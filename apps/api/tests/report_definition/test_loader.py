import json
from pathlib import Path

import pytest

from jester_api.report_definition import AssetInfo, DefinitionInput, load_definition

FIXTURES = Path(__file__).parent / "fixtures"
FONTS = frozenset({"TH Sarabun New", "Noto Sans Thai"})
ASSETS = {"logo.png": AssetInfo("image/png", "ab" * 32)}


def files_of(name):
    return {p.name: p.read_text(encoding="utf-8") for p in (FIXTURES / name).iterdir()}


def load(files, assets=ASSETS, fonts=FONTS):
    return load_definition(DefinitionInput(files, assets, fonts))


@pytest.mark.parametrize("name", ["quotation", "sales-grouped", "purchase-order"])
def test_reference_reports_load_without_problems(name):
    result = load(files_of(name))
    assert result.problems == []
    assert result.definition is not None
    assert "template.html" in result.definition.template_files


def test_quotation_definition_contents():
    d = load(files_of("quotation")).definition
    assert d.expressions.order["/totals"] == ["subtotal", "net", "vat", "grand"]
    assert d.report.page.size == "A4"
    assert "items" in d.data.lists


def test_five_problems_reported_at_once():
    files = files_of("quotation")
    report = json.loads(files["report.json"])
    report["totals"]["vat"] = "round(net * rate, 2)"  # 1 unknown ref
    files["report.json"] = json.dumps(report, ensure_ascii=False)
    sample = json.loads(files["sample.json"])
    sample["items"][0]["qty"] = "two"  # 2 sample invalid
    files["sample.json"] = json.dumps(sample, ensure_ascii=False)
    files["template.html"] += "<table><tfoot></tfoot></table>\n"  # 3 tfoot
    files["template.html"] += '<img src="stamp.png">\n'  # 4 missing asset
    files["footer.html"] = files["footer.html"].replace('"TH Sarabun New"', "Tahoma")  # 5 header/footer font
    result = load(files)
    assert result.definition is None
    assert sorted(p.code for p in result.problems) == sorted(
        ["REF_UNKNOWN", "SAMPLE_INVALID", "TFOOT_FORBIDDEN", "FILE_MISSING", "FONT_MISSING"]
    )


def test_required_files_and_broken_report():
    result = load({"report.json": "{"})
    assert {p.code for p in result.problems} == {"FILE_MISSING", "JSON_INVALID"}
    assert result.definition is None
    result = load({"template.html": "<p>"})
    assert [p.code for p in result.problems] == ["FILE_MISSING"]


def test_warnings_do_not_block_definition():
    result = load(files_of("quotation"), fonts=None)
    assert result.problems and all(p.severity == "warning" for p in result.problems)
    assert result.definition is not None


def test_sha256_is_order_independent_and_content_sensitive():
    files = files_of("quotation")
    base = load(files).sha256
    assert load(dict(reversed(list(files.items())))).sha256 == base
    assert load({**files, "template.html": files["template.html"] + " "}).sha256 != base
    assert load(files, assets={"logo.png": AssetInfo("image/png", "cd" * 32)}).sha256 != base
    assert load({**files, "extra.css": ""}).sha256 != base
