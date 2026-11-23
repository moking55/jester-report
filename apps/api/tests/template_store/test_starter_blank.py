"""v1.14: the starters with a list table print 10 empty rows on a blank form (SPEC-studio.md v1.14)."""

import io
import os

import pytest
from pypdf import PdfReader

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.engine_client import EngineClient, RenderFile

from ..binder.test_bind import ASSETS, QUOTE_PARAMS, SALES_PARAMS
from ..binder.test_tax_invoice import PARAMS as TAX_PARAMS
from ..data_prep.conftest import fixture_files, load_fixture, sample
from .test_starter_pdf import PNG

BLANK_ROW = 'data-jd="blank"'
# purchase-order repeats a table per order: a blank form needs one order sent to have a table at all
BLANK_DATA = {
    "quotation": {},
    "sales-grouped": {},
    "tax-invoice": {},
    "purchase-order": {"orders": [{"orderId": "", "details": []}]},
}
NORMAL = {
    "quotation": QUOTE_PARAMS,
    "purchase-order": {},
    "sales-grouped": SALES_PARAMS,
    "tax-invoice": TAX_PARAMS,
}


def bound(name: str, params: dict, data, blank: bool):
    definition = load_fixture(name)
    result = prepare(definition, params, data, {}, blank=blank)
    assert result.problems == [], result.problems
    out = bind(definition, fixture_files(name), ASSETS, result.prepared)
    assert [p for p in out.problems if p.severity == "error"] == []
    return out.bound


@pytest.mark.parametrize("name", list(BLANK_DATA))
def test_blank_form_has_ten_empty_rows_and_no_empty_list_note(name):
    index = bound(name, {}, BLANK_DATA[name], blank=True).index_html.decode()
    assert index.count(BLANK_ROW) == 10
    assert "ไม่มีรายการ" not in index and "ไม่มีข้อมูลในช่วงเวลาที่เลือก" not in index


def test_rows_sent_on_a_blank_form_fill_up_to_ten():
    data = {"items": [{"id": "1", "description": "ปากกา"}, {"id": "2"}]}
    index = bound("quotation", {}, data, blank=True).index_html.decode()
    assert index.count(BLANK_ROW) == 8 and "ปากกา" in index


@pytest.mark.parametrize("name", list(NORMAL))
def test_a_normal_form_has_no_empty_rows(name):
    index = bound(name, NORMAL[name], sample(name), blank=False).index_html.decode()
    assert BLANK_ROW not in index


def test_a_normal_form_still_says_when_there_are_no_items():
    index = bound("purchase-order", {}, sample("purchase-order"), blank=False).index_html.decode()
    assert "ไม่มีรายการ" in index  # PO02 has no details


@pytest.mark.engine
@pytest.mark.parametrize("name", list(BLANK_DATA))
async def test_blank_form_fits_one_a4_page(name):
    b = bound(name, {}, BLANK_DATA[name], blank=True)
    async with EngineClient(os.environ["GOTENBERG_URL"], timeout_s=90) as client:
        out = await client.convert_html(
            b.index_html,
            page=b.page,
            header_html=b.header_html,
            footer_html=b.footer_html,
            assets=[*b.files, *(RenderFile(n, PNG) for n in b.asset_names)],
        )
    assert len(PdfReader(io.BytesIO(out.pdf)).pages) == 1
