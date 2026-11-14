import copy
import decimal
import json
from decimal import Decimal
from pathlib import Path

import pytest

from jester_api.data_prep import prepare
from jester_api.report_definition import AssetInfo, DefinitionInput, load_definition

from .conftest import FONTS, sample

D = Decimal
SPECIMENS = Path(__file__).parents[4] / "research" / "specimens"
QUOTE_PARAMS = {"quoteId": "Q-DEMO-001", "docDate": "2026-11-12"}
SALES_PARAMS = {"from": "2026-11-01", "toExclusive": "2026-12-01"}


def test_quotation_totals(quotation):
    result = prepare(quotation, QUOTE_PARAMS, sample("quotation"), {"runId": "r1"})
    assert result.problems == []
    p = result.prepared
    assert p.totals == {
        "subtotal": D("3100.70"),
        "net": D("3000.00"),
        "vat": D("210.00"),
        "grand": D("3210.00"),
    }
    assert p.params["locale"] == "th-TH"
    assert p.fmt.baht_text(p.totals["grand"]) == "สามพันสองร้อยสิบบาทถ้วน"
    ctx = p.template_context()
    assert set(ctx) == {"params", "data", "lists", "totals", "meta", "fmt"} and ctx["meta"]["runId"] == "r1"


def test_sales_groups_and_empty(sales):
    p = prepare(sales, SALES_PARAMS, sample("sales-grouped"), {}).prepared
    assert [(g.key, g.totals["subtotal"]) for g in p.lists["records"].groups] == [
        ("North", D("2000.00")),
        ("South", D("400.00")),
    ]
    assert p.totals["grand"] == D("2400.00")
    empty = prepare(sales, SALES_PARAMS, sample("sales-grouped", "sample-empty.json"), {}).prepared
    assert empty.totals["grand"] == 0 and empty.lists["records"].groups == []


def test_purchase_order(purchase_order):
    p = prepare(purchase_order, {}, sample("purchase-order"), {}).prepared
    assert [o["total"] for o in p.lists["orders"]] == [D("350.00"), 0]
    assert p.totals["grand"] == D("350.00")


def test_params_and_data_problems_together(quotation):
    data = sample("quotation")
    data["items"][0]["qty"] = "two"
    result = prepare(quotation, {"quoteID": "x"}, data, {})
    assert result.prepared is None
    assert {(p.code, p.pointer) for p in result.problems} == {
        ("PARAM_UNKNOWN", "/params/quoteID"),
        ("PARAM_REQUIRED", "/params/quoteId"),
        ("PARAM_REQUIRED", "/params/docDate"),
        ("DATA_INVALID", "/data/items/0/qty"),
    }


def test_float_is_reported_as_bug(quotation):
    data = sample("quotation")
    data["items"][0]["qty"] = 2.0
    result = prepare(quotation, QUOTE_PARAMS, data, {})
    assert [(p.code, p.pointer) for p in result.problems] == [("NUMBER_IS_FLOAT", "/data/items/0/qty")]


def test_json_numbers_parsed_as_decimal_are_accepted(quotation):
    raw = json.dumps(sample("quotation"), default=str).replace('"1250.50"', "1250.50")
    data = json.loads(raw, parse_float=Decimal)
    assert data["items"][0]["unitPrice"] == D("1250.50")
    # the fixture schema wants a decimal string, so a JSON number is a schema problem, not a float bug
    assert {p.code for p in prepare(quotation, QUOTE_PARAMS, data, {}).problems} == {"DATA_INVALID"}


def test_problems_are_capped(sales):
    data = sample("sales-grouped")
    data["records"] = [{"id": f"S{i}", "region": "North", "date": "x", "amount": "1"} for i in range(80)]
    problems = prepare(sales, SALES_PARAMS, data, {}).problems
    assert len(problems) == 51 and problems[-1].code == "TOO_MANY_PROBLEMS"


