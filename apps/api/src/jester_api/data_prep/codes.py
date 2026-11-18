"""QR codes, barcodes and Thai PromptPay payloads for templates (SPEC-data-prep.md "v1.1").

The engine runs no JavaScript, so codes are drawn here as inline SVG. Data only decides which modules are
dark: the SVG is built from rectangles by this module, never from text, so data cannot add markup. The same
input gives the same bytes (no ids, no timestamps), so the PDF hash of a run stays comparable.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Literal

import segno
from barcode import EAN13, Code128
from markupsafe import Markup

from .formatters import EXACT, _decimal

QUIET_QR = 4  # modules of white around a QR code (ISO/IEC 18004)
QUIET_BAR = {"code128": (10, 10), "ean13": (11, 7)}  # left, right


def _mm(value: Decimal) -> str:
    return f"{value.normalize():f}"


def _svg(width_mm: Decimal, height_mm: Decimal, width: int, height: int, path: str) -> Markup:
    return Markup(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_mm(width_mm)}mm" height="{_mm(height_mm)}mm" '
        f'viewBox="0 0 {width} {height}" shape-rendering="crispEdges">'
        f'<rect width="{width}" height="{height}" fill="#fff"/><path fill="#000" d="{path}"/></svg>'
    )


def _runs(row: list[bool] | str, y: int, offset: int, height: int = 1) -> str:
    """One rectangle per run of dark modules in a row."""
    out, x, cells = [], 0, [c in (True, 1, "1") for c in row]
    while x < len(cells):
        if cells[x]:
            start = x
            while x < len(cells) and cells[x]:
                x += 1
            out.append(f"M{start + offset} {y}h{x - start}v{height}h-{x - start}z")
        else:
            x += 1
    return "".join(out)


def qr(text: Any, size_mm: int = 30, error: Literal["L", "M", "Q", "H"] = "M") -> Markup:
    if not isinstance(text, str) or not 1 <= len(text) <= 1000:
        raise ValueError("QR text must be 1-1000 characters")
    if not isinstance(size_mm, int) or not 10 <= size_mm <= 100:
        raise ValueError("QR size_mm must be 10-100")
    if error not in ("L", "M", "Q", "H"):
        raise ValueError("QR error must be L, M, Q or H")
    code = segno.make(text, error=error, micro=False, boost_error=False)
    rows = [list(map(bool, row)) for row in code.matrix]
    side = len(rows) + 2 * QUIET_QR
    path = "".join(_runs(row, y + QUIET_QR, QUIET_QR) for y, row in enumerate(rows))
    return _svg(Decimal(size_mm), Decimal(size_mm), side, side, path)


def _ean13_digits(text: str) -> str:
    def check(twelve: str) -> str:
        total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(twelve))
        return str((10 - total % 10) % 10)

    if text.isascii() and text.isdigit() and len(text) == 12:
        return text
    if text.isascii() and text.isdigit() and len(text) == 13 and check(text[:12]) == text[12]:
        return text[:12]
    raise ValueError("EAN-13 needs 12 digits or 13 with a valid check digit")


def barcode(
    text: Any,
    kind: Literal["code128", "ean13"] = "code128",
    height_mm: int = 12,
    module_mm: Any = Decimal("0.3"),
) -> Markup:
    """Bars only: print the human-readable value yourself in HTML, in the document's font."""
    if not isinstance(text, str):
        raise ValueError("barcode text must be a string")
    if not isinstance(height_mm, int) or not 5 <= height_mm <= 50:
        raise ValueError("barcode height_mm must be 5-50")
    try:
        module = Decimal(str(module_mm))
    except InvalidOperation:
        raise ValueError("barcode module_mm must be 0.2-1") from None
    if not Decimal("0.2") <= module <= 1:
        raise ValueError("barcode module_mm must be 0.2-1")
    if kind == "code128":
        if not 1 <= len(text) <= 80 or not all(" " <= c <= "~" for c in text):
            raise ValueError("Code 128 needs 1-80 printable ASCII characters")
        pattern = Code128(text).build()[0]
    elif kind == "ean13":
        pattern = EAN13(_ean13_digits(text)).build()[0]
    else:
        raise ValueError("barcode kind must be code128 or ean13")
    left, right = QUIET_BAR[kind]
    width = left + len(pattern) + right
    height = int((Decimal(height_mm) / module).to_integral_value())  # in modules, so bars stay crisp
    return _svg(module * width, Decimal(height_mm), width, height, _runs(pattern, 0, left, height))


def _crc16(data: bytes) -> str:
    """CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF (EMVCo QR)."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else crc << 1
            crc &= 0xFFFF
    return f"{crc:04X}"


def _tag(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def promptpay(target: Any, amount: Any = None) -> str:
    """Thai QR Payment (EMVCo merchant-presented) payload for PromptPay; pass it to fmt.qr."""
    digits = "".join(c for c in str(target) if c not in "- ")
    if not digits.isascii() or not digits.isdigit():
        digits = ""
    if len(digits) == 10 and digits.startswith("0"):
        account = _tag("01", "0066" + digits[1:])
    elif len(digits) == 13:
        account = _tag("02", digits)
    elif len(digits) == 15:
        account = _tag("03", digits)
    else:
        raise ValueError("PromptPay target must be a 10-digit phone, 13-digit tax ID or 15-digit e-wallet ID")
    money = None
    if amount is not None:
        try:
            money = _decimal(amount).quantize(Decimal("0.01"), context=EXACT)
        except (ValueError, InvalidOperation):
            raise ValueError("PromptPay amount must be a number") from None
        if money <= 0 or len(f"{money:f}") > 13:
            raise ValueError("PromptPay amount must be more than 0 and at most 13 characters")
    payload = (
        _tag("00", "01")
        + _tag("01", "12" if money is not None else "11")
        + _tag("29", _tag("00", "A000000677010111") + account)
        + _tag("58", "TH")
        + _tag("53", "764")
        + (_tag("54", f"{money:f}") if money is not None else "")
        + "6304"
    )
    return payload + _crc16(payload.encode("ascii"))
