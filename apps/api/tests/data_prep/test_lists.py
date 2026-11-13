import copy
from decimal import Decimal

from jester_api.data_prep.lists import ListView, build_lists

from .conftest import sample

D = Decimal


def codes(problems):
    return {(p.code, p.pointer) for p in problems}


def test_quotation_rows_get_decimals_and_computed(quotation):
    lists, problems = build_lists(quotation, sample("quotation"))
    assert problems == []
    items = lists["items"]
    assert isinstance(items, ListView) and len(items) == 2
    assert items[0]["unitPrice"] == D("1250.50") and items[0]["qty"] == 2
    assert [r["amount"] for r in items] == [D("2501.00"), D("599.70")]
    assert items.groups == []


def test_sales_sorted_and_grouped(sales):
    data = sample("sales-grouped")
    data["records"].reverse()
    lists, problems = build_lists(sales, data)
    assert problems == []
    view = lists["records"]
    assert [r["id"] for r in view] == ["S01", "S02", "S03", "S04"]
    assert [(g.key, g.totals["subtotal"], g.totals["rows"]) for g in view.groups] == [
        ("North", D("2000.00"), 2),
        ("South", D("400.00"), 2),
    ]


def test_empty_dataset_has_no_groups(sales):
    lists, problems = build_lists(sales, sample("sales-grouped", "sample-empty.json"))
    assert problems == [] and lists["records"].rows == [] and lists["records"].groups == []


def test_master_detail_child_lists_and_row_totals(purchase_order):
    lists, problems = build_lists(purchase_order, sample("purchase-order"))
    assert problems == []
    po1, po2 = lists["orders"]
    assert isinstance(po1["details"], ListView) and [d["detailId"] for d in po1["details"]] == ["D01", "D02"]
    assert (po1["total"], po2["total"]) == (D("350.00"), 0)


def test_duplicate_ids_and_missing_id(sales, purchase_order):
    data = sample("sales-grouped")
    data["records"][2]["id"] = "S01"
    del data["records"][3]["id"]
    _, problems = build_lists(sales, data)
    found = codes(problems)
    assert ("DUPLICATE_ID", "/data/records/2/id") in found
    assert ("VALUE_MISSING", "/data/records/3/id") in found
    assert all("S01" not in p.message for p in problems)
    # the same detail id under different orders is fine
    po = sample("purchase-order")
    po["orders"][1]["details"] = [{"detailId": "D01", "description": "x", "amount": "1.00"}]
    assert build_lists(purchase_order, po)[1] == []


def test_null_amount_reported_with_row_pointer(sales):
    data = sample("sales-grouped")
    data["records"][1]["amount"] = None
    _, problems = build_lists(sales, data)
    assert ("VALUE_MISSING", "/data/records") in codes(problems)  # group subtotal over the rows
    assert any("(row 1)" in p.message for p in problems)


def test_null_sort_key(sales):
    data = sample("sales-grouped")
    data["records"][0]["region"] = None
    _, problems = build_lists(sales, data)
    assert ("VALUE_MISSING", "/data/records/0/region") in codes(problems)


def test_computed_error_points_at_row(quotation):
    data = sample("quotation")
    data["items"][1]["unitPrice"] = None
    _, problems = build_lists(quotation, data)
    assert [(p.code, p.pointer) for p in problems] == [("VALUE_MISSING", "/data/items/1")]
    assert problems[0].message.startswith("amount:")


def test_caller_data_not_modified(purchase_order):
    data = sample("purchase-order")
    before = copy.deepcopy(data)
    build_lists(purchase_order, data)
    assert data == before


def test_missing_optional_list_is_empty(quotation):
    data = sample("quotation")
    data["items"] = []
    lists, problems = build_lists(quotation, data)
    assert problems == [] and len(lists["items"]) == 0
