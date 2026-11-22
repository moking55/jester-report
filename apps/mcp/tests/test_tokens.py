import pytest
import respx
from mcp.server.mcpserver.exceptions import ToolError

from .conftest import API, PUBLIC
from .test_oauth import provider_of

INIT = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}


@pytest.mark.parametrize("bearer", [None, "jmc_unknown", "jrs_a_jester_session"])
async def test_mcp_needs_one_of_our_tokens(http, bearer):
    headers = {"Authorization": f"Bearer {bearer}"} if bearer else {}
    r = await http.post("/mcp", json=INIT, headers=headers)
    assert r.status_code == 401
    challenge = r.headers["WWW-Authenticate"]
    assert (
        challenge.startswith("Bearer") and f"{PUBLIC}/.well-known/oauth-protected-resource/mcp" in challenge
    )


async def test_ended_jester_session_drops_the_token(http, signed_in):
    with respx.mock(base_url=API) as mock:
        mock.get("/v1/auth/me").respond(401, json={"code": "UNAUTHORIZED", "detail": "expired"})
        with pytest.raises(ToolError, match="reconnect"):
            await signed_in.call_tool("whoami", {})
    provider = provider_of(http)
    assert provider.session_of("jmc_test") is None
    assert await provider.load_access_token("jmc_test") is None  # so /mcp answers 401 and claude.ai signs in
    r = await http.post("/mcp", json=INIT, headers={"Authorization": "Bearer jmc_test"})
    assert r.status_code == 401


async def test_api_problems_reach_the_model_as_the_api_said(signed_in):
    with respx.mock(base_url=API) as mock:
        mock.get("/v1/auth/me").respond(503, json={"code": "SERVICE_UNAVAILABLE", "detail": "db down"})
        with pytest.raises(ToolError, match="SERVICE_UNAVAILABLE"):
            await signed_in.call_tool("whoami", {})
