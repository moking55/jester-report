import json
from decimal import Decimal
from urllib.parse import unquote

import pytest

from jester_api.public_api.routes.render import content_disposition

from .test_contract import assert_fits

pytestmark = pytest.mark.db
PARAMS = {"quoteId": "Q-1", "docDate": "2026-11-14"}
DATA_JSON = (
    '{"company": {"name": "บริษัท ก"}, "customer": {"name": "ลูกค้า"}, "discount": "0",'
    ' "items": [{"id": "A", "description": "x", "qty": 2, "unitPrice": "1250.50"}]}'
)


@pytest.fixture
async def published(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "quote", "name": "Q", "starter": "quotation"})
    assert (
        await api.post("/v1/templates/quote/versions", headers={**admin, "If-Match": "1"}, json={})
    ).status_code == 201
    key = await api.post("/v1/api-keys", headers=admin, json={"name": "erp"})
    return {"Authorization": f"Bearer {key.json()['secret']}"}


def test_content_disposition_keeps_thai_names():
    header = content_disposition("ใบเสนอราคา Q-1.pdf")
    assert header.startswith('attachment; filename="')
    assert unquote(header.split("filename*=UTF-8''", 1)[1]) == "ใบเสนอราคา Q-1.pdf"
    assert 'filename="document.pdf"' in content_disposition("ใบเสนอราคา.pdf")  # no ASCII left but ".pdf"


async def test_render_with_an_api_key(api, published, monkeypatch):
    import sys

    module = sys.modules["jester_api.render_service.service"]
    seen = {}
    real = module.run_in_worker

    async def spy(definition, files, assets, params, data, meta, *, timeout_s):
        seen["data"] = data
        return await real(definition, files, assets, params, data, meta, timeout_s=timeout_s)

    monkeypatch.setattr(module, "run_in_worker", spy)

    def body(template: dict, data_json: str, **extra: str) -> str:
        shell = json.dumps(
            {"template": template, "params": PARAMS, "data": "@DATA@", **extra}, ensure_ascii=False
        )
        return shell.replace('"@DATA@"', data_json)

    with_number = DATA_JSON.replace('"1250.50"', "1250.5")  # a JSON number this time, not a string
    headers = {**published, "Content-Type": "application/json", "X-Request-Id": "req-1"}
    response = await api.post(
        "/v1/render",
        headers=headers,
        content=body({"id": "quote", "version": "published"}, with_number, filename="ใบ Q-1.pdf"),
    )
    # the starter schema wants decimal strings, so a JSON number is a data problem (422)...
    assert response.status_code == 422
    # ...but it reached data-prep exact, not as a binary float
    assert seen["data"]["items"][0]["unitPrice"] == Decimal("1250.5")

    ok = await api.post("/v1/render", headers=headers, content=body({"id": "quote", "version": 1}, DATA_JSON))
    assert ok.status_code == 200 and ok.content.startswith(b"%PDF")
    assert ok.headers["Jester-Template-Version"] == "1" and ok.headers["Jester-Run-Id"]
    assert "quote-v1.pdf" in ok.headers["Content-Disposition"]


async def test_render_errors_are_problems(api, published):
    def post(payload):
        return api.post("/v1/render", headers=published, json=payload)

    bad_name = await post({"template": {"id": "quote", "version": 1}, "data": {}, "filename": "a/b.pdf"})
    assert bad_name.status_code == 422 and bad_name.json()["problems"][0]["pointer"] == "/filename"
    missing = await post({"template": {"id": "quote", "version": 1}})
    assert missing.status_code == 422 and missing.json()["problems"][0]["pointer"] == "/data"
    nope = await post({"template": {"id": "nope", "version": "published"}, "data": {}})
    assert (nope.status_code, nope.json()["code"]) == (404, "NOT_FOUND") and nope.json()["runId"]
    invalid = await post({"template": {"id": "quote", "version": 1}, "params": {}, "data": {}})
    assert invalid.status_code == 422 and {p["code"] for p in invalid.json()["problems"]} >= {
        "PARAM_REQUIRED"
    }
    not_json = await api.post(
        "/v1/render", headers={**published, "Content-Type": "application/json"}, content=b"{"
    )
    assert not_json.status_code == 422


