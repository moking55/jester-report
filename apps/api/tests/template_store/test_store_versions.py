import asyncio

import psycopg
import pytest

from jester_api.report_definition import DefinitionInput
from jester_api.report_definition.loader import definition_sha256
from jester_api.template_store import StoreError

pytestmark = pytest.mark.db


async def code_of(awaitable) -> str:
    with pytest.raises(StoreError) as e:
        await awaitable
    return e.value.code


async def test_publish_freezes_the_draft(store):
    await store.create("qt", "Q", "quotation", "alice")
    v1 = await store.publish("qt", 1, "first", "alice")
    assert (v1.version, v1.note, v1.published_by, v1.is_published) == (1, "first", "alice", True)

    await store.put_file("qt", "template.html", "<p>changed</p>", 1, "bob")
    frozen = await store.get_version("qt", 1)
    assert "<p>changed</p>" not in {f.content for f in frozen.files}
    assert [a.name for a in frozen.assets] == ["logo.png"]
    summary = await store.get("qt")
    assert (summary.published_version, summary.latest_version, summary.draft_changed_since_publish) == (
        1,
        1,
        True,
    )


async def test_sha256_matches_report_definition(store):
    await store.create("qt", "Q", "quotation", "alice")
    draft = await store.definition_input("qt", "draft")
    assert draft.sha256 == definition_sha256(DefinitionInput(draft.files, draft.assets, None))
    v1 = await store.publish("qt", 1, None, "alice")
    published = await store.definition_input("qt", "published")
    assert (published.version, published.revision, published.sha256) == (1, None, v1.sha256)
    assert published.sha256 == draft.sha256  # same content, same hash
    assert not (await store.get("qt")).draft_changed_since_publish
    assert (await store.definition_input("qt", 1)).files == published.files


async def test_publish_needs_the_validated_revision_and_a_change(store):
    await store.create("qt", "Q", "blank", "alice")
    assert await code_of(store.publish("qt", 99, None, "alice")) == "REVISION_CONFLICT"
    await store.publish("qt", 1, None, "alice")
    assert await code_of(store.publish("qt", 1, None, "alice")) == "REVISION_CONFLICT"  # nothing new
    assert await code_of(store.publish("nope", 1, None, "alice")) == "NOT_FOUND"
    assert await code_of(store.publish("qt", 1, "x" * 501, "alice")) == "INPUT_INVALID"


async def test_concurrent_publish_gives_one_version(store):
    await store.create("qt", "Q", "blank", "alice")
    results = await asyncio.gather(
        store.publish("qt", 1, None, "a"), store.publish("qt", 1, None, "b"), return_exceptions=True
    )
    assert sorted(type(r).__name__ for r in results) == ["StoreError", "Version"]
    assert [r.code for r in results if isinstance(r, StoreError)] == ["REVISION_CONFLICT"]
    assert [v.version for v in await store.list_versions("qt")] == [1]


async def test_roll_back_and_reset(store):
    await store.create("qt", "Q", "blank", "alice")
    await store.publish("qt", 1, None, "alice")
    rev = await store.put_file("qt", "template.html", "<p>v2</p>", 1, "alice")
    await store.publish("qt", rev, None, "alice")
    assert [(v.version, v.is_published) for v in await store.list_versions("qt")] == [(2, True), (1, False)]

    rolled = await store.set_published("qt", 1)
    assert rolled.published_version == 1 and rolled.latest_version == 2
    assert (await store.definition_input("qt", "published")).files["template.html"] != "<p>v2</p>"
    assert await code_of(store.set_published("qt", 9)) == "NOT_FOUND"

    rev = await store.reset_draft("qt", 1, rev, "bob")
    draft = await store.get_draft("qt")
    assert draft.revision == rev and draft.based_on_version == 1
    assert {f.name: f.content for f in draft.files} == (await store.definition_input("qt", 1)).files
    assert not (await store.get("qt")).draft_changed_since_publish
    assert await code_of(store.reset_draft("qt", 9, rev, "bob")) == "NOT_FOUND"
    assert (await store.get_draft("qt")).revision == rev  # failed reset rolled back


async def test_no_published_version_yet(store):
    await store.create("qt", "Q", "blank", "alice")
    assert await code_of(store.definition_input("qt", "published")) == "NOT_FOUND"
    assert await code_of(store.get_version("qt", 1)) == "NOT_FOUND"
    assert await code_of(store.list_versions("nope")) == "NOT_FOUND"


async def test_versions_cannot_be_changed_with_sql(store, db_url):
    await store.create("qt", "Q", "blank", "alice")
    await store.publish("qt", 1, None, "alice")
    with psycopg.connect(db_url, autocommit=True) as conn, pytest.raises(psycopg.errors.RestrictViolation):
        conn.execute("UPDATE version_files SET content = 'tampered'")
