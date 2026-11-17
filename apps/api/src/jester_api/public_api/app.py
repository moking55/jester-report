"""The FastAPI app: lifespan, middleware, error handling, routes (SPEC-public-api.md)."""

from __future__ import annotations

import contextlib
import json
import logging
import os
import sys
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI

from . import problems
from .settings import Settings
from .state import Services

log = logging.getLogger("jester.api")


class BodyLimit:
    """413 for bodies over the limit, counted while receiving (Content-Length alone can lie or be absent)."""

    def __init__(self, app: Any, max_bytes: int, per_path: dict[str, int] | None = None) -> None:
        self.app, self.default, self.per_path = app, max_bytes, per_path or {}

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = self.per_path.get(scope.get("path", ""), self.default)
        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            response = problems.problem_response(
                "PAYLOAD_TOO_LARGE", 413, f"the request is larger than {limit} bytes"
            )
            return await response(scope, receive, send)
        seen = 0

        async def counting_receive() -> dict:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:  # turned into 413 by the problem handlers inside the app
                    raise problems.ApiError("PAYLOAD_TOO_LARGE", f"the request is larger than {limit} bytes")
            return message

        await self.app(scope, counting_receive, send)


class AccessLog:
    """One JSON line per request; no headers, no body, the route template instead of the raw path."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started, status, extra = time.monotonic(), 500, {}

        async def capturing_send(message: dict) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                for name, value in message.get("headers", []):
                    if name.lower() == b"jester-run-id":
                        extra["runId"] = value.decode()
            await send(message)

        try:
            await self.app(scope, receive, capturing_send)
        finally:
            route = scope.get("route")
            request_id = dict(scope.get("headers") or []).get(b"x-request-id", b"").decode()[:128] or None
            log.info(
                json.dumps(
                    {
                        "method": scope["method"],
                        "path": getattr(route, "path", "unmatched"),
                        "status": status,
                        "ms": int((time.monotonic() - started) * 1000),
                        "requestId": request_id,
                        **extra,
                    }
                )
            )


async def build_services(settings: Settings) -> Services:
    from psycopg_pool import AsyncConnectionPool

    from ..auth import Auth
    from ..db import migrate
    from ..engine_client import EngineClient
    from ..render_service import RenderService, RenderSettings
    from ..template_store import S3BlobStore, TemplateStore
    from ..themes import Themes

    pool = AsyncConnectionPool(settings.database_url, min_size=1, max_size=10, open=False)
    await pool.open()
    async with pool.connection() as conn:
        await migrate(conn)
    blobs = S3BlobStore(
        settings.s3_endpoint, settings.s3_bucket, settings.s3_access_key, settings.s3_secret_key
    )
    await blobs.ensure_bucket()
    engine = EngineClient(settings.gotenberg_url)
    store = TemplateStore(pool, blobs)
    auth = Auth(pool)
    render = RenderService(store, engine, pool, RenderSettings(engine_image=settings.engine_image))
    token = await auth.prepare_setup()
    if token:
        banner = "=" * 72
        log.warning(
            "%s\nJester first-run setup. Open Studio and enter this one-time setup token:\n\n    %s\n\n%s",
            banner,
            token,
            banner,
        )
    return Services(auth, store, render, Themes(pool), closers=(engine, pool))


def create_app(settings: Settings | None = None, services: Services | None = None) -> FastAPI:
    """`services` is for tests; production builds them from settings at start-up."""

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings or Settings.from_env()
        app.state.services = services or await build_services(app.state.settings)
        try:
            yield
        finally:
            for closer in app.state.services.closers:
                close = getattr(closer, "aclose", None) or closer.close
                await close()

    # FastAPI's generated docs would not match the contract (render bodies are parsed as Decimal),
    # so they are off; GET /v1/openapi.yaml serves the contract itself.
    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    if settings is not None:
        app.state.settings = settings
    if services is not None:
        app.state.services = services
    problems.install(app)

    from .routes import ROUTERS

    for router in ROUTERS:
        app.include_router(router)
    limit = (
        settings.max_request_bytes if settings else int(os.environ.get("JESTER_MAX_REQUEST_BYTES", 10 << 20))
    )
    # a template zip may hold a 20 MB draft (25 MB zip + multipart overhead); every other route keeps `limit`
    import_limit = max(limit, 26 * 1024 * 1024)
    app.add_middleware(BodyLimit, max_bytes=limit, per_path={"/v1/templates/import": import_limit})
    app.add_middleware(AccessLog)
    return app


def main() -> None:  # pragma: no cover - container entrypoint
    import asyncio

    import uvicorn

    if sys.platform == "win32":  # psycopg's async connections need a selector loop
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    settings = Settings.from_env()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    uvicorn.run(
        "jester_api.public_api:app",
        host="0.0.0.0",
        port=8000,
        workers=settings.workers,
        access_log=False,
        proxy_headers=False,
    )
