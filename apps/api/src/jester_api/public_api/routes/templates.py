"""Templates, draft and versions (contract tags templates, draft, versions)."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Form, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import Field

from ...render_service import RenderError
from ...template_store.docx.package import looks_like_docx
from .. import views
from ..problems import ApiError
from ..security import Revision, SessionCaller, expected_revision
from ..state import services
from .render import content_disposition

router = APIRouter()


class NewTemplate(views.Body):
    id: str
    name: str
    starter: Literal["blank", "quotation", "grouped-table", "master-detail", "tax-invoice"] = "blank"
    page: dict[str, Any] | None = None  # report.json "page" (v1.8): blank starter only


class Rename(views.Body):
    name: str


class Publish(views.Body):
    note: str | None = None


class VersionRef(views.Body):
    version: int


class Archived(views.Body):
    archived: bool


class TagList(views.Body):
    tags: list[str]


class Duplicate(views.Body):
    id: str
    name: str
    version: Literal["draft"] | Annotated[int, Field(ge=1)] = "draft"


async def _summary(request: Request, template_id: str) -> dict:
    s = services(request)
    summary = await s.store.get(template_id)
    last = (await s.render.last_runs([template_id])).get(template_id)
    return views.template(summary, last)


# ---- templates ------------------------------------------------------------------------------------------
@router.get("/v1/templates")
async def list_templates(
    request: Request,
    caller: SessionCaller,
    includeArchived: bool = False,  # noqa: N803
    tag: Annotated[list[str] | None, Query()] = None,
) -> list:
    s = services(request)
    summaries = await s.store.list(include_archived=includeArchived, tags=tag)
    last = await s.render.last_runs([t.id for t in summaries])
    return [views.template(t, last.get(t.id)) for t in summaries]


@router.post("/v1/templates", status_code=201)
async def create_template(request: Request, caller: SessionCaller, body: NewTemplate) -> JSONResponse:
    created = await services(request).store.create(body.id, body.name, body.starter, caller.name, body.page)
    return JSONResponse(views.template(created), status_code=201)


@router.get("/v1/templates/{templateId}")
async def get_template(request: Request, caller: SessionCaller, templateId: str) -> dict:  # noqa: N803
    return await _summary(request, templateId)


@router.patch("/v1/templates/{templateId}")
async def rename_template(request: Request, caller: SessionCaller, templateId: str, body: Rename) -> dict:  # noqa: N803
    await services(request).store.rename(templateId, body.name)
    return await _summary(request, templateId)


@router.get("/v1/templates/{templateId}/export")
async def export_template(
    request: Request,
    caller: SessionCaller,
    templateId: str,  # noqa: N803
    version: str = "draft",
) -> Response:
    if version != "draft" and not (version.isdigit() and int(version) >= 1):
        raise ApiError("INPUT_INVALID", 'version must be "draft" or a version number')
    exported = await services(request).store.export_zip(
        templateId, "draft" if version == "draft" else int(version)
    )
    return Response(
        exported.data,
        media_type="application/zip",
        headers={"Content-Disposition": content_disposition(exported.filename)},
    )


@router.post("/v1/templates/import")
async def import_template(
    request: Request,
    caller: SessionCaller,
    file: UploadFile,
    templateId: Annotated[str | None, Form()] = None,  # noqa: N803
    unarchive: Annotated[Literal["true", "false"], Form()] = "false",
    name: Annotated[str | None, Form(max_length=120)] = None,  # v1.15: a Word file's report name
) -> JSONResponse:
    data = await file.read()
    store = services(request).store
    if looks_like_docx(data):  # v1.15: told apart by what is inside, not by the file name
        if not templateId:
            raise ApiError("INPUT_INVALID", "a Word file needs templateId (it has no manifest)", 422)
        if request.headers.get("If-Match") is not None or unarchive == "true":
            raise ApiError("INPUT_INVALID", "นำเข้า Word ได้เฉพาะเป็นรายงานใหม่", 422)
        title = name or (file.filename or "").rsplit("/", 1)[-1].removesuffix(".docx").removesuffix(".DOCX")
        result = await store.import_docx(data, templateId, title, caller.name)
    else:
        revision = expected_revision(request) if request.headers.get("If-Match") is not None else None
        result = await store.import_zip(
            data, revision, caller.name, templateId, unarchive=unarchive == "true"
        )
    body = {
        "template": views.template(result.summary),
        "revision": result.revision,
        "created": result.created,
        "warnings": views.problems(result.warnings),
    }
    return JSONResponse(body, status_code=201 if result.created else 200)


@router.post("/v1/templates/{templateId}/duplicate", status_code=201)
async def duplicate_template(
    request: Request,
    caller: SessionCaller,
    templateId: str,  # noqa: N803
    body: Duplicate,
) -> JSONResponse:
    copy = await services(request).store.duplicate(templateId, body.version, body.id, body.name, caller.name)
    return JSONResponse(views.template(copy), status_code=201)


@router.put("/v1/templates/{templateId}/archived")
async def set_template_archived(
    request: Request,
    caller: SessionCaller,
    templateId: str,  # noqa: N803
    body: Archived,
) -> dict:
    await services(request).store.set_archived(templateId, body.archived, caller.name)
    return await _summary(request, templateId)


# ---- draft ----------------------------------------------------------------------------------------------
@router.get("/v1/templates/{templateId}/draft")
async def get_draft(request: Request, caller: SessionCaller, templateId: str) -> dict:  # noqa: N803
    return views.draft(await services(request).store.get_draft(templateId))


@router.put("/v1/templates/{templateId}/draft/files/{fileName}")
async def put_file(
    request: Request,
    caller: SessionCaller,
    revision: Revision,
    templateId: str,  # noqa: N803
    fileName: str,  # noqa: N803
) -> dict:
    try:
        content = (await request.body()).decode("utf-8")
    except UnicodeDecodeError:
        raise ApiError("INPUT_INVALID", "text files must be UTF-8") from None
    new = await services(request).store.put_file(templateId, fileName, content, revision, caller.name)
    return {"revision": new}


@router.delete("/v1/templates/{templateId}/draft/files/{fileName}")
async def delete_file(
    request: Request,
    caller: SessionCaller,
    revision: Revision,
    templateId: str,  # noqa: N803
    fileName: str,  # noqa: N803
) -> dict:
    return {
        "revision": await services(request).store.delete_file(templateId, fileName, revision, caller.name)
    }


@router.post("/v1/templates/{templateId}/draft/assets", status_code=201)
async def upload_asset(
    request: Request,
    caller: SessionCaller,
    revision: Revision,
    templateId: str,  # noqa: N803
    file: UploadFile,
) -> JSONResponse:
    data = await file.read()  # the type is checked from these bytes, never from the client's Content-Type
    asset, new = await services(request).store.add_asset(
        templateId, file.filename or "", data, revision, caller.name
    )
    return JSONResponse({"asset": views.asset(asset), "revision": new}, status_code=201)


@router.get("/v1/templates/{templateId}/draft/assets/{assetName}")
async def get_asset(
    request: Request,
    caller: SessionCaller,
    templateId: str,  # noqa: N803
    assetName: str,  # noqa: N803
) -> Response:
    store = services(request).store
    draft = await store.get_draft(templateId)
    asset = next((a for a in draft.assets if a.name == assetName), None)
    if asset is None:
        raise ApiError("NOT_FOUND", "the draft has no asset with that name")
    return Response(
        await store.asset_bytes(asset.sha256),
        media_type=asset.content_type,  # detected from the bytes at upload, never the client's word
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/v1/templates/{templateId}/draft/assets/{assetName}")
async def delete_asset(
    request: Request,
    caller: SessionCaller,
    revision: Revision,
    templateId: str,  # noqa: N803
    assetName: str,  # noqa: N803
) -> dict:
    return {
        "revision": await services(request).store.delete_asset(templateId, assetName, revision, caller.name)
    }


@router.post("/v1/templates/{templateId}/draft/validate")
async def validate_draft(request: Request, caller: SessionCaller, templateId: str) -> dict:  # noqa: N803
    result = await services(request).render.validate(templateId)
    return {"valid": result.valid, "revision": result.revision, "problems": views.problems(result.problems)}


@router.post("/v1/templates/{templateId}/draft/reset")
async def reset_draft(
    request: Request,
    caller: SessionCaller,
    revision: Revision,
    templateId: str,  # noqa: N803
    body: VersionRef,
) -> dict:
    return {
        "revision": await services(request).store.reset_draft(templateId, body.version, revision, caller.name)
    }


# ---- versions -------------------------------------------------------------------------------------------
@router.get("/v1/templates/{templateId}/versions")
async def list_versions(request: Request, caller: SessionCaller, templateId: str) -> list:  # noqa: N803
    return [views.version(v) for v in await services(request).store.list_versions(templateId)]


@router.post("/v1/templates/{templateId}/versions", status_code=201)
async def publish(
    request: Request,
    caller: SessionCaller,
    revision: Revision,
    templateId: str,  # noqa: N803
    body: Publish | None = None,
) -> JSONResponse:
    s = services(request)
    checked = await s.render.validate(templateId)  # the draft must validate at exactly this revision
    if checked.revision != revision:
        raise ApiError("REVISION_CONFLICT", "the draft changed since this revision; reload and retry")
    if not checked.valid:
        raise RenderError("DRAFT_INVALID", 422, "the draft does not validate", problems=checked.problems)
    published = await s.store.publish(templateId, revision, body.note if body else None, caller.name)
    return JSONResponse(views.version(published), status_code=201)


@router.get("/v1/templates/{templateId}/versions/{version}")
async def get_version(request: Request, caller: SessionCaller, templateId: str, version: int) -> dict:  # noqa: N803
    return views.version_files(await services(request).store.get_version(templateId, version))


@router.put("/v1/templates/{templateId}/published")
async def set_published(request: Request, caller: SessionCaller, templateId: str, body: VersionRef) -> dict:  # noqa: N803
    await services(request).store.set_published(templateId, body.version)
    return await _summary(request, templateId)


@router.put("/v1/templates/{templateId}/tags")
async def set_template_tags(
    request: Request,
    caller: SessionCaller,
    templateId: str,  # noqa: N803
    body: TagList,
) -> dict:
    # shortcut: the new set replaces the old one, so two people editing at once means the last save wins
    return {"tags": (await services(request).store.set_tags(templateId, body.tags)).tags}