async def test_preview_runs_and_retention(api, admin, published):
    preview = await api.post("/v1/templates/quote/draft/preview", headers=admin, json={"params": PARAMS})
    assert preview.status_code == 200 and "Jester-Template-Version" not in preview.headers
    runs = (await api.get("/v1/runs?templateId=quote", headers=admin)).json()
    assert runs["items"][0]["kind"] == "preview" and runs["next"] is None
    run = await api.get(f"/v1/runs/{runs['items'][0]['id']}", headers=admin)
    assert run.json()["templateId"] == "quote"
    assert (await api.get("/v1/runs?limit=0", headers=admin)).status_code == 422
    retention = await api.get("/v1/runs/retention?previewDays=30", headers=admin)
    assert retention.status_code == 200 and retention.json() == {
        "days": None,
        "setBy": None,
        "setAt": None,
        "wouldDelete": 0,
        "wouldDeleteDocuments": 0,
    }
    saved = await api.put("/v1/runs/retention", headers=admin, json={"days": 90})
    assert saved.json()["days"] == 90 and saved.json()["setBy"] == "alice"
    assert (await api.put("/v1/runs/retention", headers=admin, json={"days": 0})).status_code == 422
    assert (await api.get("/v1/runs/retention", headers=published)).status_code == 401  # API key


async def test_prepared_data_of_the_starter(api, admin, published):
    response = await api.post("/v1/templates/quote/draft/prepared", headers=admin, json={"params": PARAMS})
    assert response.status_code == 200, response.text
    body = response.json()
    assert_fits("PreparedData", body)
    assert body["totals"]["grand"] == "3210.00"
    assert body["lists"]["items"]["rows"][0]["amount"] == "2501.00"
    runs = (await api.get("/v1/runs", headers=admin)).json()["items"]
    assert runs == []  # not a render: nothing in the history

    bad = await api.post(
        "/v1/templates/quote/draft/prepared", headers=admin, json={"params": PARAMS, "data": {"items": "x"}}
    )
    assert bad.status_code == 422 and bad.json()["code"] == "INPUT_INVALID" and bad.json()["problems"]


async def test_archive_blocks_writes_and_renders_until_restored(api, admin, published):
    archived = await api.put("/v1/templates/quote/archived", headers=admin, json={"archived": True})
    assert archived.status_code == 200 and archived.json()["archivedAt"] and archived.json()["archivedBy"]
    write = await api.put(
        "/v1/templates/quote/draft/files/extra.css", headers={**admin, "If-Match": "1"}, content=b"p {}"
    )
    assert (write.status_code, write.json()["code"]) == (409, "TEMPLATE_ARCHIVED")
    render = await api.post(
        "/v1/render", headers=published, json={"template": {"id": "quote", "version": 1}, "data": {}}
    )
    assert (render.status_code, render.json()["code"]) == (410, "TEMPLATE_ARCHIVED")
    assert render.json()["runId"]
    preview = await api.post("/v1/templates/quote/draft/preview", headers=admin, json={"params": PARAMS})
    assert preview.status_code == 410
    assert (await api.get("/v1/templates", headers=admin)).json() == []
    listed = (await api.get("/v1/templates?includeArchived=true", headers=admin)).json()
    assert [t["id"] for t in listed] == ["quote"] and listed[0]["archivedAt"]
    restored = await api.put("/v1/templates/quote/archived", headers=admin, json={"archived": False})
    assert restored.json()["archivedAt"] is None
    assert [t["id"] for t in (await api.get("/v1/templates", headers=admin)).json()] == ["quote"]
    by_key = await api.put("/v1/templates/quote/archived", headers=published, json={"archived": True})
    assert by_key.status_code == 401


