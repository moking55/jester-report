"""Every starter binds as a blank form with nothing sent (SPEC-data-prep.md v1.14)."""

import pytest
from markupsafe import Markup

from jester_api.binder import bind
from jester_api.data_prep import prepare

from ..data_prep.conftest import fixture_files, load_fixture
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
