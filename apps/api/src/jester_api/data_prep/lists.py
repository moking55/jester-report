"""Build list views: rows with Decimal numbers, computed fields, child lists, totals, sort and groups."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, overload

from ..report_definition.loader import ReportDefinition
from ..report_definition.model import DECIMAL_RE, ListSpec
from ..report_definition.problems import Problem, error, pointer
from ..report_definition.refs import field_types
from .evaluate import CalcError, Env, evaluate

Row = dict[str, Any]
LEADING_VOWEL = re.compile("([เ-ไ])([ก-ฮ])")


@dataclass(frozen=True)
class Group:
    key: Any
    rows: list[Row]
    totals: dict[str, Decimal]


class ListView(Sequence[Row]):
    """Iterable like a list in templates, plus `.rows` and `.groups`."""

    def __init__(self, rows: list[Row], groups: list[Group] | None = None) -> None:
        self.rows = rows
        self.groups = groups or []

    @overload
    def __getitem__(self, index: int) -> Row: ...
    @overload
    def __getitem__(self, index: slice) -> Sequence[Row]: ...
    def __getitem__(self, index):  # type: ignore[no-untyped-def]
        return self.rows[index]

    def __len__(self) -> int:
        return len(self.rows)

    def __repr__(self) -> str:
        return f"ListView({len(self.rows)} rows, {len(self.groups)} groups)"


def to_number(value: Any) -> Any:
    """Ints and decimal strings become Decimal; anything else is kept and the evaluator reports it."""
    if isinstance(value, int) and not isinstance(value, bool):
        return Decimal(value)
    if isinstance(value, str) and DECIMAL_RE.match(value):
        return Decimal(value)
    return value


def convert_numbers(raw: Mapping[str, Any], types: Mapping[str, bool]) -> Row:
    return {k: to_number(v) if types.get(k) else v for k, v in raw.items()}


def _types(schema: Mapping[str, Any]) -> list[Any]:
    kind = schema.get("type")
    return kind if isinstance(kind, list) else [kind]


def _empty(schema: Any) -> Any:
    """Value for a declared property the caller did not send: blank object skeleton, [] or None."""
    if not isinstance(schema, Mapping):
        return None
    if isinstance(schema.get("properties"), Mapping):
        return {k: _empty(s) for k, s in schema["properties"].items()}
    return [] if "array" in _types(schema) else None


def fill_missing(value: Any, schema: Any) -> Any:
    """Copy of `value` with every declared-but-missing property filled in, at every depth (SPEC-binder)."""
    if not isinstance(schema, Mapping):
        return value
    if value is None:  # an explicit null reads like a missing optional value: blank skeleton, [] or None
        return _empty(schema)
    props = schema.get("properties")
    if isinstance(value, Mapping) and isinstance(props, Mapping):
        out = {k: fill_missing(v, props.get(k)) for k, v in value.items()}
        for k, s in props.items():
            if k not in out:
                out[k] = _empty(s)
        return out
    if isinstance(value, list) and isinstance(schema.get("items"), Mapping):
        return [fill_missing(v, schema["items"]) for v in value]
    return value


@dataclass
class _Builder:
    definition: ReportDefinition
    problems: list[Problem] = field(default_factory=list)

    def _calc(self, node_ptr: str, env: Env, data_ptr: str) -> Decimal | None:
        try:
            return evaluate(self.definition.expressions.nodes[node_ptr], env)
        except CalcError as exc:
            name = node_ptr.rsplit("/", 1)[-1]
            self.problems.append(error(exc.code, f"{name}: {exc.message}", pointer=data_ptr))
            return None

    def _eval_set(self, def_ptr: str, env: Env, target: dict[str, Any], data_ptr: str) -> None:
        # env.names is `target` itself, so later names see earlier results (topological order)
        for name in self.definition.expressions.order.get(def_ptr, []):
            target[name] = self._calc(f"{def_ptr}/{name}", env, data_ptr)

    def build(self, key: str, spec: ListSpec, parent: Any, def_ptr: str, data_ptr: str) -> ListView:
        raw_items = _resolve(parent, spec.path)
        items = raw_items if isinstance(raw_items, list) else []
        item_schema = self.definition.data.lists[key]
        types = field_types(item_schema)
        rows: list[Row] = []
        seen: dict[Any, str] = {}
        for i, raw in enumerate(items):
            row_ptr = f"{data_ptr}{spec.path}/{i}"
            row = fill_missing(convert_numbers(raw, types), item_schema)
            ident = row.get(spec.id)
            if ident is None:
                self.problems.append(
                    error("VALUE_MISSING", f"{spec.id!r} has no value", pointer=f"{row_ptr}/{spec.id}")
                )
            elif ident in seen:
                self.problems.append(
                    error(
                        "DUPLICATE_ID", f"same {spec.id!r} as {seen[ident]}", pointer=f"{row_ptr}/{spec.id}"
                    )
                )
            else:
                seen[ident] = f"{row_ptr}/{spec.id}"
            self._eval_set(f"{def_ptr}/computed", Env(row), row, row_ptr)
            children: dict[str, list[Row]] = {}
            for child_name, child in spec.lists.items():
                view = self.build(f"{key}.{child_name}", child, raw, f"{def_ptr}/lists/{child_name}", row_ptr)
                row[child_name] = view
                children[child_name] = view.rows
            self._eval_set(f"{def_ptr}/totals", Env(row, children), row, row_ptr)
            rows.append(row)
        rows = self._sort(spec, rows, data_ptr)
        groups = self._group(spec, rows, def_ptr, f"{data_ptr}{spec.path}") if spec.groupBy else []
        return ListView(rows, groups)

    def _sort(self, spec: ListSpec, rows: list[Row], data_ptr: str) -> list[Row]:
        fields = list(spec.sort)
        if spec.groupBy and not fields:
            fields = [spec.groupBy.key]
        if not fields:
            return rows
        missing = [(i, f) for i, r in enumerate(rows) for f in fields if r.get(f) is None]
        for i, f in missing:
            self.problems.append(
                error("VALUE_MISSING", f"{f!r} has no value", pointer=f"{data_ptr}{spec.path}/{i}/{f}")
            )
        if missing:
            return rows
        return sorted(rows, key=lambda r: tuple(_sort_key(r[f]) for f in fields))

    def _group(self, spec: ListSpec, rows: list[Row], def_ptr: str, list_ptr: str) -> list[Group]:
        assert spec.groupBy is not None
        groups: list[Group] = []
        for row in rows:
            if not groups or groups[-1].key != row.get(spec.groupBy.key):
                groups.append(Group(row.get(spec.groupBy.key), [], {}))
            groups[-1].rows.append(row)
        for g in groups:
            self._eval_set(f"{def_ptr}/groupBy/totals", Env(g.totals, {"": g.rows}), g.totals, list_ptr)
        return groups


def _sort_key(value: Any) -> Any:
    # Thai dictionary order: a leading vowel (เ แ โ ใ ไ) sorts by the consonant after it
    return LEADING_VOWEL.sub(r"\2\1", value) if isinstance(value, str) else value


def _resolve(parent: Any, path: str) -> Any:
    cur = parent
    for part in path.strip("/").split("/"):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part.replace("~1", "/").replace("~0", "~"))
    return cur


def build_lists(definition: ReportDefinition, data: Any) -> tuple[dict[str, ListView], list[Problem]]:
    builder = _Builder(definition)
    views = {
        name: builder.build(name, spec, data, pointer(("lists", name)), "/data")
        for name, spec in definition.report.lists.items()
    }
    return views, builder.problems
