"""Starter drafts for createTemplate (the reference reports double as test fixtures)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

Starter = Literal["blank", "quotation", "grouped-table", "master-detail"]

STARTERS_DIR = Path(__file__).parent / "starters"
_DIRS: dict[str, str] = {
    "blank": "blank",
    "quotation": "quotation",
    "grouped-table": "sales-grouped",
    "master-detail": "purchase-order",
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
