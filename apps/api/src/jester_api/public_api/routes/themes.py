"""Studio themes. /v1/themes/default is declared before /v1/themes/{themeId} so it is not taken as an id."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from .. import views
from ..security import SessionCaller
from ..state import services

router = APIRouter()


class ThemeInput(views.Body):
    name: str
    tokens: dict[str, Any]  # checked by themes.check_tokens, which points at the bad token


class DefaultBody(views.Body):
    themeId: str  # noqa: N815


@router.get("/v1/themes")
async def list_themes(request: Request, caller: SessionCaller) -> list:
    return [views.theme(t) for t in await services(request).themes.list()]


@router.post("/v1/themes", status_code=201)
async def create_theme(request: Request, caller: SessionCaller, body: ThemeInput) -> JSONResponse:
    theme = await services(request).themes.create(body.name, body.tokens, caller.name)
    return JSONResponse(views.theme(theme), status_code=201)


@router.get("/v1/themes/default")
async def get_default_theme(request: Request) -> dict:  # public: the login page needs it
    return views.theme(await services(request).themes.default())


@router.put("/v1/themes/default")
async def set_default_theme(request: Request, caller: SessionCaller, body: DefaultBody) -> dict:
    return views.theme(await services(request).themes.set_default(body.themeId))


@router.put("/v1/themes/{themeId}")
async def update_theme(request: Request, caller: SessionCaller, themeId: str, body: ThemeInput) -> dict:  # noqa: N803
    return views.theme(await services(request).themes.update(themeId, body.name, body.tokens))


@router.delete("/v1/themes/{themeId}", status_code=204)
async def delete_theme(request: Request, caller: SessionCaller, themeId: str) -> Response:  # noqa: N803
    await services(request).themes.delete(themeId)
    return Response(status_code=204)
