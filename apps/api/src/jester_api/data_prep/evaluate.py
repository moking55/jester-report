"""Evaluate report-definition expression ASTs with Decimal (SPEC-data-prep.md "กติกาการคำนวณ")."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Context, Decimal, localcontext
from typing import Any

from ..report_definition.expressions import BinOp, BoolOp, Call, Compare, Cond, Neg, Node, Not, Num, Ref

CONTEXT = Context(prec=28, rounding=ROUND_HALF_UP)


class CalcError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code, self.message = code, message


@dataclass(frozen=True)
class Env:
    names: Mapping[str, Any]  # plain names: row fields, computed, totals
    lists: Mapping[str, Sequence[Mapping[str, Any]]] = field(default_factory=dict)  # "" = group rows


def _number(value: Any, name: str) -> Decimal:
    if value is None:
        raise CalcError("VALUE_MISSING", f"{name!r} has no value")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        return Decimal(value)
    raise CalcError("VALUE_NOT_NUMERIC", f"{name!r} is not a number")


def _lookup(env: Env, name: str) -> Decimal:
    return _number(env.names.get(name), name)


def _aggregate(func: str, ref: Ref, env: Env) -> Decimal:
    *owner, fld = ref.parts
    rows = env.lists.get(".".join(owner), ())
    values = [_number(row.get(fld), f"{'.'.join(ref.parts)} (row {i})") for i, row in enumerate(rows)]
    if func == "sum":
        return sum(values, Decimal(0))
    if not values:
        raise CalcError("EMPTY_AGGREGATE", f"{func}() of an empty list")
    return min(values) if func == "min" else max(values)


def _eval(node: Node | Cond, env: Env) -> Decimal | bool:
    match node:
        case Num(value):
            return value
        case Ref(parts):
            return _lookup(env, ".".join(parts))
        case Neg(operand):
            return -_eval(operand, env)  # type: ignore[operator]
        case BinOp(op, left, right):
            a, b = _eval(left, env), _eval(right, env)
            if op == "+":
                return a + b  # type: ignore[operator]
            if op == "-":
                return a - b  # type: ignore[operator]
            if op == "*":
                return a * b  # type: ignore[operator]
            if b == 0:
                raise CalcError("DIVISION_BY_ZERO", "division by zero")
            return a / b  # type: ignore[operator]
        case Compare(op, left, right):
            a, b = _eval(left, env), _eval(right, env)
            return {"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b, "==": a == b, "!=": a != b}[op]  # type: ignore[operator]
        case BoolOp("and", left, right):
            return bool(_eval(left, env)) and bool(_eval(right, env))
        case BoolOp(_, left, right):
            return bool(_eval(left, env)) or bool(_eval(right, env))
        case Not(operand):
            return not _eval(operand, env)
        case Call("round", (value, Num(places))):
            return _eval(value, env).quantize(Decimal(1).scaleb(-int(places)))  # type: ignore[union-attr]
        case Call("abs", (value,)):
            return abs(_eval(value, env))  # type: ignore[arg-type]
        case Call("if", (cond, then, other)):
            return _eval(then, env) if _eval(cond, env) else _eval(other, env)
        case Call("count", ()):
            return Decimal(len(env.lists.get("", ())))
        case Call(func, (Ref() as ref,)):
            return _aggregate(func, ref, env)
    raise AssertionError(f"unexpected node {node!r}")  # parser guarantees the shapes above


def evaluate(node: Node, env: Env) -> Decimal:
    """Evaluate in our own decimal context; the global context is never touched."""
    with localcontext(CONTEXT):
        return _eval(node, env)  # type: ignore[return-value]
