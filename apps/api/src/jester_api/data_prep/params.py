"""Check caller params against report.json parameters and apply declared defaults."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from ..report_definition.model import DECIMAL_RE, Parameter, ReportJson, is_iso_date
from ..report_definition.problems import Problem, error, pointer


def _coerce(spec: Parameter, value: Any) -> tuple[Any, str | None]:
    """Return (value, None) or (None, reason). Reasons never include the value."""
    kind = spec.type
    if kind == "string":
        if not isinstance(value, str):
            return None, "must be a string"
        if spec.maxLength is not None and len(value) > spec.maxLength:
            return None, f"must be at most {spec.maxLength} characters"
        return value, None
    if kind == "integer":
        ok = isinstance(value, int) and not isinstance(value, bool)
        return (value, None) if ok else (None, "must be an integer")
    if kind == "decimal":
        if isinstance(value, float):
            return None, "must be an exact decimal (got a binary float)"
        if isinstance(value, Decimal) and value.is_finite():
            return value, None
        if isinstance(value, int) and not isinstance(value, bool):
            return Decimal(value), None
        if isinstance(value, str) and DECIMAL_RE.match(value):
            return Decimal(value), None
        return None, "must be a decimal number"
    if kind == "boolean":
        return (value, None) if isinstance(value, bool) else (None, "must be true or false")
    if kind == "date":
        return (value, None) if is_iso_date(value) else (None, "must be a date as YYYY-MM-DD")
    return (value, None) if value in (spec.values or []) else (None, "is not one of the allowed values")


def check_params(
    report: ReportJson, params: Mapping[str, Any], blank: bool = False
) -> tuple[dict[str, Any], list[Problem]]:
    problems: list[Problem] = []
    out: dict[str, Any] = {}
    for name in params:
        if name not in report.parameters:
            problems.append(
                error(
                    "PARAM_UNKNOWN", f"parameter {name!r} is not declared", pointer=pointer(("params", name))
                )
            )
    for name, spec in report.parameters.items():
        where = pointer(("params", name))
        if name not in params or params[name] is None:
            if spec.required and not blank:  # v1.14: a blank form leaves required params empty
                problems.append(error("PARAM_REQUIRED", f"parameter {name!r} is required", pointer=where))
            if spec.default is not None:
                out[name] = _coerce(spec, spec.default)[0]
            else:
                out[name] = None
            continue
        value, reason = _coerce(spec, params[name])
        if reason:
            problems.append(error("PARAM_INVALID", f"parameter {name!r} {reason}", pointer=where))
        else:
            out[name] = value
    return out, problems
