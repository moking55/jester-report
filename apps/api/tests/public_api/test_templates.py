import base64

import pytest

from .test_contract import assert_fits

pytestmark = pytest.mark.db
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


async def test_template_lifecycle(api, admin):
    created = await api.post(
        "/v1/templates", headers=admin, json={"id": "quote", "name": "Q", "starter": "quotation"}
    )
    assert created.status_code == 201 and created.json()["draftRevision"] == 1
    assert created.json()["page"] == {"size": "A4", "orientation": "portrait", "layout": "flow"}
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


async def test_duplicate(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "quote", "name": "Q", "starter": "quotation"})
    url = "/v1/templates/quote/duplicate"
    copy = await api.post(url, headers=admin, json={"id": "quote-2", "name": "Q2"})
    assert copy.status_code == 201
    body = copy.json()
    assert (body["id"], body["draftRevision"], body["publishedVersion"]) == ("quote-2", 1, None)
    taken = await api.post(url, headers=admin, json={"id": "quote-2", "name": "x"})
    assert (taken.status_code, taken.json()["code"]) == (409, "CONFLICT")
    no_version = await api.post(
        "/v1/templates/quote/duplicate", headers=admin, json={"id": "quote-3", "name": "x", "version": 4}
    )
    assert no_version.status_code == 404
    bad = await api.post(
        "/v1/templates/quote/duplicate", headers=admin, json={"id": "quote-3", "name": "x", "version": "v1"}
    )
    assert bad.status_code == 422


async def test_export_and_import_over_http(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "quote", "name": "Q", "starter": "quotation"})
    exported = await api.get("/v1/templates/quote/export", headers=admin)
    assert exported.status_code == 200 and exported.headers["content-type"] == "application/zip"
    assert "quote-draft-r1.zip" in exported.headers["content-disposition"]
    zip_file = {"file": ("quote.zip", exported.content, "application/zip")}

    created = await api.post(
        "/v1/templates/import", headers=admin, files=zip_file, data={"templateId": "moved"}
    )
    assert created.status_code == 201
    assert (created.json()["created"], created.json()["template"]["id"]) == (True, "moved")
    draft = (await api.get("/v1/templates/moved/draft", headers=admin)).json()
    source = (await api.get("/v1/templates/quote/draft", headers=admin)).json()
    assert [f["sha256"] for f in draft["files"]] == [f["sha256"] for f in source["files"]]

    no_match = await api.post("/v1/templates/import", headers=admin, files=zip_file)
    assert (no_match.status_code, no_match.json()["code"]) == (409, "CONFLICT")
    stale = await api.post("/v1/templates/import", headers={**admin, "If-Match": '"9"'}, files=zip_file)
    assert stale.status_code == 412
    replaced = await api.post("/v1/templates/import", headers={**admin, "If-Match": '"1"'}, files=zip_file)
    assert replaced.status_code == 200 and replaced.json() | {"template": None} == {
        "template": None,
        "revision": 2,
        "created": False,
        "warnings": [],  # v1.15: always there, empty for a zip
    }
    bad_version = await api.get("/v1/templates/quote/export?version=v1", headers=admin)
    assert bad_version.status_code == 422
    junk = await api.post("/v1/templates/import", headers=admin, files={"file": ("x.zip", b"junk")})
    assert junk.status_code == 422


async def test_import_over_an_archived_template_asks_first_then_replaces_and_unarchives(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "t1", "name": "T", "starter": "blank"})
    zip_file = {"file": ("t1.zip", (await api.get("/v1/templates/t1/export", headers=admin)).content)}
    archived = await api.put("/v1/templates/t1/archived", headers=admin, json={"archived": True})
    assert archived.status_code == 200
    first = await api.post("/v1/templates/import", headers={**admin, "If-Match": '"1"'}, files=zip_file)
    assert (first.status_code, first.json()["code"]) == (409, "TEMPLATE_ARCHIVED")
    assert (await api.get("/v1/templates/t1", headers=admin)).json()["archivedAt"] is not None
    for value in ("yes", "maybe"):
        bad = await api.post(
            "/v1/templates/import",
            headers={**admin, "If-Match": '"1"'},
            files=zip_file,
            data={"unarchive": value},
        )
        assert bad.status_code == 422
    replaced = await api.post(
        "/v1/templates/import",
        headers={**admin, "If-Match": '"1"'},
        files=zip_file,
        data={"unarchive": "true"},
    )
    assert replaced.status_code == 200 and replaced.json()["created"] is False
    assert replaced.json()["template"]["archivedAt"] is None
    assert (await api.get("/v1/templates/t1", headers=admin)).json()["archivedAt"] is None


async def test_import_body_limit_is_26_mb_on_that_route_only(api, admin):
    big = {"file": ("big.zip", b"PK" + b"\0" * (25 * 1024 * 1024 + 512 * 1024), "application/zip")}
    over_store = await api.post("/v1/templates/import", headers=admin, files=big)
    assert (over_store.status_code, over_store.json()["code"]) == (413, "PAYLOAD_TOO_LARGE")
    huge = {"file": ("huge.zip", b"PK" + b"\0" * (27 * 1024 * 1024), "application/zip")}
    assert (await api.post("/v1/templates/import", headers=admin, files=huge)).status_code == 413
    await api.post("/v1/templates", headers=admin, json={"id": "t1", "name": "T", "starter": "blank"})
    other = await api.put(
        "/v1/templates/t1/draft/files/big.css",
        headers={**admin, "If-Match": "1"},
        content=b"a" * (11 * 1024 * 1024),
    )
    assert other.status_code == 413


