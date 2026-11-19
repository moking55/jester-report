"""v1.8 L4: lists nest three levels (order -> detail -> part), totals per parent row at every level."""

import json
from decimal import Decimal as D

from jester_api.data_prep import prepare
from jester_api.report_definition import AssetInfo, DefinitionInput, load_definition

from .conftest import FONTS

REPORT = {
    "schemaVersion": 1,
    "name": "ซ้อนสามชั้น",
    "fonts": {"body": ["TH Sarabun New"]},
    "data": {"schema": "data.schema.json", "samples": ["sample.json"]},
    "lists": {
        "orders": {
            "path": "/orders",
            "id": "orderId",
            "totals": {"labourTotal": "sum(details.labour)", "partsAll": "sum(details.partsTotal)"},
            "lists": {
                "details": {
                    "path": "/details",
                    "id": "detailId",
                    "computed": {"labour": "hours * rate"},
                    "totals": {"partsTotal": "sum(parts.price)"},
                    "lists": {"parts": {"path": "/parts", "id": "partId"}},
                }
            },
        }
    },
    "totals": {"grand": "sum(orders.labourTotal)"},
}

SCHEMA = {
    "type": "object",
    "required": ["orders"],
    "properties": {
        "orders": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["orderId", "details"],
                "properties": {
                    "orderId": {"type": "string"},
                    "details": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["detailId", "hours", "rate", "parts"],
                            "properties": {
                                "detailId": {"type": "string"},
                                "hours": {"type": "number"},
                                "rate": {"type": "number"},
                                "parts": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "required": ["partId", "price"],
                                        "properties": {
                                            "partId": {"type": "string"},
                                            "price": {"type": "number"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }
    },
}
DATA = {
    "orders": [
        {
            "orderId": "PO1",
            "details": [
                {
                    "detailId": "D1",
                    "hours": 2,
                    "rate": 100,
                    "parts": [{"partId": "P1", "price": 10.5}, {"partId": "P2", "price": 20}],
                },
                {"detailId": "D2", "hours": 1, "rate": 50, "parts": []},
            ],
        },
        {"orderId": "PO2", "details": []},
    ]
}


def definition(report=REPORT):
    files = {
        "report.json": json.dumps(report),
        "data.schema.json": json.dumps(SCHEMA),
        "sample.json": json.dumps(DATA),
        "template.html": "x",
    }
    result = load_definition(DefinitionInput(files, {"logo.png": AssetInfo("image/png", "ab" * 32)}, FONTS))
    return result


def test_three_levels_load_and_prepare():
    loaded = definition()
    assert loaded.problems == [], loaded.problems
    result = prepare(loaded.definition, {}, json.loads(json.dumps(DATA), parse_float=D), {})
    assert result.problems == [], result.problems
    po1, po2 = result.prepared.lists["orders"].rows
    d1, d2 = po1["details"].rows
    assert [p["partId"] for p in d1["parts"].rows] == ["P1", "P2"] and d2["parts"].rows == []
    assert (d1["labour"], d2["labour"]) == (D(200), D(50))
    assert (d1["partsTotal"], d2["partsTotal"]) == (
        D("30.50"),
        D(0),
    )  # a total per detail row, over its parts
    assert po1["labourTotal"] == D(250) and po1["partsAll"] == D("30.50")  # per order row, over its details
    assert po2["details"].rows == [] and po2["labourTotal"] == D(0)
    assert result.prepared.totals["grand"] == D(250)


def test_a_fourth_level_is_still_refused():
    deep = json.loads(json.dumps(REPORT))
    deep["lists"]["orders"]["lists"]["details"]["lists"]["parts"]["lists"] = {"x": {"path": "/x", "id": "id"}}
    loaded = definition(deep)
    assert [p.code for p in loaded.problems] == ["DEFINITION_INVALID"] and "3 levels" in loaded.problems[
        0
    ].message
