"""Who is calling, and from which IP (SPEC-public-api.md assumptions 3 and 4)."""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Request

from ..auth import AuthError, Principal
from .state import services, settings


def bearer_token(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError("UNAUTHORIZED", "missing, invalid, expired or revoked credentials")
    return token.strip()


async def render_caller(request: Request) -> Principal:
    """Session or API key: only POST /v1/render accepts API keys."""
    return await services(request).auth.authenticate(bearer_token(request))


async def session_caller(request: Request) -> Principal:
    """Studio routes: sessions only; an API key here is 401 like any other bad credential."""
    principal = await render_caller(request)
    if principal.kind != "user":
        raise AuthError("UNAUTHORIZED", "missing, invalid, expired or revoked credentials")
    return principal


def client_ip(request: Request) -> str:
    """The browser's IP from Studio when it proves itself with the shared key; else the connection's IP."""
    key = settings(request).studio_key
    sent_key = request.headers.get("X-Jester-Studio-Key", "")
    forwarded = request.headers.get("X-Jester-Client-IP", "").strip()
    if key and forwarded and hmac.compare_digest(sent_key.encode(), key.encode()):
        return forwarded
    return request.client.host if request.client else "unknown"


# route parameters: `caller: SessionCaller` / `caller: RenderCaller`
SessionCaller = Annotated[Principal, Depends(session_caller)]
RenderCaller = Annotated[Principal, Depends(render_caller)]
