"""Strict model of report.json (SPEC-report-definition.md "กติกาของ field")."""

from __future__ import annotations

import json
import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator

from .page import (
    CUSTOM_HEIGHT,
    CUSTOM_WIDTH,
    MIN_CONTENT_MM,
    PAPER_MM,
    ROLL_BASE_HEIGHT_MM,
    ROLL_MARGINS,
    ROLL_WIDTHS,
    SIZES,
)
from .problems import Problem, error, pointer

FILE = "report.json"
Name = Annotated[str, StringConstraints(pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")]
Expr = Annotated[str, StringConstraints(min_length=1, max_length=500)]
DECIMAL_RE = re.compile(r"^-?\d+(\.\d+)?$")


def is_iso_date(value: object) -> bool:
    """YYYY-MM-DD only; date.fromisoformat alone also accepts 20261112 and week dates."""
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class Margins(_Strict):
    top: Decimal = Field(default=Decimal(20), ge=0, le=50)
    bottom: Decimal = Field(default=Decimal(20), ge=0, le=50)
    left: Decimal = Field(default=Decimal(15), ge=0, le=50)
    right: Decimal = Field(default=Decimal(15), ge=0, le=50)


class Page(_Strict):
    size: Literal[SIZES] = "A4"  # type: ignore[valid-type]
    orientation: Literal["portrait", "landscape"] = "portrait"
    widthMm: Decimal | None = None  # custom only
    heightMm: Decimal | None = None  # custom only
    rollWidthMm: Literal[58, 80] | None = None  # roll only
    layout: Literal["flow", "free"] = "flow"
    marginsMm: Margins = Margins()

    @model_validator(mode="before")
    @classmethod
    def _roll_margins(cls, data: Any) -> Any:
        # a receipt roll starts with narrow margins unless the report says otherwise
        if isinstance(data, dict) and data.get("size") == "roll" and "marginsMm" not in data:
            return {**data, "marginsMm": {k: v for k, v in ROLL_MARGINS.items()}}
        return data

    @model_validator(mode="after")
    def _rules(self) -> Page:
        custom, roll = self.size == "custom", self.size == "roll"
        if custom:
            if self.widthMm is None or self.heightMm is None:
                raise ValueError("size custom needs widthMm and heightMm")
            if not CUSTOM_WIDTH[0] <= self.widthMm <= CUSTOM_WIDTH[1]:
                raise ValueError(f"widthMm must be {CUSTOM_WIDTH[0]}-{CUSTOM_WIDTH[1]}")
            if not CUSTOM_HEIGHT[0] <= self.heightMm <= CUSTOM_HEIGHT[1]:
                raise ValueError(f"heightMm must be {CUSTOM_HEIGHT[0]}-{CUSTOM_HEIGHT[1]}")
        elif self.widthMm is not None or self.heightMm is not None:
            raise ValueError("widthMm and heightMm go with size custom only")
        if roll:
            if self.rollWidthMm not in ROLL_WIDTHS:
                raise ValueError("size roll needs rollWidthMm 58 or 80")
            if self.orientation != "portrait":
                raise ValueError("a roll has no orientation")
            if self.layout != "flow":
                raise ValueError("a roll cannot use layout free")
        elif self.rollWidthMm is not None:
            raise ValueError("rollWidthMm goes with size roll only")
        width, height = self.paper_mm()
        m = self.effective_margins()
        if width - m["left"] - m["right"] < MIN_CONTENT_MM or (
            not roll and height - m["top"] - m["bottom"] < MIN_CONTENT_MM
        ):
            raise ValueError("margins leave less than 20 mm for the content")
        return self

    def portrait_mm(self) -> tuple[Decimal, Decimal]:
        """Width x height as the size is defined, before the orientation (a roll: width and base height)."""
        if self.size == "roll":
            return Decimal(self.rollWidthMm or 80), ROLL_BASE_HEIGHT_MM
        width, height = (self.widthMm, self.heightMm) if self.size == "custom" else PAPER_MM[self.size]
        assert width is not None and height is not None
        return width, height

    def paper_mm(self) -> tuple[Decimal, Decimal]:
        """Width x height of one sheet as it is printed, after the orientation."""
        width, height = self.portrait_mm()
        return (height, width) if self.orientation == "landscape" else (width, height)

    def effective_margins(self) -> dict[str, Decimal]:
        """Free layout counts positions from the sheet's edge: no margins."""
        if self.layout == "free":
            return {"top": Decimal(0), "bottom": Decimal(0), "left": Decimal(0), "right": Decimal(0)}
        m = self.marginsMm
        return {"top": m.top, "bottom": m.bottom, "left": m.left, "right": m.right}


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
    return is_iso_date(value)


class Parameter(_Strict):
    type: Literal["string", "integer", "decimal", "date", "boolean", "enum"]
    required: bool = False
    default: Any = None
    values: list[str] | None = Field(default=None, min_length=1)
    maxLength: int | None = Field(default=None, ge=1)
    # labels for forms (v1.4): never used to check or render values
    title: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, min_length=1, max_length=300)

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


def _depth(spec: ListSpec) -> int:
    """Levels of lists from this one down: 1 with no child lists, 3 for list -> child -> grandchild."""
    return 1 + max((_depth(c) for c in spec.lists.values()), default=0)


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
        if _depth(self) > 3:
            raise ValueError("lists can be nested 3 levels deep at most")
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
                "PAGE_INVALID" if e["loc"] and e["loc"][0] == "page" else "DEFINITION_INVALID",
                e["msg"].removeprefix("Value error, "),
                file=FILE,
                pointer=_loc_to_pointer(e["loc"]),
            )
            for e in exc.errors()
        ]
