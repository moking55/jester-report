"""Starter drafts for createTemplate (the reference reports double as test fixtures)."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

Starter = Literal["blank", "quotation", "grouped-table", "master-detail", "tax-invoice"]

STARTERS_DIR = Path(__file__).parent / "starters"
_DIRS: dict[str, str] = {
    "blank": "blank",
    "quotation": "quotation",
    "grouped-table": "sales-grouped",
    "master-detail": "purchase-order",
    "tax-invoice": "tax-invoice",
}
_TEXT = (".html", ".json", ".css")


def starter_files(starter: str) -> tuple[dict[str, str], dict[str, bytes]]:
    """(text files, binary assets) of a starter."""
    if starter not in _DIRS:
        from .errors import StoreError

        raise StoreError("INPUT_INVALID", "unknown starter")
    folder = STARTERS_DIR / _DIRS[starter]
    texts = {p.name: p.read_text(encoding="utf-8") for p in sorted(folder.iterdir()) if p.suffix in _TEXT}
    binaries = {p.name: p.read_bytes() for p in sorted(folder.iterdir()) if p.suffix not in _TEXT}
    return texts, binaries


_RECEIPT = """<div style="text-align: center; font-weight: bold">{{ data.title }}</div>
<hr>
<div>ใบเสร็จรับเงิน</div>
<hr>
<div style="text-align: center">ขอบคุณที่ใช้บริการ</div>
"""


def _mm(value: Decimal) -> str:
    return f"{value.normalize():f}"


def page_files(page: dict[str, Any]) -> tuple[dict[str, str], dict[str, bytes]]:
    """The blank starter on another sheet (SPEC-template-store.md v1.8): `page` in report.json and a
    template.html to match (free-layout sheet, short receipt); no header/footer where they are ignored."""
    from ..report_definition.model import Page
    from .errors import StoreError

    try:
        parsed = Page.model_validate(page)
    except ValueError as exc:
        raise StoreError("INPUT_INVALID", f"page: {exc}") from None
    texts, binaries = starter_files("blank")
    report = json.loads(texts["report.json"])
    report["page"] = json.loads(json.dumps(page))
    texts["report.json"] = json.dumps(report, ensure_ascii=False, indent=2)
    if parsed.layout == "free":
        width, height = parsed.paper_mm()
        texts["template.html"] = (
            f'<div data-jd="page" style="position: relative; width: {_mm(width)}mm; '
            f'height: {_mm(height)}mm">\n</div>\n'
        )
    elif parsed.size == "roll":
        texts["template.html"] = _RECEIPT
    if parsed.layout == "free" or parsed.size == "roll":
        texts.pop("header.html", None)
        texts.pop("footer.html", None)
    return texts, binaries