async def test_limited_api_keys(api, admin, published):
    body = {"template": {"id": "quote", "version": 1}, "data": {}}
    other = await api.post("/v1/api-keys", headers=admin, json={"name": "other", "templates": ["invoice"]})
    assert other.status_code == 201 and other.json()["templates"] == ["invoice"]
    refused = await api.post(
        "/v1/render", headers={"Authorization": f"Bearer {other.json()['secret']}"}, json=body
    )
    assert (refused.status_code, refused.json()["code"]) == (403, "TEMPLATE_NOT_ALLOWED") and refused.json()[
        "runId"
    ]

    past = await api.post(
        "/v1/api-keys", headers=admin, json={"name": "x", "expiresAt": "2020-01-01T00:00:00Z"}
    )
    assert past.status_code == 422
    listed = (await api.get("/v1/api-keys", headers=admin)).json()
    assert {k["name"]: k["rateLimitPerMinute"] for k in listed} == {"erp": None, "other": None}

    slow = await api.post("/v1/api-keys", headers=admin, json={"name": "slow", "rateLimitPerMinute": 2})
    slow_auth = {"Authorization": f"Bearer {slow.json()['secret']}", "Content-Type": "application/json"}
    statuses = [
        (await api.post("/v1/render", headers=slow_auth, content=b"{ not json")).status_code for _ in range(3)
    ]
    assert statuses[:2] == [422, 422]  # within the limit the body is read (and is bad)
    limited = await api.post("/v1/render", headers=slow_auth, content=b"{ not json")
    assert (limited.status_code, limited.json()["code"], limited.json()["retryable"]) == (
        429,
        "RATE_LIMITED",
        True,
    )
    assert 1 <= int(limited.headers["Retry-After"]) <= 60  # refused before the body is read: 429, not 422
    assert statuses[2] == 429


async def test_documents_list_search_and_download(api, admin, published):
    body = {"template": {"id": "quote", "version": "published"}, "params": PARAMS, "filename": "ใบ Q-1.pdf"}
    rendered = await api.post(
        "/v1/render", headers={**published, "Content-Type": "application/json"},
        content=json.dumps(body, ensure_ascii=False)[:-1] + ', "data": ' + DATA_JSON + "}",
    )  # fmt: skip
    assert rendered.status_code == 200
    run_id = rendered.headers["Jester-Run-Id"]
    await api.post("/v1/templates/quote/draft/preview", headers=admin, json={"params": PARAMS})

    listed = await api.get("/v1/documents?templateId=quote&q=ลูกค้า", headers=admin)
    assert listed.status_code == 200
    page = listed.json()
    assert [d["runId"] for d in page["items"]] == [run_id] and page["next"] is None
    for item in page["items"]:
        assert_fits("DocumentSummary", item)
    assert page["items"][0]["caller"] == {
        "type": "api-key",
        "id": page["items"][0]["caller"]["id"],
        "name": "api-key:erp",
    }
    assert (await api.get("/v1/documents?q=nothing-like-this", headers=admin)).json()["items"] == []

    pdf = await api.get(f"/v1/documents/{run_id}", headers=admin)
    assert pdf.status_code == 200 and pdf.content == rendered.content
    assert pdf.headers["Content-Type"] == "application/pdf"
    assert unquote(pdf.headers["Content-Disposition"].split("filename*=UTF-8''", 1)[1]) == "ใบ Q-1.pdf"

    run = (await api.get(f"/v1/runs/{run_id}", headers=admin)).json()
    assert run["hasDocument"] is True
    preview_id = (await api.get("/v1/runs?templateId=quote", headers=admin)).json()["items"][0]["id"]
    assert (await api.get(f"/v1/documents/{preview_id}", headers=admin)).status_code == 404
    assert (await api.get("/v1/documents/nope", headers=admin)).status_code == 404
    for bad in ("", "x" * 101, "%20%20"):
        assert (await api.get(f"/v1/documents?q={bad}", headers=admin)).status_code == 422
    for path in ("/v1/documents", f"/v1/documents/{run_id}"):
        assert (await api.get(path, headers=published)).status_code == 401  # API keys cannot read documents


