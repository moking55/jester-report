import dataclasses
import json
from urllib.parse import parse_qs, urlparse

import httpx
import respx

from .conftest import API, PUBLIC, STUDIO_KEY
from .test_oauth import CALLBACK, authorize, pkce, provider_of, register, token

SESSION = {
    "token": "jrs_long_session",
    "expiresAt": "2026-12-23T09:00:00Z",
    "user": {"id": "3f6c2a1e-8b4d-4c2a-9e1f-7a5b6c8d9e01", "username": "alice", "createdAt": "x"},
}


async def start(http):
    client_id = (await register(http)).json()["client_id"]
    verifier, challenge = pkce()
    return client_id, verifier, await authorize(http, client_id, challenge)


async def post_login(http, request_id, password="right password", **headers):
    return await http.post(
        "/login",
        headers=headers,
        data={"request": request_id, "username": "alice", "password": password, "action": "login"},
    )


async def test_page_is_thai_and_cannot_be_framed(http):
    _, _, request_id = await start(http)
    page = await http.get("/login", params={"request": request_id})
    assert page.status_code == 200
    assert "เข้าสู่ระบบ" in page.text and request_id in page.text
    assert page.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in page.headers["Content-Security-Policy"]
    assert (await http.get("/login", params={"request": "forged"})).status_code == 400


async def test_sign_in_gets_a_long_session_and_a_code(http):
    client_id, verifier, request_id = await start(http)
    with respx.mock(base_url=API) as mock:
        login = mock.post("/v1/auth/login").respond(200, json=SESSION)
        r = await post_login(http, request_id, **{"X-Forwarded-For": "6.6.6.6, 203.0.113.7"})
    assert r.status_code == 303
    location = r.headers["location"]
    assert location.startswith(CALLBACK)
    sent = login.calls.last.request
    assert json.loads(sent.content) == {"username": "alice", "password": "right password", "lifetime": "long"}
    assert sent.headers["X-Jester-Studio-Key"] == STUDIO_KEY
    assert sent.headers["X-Jester-Client-IP"] == "203.0.113.7"  # the hop our proxy added, not the forged one
    assert "Authorization" not in sent.headers

    code = parse_qs(urlparse(location).query)["code"][0]
    access = (await token(http, client_id, code, verifier)).json()["access_token"]
    assert provider_of(http).session_of(access) == ("jrs_long_session", "alice")
    # the login request is used up
    assert (await post_login(http, request_id)).status_code == 400


async def test_wrong_password_and_rate_limit_issue_no_code(http):
    _, _, request_id = await start(http)
    with respx.mock(base_url=API) as mock:
        mock.post("/v1/auth/login").respond(401, json={"code": "UNAUTHORIZED", "detail": "wrong"})
        wrong = await post_login(http, request_id, "nope")
    assert wrong.status_code == 401 and "ไม่ถูกต้อง" in wrong.text and "nope" not in wrong.text
    with respx.mock(base_url=API) as mock:
        mock.post("/v1/auth/login").respond(429, json={"code": "RATE_LIMITED", "detail": "later"})
        limited = await post_login(http, request_id)
    assert limited.status_code == 429 and "รอสักครู่" in limited.text
    with respx.mock(base_url=API) as mock:
        mock.post("/v1/auth/login").mock(side_effect=httpx.ConnectError("down"))
        down = await post_login(http, request_id)
    assert down.status_code == 502
    assert provider_of(http).login_request(request_id) is not None  # still pending: they can try again


async def test_cancel_tells_claude_access_denied(http):
    _, _, request_id = await start(http)
    r = await http.post("/login", data={"request": request_id, "action": "cancel"})
    assert r.status_code == 303
    assert parse_qs(urlparse(r.headers["location"]).query)["error"] == ["access_denied"]


async def test_no_ip_header_configured_sends_no_ip(settings, api):
    from jester_mcp.app import create_app

    app = create_app(dataclasses.replace(settings, client_ip_header=None), api)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=PUBLIC) as http:
        _, _, request_id = await start(http)
        with respx.mock(base_url=API) as mock:
            login = mock.post("/v1/auth/login").respond(200, json=SESSION)
            await post_login(http, request_id, **{"X-Forwarded-For": "203.0.113.7"})
    assert "X-Jester-Client-IP" not in login.calls.last.request.headers


async def test_whoami_runs_as_the_signed_in_person(signed_in):
    with respx.mock(base_url=API) as mock:
        me = mock.get("/v1/auth/me").respond(200, json=SESSION["user"])
        result = await signed_in.call_tool("whoami", {})
    assert not result.is_error
    assert result.structured_content == {"username": "alice", "id": SESSION["user"]["id"]}
    assert me.calls.last.request.headers["Authorization"] == "Bearer jrs_long_session"
