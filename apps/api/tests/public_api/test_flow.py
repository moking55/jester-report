"""Setup to render with an API key, every response checked against the contract schemas."""

import pytest

from .conftest import PASSWORD
from .test_contract import assert_fits

pytestmark = pytest.mark.db
PARAMS = {"quoteId": "Q-1", "docDate": "2026-11-14"}
DATA = {
    "company": {"name": "บริษัท ก"},
    "customer": {"name": "ลูกค้า"},
    "discount": "0",
    "items": [{"id": "A", "description": "x", "qty": 2, "unitPrice": "1250.50"}],
}


async def test_setup_to_render_matches_the_contract(api):
    assert (await api.get("/v1/setup")).json() == {"setupRequired": True}
    token = await api._transport.app.state.services.auth.prepare_setup()
    setup = await api.post("/v1/setup", json={"setupToken": token, "username": "alice", "password": PASSWORD})
    assert_fits("Session", setup.json())

    login = await api.post("/v1/auth/login", json={"username": "alice", "password": PASSWORD})
    assert_fits("Session", login.json())
    user = {"Authorization": f"Bearer {login.json()['token']}"}
    assert_fits("User", (await api.get("/v1/auth/me", headers=user)).json())

    created = await api.post(
        "/v1/templates", headers=user, json={"id": "quote", "name": "Q", "starter": "quotation"}
    )
    assert_fits("TemplateSummary", created.json())
    draft = (await api.get("/v1/templates/quote/draft", headers=user)).json()
    assert_fits("Draft", draft)
    edit = await api.put(
        "/v1/templates/quote/draft/files/notes.css", headers={**user, "If-Match": "1"}, content=b"p {}"
    )
    assert_fits("DraftRevision", edit.json())
    checked = await api.post("/v1/templates/quote/draft/validate", headers=user)
    assert_fits("ValidationResult", checked.json())
    published = await api.post("/v1/templates/quote/versions", headers={**user, "If-Match": "2"}, json={})
    assert_fits("Version", published.json())
    frozen = (await api.get("/v1/templates/quote/versions/1", headers=user)).json()
    assert_fits("Version", frozen)
    for f in frozen["files"]:
        assert_fits("TextFile", f)
    for a in frozen["assets"]:
        assert_fits("Asset", a)

    key = await api.post("/v1/api-keys", headers=user, json={"name": "erp"})
    assert_fits("ApiKey", key.json())
    caller = {"Authorization": f"Bearer {key.json()['secret']}"}
    pdf = await api.post(
        "/v1/render",
        headers=caller,
        json={"template": {"id": "quote", "version": "published"}, "params": PARAMS, "data": DATA},
    )
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    failed = await api.post(
        "/v1/render", headers=caller, json={"template": {"id": "nope", "version": 1}, "data": {}}
    )
    assert_fits("Problem", failed.json())

    runs = (await api.get("/v1/runs", headers=user)).json()
    assert [r["status"] for r in runs["items"]] == ["failed", "succeeded"]
    for r in runs["items"]:
        assert_fits("Run", r)
    assert_fits("Run", (await api.get(f"/v1/runs/{runs['items'][1]['id']}", headers=user)).json())
    listed = (await api.get("/v1/templates", headers=user)).json()
    assert_fits("TemplateSummary", listed[0])
    assert listed[0]["lastRun"]["status"] == "succeeded"
    assert_fits("RunRetention", (await api.get("/v1/runs/retention?previewDays=7", headers=user)).json())
    assert_fits("Health", (await api.get("/v1/health")).json())


async def test_tax_invoice_from_starter_to_render_with_a_limited_key(api, admin):
    created = await api.post(
        "/v1/templates", headers=admin, json={"id": "tax", "name": "ใบกำกับภาษี", "starter": "tax-invoice"}
    )
    assert_fits("TemplateSummary", created.json())
    checked = (await api.post("/v1/templates/tax/draft/validate", headers=admin)).json()
    assert checked["valid"] is True, checked["problems"]
    assert (
        await api.post("/v1/templates/tax/versions", headers={**admin, "If-Match": "1"}, json={})
    ).status_code == 201
    key = await api.post("/v1/api-keys", headers=admin, json={"name": "erp", "templates": ["tax"]})
    assert_fits("ApiKey", key.json())
    draft = (await api.get("/v1/templates/tax/draft", headers=admin)).json()
    sample = next(f["content"] for f in draft["files"] if f["name"] == "sample.json")
    rendered = await api.post(
        "/v1/render",
        headers={"Authorization": f"Bearer {key.json()['secret']}", "Content-Type": "application/json"},
        content=(
            '{"template": {"id": "tax", "version": "published"},'
            ' "params": {"invoiceNo": "INV-1", "issueDate": "2026-11-18"}, "data": ' + sample + "}"
        ).encode(),
    )
    assert rendered.status_code == 200 and rendered.content.startswith(b"%PDF")
