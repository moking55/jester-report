from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from .. import views
from ..security import SessionCaller
from ..state import services

router = APIRouter()


class NewUser(views.Body):
    username: str
    password: str


class NewKey(views.Body):
    name: str


@router.get("/v1/users")
async def list_users(request: Request, caller: SessionCaller) -> list:
    return [views.user(u) for u in await services(request).auth.list_users()]


@router.post("/v1/users", status_code=201)
async def create_user(request: Request, caller: SessionCaller, body: NewUser) -> JSONResponse:
    created = await services(request).auth.create_user(body.username, body.password)
    return JSONResponse(views.user(created), status_code=201)


@router.delete("/v1/users/{userId}", status_code=204)
async def delete_user(request: Request, caller: SessionCaller, userId: uuid.UUID) -> Response:  # noqa: N803
    await services(request).auth.delete_user(userId)
    return Response(status_code=204)


@router.get("/v1/api-keys")
async def list_keys(request: Request, caller: SessionCaller) -> list:
    return [views.api_key(k) for k in await services(request).auth.list_api_keys()]


@router.post("/v1/api-keys", status_code=201)
async def create_key(request: Request, caller: SessionCaller, body: NewKey) -> JSONResponse:
    key, secret = await services(request).auth.create_api_key(body.name, caller.name)
    return JSONResponse(
        {**views.api_key(key), "secret": secret}, status_code=201
    )  # the only time it is shown


@router.delete("/v1/api-keys/{keyId}", status_code=204)
async def revoke_key(request: Request, caller: SessionCaller, keyId: uuid.UUID) -> Response:  # noqa: N803
    await services(request).auth.revoke_api_key(keyId)
    return Response(status_code=204)
