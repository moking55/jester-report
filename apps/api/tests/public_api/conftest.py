import httpx
import pytest
import respx

from jester_api.auth import Auth
from jester_api.engine_client import EngineClient
from jester_api.public_api import Settings, create_app
from jester_api.public_api.state import Services
from jester_api.render_service import RenderService, RenderSettings
from jester_api.template_store import MemoryBlobStore, TemplateStore
from jester_api.themes import Themes

from ..render_service.conftest import pdf_with_font

ENGINE = "http://engine.test"
STUDIO_KEY = "studio-secret"
PASSWORD = "correct horse battery"


@pytest.fixture
async def pool(db_url):
    from psycopg_pool import AsyncConnectionPool

    from jester_api.db import migrate

    async with AsyncConnectionPool(db_url, min_size=1, max_size=8, open=False) as p:
        async with p.connection() as conn:
            await migrate(conn)
        yield p


@pytest.fixture
def engine_route():
    with respx.mock(base_url=ENGINE, assert_all_called=False) as mock:
        mock.get("/health").mock(return_value=httpx.Response(200, json={"status": "up"}))
        mock.get("/version").mock(return_value=httpx.Response(200, text="9.4.1"))
        yield mock.post("/forms/chromium/convert/html").mock(
            return_value=httpx.Response(200, content=pdf_with_font("THSarabunNew"))
        )


@pytest.fixture
async def api(pool, engine_route):
    """An httpx client on the real app with real modules on the test database and a fake engine."""
    settings = Settings(
        "unused", "unused", "b", "k", "s", ENGINE, studio_key=STUDIO_KEY, max_request_bytes=2_000_000
    )
    async with EngineClient(ENGINE) as engine:
        store = TemplateStore(pool, MemoryBlobStore())
        render = RenderService(store, engine, pool, RenderSettings(bind_timeout_s=30))
        app = create_app(settings, Services(Auth(pool), store, render, Themes(pool)))
        transport = httpx.ASGITransport(app=app, client=("198.51.100.20", 5555))
        async with httpx.AsyncClient(transport=transport, base_url="http://api") as client:
            yield client


@pytest.fixture
async def admin(api):
    """Completes first-run setup through the API; returns auth headers for the first user."""
    services = api._transport.app.state.services  # type: ignore[attr-defined]
    token = await services.auth.prepare_setup()
    created = await api.post(
        "/v1/setup", json={"setupToken": token, "username": "alice", "password": PASSWORD}
    )
    assert created.status_code == 201, created.text
    return {"Authorization": f"Bearer {created.json()['token']}"}
