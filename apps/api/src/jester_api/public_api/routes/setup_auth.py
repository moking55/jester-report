from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from .. import views
from ..problems import ApiError
from ..security import SessionCaller, bearer_token, client_ip, from_studio
from ..state import services

router = APIRouter()


class SetupBody(views.Body):
    setupToken: str
    username: str
    password: str


class LoginBody(views.Body):
    username: str
    password: str
    lifetime: Literal["standard", "long"] = "standard"


class PasswordBody(views.Body):
    currentPassword: str
    newPassword: str


@router.get("/v1/setup")
async def setup_status(request: Request) -> dict:
    return {"setupRequired": await services(request).auth.setup_required()}


@router.post("/v1/setup", status_code=201)
async def complete_setup(request: Request, body: SetupBody) -> JSONResponse:
    session = await services(request).auth.complete_setup(body.setupToken, body.username, body.password)
    return JSONResponse(views.session(session), status_code=201)


@router.post("/v1/auth/login")
async def login(request: Request, body: LoginBody) -> dict:
    long_lived = body.lifetime == "long"
    if long_lived and not from_studio(request):  # checked before the password, so it reveals nothing
        raise ApiError("INPUT_INVALID", "lifetime long is only for the MCP service")
    session = await services(request).auth.login(body.username, body.password, client_ip(request), long_lived)
    return views.session(session)


@router.post("/v1/auth/logout", status_code=204)
async def logout(request: Request, caller: SessionCaller) -> Response:
    await services(request).auth.logout(bearer_token(request))
    return Response(status_code=204)


@router.get("/v1/auth/me")
async def me(caller: SessionCaller) -> dict:
    return views.user(caller.user)  # type: ignore[arg-type]  (session callers always have a user)


@router.put("/v1/auth/password", status_code=204)
async def change_password(request: Request, caller: SessionCaller, body: PasswordBody) -> Response:
    await services(request).auth.change_password(
        bearer_token(request), body.currentPassword, body.newPassword, client_ip(request)
    )
    return Response(status_code=204)
