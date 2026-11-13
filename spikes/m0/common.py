"""Shared types and HTML helpers for spike M0 fixtures (synthetic data only)."""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

FONTS = Path(__file__).parent / "fonts"


@dataclass
class Expect:
    ids: list[str] = field(default_factory=list)  # each must appear exactly once in the PDF text
    totals: list[str] = field(default_factory=list)  # must appear at least once
    thai: list[str] = field(default_factory=list)  # Thai strings that must survive extraction
    every_page: list[str] = field(default_factory=list)  # markers expected on every page (header repeat)
    fonts: list[str] = field(default_factory=list)  # substrings expected among embedded BaseFont names
    min_pages: int = 1


@dataclass
class Variant:
    name: str
    index_html: str
    header_html: str | None = None
    footer_html: str | None = None
    font_files: list[str] = field(default_factory=list)  # names inside fonts/
    landscape: bool = False
    expect: Expect = field(default_factory=Expect)
    note: str = ""


def font_face(family: str, file: str, weight: str = "normal", inline: bool = False) -> str:
    if inline:
        data = base64.b64encode((FONTS / file).read_bytes()).decode()
        src = f'url("data:font/ttf;base64,{data}") format("truetype")'
    else:
        src = f'url("{file}") format("truetype")'
    return f'@font-face {{ font-family: "{family}"; src: {src}; font-weight: {weight}; }}\n'


def money(v: Decimal) -> str:
    return f"{v:,.2f}"


HEADER_FOOTER_BASE = "html, body { margin: 0; } body { box-sizing: border-box; width: 100%; font-size: 10px; padding: 0 15mm; }"


def footer(font_css: str, family: str) -> str:
    return f"""<html><head><style>{font_css}{HEADER_FOOTER_BASE}
body {{ font-family: {family}; text-align: right; }}</style></head>
<body>หน้า <span class="pageNumber"></span>/<span class="totalPages"></span> PAGE-MARK</body></html>"""
