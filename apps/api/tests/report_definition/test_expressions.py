import re
from decimal import Decimal
from pathlib import Path

import pytest

from jester_api.report_definition.expressions import (
    BinOp,
    BoolOp,
    Call,
    Compare,
    ExpressionError,
    Neg,
    Not,
    Num,
    Ref,
    parse_expression,
    walk,
)


def p(src, mode="basic"):
    return parse_expression(src, mode)


@pytest.mark.parametrize(
    "src",
    [
        "round(qty * unitPrice, 2)",
        "sum(items.amount)",
        "subtotal - discount",
        "round(net * 0.07, 2)",
        "net + vat",
        "sum(amount)",
        "count()",
        "sum(details.amount)",
        "sum(orders.total)",
        "-(a + b) / 2",
    ],
)
def test_spec_basic_expressions_parse(src):
    p(src)


def test_precedence_and_decimals():
    assert p("1 + 2 * 3.50") == BinOp("+", Num(Decimal(1)), BinOp("*", Num(Decimal(2)), Num(Decimal("3.50"))))
    assert p("-a") == Neg(Ref(("a",)))
    assert p("(1 + 2) * 3").op == "*"


def test_spec_advanced_example():
    node = p("if(isJuristic == 1 and net >= 1000, round(net * 0.03, 2), 0)", "advanced")
    assert isinstance(node, Call) and node.func == "if"
    assert isinstance(node.args[0], BoolOp) and isinstance(node.args[0].left, Compare)


def test_advanced_conditions():
    assert isinstance(p("if(not a > 1, 1, 2)", "advanced").args[0], Not)
    assert isinstance(p("if((a > 1 or b < 2) and c != 0, 1, 2)", "advanced").args[0], BoolOp)
    assert isinstance(p("if((a + 1) > 2, 1, 2)", "advanced").args[0], Compare)
    assert p("abs(a - b)", "advanced") == Call("abs", (BinOp("-", Ref(("a",)), Ref(("b",))),))


@pytest.mark.parametrize("src", ["if(a > 1, 1, 0)", "abs(a)"])
def test_advanced_syntax_rejected_in_basic(src):
    with pytest.raises(ExpressionError) as e:
        p(src, "basic")
    assert e.value.code == "EXPRESSION_MODE"


@pytest.mark.parametrize(
    "src",
    [
        "__import__('os')",
        "a.b()",
        "a[0]",
        "lambda: 1",
        "'text'",
        "a if b else c",
        "round(x)",
        "1 ++",
        "open(x)",
        "round(x, 1.5)",
        "round(x, 11)",
        "sum(1 + 2)",
        "count(a)",
        "a > 1",
        "a +",
        "",
        "a .",
        "a.and",
        "sum(and)",
        "and",
        "1 2",
        "a; b",
        "a ** 2",
        "`a`",
    ],
)
def test_outside_grammar_rejected(src):
    with pytest.raises(ExpressionError) as e:
        p(src, "advanced")
    assert e.value.code == "EXPRESSION_INVALID"
    assert e.value.column >= 1


def test_error_column_points_at_problem():
    with pytest.raises(ExpressionError) as e:
        p("net + vat ? 1")
    assert e.value.column == 11


def test_condition_needs_comparison():
    with pytest.raises(ExpressionError, match="comparison"):
        p("if(a, 1, 2)", "advanced")


def test_walk_finds_refs():
    refs = {n.parts for n in walk(p("if(a > 1, sum(items.x), abs(-b))", "advanced")) if isinstance(n, Ref)}
    assert refs == {("a",), ("items", "x"), ("b",)}


def test_module_never_executes_text():
    src = Path(__file__).parents[2] / "src/jester_api/report_definition"
    code = "".join(f.read_text(encoding="utf-8") for f in src.glob("*.py"))
    # builtins only; re.compile is fine
    for banned in (
        r"(?<![\w.])eval\(",
        r"(?<![\w.])exec\(",
        r"(?<![\w.])compile\(",
        r"import ast\b",
        r"literal_eval",
        r"__import__\(",
    ):
        assert not re.search(banned, code), banned
