from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Problem:
    severity: Literal["error", "warning"]
    code: str
    message: str
    file: str | None = None
    line: int | None = None
    column: int | None = None
    pointer: str | None = None


def error(code: str, message: str, **where: object) -> Problem:
    return Problem("error", code, message, **where)  # type: ignore[arg-type]


def warning(code: str, message: str, **where: object) -> Problem:
    return Problem("warning", code, message, **where)  # type: ignore[arg-type]


def pointer(parts: Iterable[object]) -> str:
    """RFC 6901 JSON Pointer."""
    return "".join("/" + str(p).replace("~", "~0").replace("/", "~1") for p in parts)


def has_errors(problems: Iterable[Problem]) -> bool:
    return any(p.severity == "error" for p in problems)


@dataclass(frozen=True)
class AssetInfo:
    content_type: str
    sha256: str
    font_family: str | None = None  # set for font assets


@dataclass(frozen=True)
class DefinitionInput:
    files: Mapping[str, str]
    assets: Mapping[str, AssetInfo]
    system_fonts: frozenset[str] | None  # None = engine fonts could not be probed
