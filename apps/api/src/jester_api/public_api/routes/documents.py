"""Documents successful renders produced (v1.5): list, search and download again. Studio sessions only."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from .. import views
from ..security import SessionCaller
from ..state import services
from .render import content_disposition

router = APIRouter()


@router.get("/v1/documents")
async def list_documents(
    request: Request,
    caller: SessionCaller,
    templateId: str | None = None,  # noqa: N803
    q: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    before: str | None = None,
    tag: Annotated[list[str] | None, Query()] = None,
) -> dict:
    items, next_cursor = await services(request).render.list_documents(templateId, q, limit, before, tag)
    return {"items": [views.document(d) for d in items], "next": next_cursor}


@router.get("/v1/documents/{runId}")
async def get_document(request: Request, caller: SessionCaller, runId: str) -> Response:  # noqa: N803
    filename, pdf = await services(request).render.document_pdf(runId)
    return Response(
        pdf, media_type="application/pdf", headers={"Content-Disposition": content_disposition(filename)}
    )


class TagList(views.Body):
    tags: list[str]


@router.put("/v1/documents/{runId}/tags")
async def set_document_tags(request: Request, caller: SessionCaller, runId: str, body: TagList) -> dict:  # noqa: N803
    # shortcut: the new set replaces the old one, so two people editing at once means the last save wins
    return {"tags": await services(request).render.set_document_tags(runId, body.tags)}
