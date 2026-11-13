from decimal import Decimal

import pytest

from jester_api.data_prep.params import check_params
from jester_api.report_definition.model import ReportJson

PARAMS = {
    "quoteId": {"type": "string", "required": True, "maxLength": 10},
    "locale": {"type": "enum", "values": ["th-TH"], "default": "th-TH"},
    "docDate": {"type": "date", "required": True},
    "rate": {"type": "decimal", "default": "0.07"},
    "copies": {"type": "integer"},
    "draft": {"type": "boolean", "default": False},
}
REPORT = ReportJson.model_validate(
    {
        "schemaVersion": 1,
        "name": "x",
        "fonts": {"body": ["a"]},
        "parameters": PARAMS,
        "data": {"schema": "s.json", "samples": ["x.json"]},
    }
)


def check(**params):
    return check_params(REPORT, params)


def test_valid_params_and_defaults():
    out, problems = check(quoteId="Q-001", docDate="2026-11-12")
    assert problems == []
    assert out == {
        "quoteId": "Q-001",
        "locale": "th-TH",
        "docDate": "2026-11-12",
        "rate": Decimal("0.07"),
        "copies": None,
        "draft": False,
    }


def test_given_value_wins_over_default():
    out, _ = check(quoteId="Q", docDate="2026-11-12", rate=Decimal("0.10"), draft=True, copies=2)
    assert (out["rate"], out["draft"], out["copies"]) == (Decimal("0.10"), True, 2)


@pytest.mark.parametrize("rate", ["1.5", 2, Decimal("0.07")])
def test_decimal_param_becomes_decimal(rate):
    out, _ = check(quoteId="Q", docDate="2026-11-12", rate=rate)
    assert isinstance(out["rate"], Decimal)


def test_problem_codes_and_pointers():
    _, problems = check(quoteID="Q-001", docDate="12/11/2026")
    found = {(p.code, p.pointer) for p in problems}
    assert found == {
        ("PARAM_UNKNOWN", "/params/quoteID"),
        ("PARAM_REQUIRED", "/params/quoteId"),
        ("PARAM_INVALID", "/params/docDate"),
    }


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("quoteId", "x" * 11),
        ("quoteId", 5),
        ("locale", "en-US"),
        ("rate", 1.5),
        ("rate", "abc"),
        ("copies", True),
        ("copies", "2"),
        ("draft", "yes"),
        ("docDate", "20261112"),
    ],
)
def test_invalid_values(name, value):
    params = {"quoteId": "Q", "docDate": "2026-11-12", name: value}
    _, problems = check_params(REPORT, params)
    assert [(p.code, p.pointer) for p in problems] == [("PARAM_INVALID", f"/params/{name}")]


def test_messages_never_contain_values():
    _, problems = check(quoteId="SECRET-123456", docDate="SECRET")
    assert problems and all("SECRET" not in p.message for p in problems)


def test_null_counts_as_missing():
    _, problems = check(quoteId=None, docDate="2026-11-12")
    assert [p.code for p in problems] == ["PARAM_REQUIRED"]