def test_secret_values_never_in_messages(quotation):
    data = sample("quotation")
    data["discount"] = "SECRET-VALUE"
    data["items"][0]["qty"] = "SECRET-QTY"
    problems = prepare(quotation, {"quoteId": "SECRET-PARAM" * 5, "docDate": "SECRET"}, data, {}).problems
    assert problems and all("SECRET" not in p.message for p in problems)


def test_deterministic_and_does_not_touch_inputs_or_context(quotation):
    data, params = sample("quotation"), dict(QUOTE_PARAMS)
    before = (copy.deepcopy(data), dict(params), decimal.getcontext().copy())
    first = prepare(quotation, params, data, {}).prepared
    second = prepare(quotation, params, data, {}).prepared
    assert first.totals == second.totals and [r["amount"] for r in first.lists["items"]] == [
        r["amount"] for r in second.lists["items"]
    ]
    assert (data, params) == before[:2]
    assert decimal.getcontext().prec == before[2].prec and decimal.getcontext().rounding == before[2].rounding


# ---- research specimens ------------------------------------------------------------------------------------
SPECIMEN_REPORT = {
    "schemaVersion": 1,
    "name": "specimen",
    "fonts": {"body": ["TH Sarabun New"]},
    "data": {"schema": "data.schema.json", "samples": ["sample.json"]},
    "lists": {
        "records": {
            "path": "/records",
            "id": "id",
            "sort": ["region", "id"],
            "computed": {"amt": "round(amount, 2)"},
            "groupBy": {"key": "region", "totals": {"subtotal": "sum(amt)"}},
        }
    },
    "totals": {"grand": "sum(records.amt)"},
}
SPECIMEN_SCHEMA = {
    "type": "object",
    "required": ["records"],
    "properties": {
        "records": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "region", "amount"],
                "properties": {
                    "id": {"type": "string"},
                    "region": {"type": "string"},
                    "amount": {"type": "string", "format": "decimal"},
                },
            },
        }
    },
}
EXPECTED_ERRORS = {
    "invalid_amount": "DATA_INVALID",
    "invalid_group": "DATA_INVALID",
    "duplicate_id": "DUPLICATE_ID",
}


def _specimen_definition():
    files = {
        "report.json": json.dumps(SPECIMEN_REPORT),
        "data.schema.json": json.dumps(SPECIMEN_SCHEMA),
        "sample.json": json.dumps({"records": []}),
        "template.html": "<p></p>",
    }
    result = load_definition(DefinitionInput(files, {}, FONTS))
    assert result.problems == []
    return result.definition


@pytest.mark.parametrize(
    "case", json.loads((SPECIMENS / "grouped-cases.json").read_text("utf-8"))["cases"], ids=lambda c: c["id"]
)
def test_grouped_specimens(case):
    result = prepare(_specimen_definition(), {}, {"records": case["records"]}, {})
    if "expected_error" in case:
        assert EXPECTED_ERRORS[case["expected_error"]] in {p.code for p in result.problems}
        return
    p = result.prepared
    assert {g.key: g.totals["subtotal"] for g in p.lists["records"].groups} == {
        k: D(v) for k, v in case["expected_groups"].items()
    }
    assert p.totals["grand"] == D(case["expected_grand"])


MD_EXPECTED_ERRORS = {"invalid_details": "DATA_INVALID"}
# orphan_detail: details are nested inside their order, so an orphan cannot exist in this data shape.
# missing_component: versioned reusable components are out of scope for v1.
MD_NOT_APPLICABLE = {"orphan_detail", "missing_component"}


