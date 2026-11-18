import asyncio
import base64

import pytest

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.report_definition import DefinitionInput, load_definition
from jester_api.template_store import StoreError

pytestmark = pytest.mark.db

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
FONTS = frozenset({"TH Sarabun New"})


async def code_of(awaitable) -> str:
    with pytest.raises(StoreError) as e:
        await awaitable
    return e.value.code


async def test_create_list_get_rename(store):
    created = await store.create("quote", "ใบเสนอราคา", "quotation", "alice")
    assert (created.id, created.draft_revision, created.published_version) == ("quote", 1, None)
    assert created.draft_changed_since_publish and created.orientation == "portrait"
    assert await code_of(store.create("quote", "again", "blank", "bob")) == "CONFLICT"
    assert await code_of(store.create("Bad_ID", "x", "blank", "bob")) == "INPUT_INVALID"
    await store.create("aaa", "first", "blank", "bob")
    assert [t.id for t in await store.list()] == ["aaa", "quote"]
    assert (await store.rename("quote", "  ชื่อใหม่ ")).name == "ชื่อใหม่"
    assert await code_of(store.get("nope")) == "NOT_FOUND"


@pytest.mark.parametrize("starter", ["blank", "quotation", "grouped-table", "master-detail", "tax-invoice"])
async def test_every_starter_validates_and_binds(store, starter):
    await store.create("t1", "t", starter, "alice")
    stored = await store.definition_input("t1", "draft")
    loaded = load_definition(DefinitionInput(stored.files, stored.assets, FONTS))
    assert loaded.problems == []
    report = loaded.definition.report
    for sample_name in report.data.samples:
        import json
        from decimal import Decimal

        data = json.loads(stored.files[sample_name], parse_float=Decimal)
        params = {"quoteId": "Q1", "docDate": "2026-11-14"} if starter == "quotation" else {}
        if starter == "grouped-table":
            params = {"from": "2026-11-01", "toExclusive": "2026-12-01"}
        if starter == "tax-invoice":
            params = {"invoiceNo": "INV-1", "issueDate": "2026-11-18"}
        prepared = prepare(loaded.definition, params, data, {})
        assert prepared.problems == []
        assert bind(loaded.definition, stored.files, stored.assets, prepared.prepared).problems == []


async def test_put_and_delete_files_bump_revision(store):
    await store.create("t1", "t", "blank", "alice")
    rev = await store.put_file("t1", "extra.css", "p { color: red; }", 1, "bob")
    assert rev == 2
    draft = await store.get_draft("t1")
    assert draft.revision == 2 and draft.updated_by == "bob" and "extra.css" in [f.name for f in draft.files]
    assert await code_of(store.put_file("t1", "extra.css", "x", 1, "bob")) == "REVISION_CONFLICT"
    assert await store.delete_file("t1", "extra.css", 2, "bob") == 3
    assert await code_of(store.delete_file("t1", "template.html", 3, "bob")) == "CONFLICT"
    assert await code_of(store.delete_file("t1", "missing.css", 3, "bob")) == "NOT_FOUND"
    assert await code_of(store.put_file("nope", "a.css", "x", 1, "bob")) == "NOT_FOUND"
    assert (await store.get_draft("t1")).revision == 3  # failed writes rolled back


@pytest.mark.parametrize("name", ["index.html", "../x.css", "a/b.css", "x.js", ".hidden.css"])
async def test_bad_file_names(store, name):
    await store.create("t1", "t", "blank", "alice")
    assert await code_of(store.put_file("t1", name, "x", 1, "bob")) == "INPUT_INVALID"


async def test_two_tabs_saving_at_once_one_wins(store):
    await store.create("t1", "t", "blank", "alice")
    results = await asyncio.gather(
        store.put_file("t1", "a.css", "a", 1, "tab1"),
        store.put_file("t1", "b.css", "b", 1, "tab2"),
        return_exceptions=True,
    )
    assert sorted(type(r).__name__ for r in results) == ["StoreError", "int"]
    assert [r.code for r in results if isinstance(r, StoreError)] == ["REVISION_CONFLICT"]
    assert (await store.get_draft("t1")).revision == 2


async def test_assets(store):
    await store.create("t1", "t", "blank", "alice")
    asset, rev = await store.add_asset("t1", "logo.png", PNG, 1, "bob")
    assert (asset.content_type, asset.size, rev) == ("image/png", len(PNG), 2)
    assert await code_of(store.add_asset("t1", "logo.png", PNG, 2, "bob")) == "CONFLICT"
    assert await code_of(store.add_asset("t1", "fake.png", b"<html>", 2, "bob")) == "UNSUPPORTED_MEDIA_TYPE"
    assert await code_of(store.add_asset("t1", "font.woff2", b"wOF2", 2, "bob")) == "INPUT_INVALID"
    assert (await store.get_draft("t1")).revision == 2
    await store.add_asset("t1", "same.png", PNG, 2, "bob")  # same bytes under another name: one blob
    assert store._blobs.writes == 1
    assert await store.asset_bytes(asset.sha256) == PNG
    assert await store.delete_asset("t1", "logo.png", 3, "bob") == 4
    assert await code_of(store.delete_asset("t1", "logo.png", 4, "bob")) == "NOT_FOUND"


async def test_limits_roll_back(store, monkeypatch):
    import jester_api.template_store.store as module

    await store.create("t1", "t", "blank", "alice")
    assert (
        await code_of(store.put_file("t1", "big.css", "x" * (1024 * 1024 + 1), 1, "bob"))
        == "PAYLOAD_TOO_LARGE"
    )
    monkeypatch.setattr(module, "MAX_DRAFT_BYTES", 400)
    assert await code_of(store.put_file("t1", "a.css", "x" * 400, 1, "bob")) == "PAYLOAD_TOO_LARGE"
    monkeypatch.setattr(module, "MAX_DRAFT_BYTES", 20 * 1024 * 1024)
    monkeypatch.setattr(module, "MAX_FILES", 4)  # blank has 4 files already
    assert await code_of(store.put_file("t1", "a.css", "x", 1, "bob")) == "PAYLOAD_TOO_LARGE"
    monkeypatch.setattr(module, "MAX_ASSET_BYTES", 10)
    assert await code_of(store.add_asset("t1", "logo.png", PNG, 1, "bob")) == "PAYLOAD_TOO_LARGE"
    assert (await store.get_draft("t1")).revision == 1  # nothing was kept
