"""Input checks that run before any database access (no db marker needed)."""

import pytest

from jester_api.template_store import MemoryBlobStore, StoreError, TemplateStore


async def test_nul_character_in_a_text_file_is_rejected():
    store = TemplateStore(None, MemoryBlobStore())  # type: ignore[arg-type]  (never reaches the pool)
    with pytest.raises(StoreError) as e:
        await store.put_file("tpl", "template.html", "a\x00b", 1, "bob")
    assert e.value.code == "INPUT_INVALID"
