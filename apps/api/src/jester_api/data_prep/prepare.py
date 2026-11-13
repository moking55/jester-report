"""prepare(): params + data + definition -> template view model (SPEC-data-prep.md)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from jsonschema import Draft202012Validator

from ..report_definition.data_schema import FORMATS, safe_message
from ..report_definition.loader import ReportDefinition
from ..report_definition.problems import Problem, error, has_errors, pointer
from ..report_definition.refs import field_types
from .evaluate import CalcError, Env, evaluate
from .formatters import FORMATTERS
from .lists import ListView, build_lists, convert_numbers
from .params import check_params

MAX_PROBLEMS = 50


@dataclass(frozen=True)
class Prepared:
    params: dict[str, Any]
    data: Any
    lists: dict[str, ListView]
    totals: dict[str, Decimal]
    meta: Mapping[str, Any]
    fmt: SimpleNamespace

    def template_context(self) -> dict[str, Any]:
        return {
            "params": self.params,
            "data": self.data,
            "lists": self.lists,
            "totals": self.totals,
            "meta": self.meta,
            "fmt": self.fmt,
        }


@dataclass(frozen=True)
class PrepareResult:
    prepared: Prepared | None
    problems: list[Problem]


def _floats(value: Any, parts: tuple[Any, ...]) -> list[Problem]:
    if isinstance(value, float):
        return [
            error(
                "NUMBER_IS_FLOAT",
                "binary float in data; parse JSON with parse_float=Decimal",
                pointer=pointer(parts),
            )
        ]
    if isinstance(value, Mapping):
        return [p for k, v in value.items() for p in _floats(v, (*parts, k))]
    if isinstance(value, list):
        return [p for i, v in enumerate(value) for p in _floats(v, (*parts, i))]
    return []


def _check_data(definition: ReportDefinition, data: Any) -> list[Problem]:
    validator = Draft202012Validator(definition.data.schema, format_checker=FORMATS)
    return [
        error(
            "DATA_INVALID",
            safe_message(e.validator, e.validator_value, e.message),
            pointer=pointer(("data", *e.absolute_path)),
        )
        for e in sorted(validator.iter_errors(data), key=lambda e: list(map(str, e.absolute_path)))
    ]


def _report_totals(definition: ReportDefinition, data: Any, lists: dict[str, ListView]) -> tuple[dict, list]:
    names = convert_numbers(data, field_types(definition.data.schema)) if isinstance(data, Mapping) else {}
    env = Env(names, {name: view.rows for name, view in lists.items()})
    totals: dict[str, Decimal] = {}
    problems: list[Problem] = []
    for name in definition.expressions.order.get("/totals", []):
        try:
            totals[name] = names[name] = evaluate(definition.expressions.nodes[f"/totals/{name}"], env)
        except CalcError as exc:
            problems.append(error(exc.code, f"{name}: {exc.message}", pointer="/data"))
            names[name] = None
    return totals, problems


def _capped(problems: list[Problem]) -> list[Problem]:
    if len(problems) <= MAX_PROBLEMS:
        return problems
    more = len(problems) - MAX_PROBLEMS
    return [*problems[:MAX_PROBLEMS], error("TOO_MANY_PROBLEMS", f"{more} more problems not shown")]


def prepare(
    definition: ReportDefinition, params: Mapping[str, Any], data: Any, meta: Mapping[str, Any]
) -> PrepareResult:
    checked_params, problems = check_params(definition.report, params)
    floats = _floats(data, ("data",))
    problems += floats or _check_data(definition, data)
    if has_errors(problems):
        return PrepareResult(None, _capped(problems))
    lists, list_problems = build_lists(definition, data)
    totals, total_problems = _report_totals(definition, data, lists)
    problems += list_problems + total_problems
    if has_errors(problems):
        return PrepareResult(None, _capped(problems))
    return PrepareResult(Prepared(checked_params, data, lists, totals, dict(meta), FORMATTERS), problems)
