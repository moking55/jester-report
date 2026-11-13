import json

import pytest

from jester_api.report_definition.data_schema import check_data
from jester_api.report_definition.model import ReportJson
from jester_api.report_definition.refs import check_expressions

DEC = {"type": "string", "format": "decimal"}
SCHEMA = {
    "type": "object",
    "properties": {
        "discount": DEC,
        "isJuristic": {"type": "integer"},
        "note": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "qty": {"type": "integer"},
                    "unitPrice": DEC,
                    "label": {"type": "string"},
                },
            },
        },
        "records": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "region": {"type": "string"}, "amount": DEC},
            },
        },
        "orders": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "orderId": {"type": "string"},
                    "details": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"detailId": {"type": "string"}, "amount": DEC},
                        },
                    },
                },
            },
        },
    },
}
QUOTE_LISTS = {"items": {"path": "/items", "id": "id", "computed": {"amount": "round(qty * unitPrice, 2)"}}}
QUOTE_TOTALS = {
    "vat": "round(net * 0.07, 2)",
    "grand": "net + vat",
    "subtotal": "sum(items.amount)",
    "net": "subtotal - discount",
}


def run(lists=None, totals=None, mode="basic"):
    rep = ReportJson.model_validate(
        {
            "schemaVersion": 1,
            "name": "x",
            "expressionMode": mode,
            "fonts": {"body": ["TH Sarabun New"]},
            "data": {"schema": "s.json", "samples": ["x.json"]},
            "lists": QUOTE_LISTS if lists is None else lists,
            "totals": QUOTE_TOTALS if totals is None else totals,
        }
    )
    data, problems = check_data(rep, {"s.json": json.dumps(SCHEMA), "x.json": "{}"})
    assert problems == []
    return check_expressions(rep, data)


def codes(result):
    return {(p.code, p.pointer) for p in result[1]}


def test_quotation_order_is_topological():
    checked, problems = run()
    assert problems == []
    assert checked.order["/totals"] == ["subtotal", "net", "vat", "grand"]
    assert checked.order["/lists/items/computed"] == ["amount"]
    assert "/lists/items/computed/amount" in checked.nodes


def test_grouped_and_master_detail():
    grouped = {
        "records": {
            "path": "/records",
            "id": "id",
            "sort": ["region", "id"],
            "groupBy": {
                "key": "region",
                "totals": {"subtotal": "sum(amount)", "rows": "count()", "avg": "subtotal / rows"},
            },
        }
    }
    checked, problems = run(grouped, {"grand": "sum(records.amount)"})
    assert problems == []
    assert checked.order["/lists/records/groupBy/totals"] == ["subtotal", "rows", "avg"]
    po = {
        "orders": {
            "path": "/orders",
            "id": "orderId",
            "totals": {"total": "sum(details.amount)"},
            "lists": {"details": {"path": "/details", "id": "detailId"}},
        }
    }
    _, problems = run(po, {"grand": "sum(orders.total)", "biggest": "max(orders.total)"})
    assert problems == []


def test_advanced_example():
    _, problems = run(
        totals={
            **QUOTE_TOTALS,
            "withholding": "if(isJuristic == 1 and net >= 1000, round(net * 0.03, 2), 0)",
            "payable": "net + vat - withholding",
        },
        mode="advanced",
    )
    assert problems == []


@pytest.mark.parametrize(
    ("totals", "expected"),
    [
        ({"x": "nope + 1"}, ("REF_UNKNOWN", "/totals/x")),
        ({"x": "note + 1"}, ("REF_NOT_NUMERIC", "/totals/x")),
        ({"x": "sum(items.label)"}, ("REF_NOT_NUMERIC", "/totals/x")),
        ({"x": "sum(items.nope)"}, ("REF_UNKNOWN", "/totals/x")),
        ({"x": "sum(nolist.amount)"}, ("REF_UNKNOWN", "/totals/x")),
        ({"x": "sum(amount)"}, ("REF_UNKNOWN", "/totals/x")),
        ({"x": "items.qty + 1"}, ("REF_UNKNOWN", "/totals/x")),
        ({"x": "count()"}, ("AGGREGATE_NOT_ALLOWED", "/totals/x")),
        ({"discount": "1"}, ("NAME_SHADOWS_FIELD", "/totals/discount")),
        ({"x": "if(1 > 0, 1, 0)"}, ("EXPRESSION_MODE", "/totals/x")),
        ({"x": "1 +"}, ("EXPRESSION_INVALID", "/totals/x")),
    ],
)
def test_report_total_problems(totals, expected):
    assert expected in codes(run(totals=totals))


