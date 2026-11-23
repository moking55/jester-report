"""prepare(..., blank=True): the blank form for handwriting (SPEC-data-prep.md v1.14)."""

from decimal import Decimal

from jester_api.data_prep import prepare

from .conftest import load_fixture, sample

D = Decimal


def test_nothing_sent_gives_a_blank_form_without_problems(quotation):
    result = prepare(quotation, {}, {}, {}, blank=True)
    assert result.problems == []
    p = result.prepared
    assert p.params == {"quoteId": None, "locale": "th-TH", "docDate": None}  # defaults still apply
    assert p.totals == {
        "subtotal": None,
        "net": None,
        "vat": None,
        "grand": None,
    }  # sum of no rows is blank, not 0
    assert list(p.lists["items"]) == [] and p.meta["blank"] is True


def test_what_was_filled_is_kept_and_what_depends_on_a_gap_is_blank(quotation):
    data = {"customer": {"name": "แผนกพัสดุ"}, "items": [{"id": "1", "unitPrice": "100.00"}], "discount": "0"}
    p = prepare(quotation, {"quoteId": "Q-1"}, data, {}, blank=True).prepared
    assert p.params["quoteId"] == "Q-1" and p.data["customer"]["name"] == "แผนกพัสดุ"
    assert p.lists["items"][0]["unitPrice"] == D("100.00") and p.lists["items"][0]["amount"] is None  # no qty
    assert p.totals["subtotal"] is None and p.totals["grand"] is None


def test_totals_that_can_be_computed_are_printed(quotation):
    data = {"items": [{"id": "1", "qty": 2, "unitPrice": "100.00"}], "discount": "0"}
    p = prepare(quotation, {}, data, {}, blank=True).prepared
    assert p.totals == {"subtotal": D("200.00"), "net": D("200.00"), "vat": D("14.00"), "grand": D("214.00")}


def test_wrong_values_are_still_errors(quotation):
    bad_type = prepare(
        quotation, {"docDate": "tomorrow"}, {"items": [{"id": "1", "qty": "two"}]}, {}, blank=True
    )
    assert bad_type.prepared is None
    assert {p.code for p in bad_type.problems} == {"PARAM_INVALID", "DATA_INVALID"}


def test_min_items_is_not_enforced():
    tax = load_fixture("tax-invoice")
    result = prepare(tax, {}, {}, {}, blank=True)
    assert result.problems == [] and list(result.prepared.lists["items"]) == []


def test_division_by_zero_from_filled_values_is_still_an_error():
    report = {
        "totals": {
            "subtotal": "sum(items.amount)",
            "net": "subtotal - discount",
            "ratio": "net / discount",
            "vat": "round(net * 0.07, 2)",
            "grand": "net + vat",
        }
    }
    definition = load_fixture("quotation", report)
    data = {"items": [{"id": "1", "qty": 1, "unitPrice": "1"}], "discount": "0"}
    result = prepare(definition, {}, data, {}, blank=True)
    assert [p.code for p in result.problems] == ["DIVISION_BY_ZERO"]


def test_rows_without_a_sort_or_group_key_go_last(sales):
    data = {"records": [{"id": "2", "amount": "5"}, {"id": "1", "region": "North", "amount": "10"}]}
    result = prepare(sales, {}, data, {}, blank=True)
    assert result.problems == []
    view = result.prepared.lists["records"]
    assert [r["id"] for r in view] == ["1", "2"]
    assert [(g.key, g.totals["subtotal"], g.totals["rows"]) for g in view.groups] == [
        ("North", D("10"), D("1")),
        (None, D("5"), D("1")),
    ]


def test_rows_without_an_id_are_not_an_error(quotation):
    result = prepare(quotation, {}, {"items": [{"qty": 1}]}, {}, blank=True)
    assert result.problems == []


def test_normal_mode_is_unchanged_and_sets_meta_blank_false(quotation):
    result = prepare(quotation, {}, {}, {"blank": True, "runId": "r"})
    assert result.prepared is None and {p.code for p in result.problems} >= {"PARAM_REQUIRED", "DATA_INVALID"}
    p = prepare(
        quotation, {"quoteId": "Q", "docDate": "2026-11-12"}, sample("quotation"), {"blank": True}
    ).prepared
    assert p.meta["blank"] is False  # prepare decides, whatever the caller passed
    assert p.totals["grand"] == D("3210.00")
