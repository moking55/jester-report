import json

from jester_api.report_definition.data_schema import check_data
from jester_api.report_definition.model import ReportJson

SCHEMA = {
    "type": "object",
    "required": ["customer", "items"],
    "properties": {
        "customer": {"type": "object", "properties": {"name": {"type": "string"}}},
        "discount": {"type": "string", "format": "decimal"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "qty", "unitPrice"],
                "properties": {
                    "id": {"type": "string"},
                    "qty": {"type": "integer"},
                    "unitPrice": {"type": "string", "format": "decimal"},
                },
            },
        },
        "orders": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "details": {
                        "type": "array",
                        "items": {"type": "object", "properties": {"amount": {"type": "number"}}},
                    }
                },
            },
        },
    },
}
SAMPLE = {
    "customer": {"name": "บริษัท ลูกค้า จำกัด"},
    "discount": "100.70",
    "items": [{"id": "QL01", "qty": 2, "unitPrice": "1250.50"}],
}


def report(**over):
    base = {
        "schemaVersion": 1,
        "name": "x",
        "fonts": {"body": ["TH Sarabun New"]},
        "data": {"schema": "data.schema.json", "samples": ["sample.json"]},
        "lists": {"items": {"path": "/items", "id": "id"}},
    }
    base.update(over)
    return ReportJson.model_validate(base)


def files(schema=SCHEMA, sample=SAMPLE, **extra):
    out = {"data.schema.json": json.dumps(schema), "sample.json": json.dumps(sample, ensure_ascii=False)}
    out.update(extra)
    return out


def test_valid_schema_and_sample_resolves_lists():
    rep = report(
        lists={
            "items": {"path": "/items", "id": "id"},
            "orders": {"path": "/orders", "id": "id", "lists": {"details": {"path": "/details", "id": "id"}}},
        }
    )
    ds, problems = check_data(rep, files())
    assert problems == []
    assert set(ds.lists) == {"items", "orders", "orders.details"}
    assert "unitPrice" in ds.lists["items"]["properties"]


def test_missing_schema_file():
    _, problems = check_data(report(), {"sample.json": "{}"})
    assert problems[0].code == "FILE_MISSING"


def test_schema_json_syntax_error_has_line():
    _, problems = check_data(report(), {"data.schema.json": '{\n "type": }', "sample.json": "{}"})
    assert (problems[0].code, problems[0].file, problems[0].line) == ("JSON_INVALID", "data.schema.json", 2)


def test_invalid_json_schema():
    _, problems = check_data(
        report(), files(schema={"type": "object", "properties": {"a": {"type": "nope"}}})
    )
    assert problems[0].code == "DATA_SCHEMA_INVALID"


def test_root_must_be_object():
    _, problems = check_data(report(), files(schema={"type": "array"}))
    assert problems[0].code == "DATA_SCHEMA_INVALID"


def test_sample_errors_have_file_and_pointer_without_data():
    bad = {
        "customer": {"name": "x"},
        "discount": "SECRET-VALUE",
        "items": [{"id": "QL01", "qty": "two", "unitPrice": "1.00"}],
    }
    _, problems = check_data(report(), files(sample=bad))
    by_ptr = {p.pointer: p for p in problems}
    assert {"/discount", "/items/0/qty"} <= set(by_ptr)
    assert all(p.code == "SAMPLE_INVALID" and p.file == "sample.json" for p in problems)
    assert all("SECRET" not in p.message and "two" not in p.message for p in problems)


def test_required_field_missing_in_sample():
    _, problems = check_data(report(), files(sample={"items": []}))
    assert problems[0].pointer == "" and "customer" in problems[0].message


def test_missing_and_broken_sample_files():
    rep = report(data={"schema": "data.schema.json", "samples": ["sample.json", "edge.json"]})
    _, problems = check_data(rep, files())
    assert problems[0].code == "FILE_MISSING"
    _, problems = check_data(rep, files(**{"edge.json": "{"}))
    assert problems[0].code == "JSON_INVALID"


def test_list_path_must_be_array_of_objects():
    _, problems = check_data(report(lists={"x": {"path": "/customer", "id": "id"}}), files())
    assert (problems[0].code, problems[0].pointer) == ("LIST_PATH_INVALID", "/lists/x/path")
    _, problems = check_data(report(lists={"x": {"path": "/nope", "id": "id"}}), files())
    assert problems[0].code == "LIST_PATH_INVALID"


def test_date_format_checked():
    schema = {"type": "object", "properties": {"d": {"type": "string", "format": "date"}}}
    _, problems = check_data(report(lists={}), files(schema=schema, sample={"d": "2026-13-40"}))
    assert problems[0].pointer == "/d"