@pytest.mark.parametrize(
    "case",
    json.loads((SPECIMENS / "master-detail-cases.json").read_text("utf-8"))["cases"],
    ids=lambda c: c["id"],
)
def test_master_detail_specimens(case, purchase_order):
    if case.get("expected_error") in MD_NOT_APPLICABLE:
        pytest.skip(f"{case['expected_error']} does not apply to the nested v1 data model")
    orders = [
        {
            "supplier": "x",
            **o,
            "details": None
            if o["details"] is None
            else [
                {"description": "x", **{k: v for k, v in d.items() if k != "parentId"}} for d in o["details"]
            ],
        }
        for o in case["orders"]
    ]
    result = prepare(purchase_order, {}, {"company": {"name": "x"}, "orders": orders}, {})
    if "expected_error" in case:
        assert MD_EXPECTED_ERRORS[case["expected_error"]] in {p.code for p in result.problems}
        return
    p = result.prepared
    assert {o["orderId"]: o["total"] for o in p.lists["orders"]} == {
        k: D(v) for k, v in case["expected_totals"].items()
    }
    assert p.totals["grand"] == D(case["expected_grand"])


# ---- declared-but-missing properties are filled (SPEC-binder "กติกาค่าที่หายไป") ------------------------------
def test_missing_optional_properties_are_filled_at_every_depth():
    schema = copy.deepcopy(SPECIMEN_SCHEMA)
    item = schema["properties"]["records"]["items"]["properties"]
    item["note"] = {"type": "string"}
    item["extra"] = {"type": "object", "properties": {"tags": {"type": "array"}}}
    schema["properties"]["shipTo"] = {
        "type": "object",
        "properties": {
            "address": {"type": "string"},
            "geo": {"type": "object", "properties": {"lat": {"type": "string"}}},
            "lines": {"type": "array", "items": {"type": "string"}},
        },
    }
    schema["properties"]["memo"] = {"type": ["string", "null"]}
    files = {
        "report.json": json.dumps(SPECIMEN_REPORT),
        "data.schema.json": json.dumps(schema),
        "sample.json": json.dumps({"records": []}),
        "template.html": "<p></p>",
    }
    definition = load_definition(DefinitionInput(files, {}, FONTS)).definition
    data = {"records": [{"id": "a", "region": "N", "amount": "1", "note": "kept"}], "memo": None}
    before = copy.deepcopy(data)

    p = prepare(definition, {}, data, {}).prepared

    assert p.data["shipTo"] == {"address": None, "geo": {"lat": None}, "lines": []}
    assert p.data["memo"] is None
    row = p.lists["records"][0]
    assert row["note"] == "kept" and row["extra"] == {"tags": []} and row["amt"] == D("1")
    assert data == before  # caller's data untouched


def test_explicit_null_object_and_array_become_blank():
    schema = copy.deepcopy(SPECIMEN_SCHEMA)
    schema["properties"]["shipTo"] = {
        "type": ["object", "null"],
        "properties": {
            "address": {"type": "string"},
            "lines": {"type": ["array", "null"], "items": {"type": "string"}},
        },
    }
    files = {
        "report.json": json.dumps(SPECIMEN_REPORT),
        "data.schema.json": json.dumps(schema),
        "sample.json": json.dumps({"records": []}),
        "template.html": "<p></p>",
    }
    definition = load_definition(DefinitionInput(files, {}, FONTS)).definition
    nulled = prepare(definition, {}, {"records": [], "shipTo": None}, {}).prepared
    assert nulled.data["shipTo"] == {"address": None, "lines": []}
    inner = prepare(definition, {}, {"records": [], "shipTo": {"address": "x", "lines": None}}, {}).prepared
    assert inner.data["shipTo"] == {"address": "x", "lines": []}


def test_filling_does_not_change_totals(quotation, sales, purchase_order):
    assert prepare(quotation, QUOTE_PARAMS, sample("quotation"), {}).prepared.totals["grand"] == D("3210.00")
    assert prepare(sales, SALES_PARAMS, sample("sales-grouped"), {}).prepared.totals["grand"] == D("2400.00")
    assert prepare(purchase_order, {}, sample("purchase-order"), {}).prepared.totals["grand"] == D("350.00")


