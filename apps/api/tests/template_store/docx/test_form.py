"""The realistic form (form.py): kept in step with its generator, converted to the golden template, binds.

form.template.html is also read by Studio's vitest (tests/docx-blocks.test.ts) to check that the
Designer reads it as blocks. After a deliberate change to the converter, rewrite both:
    python -m tests.template_store.docx.form   and copy the new template.html over the golden file.
"""

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.report_definition import DefinitionInput, load_definition
from jester_api.template_store.assets import detect
from jester_api.template_store.docx import read_docx

from .form import FIXTURES, form_docx


def convert():
    return read_docx((FIXTURES / "form.docx").read_bytes(), "requisition-form", "แบบคำขอเบิกพัสดุ")


def test_the_committed_docx_is_what_the_generator_makes():
    assert (FIXTURES / "form.docx").read_bytes() == form_docx()


def test_it_converts_to_the_golden_template_without_warnings():
    bundle, warnings = convert()
    assert warnings == []
    golden = (FIXTURES / "form.template.html").read_text(encoding="utf-8").replace("
", "
")  # autocrlf
    assert bundle.files["template.html"] == golden
    assert sorted(bundle.files) == [
        "data.schema.json",
        "footer.html",
        "header.html",
        "report.css",
        "report.json",
        "sample.json",
        "template.html",
    ]
    assert list(bundle.assets) == ["image1.png"]


def test_it_validates_and_binds():
    bundle, _ = convert()
    infos = {name: detect(name, raw) for name, raw in bundle.assets.items()}
    loaded = load_definition(DefinitionInput(bundle.files, infos, frozenset({"TH Sarabun New"})))
    assert [p for p in loaded.problems if p.severity == "error"] == []
    prepared = prepare(loaded.definition, {}, {}, {})
    bound = bind(loaded.definition, bundle.files, infos, prepared.prepared)
    assert [p for p in bound.problems if p.severity == "error"] == []
    text = bound.bound.index_html.decode()
    assert "แบบคำขอเบิกพัสดุ" in text and text.count('rowspan="2"') == 1
