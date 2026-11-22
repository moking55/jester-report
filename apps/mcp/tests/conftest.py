import httpx
import pytest

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
