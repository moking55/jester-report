import httpx
import pytest
import respx

from jester_api.engine_client import EngineClient, EngineError, ErrorCode, PageSetup
from jester_api.engine_client.client import CONVERT_HTML

BASE = "http://engine.test"


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (400, ErrorCode.RENDER_INPUT_INVALID, False),
        (413, ErrorCode.RENDER_INPUT_INVALID, False),
        (415, ErrorCode.RENDER_INPUT_INVALID, False),
        (401, ErrorCode.ENGINE_MISCONFIGURED, False),
        (403, ErrorCode.ENGINE_MISCONFIGURED, False),
        (404, ErrorCode.ENGINE_MISCONFIGURED, False),
        (409, ErrorCode.RENDER_RESOURCE_FAILED, False),
        (429, ErrorCode.SERVICE_UNAVAILABLE, True),
        (503, ErrorCode.RENDER_TIMEOUT, True),
        (500, ErrorCode.RENDER_FAILED, False),
        (418, ErrorCode.RENDER_FAILED, False),
    ],
)
@respx.mock
async def test_status_mapping(status, code, retryable):
    respx.post(f"{BASE}{CONVERT_HTML}").mock(
        return_value=httpx.Response(status, text="boom", headers={"Gotenberg-Trace": "t-9"})
    )
    async with EngineClient(BASE) as client:
        with pytest.raises(EngineError) as e:
            await client.convert_html(b"<p>", page=PageSetup())
    err = e.value
    assert (err.code, err.retryable, err.http_status, err.trace) == (code, retryable, status, "t-9")
    assert err.message == "boom"


@respx.mock
async def test_empty_error_body_gets_status_message():
    respx.post(f"{BASE}{CONVERT_HTML}").mock(return_value=httpx.Response(500))
    async with EngineClient(BASE) as client:
        with pytest.raises(EngineError, match="HTTP 500"):
            await client.convert_html(b"<p>", page=PageSetup())


@respx.mock
async def test_long_error_message_truncated():
    respx.post(f"{BASE}{CONVERT_HTML}").mock(return_value=httpx.Response(500, text="x" * 5000))
    async with EngineClient(BASE) as client:
        with pytest.raises(EngineError) as e:
            await client.convert_html(b"<p>", page=PageSetup())
    assert len(e.value.message) == 500


@pytest.mark.parametrize(
    ("exc", "code"),
    [
        (httpx.ReadTimeout("slow"), ErrorCode.RENDER_TIMEOUT),
        (httpx.ConnectTimeout("slow"), ErrorCode.RENDER_TIMEOUT),
        (httpx.ConnectError("refused"), ErrorCode.SERVICE_UNAVAILABLE),
    ],
)
@respx.mock
async def test_network_errors_are_retryable(exc, code):
    respx.post(f"{BASE}{CONVERT_HTML}").mock(side_effect=exc)
    async with EngineClient(BASE) as client:
        with pytest.raises(EngineError) as e:
            await client.convert_html(b"<p>", page=PageSetup())
    assert (e.value.code, e.value.retryable) == (code, True)


@respx.mock
async def test_health_up_with_version():
    respx.get(f"{BASE}/health").mock(return_value=httpx.Response(200, json={"status": "up", "details": {}}))
    respx.get(f"{BASE}/version").mock(return_value=httpx.Response(200, text="9.4.1\n"))
    async with EngineClient(BASE) as client:
        h = await client.health()
    assert (h.up, h.version) == (True, "9.4.1")


@respx.mock
async def test_health_down_and_no_version():
    respx.get(f"{BASE}/health").mock(return_value=httpx.Response(503, json={"status": "down"}))
    respx.get(f"{BASE}/version").mock(return_value=httpx.Response(404))
    async with EngineClient(BASE) as client:
        h = await client.health()
    assert (h.up, h.version) == (False, None)


@respx.mock
async def test_health_unexpected_status_raises():
    respx.get(f"{BASE}/health").mock(return_value=httpx.Response(401))
    async with EngineClient(BASE) as client:
        with pytest.raises(EngineError) as e:
            await client.health()
    assert e.value.code is ErrorCode.ENGINE_MISCONFIGURED