async def test_create_with_a_page(api, admin):
    ok = await api.post(
        "/v1/templates",
        headers=admin,
        json={"id": "receipt", "name": "R", "starter": "blank", "page": {"size": "roll", "rollWidthMm": 58}},
    )
    assert ok.status_code == 201
    draft = (await api.get("/v1/templates/receipt/draft", headers=admin)).json()
    assert "header.html" not in [f["name"] for f in draft["files"]]
    bad = await api.post(
        "/v1/templates",
        headers=admin,
        json={"id": "bad", "name": "B", "starter": "blank", "page": {"size": "roll"}},
    )
    assert (bad.status_code, bad.json()["code"]) == (422, "INPUT_INVALID")
    wrong = await api.post(
        "/v1/templates",
        headers=admin,
        json={"id": "bad2", "name": "B", "starter": "quotation", "page": {"size": "A5"}},
    )
    assert wrong.status_code == 422


async def test_template_tags(api, admin):
    for tid in ("aa", "bb", "cc"):
        await api.post("/v1/templates", headers=admin, json={"id": tid, "name": tid})
    fresh = (await api.get("/v1/templates/aa", headers=admin)).json()
    assert fresh["tags"] == [] and fresh["draftChangedSincePublish"] is True
    put = await api.put("/v1/templates/aa/tags", headers=admin, json={"tags": [" vip ", "ไตรมาส  4", "vip"]})
    assert (put.status_code, put.json()) == (200, {"tags": ["vip", "ไตรมาส 4"]})
    await api.put("/v1/templates/bb/tags", headers=admin, json={"tags": ["vip"]})
    got = (await api.get("/v1/templates/aa", headers=admin)).json()
    assert_fits("TemplateSummary", got)
    assert got["tags"] == ["vip", "ไตรมาส 4"] and got["draftRevision"] == 1

    def ids(response):
        return [t["id"] for t in response.json()]

    assert ids(await api.get("/v1/templates?tag=vip", headers=admin)) == ["aa", "bb"]
    assert ids(await api.get("/v1/templates?tag=vip&tag=ไตรมาส 4", headers=admin)) == ["aa"]
    assert ids(await api.get("/v1/templates?tag=VIP", headers=admin)) == []
    assert ids(await api.get("/v1/templates", headers=admin)) == ["aa", "bb", "cc"]
    for item in (await api.get("/v1/templates", headers=admin)).json():
        assert_fits("TemplateSummary", item)


async def test_template_tags_errors_and_who_may_edit(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "aa", "name": "A"})
    await api.put("/v1/templates/aa/tags", headers=admin, json={"tags": ["keep"]})
    for bad in (["a,b"], ["x" * 31], [f"t{i}" for i in range(11)]):
        r = await api.put("/v1/templates/aa/tags", headers=admin, json={"tags": bad})
        assert (r.status_code, r.json()["code"]) == (422, "INPUT_INVALID")
    r = await api.put("/v1/templates/aa/tags", headers=admin, json={"tags": ["a,b"]})
    assert "a,b" in r.json()["detail"]  # names the tag
    for body in ({"tags": "vip"}, {"tags": [3]}, {}, {"tags": [], "x": 1}):
        assert (await api.put("/v1/templates/aa/tags", headers=admin, json=body)).status_code == 422
    assert (await api.get("/v1/templates/aa", headers=admin)).json()["tags"] == ["keep"]
    assert (await api.put("/v1/templates/nope/tags", headers=admin, json={"tags": []})).status_code == 404
    assert (await api.put("/v1/templates/aa/tags", json={"tags": []})).status_code == 401
    key = await api.post("/v1/api-keys", headers=admin, json={"name": "erp"})
    by_key = {"Authorization": f"Bearer {key.json()['secret']}"}
    assert (await api.put("/v1/templates/aa/tags", headers=by_key, json={"tags": []})).status_code == 401


async def test_tagging_does_not_make_a_published_template_look_edited(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "aa", "name": "A", "starter": "quotation"})
    await api.post("/v1/templates/aa/versions", headers={**admin, "If-Match": "1"}, json={})
    before = (await api.get("/v1/templates/aa", headers=admin)).json()
    assert before["draftChangedSincePublish"] is False
    await api.put("/v1/templates/aa/tags", headers=admin, json={"tags": ["vip"]})
    after = (await api.get("/v1/templates/aa", headers=admin)).json()
    assert after["draftChangedSincePublish"] is False
    assert (after["draftRevision"], after["updatedAt"]) == (before["draftRevision"], before["updatedAt"])


async def test_duplicate_and_zip_carry_tags_over_http(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "aa", "name": "A"})
    await api.put("/v1/templates/aa/tags", headers=admin, json={"tags": ["vip"]})
    copy = await api.post("/v1/templates/aa/duplicate", headers=admin, json={"id": "bb", "name": "B"})
    assert copy.json()["tags"] == ["vip"]
    zipped = await api.get("/v1/templates/aa/export", headers=admin)
    imported = await api.post(
        "/v1/templates/import",
        headers=admin,
        files={"file": ("aa.zip", zipped.content, "application/zip")},
        data={"templateId": "cc"},
    )
    assert imported.status_code == 201 and imported.json()["template"]["tags"] == ["vip"]
