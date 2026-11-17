"""v1.1 lifecycle: archive (A3). SPEC-template-store.md "v1.1"."""

import asyncio
import base64

import pytest

from jester_api.template_store import StoreError
from jester_api.template_store.bundle import read_zip

pytestmark = pytest.mark.db

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


async def code_of(awaitable) -> str:
    with pytest.raises(StoreError) as e:
        await awaitable
    return e.value.code


async def published(store, template_id: str) -> int:
    """A template with one published version and a draft at revision 1."""
    await store.create(template_id, "tt", "blank", "alice")
    return (await store.publish(template_id, 1, None, "alice")).version


async def test_archive_hides_from_list_and_is_idempotent(store):
    await store.create("aa", "A", "blank", "alice")
    await store.create("bb", "B", "blank", "alice")
    archived = await store.set_archived("aa", True, "bob")
    assert archived.archived_at is not None and archived.archived_by == "bob"
    again = await store.set_archived("aa", True, "carol")
    assert again.archived_at == archived.archived_at and again.archived_by == "bob"
    assert [t.id for t in await store.list()] == ["bb"]
    assert [t.id for t in await store.list(include_archived=True)] == ["aa", "bb"]
    assert (await store.get("aa")).archived_at is not None
    restored = await store.set_archived("aa", False, "bob")
    assert (restored.archived_at, restored.archived_by) == (None, None)
    assert [t.id for t in await store.list()] == ["aa", "bb"]
    assert await code_of(store.set_archived("nope", True, "bob")) == "NOT_FOUND"


async def test_archived_template_rejects_every_write(store):
    version = await published(store, "tt")
    await store.set_archived("tt", True, "bob")
    writes = [
        store.put_file("tt", "template.html", "<p>x</p>", 1, "bob"),
        store.delete_file("tt", "styles.css", 1, "bob"),
        store.add_asset("tt", "logo.png", PNG, 1, "bob"),
        store.delete_asset("tt", "logo.png", 1, "bob"),
        store.reset_draft("tt", version, 1, "bob"),
        store.publish("tt", 1, None, "bob"),
        store.set_published("tt", version),
        store.rename("tt", "new name"),
    ]
    for write in writes:
        assert await code_of(write) == "ARCHIVED"
    assert (await store.get_draft("tt")).revision == 1
    assert (await store.get("tt")).name == "tt"


async def test_archived_template_reads_but_has_no_definition(store):
    version = await published(store, "tt")
    await store.set_archived("tt", True, "bob")
    assert (await store.get_draft("tt")).revision == 1
    assert [v.version for v in await store.list_versions("tt")] == [version]
    assert (await store.get_version("tt", version)).version.version == version
    for ref in ("draft", "published", version):
        assert await code_of(store.definition_input("tt", ref)) == "ARCHIVED"
    await store.set_archived("tt", False, "bob")
    assert (await store.definition_input("tt", "published")).version == version
    assert await store.put_file("tt", "template.html", "<p>x</p>", 1, "bob") == 2


async def test_no_write_lands_after_archive(store):
    """Archive and a burst of writes race; every write either commits before the archive or fails."""
    await store.create("tt", "tt", "blank", "alice")

    async def write(i: int) -> str:
        try:
            await store.put_file("tt", f"part{i}.html", "<p>x</p>", 1 + i, "bob")
            return "ok"
        except StoreError as e:
            return e.code

    results = await asyncio.gather(*(write(i) for i in range(5)), store.set_archived("tt", True, "bob"))
    archived_at = results[-1].archived_at
    draft = await store.get_draft("tt")
    assert draft.updated_at <= archived_at
    assert set(results[:-1]) <= {"ok", "ARCHIVED", "REVISION_CONFLICT"}


async def test_duplicate_from_draft_and_version_shares_blobs(store):
    version = await published(store, "tt")
    _, rev = await store.add_asset("tt", "logo.png", PNG, 1, "alice")
    writes = store._blobs.writes
    copy = await store.duplicate("tt", "draft", "tt-copy", "สำเนา", "bob")
    assert (copy.id, copy.name, copy.draft_revision, copy.published_version) == ("tt-copy", "สำเนา", 1, None)
    source, dup = await store.get_draft("tt"), await store.get_draft("tt-copy")
    assert [(f.name, f.sha256) for f in dup.files] == [(f.name, f.sha256) for f in source.files]
    assert [(a.name, a.sha256) for a in dup.assets] == [(a.name, a.sha256) for a in source.assets]
    assert store._blobs.writes == writes and await store.list_versions("tt-copy") == []
    old = await store.duplicate("tt", version, "tt-v1", "v1", "bob")
    assert [a.name for a in (await store.get_draft(old.id)).assets] == []  # the logo came after v1
    assert await code_of(store.duplicate("tt", "draft", "tt-copy", "x", "bob")) == "CONFLICT"
    assert await code_of(store.duplicate("tt", 9, "tt-v9", "x", "bob")) == "NOT_FOUND"
    assert await code_of(store.duplicate("nope", "draft", "zz", "x", "bob")) == "NOT_FOUND"
    assert await code_of(store.duplicate("tt", "draft", "Bad_ID", "x", "bob")) == "INPUT_INVALID"
    await store.set_archived("tt", True, "bob")
    assert (await store.duplicate("tt", "draft", "tt-again", "x", "bob")).archived_at is None


async def test_export_then_import_as_new_template_matches_byte_for_byte(store):
    await published(store, "tt")
    await store.add_asset("tt", "logo.png", PNG, 1, "alice")
    exported = await store.export_zip("tt", "draft")
    assert exported.filename == "tt-draft-r2.zip"
    result = await store.import_zip(exported.data, None, "bob", template_id="tt-moved")
    assert (result.created, result.revision, result.summary.name) == (True, 1, "tt")
    source, moved = await store.get_draft("tt"), await store.get_draft("tt-moved")
    assert [(f.name, f.sha256) for f in moved.files] == [(f.name, f.sha256) for f in source.files]
    assert [(a.name, a.sha256) for a in moved.assets] == [(a.name, a.sha256) for a in source.assets]
    v1 = await store.export_zip("tt", 1)
    assert v1.filename == "tt-v1.zip" and read_zip(v1.data).assets == {}  # the logo came after v1


async def test_import_over_an_existing_draft_needs_its_revision(store):
    await published(store, "tt")
    await store.put_file("tt", "extra.css", "p {}", 1, "alice")  # revision 2, not in the zip below
    zip_v1 = (await store.export_zip("tt", 1)).data
    assert await code_of(store.import_zip(zip_v1, None, "bob")) == "CONFLICT"
    assert await code_of(store.import_zip(zip_v1, 1, "bob")) == "REVISION_CONFLICT"
    assert await code_of(store.import_zip(zip_v1, 1, "bob", template_id="ghost")) == "NOT_FOUND"
    result = await store.import_zip(zip_v1, 2, "bob")
    assert (result.created, result.revision) == (False, 3)
    draft = await store.get_draft("tt")
    assert "extra.css" not in [f.name for f in draft.files] and draft.based_on_version is None
    assert [v.version for v in await store.list_versions("tt")] == [1]
    assert (await store.get("tt")).published_version == 1
    await store.set_archived("tt", True, "bob")
    assert await code_of(store.import_zip(zip_v1, 3, "bob")) == "ARCHIVED"
    assert (await store.export_zip("tt", "draft")).filename == "tt-draft-r3.zip"


async def test_bad_zip_writes_nothing(store):
    assert await code_of(store.import_zip(b"not a zip", None, "bob")) == "INPUT_INVALID"
    assert await store.list(include_archived=True) == []
