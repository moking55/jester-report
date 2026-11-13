import json

import pytest

from jester_api.report_definition.model import parse_report_json

QUOTATION = {
    "schemaVersion": 1,
    "name": "ใบเสนอราคา",
    "page": {
        "size": "A4",
        "orientation": "portrait",
        "marginsMm": {"top": 20, "bottom": 20, "left": 15, "right": 15},
    },
    "fonts": {"body": ["TH Sarabun New"], "headerFooter": ["TH Sarabun New"]},
    "parameters": {
        "quoteId": {"type": "string", "required": True, "maxLength": 40},
        "locale": {"type": "enum", "values": ["th-TH", "en-US"], "default": "th-TH"},
        "docDate": {"type": "date", "required": True},
    },
    "data": {"schema": "data.schema.json", "samples": ["sample.json"]},
    "lists": {"items": {"path": "/items", "id": "id", "computed": {"amount": "round(qty * unitPrice, 2)"}}},
    "totals": {"subtotal": "sum(items.amount)", "net": "subtotal - discount"},
}


def parse(obj):
    return parse_report_json(json.dumps(obj, ensure_ascii=False))


def with_(**changes):
    obj = json.loads(json.dumps(QUOTATION))
    for path, value in changes.items():
        cur = obj
        keys = path.split("__")
        for k in keys[:-1]:
            cur = cur[k]
        if value is ...:
            del cur[keys[-1]]
        else:
            cur[keys[-1]] = value
    return obj


def pointers(obj):
    model, problems = parse(obj)
    assert model is None
    return {p.pointer for p in problems}


def test_valid_quotation():
    model, problems = parse(QUOTATION)
    assert problems == []
    assert model.data.schema_ == "data.schema.json"
    assert model.expressionMode == "basic"


def test_grouped_and_master_detail_examples():
    grouped = with_(
        lists={
            "records": {
                "path": "/records",
                "id": "id",
                "sort": ["region", "id"],
                "groupBy": {"key": "region", "totals": {"subtotal": "sum(amount)"}},
            }
        },
        totals={"grand": "sum(records.amount)"},
    )
    po = with_(
        lists={
            "orders": {
                "path": "/orders",
                "id": "orderId",
                "totals": {"total": "sum(details.amount)"},
                "lists": {"details": {"path": "/details", "id": "detailId"}},
            }
        },
        totals={"grand": "sum(orders.total)"},
        expressionMode="advanced",
    )
    for obj in (grouped, po):
        assert parse(obj)[1] == []


def test_defaults_applied():
    obj = with_(page=...)
    model, _ = parse(obj)
    assert (model.page.orientation, str(model.page.marginsMm.left)) == ("portrait", "15")


@pytest.mark.parametrize(
    ("change", "expected_pointer"),
    [
        ({"extra": 1}, "/extra"),
        ({"schemaVersion": 2}, "/schemaVersion"),
        ({"page__size": "A5"}, "/page/size"),
        ({"page__marginsMm__top": 60}, "/page/marginsMm/top"),
        ({"fonts__body": []}, "/fonts/body"),
        ({"expressionMode": "python"}, "/expressionMode"),
        ({"data__schema": ...}, "/data/schema"),
        ({"parameters__quoteId__default": "x"}, "/parameters/quoteId"),
        ({"parameters__locale__default": "fr-FR"}, "/parameters/locale"),
        ({"parameters__locale__values": ...}, "/parameters/locale"),
        (
            {"parameters__docDate__required": False, "parameters__docDate__default": "2026-13-01"},
            "/parameters/docDate",
        ),
        ({"parameters__bad-name": {"type": "string"}}, "/parameters/bad-name/[key]"),
        ({"lists__items__path": "items"}, "/lists/items/path"),
        ({"totals__vat": ""}, "/totals/vat"),
    ],
)
def test_invalid_fields_report_pointer(change, expected_pointer):
    assert expected_pointer in pointers(with_(**change))


def test_group_key_must_lead_sort():
    obj = with_(
        lists={
            "records": {
                "path": "/records",
                "id": "id",
                "sort": ["id", "region"],
                "groupBy": {"key": "region"},
            }
        }
    )
    model, problems = parse(obj)
    assert model is None and "first sort field" in problems[0].message
    assert problems[0].pointer == "/lists/records"


def test_lists_one_level_deep_only():
    deep = {
        "path": "/a",
        "id": "id",
        "lists": {"b": {"path": "/b", "id": "id", "lists": {"c": {"path": "/c", "id": "id"}}}},
    }
    _, problems = parse(with_(lists={"a": deep}))
    assert any("one level" in p.message for p in problems)


@pytest.mark.parametrize(
    ("ptype", "default", "ok"),
    [
        ("string", "x", True),
        ("integer", 3, True),
        ("integer", True, False),
        ("decimal", "1.50", True),
        ("decimal", 1.5, False),
        ("boolean", False, True),
        ("date", "2026-11-12", True),
        ("date", 20261112, False),
    ],
)
def test_parameter_default_types(ptype, default, ok):
    model, _ = parse(with_(parameters={"p": {"type": ptype, "default": default}}))
    assert (model is not None) is ok


def test_broken_json_reports_line_and_column():
    model, problems = parse_report_json('{\n  "schemaVersion": 1,\n  "name": \n}')
    assert model is None
    assert (problems[0].code, problems[0].line) == ("JSON_INVALID", 4)
    assert problems[0].column is not None


def test_root_must_be_object():
    _, problems = parse_report_json("[]")
    assert problems[0].code == "DEFINITION_INVALID"


def test_collects_all_problems_at_once():
    obj = with_(extra=1, schemaVersion=2, page__size="A5")
    assert len(pointers(obj)) >= 3


@pytest.mark.parametrize("value", ["20261112", "2026-W46-5", "2026-11-12T00:00", "2026-1-2"])
def test_date_default_must_be_yyyy_mm_dd(value):
    model, _ = parse(with_(parameters={"p": {"type": "date", "default": value}}))
    assert model is None
