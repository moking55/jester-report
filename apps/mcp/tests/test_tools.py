import base64
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


STUDIO = "https://jester.example.com/templates/quotation"


async def test_create_and_duplicate_return_revision_and_studio_link(signed_in):
    summary = {"id": "quotation", "name": "ใบเสนอราคา", "draftRevision": 1}
    with respx.mock(base_url=API) as mock:
        created = mock.post("/v1/templates").respond(201, json=summary)
        dup = mock.post("/v1/templates/old/duplicate").respond(201, json={**summary, "draftRevision": 7})
        out = await call(
            signed_in,
            "create_template",
            {"template_id": "quotation", "name": "ใบเสนอราคา", "page": {"size": "A5"}},
        )
        copy = await call(
            signed_in, "duplicate_template", {"source_id": "old", "template_id": "quotation", "name": "x"}
        )
    assert (out["revision"], out["studioUrl"]) == (1, STUDIO)
    assert json.loads(created.calls.last.request.content) == {
        "id": "quotation",
        "name": "ใบเสนอราคา",
        "starter": "blank",
        "page": {"size": "A5"},
    }
    assert copy["revision"] == 7
    assert json.loads(dup.calls.last.request.content) == {"id": "quotation", "name": "x", "version": "draft"}


async def test_draft_changes_send_if_match(signed_in):
    with respx.mock(base_url=API) as mock:
        put = mock.put("/v1/templates/quotation/draft/files/template.html").respond(
            200, json={"revision": 15}
        )
        rm = mock.delete("/v1/templates/quotation/draft/files/extra.css").respond(200, json={"revision": 16})
        up = mock.post("/v1/templates/quotation/draft/assets").respond(
            201, json={"asset": {"name": "logo.png"}, "revision": 17}
        )
        rm_asset = mock.delete("/v1/templates/quotation/draft/assets/logo.png").respond(
            200, json={"revision": 18}
        )
        args = {"template_id": "quotation", "revision": 14}
        out = await call(
            signed_in, "put_draft_file", {**args, "file_name": "template.html", "content": "<h1>ไทย</h1>"}
        )
        await call(signed_in, "delete_draft_file", {**args, "file_name": "extra.css"})
        png = base64.b64encode(b"\x89PNG fake").decode()
        await call(
            signed_in,
            "upload_draft_asset",
            {**args, "asset_name": "logo.png", "content_type": "image/png", "base64_content": png},
        )
        await call(signed_in, "delete_draft_asset", {**args, "asset_name": "logo.png"})
    assert out == {"revision": 15, "studioUrl": STUDIO}
    sent = put.calls.last.request
    assert sent.content.decode("utf-8") == "<h1>ไทย</h1>"
    assert sent.headers["Content-Type"].startswith("text/plain")
    for route in (put, rm, up, rm_asset):
        assert route.calls.last.request.headers["If-Match"] == '"14"'
    body = up.calls.last.request.content
    assert b'filename="logo.png"' in body and b"\x89PNG fake" in body and b"image/png" in body


async def test_revision_conflict_tells_the_model_to_read_again(signed_in):
    conflict = {"code": "REVISION_CONFLICT", "detail": "draft is at revision 16"}
    with respx.mock(base_url=API) as mock:
        mock.put("/v1/templates/quotation/draft/files/a.html").respond(412, json=conflict)
        with pytest.raises(ToolError) as e:
            await signed_in.call_tool(
                "put_draft_file",
                {"template_id": "quotation", "file_name": "a.html", "content": "x", "revision": 14},
            )
    message = str(e.value)
    assert "REVISION_CONFLICT" in message and "get_draft" in message


@pytest.mark.parametrize(
    ("content", "match"),
    [
        ("not base64!!", "not valid base64"),
        (base64.b64encode(b"x" * (5 * 1024 * 1024 + 1)).decode(), "limit"),
    ],
)
async def test_bad_assets_never_reach_the_api(signed_in, content, match):
    with respx.mock(base_url=API, assert_all_called=False) as mock:
        route = mock.route().respond(201, json={})
        with pytest.raises(ToolError, match=match):
            await signed_in.call_tool(
                "upload_draft_asset",
                {
                    "template_id": "quotation",
                    "asset_name": "logo.png",
                    "content_type": "image/png",
                    "base64_content": content,
                    "revision": 1,
                },
            )
    assert not route.called


async def test_only_deletes_are_destructive(signed_in):
    tools = {t.name: t.annotations for t in await signed_in.list_tools()}
    destructive = {name for name, a in tools.items() if a.destructive_hint}
    assert destructive == {"delete_draft_file", "delete_draft_asset"}
    for name in ("create_template", "duplicate_template", "put_draft_file", "upload_draft_asset"):
        assert tools[name].read_only_hint is False