def test_child_list_rows_are_filled():
    from .conftest import fixture_files

    files = fixture_files("purchase-order")
    schema = json.loads(files["data.schema.json"])
    schema["properties"]["orders"]["items"]["properties"]["details"]["items"]["properties"]["note"] = {
        "type": "string"
    }
    files["data.schema.json"] = json.dumps(schema)
    definition = load_definition(DefinitionInput(files, {}, FONTS)).definition
    p = prepare(definition, {}, sample("purchase-order"), {}).prepared
    assert [d["note"] for d in p.lists["orders"][0]["details"]] == [None, None]


def test_nullable_child_list_is_accepted_and_null_means_empty():
    from .conftest import fixture_files

    files = fixture_files("purchase-order")
    schema = json.loads(files["data.schema.json"])
    schema["properties"]["orders"]["items"]["properties"]["details"]["type"] = ["array", "null"]
    files["data.schema.json"] = json.dumps(schema)
    loaded = load_definition(DefinitionInput(files, {}, FONTS))
    assert loaded.problems == []
    data = sample("purchase-order")
    data["orders"][0]["details"] = None
    p = prepare(loaded.definition, {}, data, {}).prepared
    assert len(p.lists["orders"][0]["details"]) == 0 and p.lists["orders"][0]["total"] == 0


def _nullable(name, *path):
    """Fixture definition whose field at `path` (through properties/items) also accepts null."""
    from .conftest import fixture_files

    files = fixture_files(name)
    schema = json.loads(files["data.schema.json"])
    node = schema
    for part in path:
        node = node["items"] if part == "[]" else node["properties"][part]
    node["type"] = [node["type"], "null"]
    files["data.schema.json"] = json.dumps(schema)
    return load_definition(
        DefinitionInput(files, {"logo.png": AssetInfo("image/png", "ab" * 32)}, FONTS)
    ).definition


def test_one_bad_row_gives_one_problem_not_a_cascade():
    quotation = _nullable("quotation", "items", "[]", "unitPrice")
    data = sample("quotation")
    data["items"][1]["unitPrice"] = None  # computed amount fails; subtotal/net/vat/grand must not repeat it
    problems = prepare(quotation, QUOTE_PARAMS, data, {}).problems
    assert [(p.code, p.pointer) for p in problems] == [("VALUE_MISSING", "/data/items/1")]

    sales = _nullable("sales-grouped", "records", "[]", "amount")
    data = sample("sales-grouped")
    data["records"][1]["amount"] = None  # group subtotal fails; grand must not repeat it
    assert [p.code for p in prepare(sales, SALES_PARAMS, data, {}).problems] == ["VALUE_MISSING"]

    purchase_order = _nullable("purchase-order", "orders", "[]", "details", "[]", "amount")
    data = sample("purchase-order")
    data["orders"][0]["details"][0]["amount"] = None  # order total fails; grand must not repeat it
    assert [p.code for p in prepare(purchase_order, {}, data, {}).problems] == ["VALUE_MISSING"]


def test_view_model_is_plain_json_with_exact_decimal_strings(quotation, sales):
    view = prepare(quotation, QUOTE_PARAMS, sample("quotation"), {}).prepared.view_model()
    assert json.loads(json.dumps(view)) == view  # nothing but JSON types
    assert view["totals"]["grand"] == "3210.00"
    assert view["lists"]["items"]["rows"][0]["amount"] == "2501.00"
    assert view["lists"]["items"]["groups"] == []
    grouped = prepare(sales, SALES_PARAMS, sample("sales-grouped"), {}).prepared.view_model()
    assert [(g["key"], g["totals"]["subtotal"]) for g in grouped["lists"]["records"]["groups"]] == [
        ("North", "2000.00"),
        ("South", "400.00"),
    ]
    assert grouped["totals"]["grand"] == "2400.00"
