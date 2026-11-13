import os

import pytest

from jester_api.engine_client import EngineClient, EngineError, ErrorCode, PageSetup

pytestmark = pytest.mark.engine


@pytest.fixture
async def client():
    async with EngineClient(os.environ.get("GOTENBERG_URL", ""), timeout_s=60) as c:
        yield c


async def test_health_reports_pinned_version(client):
    h = await client.health()
    assert h.up
    assert h.version == "9.4.1"


async def test_renders_simple_html(client):
    result = await client.convert_html(b"<html><body><h1>Jester</h1></body></html>", page=PageSetup())
    assert result.pdf.startswith(b"%PDF-")
    assert result.options["failOnResourceLoadingFailed"] == "true"


async def test_missing_asset_fails_loudly(client):
    html = b'<html><body><img src="missing-logo.png"></body></html>'
    with pytest.raises(EngineError) as e:
        await client.convert_html(html, page=PageSetup())
    assert e.value.code is ErrorCode.RENDER_RESOURCE_FAILED, (e.value.http_status, e.value.message)
