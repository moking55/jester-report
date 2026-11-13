"""Parse every expression, check what it refers to, and order each set of definitions.

Scopes (SPEC-report-definition.md "กติกาของ field"):
- list `computed`: row fields + earlier computed names; no aggregates
- list `totals` (per row): row scope + aggregates over child lists `sum(child.field)`
- `groupBy.totals`: earlier group totals + aggregates over the group's rows `sum(field)` and `count()`
- report `totals`: top-level data fields + earlier totals + aggregates over top-level lists `sum(list.field)`
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .data_schema import DataSchema
from .expressions import (
    BinOp,
    BoolOp,
    Call,
    Compare,
    ExpressionError,
    Neg,
    Node,
    Not,
    Num,
    Ref,
    parse_expression,
)
from .model import ListSpec, ReportJson
from .problems import Problem, error, pointer

FILE = "report.json"


def _is_numeric(schema: Any) -> bool:
    if not isinstance(schema, dict):
        return False
    types = schema.get("type")
    types = types if isinstance(types, list) else [types]
    return bool({"number", "integer"} & set(types)) or (
        "string" in types and schema.get("format") == "decimal"
    )


def _fields(item_schema: dict[str, Any]) -> dict[str, bool]:
    """Field name -> is numeric."""
    props = item_schema.get("properties") or {}
    return {name: _is_numeric(s) for name, s in props.items()}


@dataclass
class _Scope:
    names: dict[str, bool]  # plain names visible -> numeric
    aggregate: dict[str, dict[str, bool]] | None  # None = no aggregates; "child" or "" -> usable fields
    allow_count: bool = False
    siblings: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class CheckedExpressions:
    nodes: dict[str, Node]  # JSON pointer in report.json -> AST
    order: dict[str, list[str]]  # pointer of each definition set -> names in evaluation order


class _Checker:
    def __init__(self, report: ReportJson, data: DataSchema) -> None:
        self.report, self.data = report, data
        self.problems: list[Problem] = []
        self.nodes: dict[str, Node] = {}
        self.order: dict[str, list[str]] = {}

    # ---- expression walking ---------------------------------------------------------------------------
    def _refs(self, node: Node | Any, scope: _Scope, where: str, deps: set[str]) -> None:
        if isinstance(node, Num):
            return
        if isinstance(node, Ref):
            self._plain_ref(node, scope, where, deps)
        elif isinstance(node, Neg | Not):
            self._refs(node.operand, scope, where, deps)
        elif isinstance(node, BinOp | Compare | BoolOp):
            self._refs(node.left, scope, where, deps)
            self._refs(node.right, scope, where, deps)
        elif isinstance(node, Call):
            if node.func in ("sum", "min", "max"):
                self._aggregate_ref(node.func, node.args[0], scope, where)  # type: ignore[arg-type]
            elif node.func == "count":
                if not scope.allow_count:
                    self._err("AGGREGATE_NOT_ALLOWED", "count() is only allowed in groupBy.totals", where)
            else:
                for arg in node.args:
                    self._refs(arg, scope, where, deps)

    def _plain_ref(self, ref: Ref, scope: _Scope, where: str, deps: set[str]) -> None:
        name = ".".join(ref.parts)
        if len(ref.parts) == 1 and name in scope.siblings:
            deps.add(name)
        elif len(ref.parts) != 1 or name not in scope.names:
            self._err("REF_UNKNOWN", f"{name!r} is not defined here", where)
        elif not scope.names[name]:
            self._err("REF_NOT_NUMERIC", f"{name!r} is not a number in the data schema", where)

    def _aggregate_ref(self, func: str, ref: Ref, scope: _Scope, where: str) -> None:
        if scope.aggregate is None:
            self._err("AGGREGATE_NOT_ALLOWED", f"{func}() is not allowed here", where)
            return
        *owner, fld = ref.parts
        fields = scope.aggregate.get(".".join(owner))
        name = ".".join(ref.parts)
        if fields is None or fld not in fields or len(owner) > 1:
            self._err("REF_UNKNOWN", f"{name!r} is not a list field that {func}() can use here", where)
        elif not fields[fld]:
            self._err("REF_NOT_NUMERIC", f"{name!r} is not a number in the data schema", where)

    def _err(self, code: str, message: str, where: str) -> None:
        self.problems.append(error(code, message, file=FILE, pointer=where))

    # ---- definition sets ------------------------------------------------------------------------------
    def _check_set(self, exprs: dict[str, str], where: tuple[str, ...], scope: _Scope) -> None:
        set_ptr = pointer(where)
        scope.siblings = set(exprs)
        deps: dict[str, set[str]] = {}
        for name, src in exprs.items():
            ptr = pointer((*where, name))
            try:
                node = parse_expression(src, self.report.expressionMode)
            except ExpressionError as exc:
                self.problems.append(error(exc.code, exc.message, file=FILE, pointer=ptr, column=exc.column))
                continue
            if name in scope.names:
                self._err("NAME_SHADOWS_FIELD", f"{name!r} already exists as a data field", ptr)
            self.nodes[ptr] = node
            deps[name] = set()
            self._refs(node, scope, ptr, deps[name])
        order = self._topo(deps, where)
        if order is not None:
            self.order[set_ptr] = order

    def _topo(self, deps: dict[str, set[str]], where: tuple[str, ...]) -> list[str] | None:
        order: list[str] = []
        state: dict[str, int] = {}  # 1 visiting, 2 done

        def visit(name: str, path: list[str]) -> bool:
            if state.get(name) == 2 or name not in deps:
                return True
            if state.get(name) == 1:
                cycle = path[path.index(name) :] + [name]
                self._err("REF_CYCLE", "circular definition: " + " -> ".join(cycle), pointer((*where, name)))
                return False
            state[name] = 1
            ok = all(visit(d, [*path, name]) for d in sorted(deps[name]))
            state[name] = 2
            order.append(name)
            return ok

        ok = all(visit(n, []) for n in deps)
        return order if ok else None

    def _row_scope(self, key: str, spec: ListSpec) -> dict[str, bool]:
        names = dict(_fields(self.data.lists[key]))
        names.update(dict.fromkeys(spec.computed, True))
        names.update(dict.fromkeys(spec.totals, True))
        return names

    def _check_list(self, key: str, spec: ListSpec, where: tuple[str, ...]) -> None:
        if key not in self.data.lists:
            return  # LIST_PATH_INVALID already reported
        fields = _fields(self.data.lists[key])
        named = [(("id",), spec.id), *((("sort", i), s) for i, s in enumerate(spec.sort))]
        if spec.groupBy:
            named.append((("groupBy", "key"), spec.groupBy.key))
        for sub, name in named:
            if name not in fields:
                self._err("REF_UNKNOWN", f"{name!r} is not a field of this list", pointer((*where, *sub)))
        self._check_set(spec.computed, (*where, "computed"), _Scope(dict(fields), None))
        children: dict[str, dict[str, bool]] = {}
        for child_name, child in spec.lists.items():
            child_key = f"{key}.{child_name}"
            self._check_list(child_key, child, (*where, "lists", child_name))
            if child_key in self.data.lists:
                children[child_name] = self._row_scope(child_key, child)
        row_names = {**fields, **dict.fromkeys(spec.computed, True)}
        self._check_set(spec.totals, (*where, "totals"), _Scope(row_names, children))
        if spec.groupBy:
            group_scope = _Scope({}, {"": self._row_scope(key, spec)}, allow_count=True)
            self._check_set(spec.groupBy.totals, (*where, "groupBy", "totals"), group_scope)

    def run(self) -> None:
        aggregates: dict[str, dict[str, bool]] = {}
        for name, spec in self.report.lists.items():
            self._check_list(name, spec, ("lists", name))
            if name in self.data.lists:
                aggregates[name] = self._row_scope(name, spec)
        self._check_set(self.report.totals, ("totals",), _Scope(_fields(self.data.schema), aggregates))


def check_expressions(report: ReportJson, data: DataSchema) -> tuple[CheckedExpressions, list[Problem]]:
    checker = _Checker(report, data)
    checker.run()
    return CheckedExpressions(checker.nodes, checker.order), checker.problems
