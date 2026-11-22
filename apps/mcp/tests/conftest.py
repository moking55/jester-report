import httpx
import pytest
from mcp.server.auth.middleware.auth_context import auth_context_var
from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from mcp.server.auth.provider import AccessToken

from jester_mcp.api import Api
from jester_mcp.settings import Settings

API = "http://api.test"
PUBLIC = "https://mcp.example.com"
STUDIO_KEY = "studio-secret"


@pytest.fixture
def settings(tmp_path):
    return Settings(
        api_url=API,
        public_url=PUBLIC,
        studio_public_url="https://jester.example.com",
        studio_key=STUDIO_KEY,
        db_path=str(tmp_path / "mcp.sqlite3"),
        client_ip_header="X-Forwarded-For",
    )


@pytest.fixture
async def api():
    client = Api(API)
    yield client
    await client.aclose()


@pytest.fixture
async def http(settings, api):
    """httpx on the real Starlette app (no lifespan: OAuth routes and pages do not need it)."""
    from jester_mcp.app import create_app

    app = create_app(settings, api)
    transport = httpx.ASGITransport(app=app, client=("198.51.100.9", 4444))
    async with httpx.AsyncClient(transport=transport, base_url=PUBLIC) as client:
        yield client


@pytest.fixture
def signed_in(http):
    """Acts as the MCP request of a person signed in through the connector."""
    provider = http._transport.app.state.provider  # noqa: SLF001
    provider.store.put_token("jmc_test", "jrs_long_session", "alice", "client", 2_000_000_000)
    user = AuthenticatedUser(AccessToken(token="jmc_test", client_id="client", scopes=[], subject="alice"))
    reset = auth_context_var.set(user)
    yield http._transport.app.state.server  # noqa: SLF001
    auth_context_var.reset(reset)
