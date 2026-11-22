"""The connector against a running stack (api + mcp), as claude.ai would use it.

Needs: JESTER_TEST_MCP_URL (the mcp service), JESTER_TEST_API_URL, an existing account in
JESTER_TEST_USERNAME / JESTER_TEST_PASSWORD (it creates and deletes a throwaway user), and
JESTER_TEST_CALLBACK in the service's JESTER_MCP_REDIRECT_ALLOW (default http://localhost:6274/oauth/callback).
"""

import base64
import hashlib
import json
import os
import secrets
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

pytestmark = pytest.mark.live_stack
ENV = ("JESTER_TEST_MCP_URL", "JESTER_TEST_API_URL", "JESTER_TEST_USERNAME", "JESTER_TEST_PASSWORD")
if not all(os.environ.get(name) for name in ENV):
    pytest.skip(f"set {', '.join(ENV)}", allow_module_level=True)

MCP, API = os.environ["JESTER_TEST_MCP_URL"].rstrip("/"), os.environ["JESTER_TEST_API_URL"].rstrip("/")
CALLBACK = os.environ.get("JESTER_TEST_CALLBACK", "http://localhost:6274/oauth/callback")


def api_admin() -> httpx.Client:
    http = httpx.Client(base_url=API, timeout=60)
    body = {"username": os.environ["JESTER_TEST_USERNAME"], "password": os.environ["JESTER_TEST_PASSWORD"]}
    token = http.post("/v1/auth/login", json=body).raise_for_status().json()["token"]
    http.headers["Authorization"] = f"Bearer {token}"
    return http


def connect(http: httpx.Client, username: str, password: str) -> str:
    """Register, authorize, sign in on the page, exchange the code: the jmc_ access token."""
    client_id = http.post(
        "/register", json={"redirect_uris": [CALLBACK], "token_endpoint_auth_method": "none"}
    )
    client_id = client_id.raise_for_status().json()["client_id"]
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    auth = http.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": CALLBACK,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "live",
        },
    )
    request_id = parse_qs(urlparse(auth.headers["location"]).query)["request"][0]
    form = {"request": request_id, "username": username, "password": password, "action": "login"}
    signed = http.post("/login", data=form)
    assert signed.status_code == 303, signed.text
    code = parse_qs(urlparse(signed.headers["location"]).query)["code"][0]
    tokens = http.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CALLBACK,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )
    return tokens.raise_for_status().json()["access_token"]


class Session:
    """A Streamable HTTP MCP session with one access token."""

    def __init__(self, http: httpx.Client, token: str) -> None:
        self.http, self.ids, self.sid = http, 0, None
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        info = {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "live", "version": "1"},
        }
        assert self.rpc("initialize", info)["result"]["serverInfo"]["name"] == "jester"
        self.rpc("notifications/initialized", notify=True)

    def rpc(self, method, params=None, notify=False, status=200):
        body = {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {})}
        if not notify:
            self.ids += 1
            body["id"] = self.ids
        headers = dict(self.headers, **({"mcp-session-id": self.sid} if self.sid else {}))
        r = self.http.post("/mcp", headers=headers, content=json.dumps(body))
        if r.status_code != 200 and r.status_code == status:
            return None
        assert r.status_code in (200, 202), (r.status_code, r.text)
        self.sid = self.sid or r.headers.get("mcp-session-id")
        data = [line[5:].strip() for line in r.text.splitlines() if line.startswith("data:")]
        return json.loads(data[-1]) if data else None

    def tool(self, tool_name, **args):
        return self.rpc("tools/call", {"name": tool_name, "arguments": args})["result"]


def test_report_through_the_connector_and_a_deleted_user_is_cut_off():
    admin = api_admin()
    username, password = f"live-mcp-{secrets.token_hex(3)}", secrets.token_urlsafe(18)
    user = (
        admin.post("/v1/users", json={"username": username, "password": password}).raise_for_status().json()
    )
    tid = f"live-mcp-{secrets.token_hex(3)}"
    try:
        with httpx.Client(base_url=MCP, timeout=120) as http:
            mcp = Session(http, connect(http, username, password))
            assert mcp.tool("whoami")["structuredContent"]["username"] == username

            created = mcp.tool("create_template", template_id=tid, name="ทดสอบ live", starter="quotation")
            revision = created["structuredContent"]["revision"]
            draft = mcp.tool("get_draft", template_id=tid)["structuredContent"]
            css = next(f["content"] for f in draft["files"] if f["name"] == "report.css")
            put = mcp.tool(
                "put_draft_file", template_id=tid, file_name="report.css", content=css, revision=revision
            )
            assert put["structuredContent"]["revision"] == revision + 1
            stale = mcp.tool(
                "put_draft_file", template_id=tid, file_name="report.css", content=css, revision=revision
            )
            assert stale["isError"] and "REVISION_CONFLICT" in stale["content"][0]["text"]
            assert mcp.tool("validate_draft", template_id=tid)["structuredContent"]["valid"] is True

            preview = mcp.tool(
                "preview_draft", template_id=tid, params={"quoteId": "QT-1", "docDate": "2026-11-23"}
            )
            summary = json.loads(preview["content"][0]["text"])
            assert summary["pages"] >= 1 and preview["content"][1]["mimeType"] == "image/png"
            run = admin.get(f"/v1/runs/{summary['runId']}").raise_for_status().json()
            assert run["caller"]["name"] == username  # history shows the real person

            admin.delete(f"/v1/users/{user['id']}").raise_for_status()
            gone = mcp.tool("whoami")
            assert gone["isError"] and "reconnect" in gone["content"][0]["text"]
            assert mcp.rpc("tools/list", status=401) is None  # the token is dropped: claude.ai signs in again
    finally:
        admin.put(f"/v1/templates/{tid}/archived", json={"archived": True})
        admin.delete(f"/v1/users/{user['id']}")
        admin.close()
