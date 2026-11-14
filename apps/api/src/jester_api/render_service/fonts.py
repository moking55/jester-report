"""Which font families the engine really has (SPEC-report-definition.md "ที่มาของ system_fonts").

Chromium falls back silently, so asking "is TH Sarabun New installed?" means rendering a page whose header
uses that family and reading which font got embedded in the PDF. Results are kept until the process
restarts; a failed probe (engine down) is not remembered, so the next call tries again.
"""

from __future__ import annotations

import io
import re
from collections.abc import Iterable

from pypdf import PdfReader

from ..binder.document import css_string
from ..engine_client import EngineClient, EngineError, PageSetup

_INDEX = b"<!doctype html><html><body><p>.</p></body></html>"


def _header(family: str) -> bytes:
    style = f"body {{ font-family: {css_string(family)}; font-size: 10px; }}"
    return f"<html><head><style>{style}</style></head><body>ตัวอย่าง Sample 123</body></html>".encode()


def _embedded_fonts(pdf: bytes) -> set[str]:
    names = set()
    for page in PdfReader(io.BytesIO(pdf)).pages:
        for ref in (page.get("/Resources") or {}).get("/Font", {}).values():
            names.add(str(ref.get_object().get("/BaseFont", "")))
    return names


def _squash(name: str) -> str:
    # "ABCDEF+THSarabunNew-Bold" and "TH Sarabun New" both become "thsarabunnew..."
    return re.sub(r"[^a-z0-9]", "", name.split("+", 1)[-1].casefold())


class EngineFonts:
    def __init__(self, engine: EngineClient) -> None:
        self._engine = engine
        self._known: dict[str, bool] = {}  # casefolded family -> installed

    async def _probe(self, family: str) -> bool:
        result = await self._engine.convert_html(_INDEX, page=PageSetup(), header_html=_header(family))
        wanted = _squash(family)
        return any(_squash(name).startswith(wanted) for name in _embedded_fonts(result.pdf))

    async def known(self, families: Iterable[str]) -> frozenset[str] | None:
        """The given families that the engine has, or None when the engine cannot be asked right now."""
        families = list(families)
        try:
            for family in families:
                if family.casefold() not in self._known:
                    self._known[family.casefold()] = await self._probe(family)
        except EngineError:
            return None
        return frozenset(f for f in families if self._known[f.casefold()])
