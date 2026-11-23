"""TemplateStore.import_docx: a Word form makes a new report and never replaces one (SPEC v1.15)."""

import pytest

from jester_api.template_store import StoreError

from .docx.form import form_docx
from .test_store_lifecycle import code_of

pytestmark = pytest.mark.db


async def test_a_word_form_becomes_a_new_draft(store):
    result = await store.import_docx(form_docx(), "requisition", "  แบบคำขอ   เบิกพัสดุ ", "alice")
    assert (result.created, result.revision, result.warnings) == (True, 1, [])
    assert (result.summary.id, result.summary.name, result.summary.archived_at) == (
        "requisition",
        "แบบคำขอ เบิกพัสดุ",
        None,
    )
    draft = await store.get_draft("requisition")
    assert sorted(f.name for f in draft.files) == [
        "data.schema.json",
        "footer.html",
        "header.html",
        "report.css",
        "report.json",
        "sample.json",
        "template.html",
    ]
    assert [a.name for a in draft.assets] == ["image1.png"]


async def test_an_existing_or_archived_id_is_a_conflict_and_nothing_changes(store):
    await store.import_docx(form_docx(), "requisition", "เดิม", "alice")
    assert await code_of(store.import_docx(form_docx(), "requisition", "ใหม่", "bob")) == "CONFLICT"
    await store.set_archived("requisition", True, "alice")
    assert await code_of(store.import_docx(form_docx(), "requisition", "ใหม่", "bob")) == "CONFLICT"
    kept = await store.get("requisition")
    assert (kept.name, kept.draft_revision) == ("เดิม", 1) and kept.archived_at is not None


async def test_bad_files_write_nothing(store):
    assert await code_of(store.import_docx(b"not a word file", "x-form", "x", "alice")) == "INPUT_INVALID"
    assert await code_of(store.import_docx(form_docx(), "Bad_Id", "x", "alice")) == "INPUT_INVALID"
    assert await store.list(include_archived=True) == []


async def test_a_draft_that_does_not_bind_is_a_converter_bug_and_writes_nothing(store, monkeypatch):
    import sys

    from jester_api.template_store.docx import read_docx

    def broken(data, template_id, name):
        bundle, warnings = read_docx(data, template_id, name)
        bundle.files["template.html"] = "<p>{{ data.missing.deeper }}</p>"  # StrictUndefined fails the bind
        return bundle, warnings

    monkeypatch.setattr(sys.modules["jester_api.template_store.store"], "read_docx", broken)
    with pytest.raises(StoreError) as exc:
        await store.import_docx(form_docx(), "requisition", "x", "alice")
    assert exc.value.code == "INTERNAL_ERROR"
    assert await store.list(include_archived=True) == []
