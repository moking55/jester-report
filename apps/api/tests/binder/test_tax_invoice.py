"""Starter tax-invoice: golden totals and the fields of a full tax invoice (SPEC-template-store.md "C2")."""

from decimal import Decimal

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.data_prep.codes import barcode, promptpay, qr

from ..data_prep.conftest import fixture_files, load_fixture, sample
from .test_bind import ASSETS

PARAMS = {"invoiceNo": "INV-2026-0001", "bookNo": "12", "issueDate": "2026-11-18"}


def run(params=PARAMS, change=None):
    definition = load_fixture("tax-invoice")
    data = sample("tax-invoice")
    if change:
        change(data)
    result = prepare(definition, params, data, {})
    assert result.problems == [], result.problems
    return result.prepared, bind(definition, fixture_files("tax-invoice"), ASSETS, result.prepared)


def test_golden_totals():
    prepared, _ = run()
    # 15,000.00 + 3 x 2,500.00 + 10 x 125.50 = 23,755.00; VAT 7% = 1,662.85
    assert prepared.totals == {
        "subtotal": Decimal("23755.00"),
        "vat": Decimal("1662.85"),
        "grand": Decimal("25417.85"),
    }


def test_every_required_field_is_printed():
    _, result = run()
    assert result.problems == []
    html = result.bound.index_html.decode()
    for text in (
        "ใบกำกับภาษี",  # 1. the words, prominently
        "บริษัท ตัวอย่าง จำกัด",
        "0105500000001",
        "สำนักงานใหญ่",  # 2. seller, tax ID, head office
        "บริษัท ลูกค้า จำกัด",
        "0505500000002",
        "สาขาที่ 00001",  # 3. buyer, tax ID, branch
        "INV-2026-0001",
        "เล่มที่ 12",  # 4. number and book
        "กระดาษ A4 80 แกรม",
        "รีม",
        "10.00",
        "1,255.00",  # 5. what, how many, how much
        "ภาษีมูลค่าเพิ่ม 7%",
        "1,662.85",  # 6. VAT apart from the value
        "18 พฤศจิกายน 2569",  # 7. date of issue
        "สองหมื่นห้าพันสี่ร้อยสิบเจ็ดบาทแปดสิบห้าสตางค์",
    ):
        assert text in html, text
    assert str(qr(promptpay("0105500000001", Decimal("25417.85")), size_mm=28)) in html
    assert str(barcode("INV-2026-0001", height_mm=8)) in html


def test_promptpay_and_book_number_are_optional():
    def plain(data):
        del data["promptpay"]
        del data["buyer"]["taxId"]
        del data["buyer"]["branch"]

    _, result = run({"invoiceNo": "INV-2", "issueDate": "2026-11-18"}, plain)
    html = result.bound.index_html.decode()
    assert result.problems == [] and html.count("<svg") == 1  # the invoice-number barcode only
    assert "เล่มที่" not in html and "สาขาที่" not in html


def test_the_template_warns_that_no_tax_expert_checked_it():
    assert "ยังไม่ได้ให้ผู้เชี่ยวชาญด้านภาษีตรวจ" in fixture_files("tax-invoice")["template.html"]
