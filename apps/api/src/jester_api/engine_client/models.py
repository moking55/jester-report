from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from .errors import EngineError, ErrorCode

RESERVED_NAMES = frozenset({"index.html", "header.html", "footer.html"})


class PageSetup(BaseModel):
    paper: Literal["A4"] = "A4"
    landscape: bool = False
    margin_top_mm: Decimal = Field(default=Decimal("20"), ge=0)
    margin_bottom_mm: Decimal = Field(default=Decimal("20"), ge=0)
    margin_left_mm: Decimal = Field(default=Decimal("15"), ge=0)
    margin_right_mm: Decimal = Field(default=Decimal("15"), ge=0)

    def form_fields(self) -> dict[str, str]:
        # A4 in inches; sent explicitly because Gotenberg defaults to Letter
        return {
            "paperWidth": "8.27",
            "paperHeight": "11.7",
            "landscape": str(self.landscape).lower(),
            "marginTop": f"{self.margin_top_mm}mm",
            "marginBottom": f"{self.margin_bottom_mm}mm",
            "marginLeft": f"{self.margin_left_mm}mm",
            "marginRight": f"{self.margin_right_mm}mm",
        }


@dataclass(frozen=True)
class RenderFile:
    name: str
    content: bytes


@dataclass(frozen=True)
class EngineResult:
    pdf: bytes
    trace: str | None
    duration_ms: int
    options: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class EngineHealth:
    up: bool
    version: str | None
    details: dict[str, object] = field(default_factory=dict)


def _invalid(message: str) -> EngineError:
    return EngineError(ErrorCode.RENDER_INPUT_INVALID, message=message)


def _check_name(name: str) -> None:
    if not name or name in {".", ".."} or "/" in name or "\\" in name or ".." in name:
        raise _invalid(f"invalid file name: {name!r}")


def collect_files(
    index_html: bytes,
    header_html: bytes | None,
    footer_html: bytes | None,
    assets: Sequence[RenderFile],
    max_bytes: int,
) -> list[RenderFile]:
    """Validate and order files. Gotenberg flattens paths, so names must be unique basenames."""
    files = [RenderFile("index.html", index_html)]
    if header_html is not None:
        files.append(RenderFile("header.html", header_html))
    if footer_html is not None:
        files.append(RenderFile("footer.html", footer_html))
    seen = {f.name for f in files}
    for asset in assets:
        _check_name(asset.name)
        if asset.name in RESERVED_NAMES:
            raise _invalid(f"asset name is reserved: {asset.name!r}")
        if asset.name in seen:
            raise _invalid(f"duplicate file name: {asset.name!r}")
        seen.add(asset.name)
        files.append(asset)
    total = sum(len(f.content) for f in files)
    if total > max_bytes:
        raise _invalid(f"request too large: {total} bytes > {max_bytes}")
    return files
