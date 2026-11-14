import copy
import json

import pytest

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.report_definition import AssetInfo, DefinitionInput, load_definition

from ..data_prep.conftest import FONTS, fixture_files, load_fixture, sample

ASSETS = {"logo.png": AssetInfo("image/png", "ab" * 32)}
QUOTE_PARAMS = {"quoteId": "Q-DEMO-001", "docDate": "2026-11-12"}
SALES_PARAMS = {"from": "2026-11-01", "toExclusive": "2026-12-01"}


def bound_fixture(name, params, data=None):
    definition = load_fixture(name)
    prepared = prepare(definition, params, data if data is not None else sample(name), {}).prepared
    return bind(definition, fixture_files(name), ASSETS, prepared)


def test_quotation_binds_to_engine_files():
    result = bound_fixture("quotation", QUOTE_PARAMS)
    assert result.problems == []
    b = result.bound
    index = b.index_html.decode()
    assert "3,210.00" in index and "สามพันสองร้อยสิบบาทถ้วน" in index and "12 พฤศจิกายน 2569" in index
    assert index.startswith("<!doctype html>") and 'src="logo.png"' in index
    assert "บริษัท ตัวอย่าง จำกัด" in b.header_html.decode()
    assert '<span class="pageNumber"></span>' in b.footer_html.decode()
    assert [f.name for f in b.files] == ["report.css"] and b.asset_names == ("logo.png",)
    assert b.page.landscape is False


def test_sales_and_purchase_order_bind():
    sales = bound_fixture("sales-grouped", SALES_PARAMS)
    assert sales.problems == []
    text = sales.bound.index_html.decode()
    assert text.index("กลุ่ม North") < text.index("กลุ่ม South") and "2,400.00" in text
    empty = bound_fixture("sales-grouped", SALES_PARAMS, sample("sales-grouped", "sample-empty.json"))
    assert "ไม่มีข้อมูลในช่วงเวลาที่เลือก" in empty.bound.index_html.decode()
    po = bound_fixture("purchase-order", {})
    assert po.problems == [] and "ไม่มีรายการ" in po.bound.index_html.decode()  # PO02 has no details


def test_errors_from_every_part_come_back_together():
    files = fixture_files("quotation")
    files["template.html"] += "\n{{ item_typo }}"
    files["footer.html"] = "{{ data.nope.deeper }}"
    definition = load_fixture("quotation")
    prepared = prepare(definition, QUOTE_PARAMS, sample("quotation"), {}).prepared
    result = bind(definition, files, ASSETS, prepared)
    assert result.bound is None
    assert {(p.code, p.file) for p in result.problems} == {
        ("TEMPLATE_UNDEFINED", "template.html"),
        ("TEMPLATE_UNDEFINED", "footer.html"),
    }


def test_output_budget_is_shared_by_all_parts(monkeypatch):
    import sys

    bind_module = sys.modules["jester_api.binder.bind"]  # the package re-exports the function under this name
    # rendered template.html (~1.3 KB) fits alone; what it leaves is too little for header and footer
    monkeypatch.setattr(bind_module, "MAX_OUTPUT_BYTES", 1350)
    result = bound_fixture("quotation", QUOTE_PARAMS)
    assert result.problems and {p.code for p in result.problems} == {"OUTPUT_TOO_LARGE"}
    assert "template.html" not in {p.file for p in result.problems}


def test_ssrf_through_data_is_blocked():
    files = fixture_files("quotation")
    files["template.html"] += '\n<img src="{{ data.customer.name }}">'
    definition = load_fixture("quotation")
    data = sample("quotation")
    for value in ("http://169.254.169.254/latest", "//evil/x", "file:///etc/passwd"):
        data["customer"]["name"] = value
        prepared = prepare(definition, QUOTE_PARAMS, data, {}).prepared
        result = bind(definition, files, ASSETS, prepared)
        assert result.bound is None and [p.code for p in result.problems] == ["RESOURCE_NOT_ALLOWED"]
        assert all("169.254" not in p.message for p in result.problems)


