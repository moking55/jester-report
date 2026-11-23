"""?allowEmpty=true: the blank form through the public API (SPEC-public-api.md v1.14)."""

import sys

import pytest

from .test_render_runs import published  # noqa: F401 - fixture

pytestmark = pytest.mark.db
QUOTE = {"id": "quote", "version": "published"}


@pytest.fixture
def seen_meta(monkeypatch):
    module = sys.modules["jester_api.render_service.service"]
    seen: dict = {}
    real = module.run_in_worker

    async def spy(definition, files, assets, params, data, meta, *, timeout_s):
        seen.update(meta)
        return await real(definition, files, assets, params, data, meta, timeout_s=timeout_s)

    monkeypatch.setattr(module, "run_in_worker", spy)
    return seen


async def test_render_blank_form_with_nothing_sent(api, admin, published, seen_meta):  # noqa: F811
    body = {"template": QUOTE, "params": {}, "data": {}}
    refused = await api.post("/v1/render", headers=published, json=body)
    assert refused.status_code == 422  # required fields, as before
    ok = await api.post("/v1/render?allowEmpty=true", headers=published, json=body)
    assert ok.status_code == 200 and ok.content.startswith(b"%PDF") and seen_meta["blank"] is True
    runs = (await api.get("/v1/runs?templateId=quote", headers=admin)).json()["items"]
    assert ok.headers["Jester-Run-Id"] in {r["id"] for r in runs}  # recorded like any render
    docs = (await api.get("/v1/documents?templateId=quote", headers=admin)).json()["items"]
    assert len(docs) == 1  # and kept like any issued document


@pytest.mark.parametrize("value", ["yes", "1", "TRUE", ""])
async def test_allow_empty_is_true_or_false_only(api, published, value):  # noqa: F811
    response = await api.post(
        f"/v1/render?allowEmpty={value}", headers=published, json={"template": QUOTE, "data": {}}
    )
    assert response.status_code == 422 and response.json()["code"] == "INPUT_INVALID"


async def test_allow_empty_false_is_a_normal_render(api, published, seen_meta):  # noqa: F811
    response = await api.post(
        "/v1/render?allowEmpty=false", headers=published, json={"template": QUOTE, "data": {}}
    )
    assert response.status_code == 422


async def test_allow_empty_keeps_the_key_allow_list(api, admin, published):  # noqa: F811
    await api.post("/v1/templates", headers=admin, json={"id": "other", "name": "O", "starter": "quotation"})
    key = await api.post("/v1/api-keys", headers=admin, json={"name": "limited", "templates": ["other"]})
    limited = {"Authorization": f"Bearer {key.json()['secret']}"}
    response = await api.post(
        "/v1/render?allowEmpty=true", headers=limited, json={"template": QUOTE, "data": {}}
    )
    assert response.status_code == 403 and response.json()["code"] == "TEMPLATE_NOT_ALLOWED"


async def test_draft_preview_and_prepared_take_allow_empty(api, admin, published):  # noqa: F811
    blank = {"params": {}, "data": {}}
    assert (await api.post("/v1/templates/quote/draft/preview", headers=admin, json=blank)).status_code == 422
    preview = await api.post("/v1/templates/quote/draft/preview?allowEmpty=true", headers=admin, json=blank)
    assert preview.status_code == 200 and preview.content.startswith(b"%PDF")
    prepared = await api.post("/v1/templates/quote/draft/prepared?allowEmpty=true", headers=admin, json=blank)
    assert prepared.status_code == 200
    assert prepared.json()["totals"] == {"subtotal": None, "net": None, "vat": None, "grand": None}
