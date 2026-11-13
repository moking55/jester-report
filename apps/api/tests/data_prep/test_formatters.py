from datetime import date
from decimal import Decimal

import pytest

from jester_api.data_prep.formatters import FORMATTERS, baht_text, money, number, thai_date, thai_date_short


@pytest.mark.parametrize(
    ("value", "text"),
    [
        ("0", "ศูนย์บาทถ้วน"),
        ("1", "หนึ่งบาทถ้วน"),
        ("11", "สิบเอ็ดบาทถ้วน"),
        ("21", "ยี่สิบเอ็ดบาทถ้วน"),
        ("20", "ยี่สิบบาทถ้วน"),
        ("101", "หนึ่งร้อยเอ็ดบาทถ้วน"),
        ("111", "หนึ่งร้อยสิบเอ็ดบาทถ้วน"),
        ("100000", "หนึ่งแสนบาทถ้วน"),
        ("1000001", "หนึ่งล้านเอ็ดบาทถ้วน"),
        ("21000000", "ยี่สิบเอ็ดล้านบาทถ้วน"),
        ("1000000000000", "หนึ่งล้านล้านบาทถ้วน"),
        ("3210.00", "สามพันสองร้อยสิบบาทถ้วน"),
        ("0.50", "ห้าสิบสตางค์"),
        ("0.01", "หนึ่งสตางค์"),
        ("21.25", "ยี่สิบเอ็ดบาทยี่สิบห้าสตางค์"),
        ("0.005", "หนึ่งสตางค์"),
        ("-5", "ลบห้าบาทถ้วน"),
        ("1250.50", "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"),
        ("12345678.91", "สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปดบาทเก้าสิบเอ็ดสตางค์"),
    ],
)
def test_baht_text(value, text):
    assert baht_text(Decimal(value)) == text


@pytest.mark.parametrize(
    ("value", "places", "text"),
    [
        (3210, 2, "3,210.00"),
        (Decimal("1.005"), 2, "1.01"),
        (Decimal("-100.7"), 2, "-100.70"),
        (Decimal("-0.001"), 2, "0.00"),
        ("1250.5", 2, "1,250.50"),
        (Decimal("1234567.891"), 2, "1,234,567.89"),
    ],
)
def test_money(value, places, text):
    assert money(value, places) == text


def test_number():
    assert number(Decimal("1234.5"), 1) == "1,234.5"
    assert number(1234) == "1,234"


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
SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


@pytest.mark.parametrize("month", range(1, 13))
def test_thai_dates_every_month(month):
    iso = f"2026-{month:02d}-05"
    assert thai_date(iso) == f"5 {MONTHS[month - 1]} 2569"
    assert thai_date_short(iso) == f"5 {SHORT[month - 1]} 2569"


def test_thai_date_accepts_date_object():
    assert thai_date(date(2026, 11, 12)) == "12 พฤศจิกายน 2569"


def test_none_is_empty_string():
    for f in (money, number, thai_date, thai_date_short, baht_text):
        assert f(None) == ""


@pytest.mark.parametrize("bad", ["abc", "NaN", 1.5, True, [1]])
def test_money_rejects_non_numbers(bad):
    with pytest.raises(ValueError):
        money(bad)


@pytest.mark.parametrize("bad", ["20261112", "2026-W46-5", 5])
def test_thai_date_rejects_other_formats(bad):
    with pytest.raises(ValueError):
        thai_date(bad)


def test_float_rejected_everywhere():
    for f in (money, number, baht_text):
        with pytest.raises(ValueError):
            f(1.5)


def test_formatters_namespace():
    assert FORMATTERS.money(1) == "1.00"
    assert FORMATTERS.baht_text(Decimal("1")) == "หนึ่งบาทถ้วน"
