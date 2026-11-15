import base64

import pytest

pytestmark = pytest.mark.db
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


async def test_template_lifecycle(api, admin):
    created = await api.post(
        "/v1/templates", headers=admin, json={"id": "quote", "name": "Q", "starter": "quotation"}
    )
    assert created.status_code == 201 and created.json()["draftRevision"] == 1
    assert created.json()["page"] == {"size": "A4", "orientation": "portrait"}
    dup = await api.post("/v1/templates", headers=admin, json={"id": "quote", "name": "again"})
    assert (dup.status_code, dup.json()["code"]) == (409, "CONFLICT")
    assert [t["id"] for t in (await api.get("/v1/templates", headers=admin)).json()] == ["quote"]
    renamed = await api.patch("/v1/templates/quote", headers=admin, json={"name": "ใบเสนอราคา"})
    assert renamed.json()["name"] == "ใบเสนอราคา"
    assert (await api.get("/v1/templates/nope", headers=admin)).status_code == 404


async def test_draft_edits_need_the_revision(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "t1", "name": "T", "starter": "blank"})
    url = "/v1/templates/t1/draft/files/extra.css"
    missing = await api.put(url, headers=admin, content=b"p {}")
    assert (missing.status_code, missing.json()["code"]) == (428, "REVISION_REQUIRED")
    ok = await api.put(url, headers={**admin, "If-Match": '"1"'}, content=b"p { color: red; }")
    assert ok.json() == {"revision": 2}
    stale = await api.put(url, headers={**admin, "If-Match": "1"}, content=b"p {}")
    assert (stale.status_code, stale.json()["code"]) == (412, "REVISION_CONFLICT")
    bad = await api.put(url, headers={**admin, "If-Match": "abc"}, content=b"p {}")
    assert bad.status_code == 422
    draft = (await api.get("/v1/templates/t1/draft", headers=admin)).json()
    assert draft["revision"] == 2 and "extra.css" in [f["name"] for f in draft["files"]]
    gone = await api.delete(url, headers={**admin, "If-Match": "2"})
    assert gone.json() == {"revision": 3}
    required = await api.delete(
        "/v1/templates/t1/draft/files/template.html", headers={**admin, "If-Match": "3"}
    )
    assert required.status_code == 409


async def test_assets(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "t1", "name": "T"})
    url, headers = "/v1/templates/t1/draft/assets", {**admin, "If-Match": "1"}
    up = await api.post(url, headers=headers, files={"file": ("logo.png", PNG, "image/png")})
    assert (
        up.status_code == 201
        and up.json()["asset"]["contentType"] == "image/png"
        and up.json()["revision"] == 2
    )
    fake = await api.post(
        url, headers={**admin, "If-Match": "2"}, files={"file": ("fake.png", b"<html>", "image/png")}
    )
    assert (fake.status_code, fake.json()["code"]) == (415, "UNSUPPORTED_MEDIA_TYPE")
    dup = await api.post(
        url, headers={**admin, "If-Match": "2"}, files={"file": ("logo.png", PNG, "image/png")}
    )
    assert dup.status_code == 409

    got = await api.get(f"{url}/logo.png", headers=admin)
    assert got.status_code == 200 and got.content == PNG
    assert got.headers["content-type"] == "image/png" and got.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in got.headers["content-security-policy"]
    assert (await api.get(f"{url}/nope.png", headers=admin)).status_code == 404
    assert (await api.get(f"{url}/logo.png")).status_code == 401

    gone = await api.delete(f"{url}/logo.png", headers={**admin, "If-Match": "2"})
    assert gone.json() == {"revision": 3}


async def test_publish_validates_at_the_given_revision(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "quote", "name": "Q", "starter": "quotation"})
    valid = (await api.post("/v1/templates/quote/draft/validate", headers=admin)).json()
    assert valid == {"valid": True, "revision": 1, "problems": []}

    broken = (await api.get("/v1/templates/quote/draft", headers=admin)).json()
    html = next(f["content"] for f in broken["files"] if f["name"] == "template.html") + "\n{{ data.nope }}"
    await api.put(
        "/v1/templates/quote/draft/files/template.html",
        headers={**admin, "If-Match": "1"},
        content=html.encode(),
    )
    refused = await api.post("/v1/templates/quote/versions", headers={**admin, "If-Match": "2"}, json={})
    assert (refused.status_code, refused.json()["code"]) == (422, "DRAFT_INVALID")
    assert refused.json()["problems"][0]["code"] == "TEMPLATE_UNDEFINED"
    stale = await api.post("/v1/templates/quote/versions", headers={**admin, "If-Match": "1"}, json={})
    assert stale.status_code == 412

    reset = await api.post(
        "/v1/templates/quote/draft/reset", headers={**admin, "If-Match": "2"}, json={"version": 1}
    )
    assert reset.status_code == 404  # nothing published yet
    fixed = html.replace("\n{{ data.nope }}", "")
    await api.put(
        "/v1/templates/quote/draft/files/template.html",
        headers={**admin, "If-Match": "2"},
        content=fixed.encode(),
    )
    published = await api.post(
        "/v1/templates/quote/versions", headers={**admin, "If-Match": "3"}, json={"note": "v1"}
    )
    assert (
        published.status_code == 201 and published.json()["version"] == 1 and published.json()["isPublished"]
    )
    assert [v["version"] for v in (await api.get("/v1/templates/quote/versions", headers=admin)).json()] == [
        1
    ]
    files = (await api.get("/v1/templates/quote/versions/1", headers=admin)).json()
    assert {"files", "assets", "sha256"} <= files.keys()
    alias = await api.put("/v1/templates/quote/published", headers=admin, json={"version": 1})
    assert alias.json()["publishedVersion"] == 1
