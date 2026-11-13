"""data.schema.json and sample checks; resolves the item schema of every list."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError

from .model import DECIMAL_RE, ListSpec, ReportJson, is_iso_date
from .problems import Problem, error, pointer

FORMATS = FormatChecker()


@FORMATS.checks("decimal")
def _is_decimal(value: object) -> bool:
    return not isinstance(value, str) or bool(DECIMAL_RE.match(value))


@FORMATS.checks("date")
def _is_date(value: object) -> bool:
    return not isinstance(value, str) or is_iso_date(value)


@dataclass(frozen=True)
class DataSchema:
    schema: dict[str, Any]
    lists: dict[str, dict[str, Any]]  # "items" / "orders.details" -> item schema


def _load_json(name: str, files: Mapping[str, str]) -> tuple[Any, list[Problem]]:
    if name not in files:
        return None, [error("FILE_MISSING", f"{name} is not in the draft", file="report.json")]
    try:
        return json.loads(files[name]), []
    except json.JSONDecodeError as exc:
        return None, [error("JSON_INVALID", exc.msg, file=name, line=exc.lineno, column=exc.colno)]


def _resolve(schema: dict[str, Any], json_pointer: str) -> dict[str, Any] | None:
    cur: Any = schema
    for part in json_pointer.strip("/").split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        props = cur.get("properties") if isinstance(cur, dict) else None
        if not isinstance(props, dict) or part not in props:
            return None
        cur = props[part]
    return cur if isinstance(cur, dict) else None


def _array_items(node: dict[str, Any] | None) -> dict[str, Any] | None:
    if not node or node.get("type") != "array" or not isinstance(node.get("items"), dict):
        return None
    return node["items"]


def _resolve_lists(
    report: ReportJson, schema: dict[str, Any]
) -> tuple[dict[str, dict[str, Any]], list[Problem]]:
    found: dict[str, dict[str, Any]] = {}
    problems: list[Problem] = []

    def visit(name: str, spec: ListSpec, parent: dict[str, Any], key: str, where: tuple[str, ...]) -> None:
        items = _array_items(_resolve(parent, spec.path))
        if items is None:
            problems.append(
                error(
                    "LIST_PATH_INVALID",
                    f"{spec.path!r} is not an array of objects in the data schema",
                    file="report.json",
                    pointer=pointer((*where, "path")),
                )
            )
            return
        found[key] = items
        for child_name, child in spec.lists.items():
            visit(child_name, child, items, f"{key}.{child_name}", (*where, "lists", child_name))

    for name, spec in report.lists.items():
        visit(name, spec, schema, name, ("lists", name))
    return found, problems


def check_data(report: ReportJson, files: Mapping[str, str]) -> tuple[DataSchema | None, list[Problem]]:
    name = report.data.schema_
    schema, problems = _load_json(name, files)
    if problems:
        return None, problems
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        return None, [error("DATA_SCHEMA_INVALID", exc.message, file=name, pointer=pointer(exc.path))]
    if not isinstance(schema, dict) or schema.get("type") != "object":
        return None, [
            error(
                "DATA_SCHEMA_INVALID",
                'the data schema root must be {"type": "object"}',
                file=name,
                pointer="",
            )
        ]

    validator = Draft202012Validator(schema, format_checker=FORMATS)
    for sample_name in report.data.samples:
        sample, sample_problems = _load_json(sample_name, files)
        problems += sample_problems
        if sample_problems:
            continue
        for err in sorted(validator.iter_errors(sample), key=lambda e: list(e.absolute_path)):
            problems.append(
                error(
                    "SAMPLE_INVALID",
                    safe_message(err.validator, err.validator_value, err.message),
                    file=sample_name,
                    pointer=pointer(err.absolute_path),
                )
            )

    lists, list_problems = _resolve_lists(report, schema)
    return DataSchema(schema, lists), problems + list_problems


def safe_message(keyword: object, value: object, message: str) -> str:
    # jsonschema messages quote the offending value; describe the rule instead (spec: no data in messages)
    if keyword in ("required", "additionalProperties"):
        return message  # names come from the schema / object keys, not values
    shown = json.dumps(value, ensure_ascii=False)
    return f"value does not satisfy {keyword} {shown[:120]}"
