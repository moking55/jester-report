import json
from decimal import Decimal
from urllib.parse import unquote

import pytest

from jester_api.public_api.routes.render import content_disposition

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
    }
    saved = await api.put("/v1/runs/retention", headers=admin, json={"days": 90})
    assert saved.json()["days"] == 90 and saved.json()["setBy"] == "alice"
    assert (await api.put("/v1/runs/retention", headers=admin, json={"days": 0})).status_code == 422
    assert (await api.get("/v1/runs/retention", headers=published)).status_code == 401  # API key
