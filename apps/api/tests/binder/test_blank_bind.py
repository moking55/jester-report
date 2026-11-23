"""Every starter binds as a blank form with nothing sent (SPEC-data-prep.md v1.14)."""

import pytest
from markupsafe import Markup

from jester_api.binder import bind
from jester_api.data_prep import prepare

from ..data_prep.conftest import fixture_files, load_fixture, sample
from .test_bind import ASSETS

STARTERS = ["blank", "quotation", "purchase-order", "sales-grouped", "tax-invoice"]


@pytest.mark.parametrize("name", STARTERS)
def test_starter_binds_blank_with_nothing_sent(name):
    definition = load_fixture(name)
    result = prepare(definition, {}, {}, {}, blank=True)
    assert result.problems == []
    bound = bind(definition, fixture_files(name), ASSETS, result.prepared)
    assert [p for p in bound.problems if p.severity == "error"] == []
    index = bound.bound.index_html.decode()
    assert "None" not in index and "0.00" not in index


def test_a_designer_number_condition_does_not_stop_a_blank_form():
    # the test the Designer's condition helper writes for "มากกว่า" (BlockPanels.buildTest)
    definition = load_fixture("quotation")
    files = fixture_files("quotation")
    test = "totals.grand is not none and totals.grand > 1000"
    files["template.html"] += f"<p>{{% if {test} %}}ยอดเกินพัน{{% endif %}}</p>\n"
    blank = bind(definition, files, ASSETS, prepare(definition, {}, {}, {}, blank=True).prepared)
    assert [p for p in blank.problems if p.severity == "error"] == []
    assert "ยอดเกินพัน" not in blank.bound.index_html.decode()
    params = {"quoteId": "Q-1", "docDate": "2026-11-12"}
    normal = bind(definition, files, ASSETS, prepare(definition, params, sample("quotation"), {}).prepared)
    assert "ยอดเกินพัน" in normal.bound.index_html.decode()  # 3,210.00 > 1000: unchanged on a normal form


def test_a_bare_number_condition_is_why_the_guard_is_needed():
    definition = load_fixture("quotation")
    files = fixture_files("quotation")
    files["template.html"] += "<p>{% if totals.grand > 1000 %}x{% endif %}</p>\n"
    blank = bind(definition, files, ASSETS, prepare(definition, {}, {}, {}, blank=True).prepared)
    assert [p.code for p in blank.problems if p.severity == "error"] == ["TEMPLATE_ERROR"]


def test_codes_print_nothing_for_a_missing_value_on_a_blank_form():
    fmt = prepare(load_fixture("quotation"), {}, {}, {}, blank=True).prepared.fmt
    assert fmt.qr(None) == Markup("") and fmt.qr("") == Markup("")
    assert fmt.barcode(None) == Markup("") and fmt.promptpay(None) == "" and fmt.promptpay("", None) == ""
    assert "<svg" in fmt.qr("hello")  # a value that is there still makes a code


def test_codes_still_refuse_a_missing_value_on_a_normal_form():
    from jester_api.data_prep.prepare import FMT

    with pytest.raises(ValueError):
        FMT.qr(None)
    with pytest.raises(ValueError):
        FMT.barcode(None)
