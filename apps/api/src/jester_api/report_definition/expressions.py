"""Closed expression language (SPEC-report-definition.md "ภาษา expression").

Hand-written tokenizer + recursive-descent parser. Nothing here executes user text.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

Mode = Literal["basic", "advanced"]
ADVANCED_FUNCS = frozenset({"if", "abs"})
FUNCS = frozenset({"round", "sum", "count", "min", "max"}) | ADVANCED_FUNCS
KEYWORDS = frozenset({"and", "or", "not"})
CMP_OPS = frozenset({"<", "<=", ">", ">=", "==", "!="})
MAX_ROUND_PLACES = 10

_TOKEN = re.compile(
    r"\s*(?:(?P<num>\d+(?:\.\d+)?)|(?P<name>[A-Za-z_][A-Za-z0-9_]*)|(?P<op><=|>=|==|!=|[-+*/().,<>]))"
)


# ---- AST -------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Num:
    value: Decimal


@dataclass(frozen=True)
class Ref:
    parts: tuple[str, ...]


@dataclass(frozen=True)
class Neg:
    operand: Node


@dataclass(frozen=True)
class BinOp:
    op: str  # + - * /
    left: Node
    right: Node


@dataclass(frozen=True)
class Call:
    func: str  # round sum count min max if abs
    args: tuple[Node | Cond, ...]


@dataclass(frozen=True)
class Compare:
    op: str
    left: Node
    right: Node


@dataclass(frozen=True)
class BoolOp:
    op: Literal["and", "or"]
    left: Cond
    right: Cond


@dataclass(frozen=True)
class Not:
    operand: Cond


Node = Num | Ref | Neg | BinOp | Call
Cond = Compare | BoolOp | Not


class ExpressionError(Exception):
    def __init__(self, code: str, message: str, column: int) -> None:
        super().__init__(message)
        self.code, self.message, self.column = code, message, column


@dataclass(frozen=True)
class _Tok:
    kind: Literal["num", "name", "op", "end"]
    text: str
    col: int  # 1-based


def _tokenize(src: str) -> list[_Tok]:
    toks, pos = [], 0
    while pos < len(src):
        if src[pos:].strip() == "":
            break
        m = _TOKEN.match(src, pos)
        if not m:
            col = pos + len(src[pos:]) - len(src[pos:].lstrip()) + 1
            raise ExpressionError("EXPRESSION_INVALID", f"unexpected character {src[col - 1]!r}", col)
        kind = m.lastgroup
        toks.append(_Tok(kind, m.group(kind), m.start(kind) + 1))  # type: ignore[arg-type]
        pos = m.end()
    toks.append(_Tok("end", "", len(src) + 1))
    return toks


class _Parser:
    def __init__(self, src: str, mode: Mode) -> None:
        self.toks, self.i, self.mode = _tokenize(src), 0, mode

    # helpers
    @property
    def cur(self) -> _Tok:
        return self.toks[self.i]

    def _next(self) -> _Tok:
        tok = self.cur
        self.i += 1
        return tok

    def _is(self, text: str) -> bool:
        return self.cur.kind in ("op", "name") and self.cur.text == text

    def _expect(self, text: str) -> _Tok:
        if not self._is(text):
            raise self._unexpected(f"expected {text!r}")
        return self._next()

    def _unexpected(self, what: str = "unexpected token") -> ExpressionError:
        found = "end of expression" if self.cur.kind == "end" else repr(self.cur.text)
        return ExpressionError("EXPRESSION_INVALID", f"{what}, found {found}", self.cur.col)

    # grammar
    def parse(self) -> Node:
        node = self.expr()
        if self.cur.kind != "end":
            raise self._unexpected()
        return node

    def expr(self) -> Node:
        node = self.term()
        while self._is("+") or self._is("-"):
            op = self._next().text
            node = BinOp(op, node, self.term())
        return node

    def term(self) -> Node:
        node = self.factor()
        while self._is("*") or self._is("/"):
            op = self._next().text
            node = BinOp(op, node, self.factor())
        return node

    def factor(self) -> Node:
        tok = self.cur
        if tok.kind == "num":
            self._next()
            return Num(Decimal(tok.text))
        if self._is("-"):
            self._next()
            return Neg(self.factor())
        if self._is("("):
            self._next()
            node = self.expr()
            self._expect(")")
            return node
        if tok.kind == "name" and tok.text not in KEYWORDS:
            if self.toks[self.i + 1].text == "(" and self.toks[self.i + 1].kind == "op":
                return self.call()
            return self.ref()
        raise self._unexpected("expected a number, name or '('")

    def ref(self) -> Ref:
        parts = [self._next().text]
        while self._is("."):
            self._next()
            if self.cur.kind != "name" or self.cur.text in KEYWORDS:
                raise self._unexpected("expected a field name after '.'")
            parts.append(self._next().text)
        if self._is("("):
            raise ExpressionError("EXPRESSION_INVALID", "only built-in functions can be called", self.cur.col)
        return Ref(tuple(parts))

    def call(self) -> Call:
        name_tok = self._next()
        name = name_tok.text
        if name not in FUNCS:
            raise ExpressionError("EXPRESSION_INVALID", f"unknown function {name!r}", name_tok.col)
        if name in ADVANCED_FUNCS and self.mode == "basic":
            raise ExpressionError(
                "EXPRESSION_MODE", f'{name}() needs "expressionMode": "advanced"', name_tok.col
            )
        self._expect("(")
        if name == "count":
            args: tuple[Node | Cond, ...] = ()
        elif name in ("sum", "min", "max"):
            if self.cur.kind != "name" or self.cur.text in KEYWORDS:
                raise self._unexpected(f"{name}() takes a field reference")
            args = (self.ref(),)
        elif name == "round":
            value = self.expr()
            self._expect(",")
            places = self.cur
            if places.kind != "num" or "." in places.text or int(places.text) > MAX_ROUND_PLACES:
                raise self._unexpected(f"round() places must be an integer 0-{MAX_ROUND_PLACES}")
            self._next()
            args = (value, Num(Decimal(places.text)))
        elif name == "abs":
            args = (self.expr(),)
        else:  # if
            cond = self.cond()
            self._expect(",")
            then = self.expr()
            self._expect(",")
            args = (cond, then, self.expr())
        self._expect(")")
        return Call(name, args)

    def cond(self) -> Cond:
        node = self.cond_and()
        while self._is("or"):
            self._next()
            node = BoolOp("or", node, self.cond_and())
        return node

    def cond_and(self) -> Cond:
        node = self.cond_not()
        while self._is("and"):
            self._next()
            node = BoolOp("and", node, self.cond_not())
        return node

    def cond_not(self) -> Cond:
        if self._is("not"):
            self._next()
            return Not(self.cond_not())
        if self._is("("):  # "(" may open a grouped condition or an arithmetic expression
            start = self.i
            try:
                self._next()
                inner = self.cond()
                self._expect(")")
                return inner
            except ExpressionError:
                self.i = start
        left = self.expr()
        if self.cur.kind != "op" or self.cur.text not in CMP_OPS:
            raise self._unexpected("expected a comparison (<, <=, >, >=, ==, !=)")
        op = self._next().text
        return Compare(op, left, self.expr())


def parse_expression(src: str, mode: Mode) -> Node:
    """Parse or raise ExpressionError(code, message, column)."""
    return _Parser(src, mode).parse()


def walk(node: Node | Cond) -> Iterator[Node | Cond]:
    yield node
    if isinstance(node, Neg | Not):
        yield from walk(node.operand)
    elif isinstance(node, BinOp | Compare | BoolOp):
        yield from walk(node.left)
        yield from walk(node.right)
    elif isinstance(node, Call):
        for arg in node.args:
            yield from walk(arg)
