import base64
import hashlib
import secrets
import time
from urllib.parse import parse_qs, urlparse

import pytest

from jester_mcp.oauth import CODE_LIFETIME_S, TOKEN_PREFIX

from .conftest import PUBLIC

CALLBACK = "https://claude.ai/api/mcp/auth_callback"


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


async def register(http, redirect=CALLBACK):
    return await http.post(
        "/register",
        json={"redirect_uris": [redirect], "client_name": "claude", "token_endpoint_auth_method": "none"},
    )


async def authorize(http, client_id, challenge, state="st"):
    """GET /authorize -> redirect to our login page; returns the login request id."""
    r = await http.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": CALLBACK,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
            "resource": f"{PUBLIC}/mcp",
        },
    )
    assert r.status_code == 302, r.text
    location = urlparse(r.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == f"{PUBLIC}/login"
    return parse_qs(location.query)["request"][0]


def provider_of(http):
    return http._transport.app.state.provider  # noqa: SLF001 (test reaches into the app it built)


async def token(http, client_id, code, verifier):
    return await http.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CALLBACK,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )


async def signed_in_code(http):
    client_id = (await register(http)).json()["client_id"]
    verifier, challenge = pkce()
    request_id = await authorize(http, client_id, challenge)
    redirect = provider_of(http).complete_login(request_id, "jrs_session", "alice")
    query = parse_qs(urlparse(redirect).query)
    assert redirect.startswith(CALLBACK) and query["state"] == ["st"]
    return client_id, query["code"][0], verifier


async def test_metadata_points_at_the_public_url(http):
    meta = (await http.get("/.well-known/oauth-authorization-server")).json()
    assert meta["issuer"].rstrip("/") == PUBLIC
    assert meta["authorization_endpoint"] == f"{PUBLIC}/authorize"
    assert meta["registration_endpoint"] == f"{PUBLIC}/register"
    resource = (await http.get("/.well-known/oauth-protected-resource/mcp")).json()
    assert resource["resource"] == f"{PUBLIC}/mcp"


async def test_registration_only_for_allowed_callbacks(http):
    assert (await register(http)).status_code == 201
    assert (await register(http, "https://claude.com/api/mcp/auth_callback")).status_code == 201
    evil = await register(http, "https://evil.example/cb")
    assert (evil.status_code, evil.json()["error"]) == (400, "invalid_redirect_uri")


async def test_code_for_token_with_pkce(http):
    client_id, code, verifier = await signed_in_code(http)
    r = await token(http, client_id, code, verifier)
    assert r.status_code == 200, r.text
    access = r.json()["access_token"]
    assert access.startswith(TOKEN_PREFIX) and "refresh_token" not in r.json()
    assert provider_of(http).session_of(access) == ("jrs_session", "alice")
    assert (await token(http, client_id, code, verifier)).status_code == 400  # one use only


async def test_wrong_verifier_or_old_code_fails(http, monkeypatch):
    client_id, code, _ = await signed_in_code(http)
    assert (await token(http, client_id, code, pkce()[0])).status_code == 400

    client_id, code, verifier = await signed_in_code(http)
    later = time.time() + CODE_LIFETIME_S + 1
    monkeypatch.setattr(time, "time", lambda: later)
    assert (await token(http, client_id, code, verifier)).status_code == 400


async def test_store_keeps_only_a_hash(http, settings):
    client_id, code, verifier = await signed_in_code(http)
    access = (await token(http, client_id, code, verifier)).json()["access_token"]
    raw = open(settings.db_path, "rb").read()  # noqa: SIM115 ASYNC230 (tiny test file)
    assert access.encode() not in raw


async def test_unknown_login_request_is_refused(http):
    with pytest.raises(KeyError):
        provider_of(http).complete_login("nope", "jrs_x", "alice")
    assert provider_of(http).login_request("nope") is None