def test_safe_filter_cannot_smuggle_markup():
    files = fixture_files("quotation")
    files["template.html"] += "\n{{ data.customer.name | safe }}"
    definition = load_fixture("quotation")
    data = sample("quotation")
    data["customer"]["name"] = '<img src="http://evil/x"><script>x</script>'
    prepared = prepare(definition, QUOTE_PARAMS, data, {}).prepared
    codes = sorted(p.code for p in bind(definition, files, ASSETS, prepared).problems)
    assert codes == ["RESOURCE_NOT_ALLOWED", "SCRIPT_NOT_ALLOWED"]


def test_bind_is_deterministic():
    a, b = bound_fixture("quotation", QUOTE_PARAMS).bound, bound_fixture("quotation", QUOTE_PARAMS).bound
    assert a == b


# ---- SPEC-binder "กติกาค่าที่หายไป", through prepare -> bind -----------------------------------------------
REPORT = {
    "schemaVersion": 1,
    "name": "missing",
    "fonts": {"body": ["TH Sarabun New"]},
    "data": {"schema": "data.schema.json", "samples": ["sample.json"]},
    "lists": {"items": {"path": "/items", "id": "id"}},
}
SCHEMA = {
    "type": "object",
    "required": ["customer", "items"],
    "properties": {
        "customer": {
            "type": "object",
            "required": ["name"],
            "properties": {"name": {"type": "string"}, "taxId": {"type": ["string", "null"]}},
        },
        "shipTo": {
            "type": ["object", "null"],
            "properties": {
                "address": {"type": "string"},
                "geo": {"type": "object", "properties": {"lat": {"type": "string"}}},
                "lines": {"type": "array", "items": {"type": "string"}},
            },
        },
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id"],
                "properties": {"id": {"type": "string"}, "note": {"type": "string"}},
            },
        },
    },
}


def missing_case(template, data):
    files = {
        "report.json": json.dumps(REPORT),
        "data.schema.json": json.dumps(SCHEMA),
        "sample.json": json.dumps({"customer": {"name": "x"}, "items": []}),
        "template.html": template,
    }
    loaded = load_definition(DefinitionInput(files, {}, FONTS))
    assert loaded.definition is not None, loaded.problems
    result = prepare(loaded.definition, {}, data, {})
    if result.prepared is None:
        return None, result.problems
    bound = bind(loaded.definition, files, {}, result.prepared)
    body = (
        bound.bound.index_html.decode().split("<body>\n", 1)[1].rsplit("\n</body>", 1)[0]
        if bound.bound
        else None
    )
    return body, bound.problems


BASE = {"customer": {"name": "ACME"}, "items": [{"id": "1"}]}


@pytest.mark.parametrize(
    ("template", "data", "expected"),
    [
        ("[{{ data.customer.taxId }}]", BASE, "[]"),  # optional field not sent
        ("[{{ data.customer.taxId }}]", {**BASE, "customer": {"name": "A", "taxId": None}}, "[]"),  # null
        ("[{{ data.shipTo.address }}|{{ data.shipTo.geo.lat }}]", BASE, "[|]"),  # optional object, 2 levels
        ("[{{ data.shipTo.address }}]", {**BASE, "shipTo": None}, "[]"),  # null object
        ("[{% for x in data.shipTo.lines %}x{% endfor %}]", BASE, "[]"),  # optional array
        ("[{% for i in lists.items %}{{ i.note }}{% endfor %}]", BASE, "[]"),  # optional field in a list row
    ],
)
def test_missing_optional_values_are_blank(template, data, expected):
    body, problems = missing_case(template, data)
    assert problems == [] and body == expected


def test_missing_required_field_is_a_data_error():
    _, problems = missing_case("{{ data.customer.name }}", {"customer": {}, "items": []})
    assert [p.code for p in problems] == ["DATA_INVALID"]


def test_printing_an_object_warns_and_is_blank():
    body, problems = missing_case("[{{ data.customer }}]", BASE)
    assert body == "[]" and [(p.code, p.severity) for p in problems] == [
        ("TEMPLATE_PRINTS_OBJECT", "warning")
    ]


def test_typo_is_an_error():
    body, problems = missing_case("{{ data.customer.nmae }}", BASE)
    assert body is None and [p.code for p in problems] == ["TEMPLATE_UNDEFINED"]


def test_caller_data_untouched():
    data = copy.deepcopy(BASE)
    missing_case("{{ data.shipTo.address }}", data)
    assert data == BASE
