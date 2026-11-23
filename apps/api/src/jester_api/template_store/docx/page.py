"""Section properties (w:sectPr) -> report.json `page` (SPEC-template-store.md v1.15 "การแปลง")."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from xml.etree.ElementTree import Element

from ...report_definition.page import CUSTOM_HEIGHT, CUSTOM_WIDTH, PAPER_MM
from .body import Ctx, twips_mm, w

MAX_MARGIN_MM = Decimal(50)  # report.json marginsMm: each side 0-50


def _size(width: Decimal, height: Decimal) -> dict[str, Any]:
    short, long_ = min(width, height), max(width, height)
    page: dict[str, Any] = {"orientation": "landscape" if width > height else "portrait"}
    for name, (pw, ph) in PAPER_MM.items():
        if abs(pw - short) <= 1 and abs(ph - long_) <= 1:
            return {"size": name, **page}
    clamp = lambda v, lo_hi: min(max(v, lo_hi[0]), lo_hi[1])  # noqa: E731
    return {
        "size": "custom",
        "widthMm": float(clamp(short, CUSTOM_WIDTH)),
        "heightMm": float(clamp(long_, CUSTOM_HEIGHT)),
        **page,
    }


def page_of(ctx: Ctx, sect: Element | None) -> dict[str, Any]:
    """The page of a section; A4 portrait with Jester's margins when the file has none."""
    size = sect.find(w("pgSz")) if sect is not None else None
    if size is None:
        return {"size": "A4", "orientation": "portrait", "layout": "flow"}
    width, height = twips_mm(size.get(w("w")), Decimal(210)), twips_mm(size.get(w("h")), Decimal(297))
    page = {**_size(width, height), "layout": "flow"}
    mar = sect.find(w("pgMar"))
    if mar is not None:
        margins: dict[str, float] = {}
        for side in ("top", "bottom", "left", "right"):
            value = abs(twips_mm(mar.get(w(side)), Decimal(15)))
            if value > MAX_MARGIN_MM:
                ctx.warn("PAGE_MARGIN_CLAMPED", f"ขอบ{side} {value} mm เกิน 50 mm: ตั้งเป็น 50 mm")
                value = MAX_MARGIN_MM
            margins[side] = float(value)
        page["marginsMm"] = margins
    return page
