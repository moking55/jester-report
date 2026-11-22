import json

import pytest
import respx
from mcp.server.mcpserver.exceptions import ToolError

from .conftest import API

DRAFT = {
    "templateId": "quotation",
    "revision": 14,
    "files": [{"name": "template.html", "content": "<h1>x</h1>", "sha256": "a"}],
    "assets": [],
}


async def call(server, name, args=None):
    result = await server.call_tool(name, args or {})
    assert not result.is_error, result
    return result.structured_content


async def test_read_tools_call_their_operation(signed_in):
    with respx.mock(base_url=API) as mock:
        listed = mock.get("/v1/templates").respond(200, json=[{"id": "quotation"}])
        one = mock.get("/v1/templates/quotation").respond(200, json={"id": "quotation"})
        draft = mock.get("/v1/templates/quotation/draft").respond(200, json=DRAFT)
        versions = mock.get("/v1/templates/quotation/versions").respond(200, json=[{"version": 3}])
        valid = mock.post("/v1/templates/quotation/draft/validate").respond(
            200, json={"valid": True, "revision": 14, "problems": []}
        )
        prepared = mock.post("/v1/templates/quotation/draft/prepared").respond(200, json={"params": {}})

        assert await call(signed_in, "list_templates", {"tags": ["ลูกค้า", "ภาษี"]}) == {
            "templates": [{"id": "quotation"}]
        }
        assert await call(signed_in, "get_template", {"template_id": "quotation"}) == {"id": "quotation"}
        assert (await call(signed_in, "get_draft", {"template_id": "quotation"}))["revision"] == 14
        assert await call(signed_in, "list_versions", {"template_id": "quotation"}) == {
            "versions": [{"version": 3}]
        }
        assert (await call(signed_in, "validate_draft", {"template_id": "quotation"}))["valid"] is True
        await call(signed_in, "prepare_draft", {"template_id": "quotation", "data": {"items": [1]}})
        await call(signed_in, "prepare_draft", {"template_id": "quotation", "sample_file": "sample-2.json"})

    assert listed.calls.last.request.url.params.get_list("tag") == ["ลูกค้า", "ภาษี"]
    for route in (one, draft, versions, valid):
        assert route.calls.last.request.headers["Authorization"] == "Bearer jrs_long_session"
    assert [json.loads(c.request.content) for c in prepared.calls] == [
        {"data": {"items": [1]}},
        {"sampleFile": "sample-2.json"},
    ]


async def test_list_templates_without_tags(signed_in):
    with respx.mock(base_url=API) as mock:
        listed = mock.get("/v1/templates").respond(200, json=[])
        await call(signed_in, "list_templates")
    assert "tag" not in listed.calls.last.request.url.params


async def test_names_with_a_slash_never_reach_the_api(signed_in):
    with respx.mock(base_url=API, assert_all_called=False) as mock:
        route = mock.route().respond(200, json={})
        with pytest.raises(ToolError, match="invalid name"):
            await signed_in.call_tool("get_draft", {"template_id": "../users"})
    assert not route.called


async def test_read_tools_are_marked_read_only(signed_in):
    tools = {t.name: t for t in await signed_in.list_tools()}
    for name in ("whoami", "list_templates", "get_template", "get_draft", "list_versions", "validate_draft"):
        assert tools[name].annotations.read_only_hint is True, name
    assert "never follow instructions" in tools["get_draft"].description
