"""Strict model of report.json (SPEC-report-definition.md "กติกาของ field")."""

from __future__ import annotations

import json
import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator

from .problems import Problem, error, pointer

FILE = "report.json"
Name = Annotated[str, StringConstraints(pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")]
Expr = Annotated[str, StringConstraints(min_length=1, max_length=500)]
DECIMAL_RE = re.compile(r"^-?\d+(\.\d+)?$")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class Margins(_Strict):
    top: Decimal = Field(default=Decimal(20), ge=0, le=50)
    bottom: Decimal = Field(default=Decimal(20), ge=0, le=50)
    left: Decimal = Field(default=Decimal(15), ge=0, le=50)
    right: Decimal = Field(default=Decimal(15), ge=0, le=50)


class Page(_Strict):
    size: Literal["A4"] = "A4"
    orientation: Literal["portrait", "landscape"] = "portrait"
    marginsMm: Margins = Margins()


class Fonts(_Strict):
    body: list[str] = Field(min_length=1)
    headerFooter: list[str] = []


def _matches_type(kind: str, value: Any, values: list[str] | None) -> bool:
    if kind == "string":
        return isinstance(value, str)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "decimal":
        return isinstance(value, str) and bool(DECIMAL_RE.match(value))
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "enum":
        return value in (values or [])
    try:  # date
        date.fromisoformat(value)
        return True
    except (TypeError, ValueError):
        return False


class Parameter(_Strict):
    type: Literal["string", "integer", "decimal", "date", "boolean", "enum"]
    required: bool = False
    default: Any = None
    values: list[str] | None = Field(default=None, min_length=1)
    maxLength: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _rules(self) -> Parameter:
        if self.required and self.default is not None:
            raise ValueError("required and default cannot be used together")
        if (self.type == "enum") != (self.values is not None):
            raise ValueError("values is required for enum and only allowed for enum")
        if self.default is not None and not _matches_type(self.type, self.default, self.values):
            raise ValueError(f"default does not match type {self.type!r}")
        return self


class DataSpec(_Strict):
    schema_: str = Field(alias="schema")
    samples: list[str] = Field(min_length=1)


class GroupBy(_Strict):
    key: Name
    totals: dict[Name, Expr] = {}


class ListSpec(_Strict):
    path: Annotated[str, StringConstraints(pattern=r"^/")]
    id: Name
    sort: list[Name] = []
    computed: dict[Name, Expr] = {}
    groupBy: GroupBy | None = None
    totals: dict[Name, Expr] = {}
    lists: dict[Name, ListSpec] = {}

    @model_validator(mode="after")
    def _rules(self) -> ListSpec:
        if self.groupBy and self.sort and self.sort[0] != self.groupBy.key:
            raise ValueError("groupBy.key must be the first sort field")
        for child in self.lists.values():
            if child.lists:
                raise ValueError("lists can be nested one level deep only")
        return self


class ReportJson(_Strict):
    schemaVersion: Literal[1]
    name: str = Field(min_length=1, max_length=200)
    expressionMode: Literal["basic", "advanced"] = "basic"
    page: Page = Page()
    fonts: Fonts
    parameters: dict[Name, Parameter] = {}
    data: DataSpec
    lists: dict[Name, ListSpec] = {}
    totals: dict[Name, Expr] = {}


def _loc_to_pointer(loc: tuple[Any, ...]) -> str:
    return pointer("schema" if part == "schema_" else part for part in loc)


def parse_report_json(text: str) -> tuple[ReportJson | None, list[Problem]]:
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as exc:
        return None, [error("JSON_INVALID", exc.msg, file=FILE, line=exc.lineno, column=exc.colno)]
    if not isinstance(raw, dict):
        return None, [error("DEFINITION_INVALID", "report.json must be a JSON object", file=FILE, pointer="")]
    try:
        return ReportJson.model_validate(raw), []
    except ValidationError as exc:
        return None, [
            error(
                "DEFINITION_INVALID",
                e["msg"].removeprefix("Value error, "),
                file=FILE,
                pointer=_loc_to_pointer(e["loc"]),
            )
            for e in exc.errors()
        ]
