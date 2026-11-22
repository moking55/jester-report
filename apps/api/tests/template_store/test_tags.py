"""v1.11 tags on templates (SPEC-template-store.md "v1.11")."""

import pytest

from jester_api.template_store import StoreError

pytestmark = pytest.mark.db


async def code_of(awaitable) -> str:
    with pytest.raises(StoreError) as e:
        await awaitable
    return e.value.code


async def test_new_templates_have_no_tags_and_set_replaces_the_whole_set(store):
    created = await store.create("aa", "A", "blank", "alice")
    assert created.tags == []
    got = await store.set_tags("aa", ["  ลูกค้า-ก ", "VIP", "VIP"])
    assert got.tags == ["ลูกค้า-ก", "VIP"]
    assert (await store.get("aa")).tags == ["ลูกค้า-ก", "VIP"]
    assert (await store.set_tags("aa", ["x"])).tags == ["x"]
    assert (await store.set_tags("aa", [])).tags == []


async def test_bad_tags_are_input_invalid_and_change_nothing(store):
    await store.create("aa", "A", "blank", "alice")
    await store.set_tags("aa", ["keep"])
    for bad in (["a,b"], ["x" * 31], [f"t{i}" for i in range(11)]):
        assert await code_of(store.set_tags("aa", bad)) == "INPUT_INVALID"
    assert (await store.get("aa")).tags == ["keep"]
    assert await code_of(store.set_tags("nope", ["a"])) == "NOT_FOUND"


async def test_tags_are_not_part_of_the_report(store):
    await store.create("aa", "A", "blank", "alice")
    await store.publish("aa", 1, None, "alice")
    before = await store.get("aa")
    draft = await store.get_draft("aa")
    after = await store.set_tags("aa", ["vip", "q4"])
    assert after.draft_revision == before.draft_revision == 1
    assert after.draft_changed_since_publish is False
    assert after.updated_at == before.updated_at
    assert (await store.get_draft("aa")).updated_at == draft.updated_at


async def test_archived_templates_can_still_be_tagged(store):
    await store.create("aa", "A", "blank", "alice")
    await store.set_archived("aa", True, "bob")
    assert (await store.set_tags("aa", ["old"])).tags == ["old"]


async def test_list_filters_need_every_tag(store):
    for tid, tags in (("aa", ["vip", "q4"]), ("bb", ["vip"]), ("cc", [])):
        await store.create(tid, tid, "blank", "alice")
        await store.set_tags(tid, tags)
    ids = lambda found: [t.id for t in found]  # noqa: E731
    assert ids(await store.list(tags=["vip"])) == ["aa", "bb"]
    assert ids(await store.list(tags=["vip", "q4"])) == ["aa"]
    assert ids(await store.list(tags=["VIP"])) == []  # exact match
    assert ids(await store.list(tags=[])) == ["aa", "bb", "cc"]
    assert ids(await store.list()) == ["aa", "bb", "cc"]
    await store.set_archived("aa", True, "bob")
    assert ids(await store.list(tags=["vip"])) == ["bb"]
    assert ids(await store.list(include_archived=True, tags=["vip"])) == ["aa", "bb"]


async def test_duplicate_copies_tags_from_draft_and_from_a_version(store):
    await store.create("aa", "A", "blank", "alice")
    await store.publish("aa", 1, None, "alice")
    await store.set_tags("aa", ["vip"])
    assert (await store.duplicate("aa", "draft", "bb", "B", "bob")).tags == ["vip"]
    assert (await store.duplicate("aa", 1, "cc", "C", "bob")).tags == ["vip"]


async def test_export_carries_tags_and_import_creates_with_them(store):
    await store.create("aa", "A", "blank", "alice")
    await store.set_tags("aa", ["vip", "ไตรมาส 4"])
    exported = await store.export_zip("aa", "draft")
    result = await store.import_zip(exported.data, None, "bob", template_id="aa-copy")
    assert result.created and result.summary.tags == ["vip", "ไตรมาส 4"]


async def test_import_over_an_existing_template_keeps_its_tags(store):
    await store.create("aa", "A", "blank", "alice")
    await store.set_tags("aa", ["vip"])
    exported = await store.export_zip("aa", "draft")
    await store.set_tags("aa", ["changed"])
    result = await store.import_zip(exported.data, 1, "bob")
    assert not result.created and result.summary.tags == ["changed"]
