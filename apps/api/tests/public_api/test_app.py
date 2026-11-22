import logging
import uuid
from dataclasses import dataclass

import httpx
import pytest
from fastapi import Request

from jester_api.auth import AuthError, Principal, User
from jester_api.public_api import Settings, create_app
from jester_api.public_api.security import RenderCaller, SessionCaller, client_ip
from jester_api.public_api.state import Services
from jester_api.render_service import Health

USER = Principal("user", "alice", user=User(uuid.uuid4(), "alice", None, None))  # type: ignore[arg-type]
KEY = Principal("api_key", "api-key:erp", api_key_id=uuid.uuid4())
SETTINGS = Settings("postgresql://x", "http://s3", "b", "k", "s", "http://engine", studio_key="studio-secret",
                    max_request_bytes=1000)  # fmt: skip


class FakeAuth:
    async def authenticate(self, bearer: str) -> Principal:
        if bearer == "jrs_good":
            return USER
        if bearer == "jrk_good":
            return KEY
        raise AuthError("UNAUTHORIZED", "missing, invalid, expired or revoked credentials")


@dataclass
class FakeRender:
    health_value: Health

    async def health(self) -> Health:
        return self.health_value


def make_app(health: Health | None = None):
    up = health or Health("up", "up", "up", "up", "9.4.1")
    app = create_app(SETTINGS, Services(FakeAuth(), None, FakeRender(up), None, None))  # type: ignore[arg-type]

    @app.post("/test/echo-size")
    async def echo(request: Request) -> dict:
        return {"size": len(await request.body())}

    @app.get("/test/session")
    async def session_only(p: SessionCaller) -> dict:
        return {"name": p.name}

    @app.get("/test/render")
    async def render_ok(p: RenderCaller) -> dict:
        return {"name": p.name}

    @app.get("/test/ip")
    async def ip(request: Request) -> dict:
        return {"ip": client_ip(request)}

    return app


def client(app, raise_app_exceptions: bool = True) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(
        app=app, client=("203.0.113.9", 1234), raise_app_exceptions=raise_app_exceptions
    )
    return httpx.AsyncClient(transport=transport, base_url="http://t")


async def test_health_and_contract_file():
    async with client(make_app()) as c:
        h = await c.get("/v1/health")
        assert h.status_code == 200 and h.json()["components"]["engine"] == {
            "status": "up",
            "version": "9.4.1",
        }
        spec = await c.get("/v1/openapi.yaml")
        assert spec.status_code == 200 and spec.text.startswith("openapi: 3.1.0")
        for generated in ("/docs", "/redoc", "/openapi.json"):
            assert (await c.get(generated)).status_code == 404
    async with client(make_app(Health("degraded", "up", "up", "down", None))) as c:
        assert (await c.get("/v1/health")).status_code == 503


async def test_body_limit_with_and_without_content_length():
    async with client(make_app()) as c:
        assert (await c.post("/test/echo-size", content=b"x" * 999)).json() == {"size": 999}
        declared = await c.post("/test/echo-size", content=b"x" * 1001)
        assert declared.status_code == 413 and declared.headers["content-type"] == "application/problem+json"

        async def chunks():  # no Content-Length: counted while receiving
            for _ in range(5):
                yield b"x" * 300

        streamed = await c.post("/test/echo-size", content=chunks())
        assert streamed.status_code == 413 and streamed.json()["code"] == "PAYLOAD_TOO_LARGE"


async def test_who_is_calling():
    async with client(make_app()) as c:
        assert (await c.get("/test/session")).status_code == 401
        assert (await c.get("/test/session", headers={"Authorization": "Bearer jrs_good"})).json() == {
            "name": "alice"
        }
        key = {"Authorization": "Bearer jrk_good"}
        assert (await c.get("/test/session", headers=key)).status_code == 401  # API keys: render only
        assert (await c.get("/test/render", headers=key)).json() == {"name": "api-key:erp"}
        bad = await c.get("/test/render", headers={"Authorization": "Basic abc"})
        assert bad.status_code == 401 and bad.json()["type"].endswith("/unauthorized")


async def test_client_ip_needs_the_studio_key():
    async with client(make_app()) as c:
        forged = await c.get("/test/ip", headers={"X-Jester-Client-IP": "1.2.3.4"})
        assert forged.json() == {"ip": "203.0.113.9"}  # no key: the connection's IP
        wrong = await c.get(
            "/test/ip", headers={"X-Jester-Client-IP": "1.2.3.4", "X-Jester-Studio-Key": "nope"}
        )
        assert wrong.json() == {"ip": "203.0.113.9"}
        studio = {"X-Jester-Client-IP": "1.2.3.4", "X-Jester-Studio-Key": "studio-secret"}
        assert (await c.get("/test/ip", headers=studio)).json() == {"ip": "1.2.3.4"}


async def test_unknown_route_and_unexpected_errors_are_problems(caplog):
    app = make_app()

    @app.get("/test/boom")
    async def boom() -> dict:
        raise RuntimeError("secret detail")

    # Starlette re-raises after sending the 500 so the server can log it; the response is what we check
    async with client(app, raise_app_exceptions=False) as c:
        missing = await c.get("/v1/nope")
        assert missing.status_code == 404 and missing.json()["code"] == "NOT_FOUND"
        with caplog.at_level(logging.ERROR):
            crash = await c.get("/test/boom")
        assert crash.status_code == 500 and "secret detail" not in crash.text


async def test_access_log_has_no_secrets(caplog):
    async with client(make_app()) as c:
        with caplog.at_level(logging.INFO, logger="jester.api"):
            await c.get(
                "/test/session", headers={"Authorization": "Bearer jrs_good", "X-Request-Id": "req-7"}
            )
    lines = [r.getMessage() for r in caplog.records if r.name == "jester.api"]
    assert any('"path": "/test/session"' in line and '"requestId": "req-7"' in line for line in lines)
    assert all("jrs_good" not in line for line in lines)


def test_settings_from_env():
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        Settings.from_env({})
    env = {
        "DATABASE_URL": "postgresql://x",
        "JESTER_S3_ENDPOINT": "http://s3",
        "JESTER_S3_BUCKET": "b",
        "JESTER_S3_ACCESS_KEY": "k",
        "JESTER_S3_SECRET_KEY": "s",
        "GOTENBERG_URL": "http://g",
        "JESTER_API_WORKERS": "1",
    }
    s = Settings.from_env(env)
    assert (s.workers, s.studio_key, s.max_request_bytes) == (1, None, 10 * 1024 * 1024)
