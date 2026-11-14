"""Thai formatters exposed to templates as `fmt` (SPEC-data-prep.md "Formatters")."""

from __future__ import annotations

from datetime import date
from decimal import MAX_PREC, ROUND_HALF_UP, Context, Decimal, InvalidOperation, localcontext
from types import SimpleNamespace
from typing import Any

from ..report_definition.model import is_iso_date

DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"]
PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"]
MONTHS = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
]
# formatting only rounds to a few places, so it must never fail or lose digits on long numbers
EXACT = Context(prec=MAX_PREC, rounding=ROUND_HALF_UP)
MONTHS_SHORT = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
]
BUDDHIST_OFFSET = 543


def _decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, int) and not isinstance(value, bool):
        result = Decimal(value)
    elif isinstance(value, str):
        try:
            result = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError("not a number") from exc
    else:  # float, bool and others: floats would make money inexact
        raise ValueError(f"expected an exact number, got {type(value).__name__}")
    if not result.is_finite():
        raise ValueError("not a finite number")
    return result


def _date(value: Any) -> date:
    if isinstance(value, date):
        return value
    if is_iso_date(value):
        return date.fromisoformat(value)
    raise ValueError("expected a date as YYYY-MM-DD")


def number(value: Any, places: int = 0) -> str:
    if value is None:
        return ""
    q = _decimal(value).quantize(Decimal(1).scaleb(-places), context=EXACT)
    if q == 0:
        q = abs(q)  # no "-0.00"
    return f"{q:,.{places}f}"


def money(value: Any, places: int = 2) -> str:
    return number(value, places)


def thai_date(value: Any) -> str:
    if value is None:
        return ""
    d = _date(value)
    return f"{d.day} {MONTHS[d.month - 1]} {d.year + BUDDHIST_OFFSET}"


def thai_date_short(value: Any) -> str:
    if value is None:
        return ""
    d = _date(value)
    return f"{d.day} {MONTHS_SHORT[d.month - 1]} {d.year + BUDDHIST_OFFSET}"


def _below_million(n: int, has_higher: bool) -> str:
    out = []
    for place in range(5, -1, -1):
        d = n // 10**place % 10
        if d == 0:
            continue
        if place == 1:
            out.append("สิบ" if d == 1 else "ยี่สิบ" if d == 2 else DIGITS[d] + "สิบ")
        elif place == 0 and d == 1 and (n >= 10 or has_higher):
            out.append("เอ็ด")
        else:
            out.append(DIGITS[d] + PLACES[place])
    return "".join(out)


def _words(n: int, has_higher: bool = False) -> str:
    if n >= 1_000_000:
        high, low = divmod(n, 1_000_000)
        return _words(high, has_higher) + "ล้าน" + (_below_million(low, True) if low else "")
    return _below_million(n, has_higher)


def baht_text(value: Any) -> str:
    if value is None:
        return ""
    with localcontext(EXACT):
        amount = _decimal(value).quantize(Decimal("0.01"))
        baht, satang = divmod(int(abs(amount) * 100), 100)
    sign = "ลบ" if amount < 0 else ""
    if baht == 0 and satang == 0:
        return "ศูนย์บาทถ้วน"
    text = (_words(baht) + "บาท") if baht else ""
    text += (_words(satang) + "สตางค์") if satang else "ถ้วน"
    return sign + text


FORMATTERS = SimpleNamespace(
    money=money, number=number, thai_date=thai_date, thai_date_short=thai_date_short, baht_text=baht_text
)
