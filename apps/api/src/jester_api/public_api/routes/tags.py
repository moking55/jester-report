"""Tags in use and the colour of a tag name (v1.11). Studio sessions only."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from .. import views
from ..security import SessionCaller
from ..state import services

router = APIRouter()


class TagColor(views.Body):
    tag: str
    color: str  # checked against jester_api.tags.COLORS by Tags.set_color


@router.get("/v1/tags")
async def list_tags(request: Request, caller: SessionCaller) -> list[dict[str, Any]]:
    return [
        {"tag": u.tag, "color": u.color, "templates": u.templates, "documents": u.documents}
        for u in await services(request).tags.list()
    ]


@router.put("/v1/tag-colors")
async def set_tag_color(request: Request, caller: SessionCaller, body: TagColor) -> dict[str, str]:
    tag, color = await services(request).tags.set_color(body.tag, body.color)
    return {"tag": tag, "color": color}
