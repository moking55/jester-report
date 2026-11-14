import decimal
from decimal import Decimal

import pytest

from jester_api.data_prep.evaluate import CalcError, Env, evaluate
from jester_api.report_definition.expressions import parse_expression

D = Decimal


def ev(src, names=None, lists=None, mode="advanced"):
    return evaluate(parse_expression(src, mode), Env(names or {}, lists or {}))


def test_arithmetic_and_precedence():
    assert ev("1 + 2 * 3.50") == D("8.00")
    assert ev("-(a - b) / 2", {"a": D(1), "b": D(5)}) == D(2)
    assert ev("qty * unitPrice", {"qty": 2, "unitPrice": D("1250.50")}) == D("2501.00")


@pytest.mark.parametrize(
    ("src", "expected"),
    [
        ("round(1.005, 2)", "1.01"),
        ("round(-0.005, 2)", "-0.01"),
        ("round(2.5, 0)", "3"),
        ("round(net * 0.07, 2)", "210.00"),
    ],
)
def test_round_half_up(src, expected):
    assert ev(src, {"net": D("3000.00")}) == D(expected)


def test_sum_min_max_count():
    rows = [{"amount": D("1200.25")}, {"amount": D("799.75")}]
    assert ev("sum(items.amount)", lists={"items": rows}) == D("2000.00")
    assert ev("min(items.amount)", lists={"items": rows}) == D("799.75")
    assert ev("max(amount)", lists={"": rows}) == D("1200.25")
    assert ev("count()", lists={"": rows}) == 2
    assert ev("sum(items.amount)", lists={"items": []}) == 0


@pytest.mark.parametrize("func", ["min", "max"])
def test_min_max_of_empty_list(func):
    with pytest.raises(CalcError) as e:
        ev(f"{func}(items.amount)", lists={"items": []})
    assert e.value.code == "EMPTY_AGGREGATE"


@pytest.mark.parametrize(
    ("src", "names", "lists"),
    [
        ("a + 1", {"a": None}, {}),
        ("a + 1", {}, {}),
        ("sum(items.amount)", {}, {"items": [{"amount": D(1)}, {"amount": None}]}),
        ("sum(items.amount)", {}, {"items": [{}]}),
    ],
)
def test_null_is_never_zero(src, names, lists):
    with pytest.raises(CalcError) as e:
        ev(src, names, lists)
    assert e.value.code == "VALUE_MISSING"


def test_non_numeric_value():
    with pytest.raises(CalcError) as e:
        ev("a + 1", {"a": "12"})
    assert e.value.code == "VALUE_NOT_NUMERIC"


def test_division_by_zero():
    with pytest.raises(CalcError) as e:
        ev("1 / (a - a)", {"a": D(3)})
    assert e.value.code == "DIVISION_BY_ZERO"


def test_if_only_evaluates_chosen_branch():
    assert ev("if(rows > 0, total / rows, 0)", {"rows": D(0), "total": D(5)}) == 0
    assert ev("if(rows > 0, total / rows, 0)", {"rows": D(2), "total": D(5)}) == D("2.5")


def test_conditions_and_abs():
    names = {"isJuristic": 1, "net": D("1000")}
    assert ev("if(isJuristic == 1 and net >= 1000, round(net * 0.03, 2), 0)", names) == D("30.00")
    assert ev("if(not net < 1000 or isJuristic != 1, 1, 2)", names) == 1
    assert ev("if(net < 1000 and isJuristic == 1, 1, 2)", names) == 2
    assert ev("abs(0 - net)", names) == D("1000")


def test_global_decimal_context_untouched():
    before = decimal.getcontext().copy()
    decimal.getcontext().prec = 5
    try:
        assert ev("1 / 3") == D("0.3333333333333333333333333333")  # 28 digits, not 5
        assert decimal.getcontext().prec == 5
    finally:
        decimal.setcontext(before)


def test_number_too_large_is_a_calc_error():
    with pytest.raises(CalcError) as e:
        ev("round(a, 2)", {"a": D("9" * 30 + ".5")})
    assert e.value.code == "NUMBER_TOO_LARGE"