def test_cycle_detected_and_no_order():
    result = run(totals={"a": "b + 1", "b": "c + 1", "c": "a + 1"})
    problems = result[1]
    assert problems[0].code == "REF_CYCLE" and "a -> b -> c -> a" in problems[0].message
    assert "/totals" not in result[0].order


def test_computed_rules():
    lists = {
        "items": {
            "path": "/items",
            "id": "id",
            "computed": {"qty": "1", "x": "sum(unitPrice)", "y": "qty * 2"},
        }
    }
    found = codes(run(lists, {}))
    assert ("NAME_SHADOWS_FIELD", "/lists/items/computed/qty") in found
    assert ("AGGREGATE_NOT_ALLOWED", "/lists/items/computed/x") in found


def test_group_totals_rules():
    lists = {
        "records": {
            "path": "/records",
            "id": "id",
            "groupBy": {
                "key": "region",
                "totals": {"a": "sum(region)", "b": "sum(records.amount)", "c": "amount + 1"},
            },
        }
    }
    found = codes(run(lists, {}))
    assert ("REF_NOT_NUMERIC", "/lists/records/groupBy/totals/a") in found
    assert ("REF_UNKNOWN", "/lists/records/groupBy/totals/b") in found
    assert ("REF_UNKNOWN", "/lists/records/groupBy/totals/c") in found


def test_list_totals_cannot_use_unknown_child():
    lists = {
        "orders": {
            "path": "/orders",
            "id": "orderId",
            "totals": {"t": "sum(lines.amount)"},
            "lists": {"details": {"path": "/details", "id": "detailId"}},
        }
    }
    assert ("REF_UNKNOWN", "/lists/orders/totals/t") in codes(run(lists, {}))


def test_bad_list_path_skipped_without_crash():
    rep = ReportJson.model_validate(
        {
            "schemaVersion": 1,
            "name": "x",
            "fonts": {"body": ["a"]},
            "data": {"schema": "s.json", "samples": ["x.json"]},
            "lists": {"bad": {"path": "/nope", "id": "id", "computed": {"a": "1"}}},
            "totals": {"t": "sum(bad.a)"},
        }
    )
    data, problems = check_data(rep, {"s.json": json.dumps(SCHEMA), "x.json": "{}"})
    assert problems[0].code == "LIST_PATH_INVALID"
    _, problems = check_expressions(rep, data)
    assert [p.code for p in problems] == ["REF_UNKNOWN"]


def test_list_id_sort_and_group_key_must_exist():
    lists = {
        "records": {
            "path": "/records",
            "id": "rid",
            "sort": ["regoin", "id"],
            "groupBy": {"key": "regoin", "totals": {"subtotal": "sum(amount)"}},
        },
        "orders": {
            "path": "/orders",
            "id": "orderId",
            "lists": {"details": {"path": "/details", "id": "detailID", "sort": ["amount"]}},
        },
    }
    found = codes(run(lists, {}))
    assert {
        ("REF_UNKNOWN", "/lists/records/id"),
        ("REF_UNKNOWN", "/lists/records/sort/0"),
        ("REF_UNKNOWN", "/lists/records/groupBy/key"),
        ("REF_UNKNOWN", "/lists/orders/lists/details/id"),
    } <= found
    assert ("REF_UNKNOWN", "/lists/orders/lists/details/sort/0") not in found
