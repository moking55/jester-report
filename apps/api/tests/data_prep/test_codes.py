"""fmt.qr, fmt.barcode, fmt.promptpay (SPEC-data-prep.md "v1.1")."""

import re
from decimal import Decimal

import pytest
import segno
from markupsafe import Markup

from jester_api.data_prep.codes import _crc16, barcode, promptpay, qr

# README of the widely used promptpay-qr library (github.com/dtinth/promptpay-qr):
#   generatePayload('000-000-0000', { amount: 4.22 })
README_PAYLOAD = "00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469"


def test_crc16_is_ccitt_false():
    assert _crc16(b"123456789") == "29B1"  # the published check value of CRC-16/CCITT-FALSE


def test_promptpay_matches_the_reference_payload():
    assert promptpay("000-000-0000", "4.22") == README_PAYLOAD
    assert promptpay("000 000 0000", Decimal("4.22")) == README_PAYLOAD


@pytest.mark.parametrize(
    ("target", "account"),
    [
        ("0812345678", "01130066812345678"),
        ("1234567890123", "02131234567890123"),
        ("123456789012345", "0315123456789012345"),
    ],
)
def test_promptpay_targets_and_static_qr(target, account):
    payload = promptpay(target)
    body = f"00020101021129{len(account) + 20:02d}0016A000000677010111{account}5802TH53037646304"
    assert payload == body + _crc16(body.encode())
    assert "54" not in payload[len(body) - 8 : len(body) - 4]  # no amount tag before the CRC


def test_promptpay_amount_rounds_like_money_and_is_checked():
    assert "54075000.01" in promptpay("0812345678", "5000.005")  # half up, like fmt.money
    assert promptpay("0812345678", 100).count("5406100.00") == 1
    for bad in ("0", "-1", "12345678901.23", "abc", 1.5):
        with pytest.raises(ValueError) as e:
            promptpay("0812345678", bad)
        assert "abc" not in str(e.value)


@pytest.mark.parametrize(
    "target", ["", "081234567", "1812345678", "12345678901234", "08123456ab", "๐๘๑๒๓๔๕๖๗๘"]
)
def test_promptpay_bad_targets(target):
    with pytest.raises(ValueError, match="PromptPay target"):
        promptpay(target)


def test_qr_decodes_back_and_is_deterministic():
    svg = qr("hello จ่ายเงิน", size_mm=28)
    assert isinstance(svg, Markup) and svg == qr("hello จ่ายเงิน", size_mm=28)
    assert 'width="28mm"' in svg and 'height="28mm"' in svg
    side = len(segno.make("hello จ่ายเงิน", error="M", micro=False, boost_error=False).matrix) + 8
    assert f'viewBox="0 0 {side} {side}"' in svg


def test_qr_never_carries_data_as_markup():
    svg = qr('</svg><script>alert(1)</script><a href="x">')
    assert "<script" not in svg and "href" not in svg and "alert" not in svg
    assert re.fullmatch(r'<svg [^<]*><rect [^<]*/><path fill="#000" d="[M0-9hvz \-]*"/></svg>', svg)


@pytest.mark.parametrize(
    ("args", "message"),
    [
        (("",), "1-1000"),
        (("x" * 1001,), "1-1000"),
        ((None,), "1-1000"),
        (("x", 9), "10-100"),
        (("x", 30, "Z"), "L, M"),
    ],
)
def test_qr_rules(args, message):
    with pytest.raises(ValueError, match=message):
        qr(*args)


def test_code128_is_bars_only():
    svg = barcode("INV-2026-0001")
    assert isinstance(svg, Markup) and svg == barcode("INV-2026-0001")
    assert "<text" not in svg and 'height="12mm"' in svg
    assert set(re.findall(r"<(\w+)", svg)) == {"svg", "rect", "path"}
    assert barcode("</svg><script>").count("<script") == 0


def test_ean13_check_digit():
    assert barcode("590123412345", "ean13") == barcode("5901234123457", "ean13")
    with pytest.raises(ValueError, match="EAN-13"):
        barcode("5901234123458", "ean13")
    with pytest.raises(ValueError, match="EAN-13"):
        barcode("59012341234", "ean13")


@pytest.mark.parametrize(
    ("args", "kwargs"),
    [
        (("",), {}),
        (("x" * 81,), {}),
        (("ไทย",), {}),
        (("x",), {"height_mm": 4}),
        (("x",), {"height_mm": 51}),
        (("x",), {"module_mm": "0.1"}),
        (("x",), {"module_mm": "1.5"}),
        (("x", "qr"), {}),
        ((123,), {}),
    ],
)
def test_barcode_rules(args, kwargs):
    with pytest.raises(ValueError):
        barcode(*args, **kwargs)


def test_width_follows_the_module_size():
    narrow, wide = barcode("ABC", module_mm="0.2"), barcode("ABC", module_mm="0.4")
    width = lambda svg: Decimal(re.search(r'width="([\d.]+)mm"', svg).group(1))  # noqa: E731
    assert width(wide) == 2 * width(narrow)
