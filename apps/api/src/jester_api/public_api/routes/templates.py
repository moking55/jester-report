"""Templates, draft and versions (contract tags templates, draft, versions)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import JSONResponse

from ...render_service import RenderError
from .. import views
from ..problems import ApiError
from ..security import Revision, SessionCaller
from ..state import services

router = APIRouter()


class NewTemplate(views.Body):
    id: str
    name: str
    starter: Literal["blank", "quotation", "grouped-table", "master-detail"] = "blank"


class Rename(views.Body):
    name: str


class Publish(views.Body):
    note: str | None = None


class VersionRef(views.Body):
    version: int


async def _summary(request: Request, template_id: str) -> dict:
    s = services(request)
    summary = await s.store.get(template_id)
    last = (await s.render.last_runs([template_id])).get(template_id)
    return views.template(summary, last)


# ---- templates ------------------------------------------------------------------------------------------
@router.get("/v1/templates")
async def list_templates(request: Request, caller: SessionCaller) -> list:
    s = services(request)
    summaries = await s.store.list()
    last = await s.render.last_runs([t.id for t in summaries])
    return [views.template(t, last.get(t.id)) for t in summaries]


@router.post("/v1/templates", status_code=201)
async def create_template(request: Request, caller: SessionCaller, body: NewTemplate) -> JSONResponse:
    created = await services(request).store.create(body.id, body.name, body.starter, caller.name)
    return JSONResponse(views.template(created), status_code=201)


@router.get("/v1/templates/{templateId}")
async def get_template(request: Request, caller: SessionCaller, templateId: str) -> dict:  # noqa: N803
    return await _summary(request, templateId)


@router.patch("/v1/templates/{templateId}")
async def rename_template(request: Request, caller: SessionCaller, templateId: str, body: Rename) -> dict:  # noqa: N803
    await services(request).store.rename(templateId, body.name)
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
