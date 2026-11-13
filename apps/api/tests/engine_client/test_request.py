import email
import email.policy

import httpx
import pytest
import respx

from jester_api.engine_client import EngineClient, PageSetup, RenderFile
from jester_api.engine_client.client import CONVERT_HTML, SAFETY_FIELDS

BASE = "http://engine.test"


def _parts(request: httpx.Request) -> tuple[dict[str, str], dict[str, bytes]]:
    raw = b"Content-Type: " + request.headers["content-type"].encode() + b"\r\n\r\n" + request.content
    msg = email.message_from_bytes(raw, policy=email.policy.HTTP)
    fields, files = {}, {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True)
        if filename:
            files[filename] = payload
        else:
            fields[name] = payload.decode()
    return fields, files


@respx.mock
async def test_sends_files_page_and_safety_fields():
    route = respx.post(f"{BASE}{CONVERT_HTML}").mock(
        return_value=httpx.Response(200, content=b"%PDF-1.7", headers={"Gotenberg-Trace": "t-1"})
    )
    async with EngineClient(BASE) as client:
        result = await client.convert_html(
            b"<p>body</p>",
            page=PageSetup(landscape=True),
            header_html=b"<h>",
            footer_html=b"<f>",
            assets=[RenderFile("logo.png", b"PNG")],
            wait_for_expression="window.ready === true",
        )
    fields, files = _parts(route.calls.last.request)
    assert files == {
        "index.html": b"<p>body</p>",
        "header.html": b"<h>",
        "footer.html": b"<f>",
        "logo.png": b"PNG",
    }
    for key, value in SAFETY_FIELDS.items():
        assert fields[key] == value
    assert fields["landscape"] == "true"
    assert fields["paperWidth"] == "8.27"
    assert fields["waitForExpression"] == "window.ready === true"
    assert result.pdf == b"%PDF-1.7"
    assert result.trace == "t-1"
    assert result.options == fields
    assert result.duration_ms >= 0


@respx.mock
async def test_safety_fields_cannot_be_overridden_by_page():
    route = respx.post(f"{BASE}{CONVERT_HTML}").mock(return_value=httpx.Response(200, content=b"%PDF"))
    async with EngineClient(BASE) as client:
        await client.convert_html(b"<p>", page=PageSetup())
    fields, _ = _parts(route.calls.last.request)
    assert fields["failOnResourceLoadingFailed"] == "true"
    assert "downloadFrom" not in fields


def test_no_parameter_for_remote_urls():
    import inspect

    params = inspect.signature(EngineClient.convert_html).parameters
    assert not {"download_from", "archives", "url", "safety"} & set(params)


@pytest.mark.parametrize("base", ["http://engine.test/", "http://engine.test"])
@respx.mock
async def test_base_url_trailing_slash(base):
    respx.post(f"{BASE}{CONVERT_HTML}").mock(return_value=httpx.Response(200, content=b"%PDF"))
    async with EngineClient(base) as client:
        assert (await client.convert_html(b"<p>", page=PageSetup())).pdf == b"%PDF"