async def issue(api, headers, **extra):
    body = {"template": {"id": "quote", "version": "published"}, "params": PARAMS, **extra}
    rendered = await api.post(
        "/v1/render", headers={**headers, "Content-Type": "application/json"},
        content=json.dumps(body, ensure_ascii=False)[:-1] + ', "data": ' + DATA_JSON + "}",
    )  # fmt: skip
    return rendered


async def test_document_tags_over_http(api, admin, published):
    await api.put("/v1/templates/quote/tags", headers=admin, json={"tags": ["vip"]})
    copied = await issue(api, published)
    own = await issue(api, published, tags=[" ลูกค้า-ก ", "q4"])
    empty = await issue(api, published, tags=[])
    assert [r.status_code for r in (copied, own, empty)] == [200, 200, 200]
    items = (await api.get("/v1/documents", headers=admin)).json()["items"]
    by_id = {d["runId"]: d for d in items}
    for item in items:
        assert_fits("DocumentSummary", item)
    assert by_id[copied.headers["Jester-Run-Id"]]["tags"] == ["vip"]
    assert by_id[own.headers["Jester-Run-Id"]]["tags"] == ["ลูกค้า-ก", "q4"]
    assert by_id[empty.headers["Jester-Run-Id"]]["tags"] == []

    async def ids(query):
        return {d["runId"] for d in (await api.get(f"/v1/documents?{query}", headers=admin)).json()["items"]}

    assert await ids("tag=vip") == {copied.headers["Jester-Run-Id"]}
    assert await ids("tag=ลูกค้า-ก&tag=q4") == {own.headers["Jester-Run-Id"]}
    assert await ids("tag=ลูกค้า-ก&tag=vip") == set()
    assert await ids("q=q4") == {own.headers["Jester-Run-Id"]}


async def test_bad_tags_when_rendering_are_422_and_leave_nothing(api, admin, published):
    for bad in (["a,b"], ["x" * 31], [f"t{i}" for i in range(11)], "vip", [3]):
        r = await issue(api, published, tags=bad)
        assert (r.status_code, r.json()["code"]) == (422, "INPUT_INVALID")
    assert (await api.get("/v1/runs", headers=admin)).json()["items"] == []
    assert (await api.get("/v1/documents", headers=admin)).json()["items"] == []


async def test_set_document_tags_is_for_studio_sessions_only(api, admin, published):
    run_id = (await issue(api, published, tags=["old"])).headers["Jester-Run-Id"]
    url = f"/v1/documents/{run_id}/tags"
    put = await api.put(url, headers=admin, json={"tags": [" new ", "ไทย", "new"]})
    assert (put.status_code, put.json()) == (200, {"tags": ["new", "ไทย"]})
    assert (await api.get("/v1/documents", headers=admin)).json()["items"][0]["tags"] == ["new", "ไทย"]
    assert (
        await api.get(f"/v1/documents/{run_id}", headers=admin)
    ).status_code == 200  # the PDF is untouched
    bad = await api.put(url, headers=admin, json={"tags": ["a,b"]})
    assert (bad.status_code, bad.json()["code"]) == (422, "INPUT_INVALID") and "a,b" in bad.json()["detail"]
    assert (await api.put(url, headers=admin, json={"tags": "x"})).status_code == 422
    assert (await api.put("/v1/documents/nope/tags", headers=admin, json={"tags": []})).status_code == 404
    assert (await api.put(url, json={"tags": []})).status_code == 401
    assert (await api.put(url, headers=published, json={"tags": []})).status_code == 401  # API key
