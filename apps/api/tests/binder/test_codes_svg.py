"""QR and barcodes from fmt pass through the binder; its resource check still runs (SPEC-binder v1.1)."""

from markupsafe import Markup

from jester_api.binder import bind
from jester_api.data_prep import prepare

from ..data_prep.conftest import fixture_files, load_fixture, sample
from .test_bind import ASSETS, QUOTE_PARAMS


def bound_with(extra: str, data_change=None):
    files = fixture_files("quotation")
    files["template.html"] += "\n" + extra
    definition = load_fixture("quotation")
    data = sample("quotation")
    if data_change:
        data_change(data)
    prepared = prepare(definition, QUOTE_PARAMS, data, {}).prepared
    return bind(definition, files, ASSETS, prepared)


def test_qr_promptpay_and_barcode_bind_clean():
    result = bound_with(
        '<div>{{ fmt.qr(fmt.promptpay("0812345678", totals.grand), size_mm=28) }}</div>'
        "<div>{{ fmt.barcode(params.quoteId) }}</div>"
    )
    assert result.problems == []
    assert result.bound.index_html.decode().count("<svg") == 2


def test_data_cannot_turn_into_markup_through_codes():
    def evil(data):
        data["customer"]["name"] = "</svg><script>alert(1)</script>"

    result = bound_with("{{ fmt.qr(data.customer.name) }}{{ fmt.barcode(data.customer.name) }}", evil)
    assert result.problems == []
    index = result.bound.index_html.decode()
    assert index.count("<svg") == 2
    # the name is escaped where the template prints it, and only shapes in the codes
    assert "<script" not in index


def test_a_bad_code_value_is_a_template_error_without_the_value():
    result = bound_with('{{ fmt.barcode("5901234123458", "ean13") }}')
    assert result.bound is None
    assert [(p.code, p.file) for p in result.problems] == [("TEMPLATE_ERROR", "template.html")]
    assert "5901234123458" not in result.problems[0].message


def test_resource_check_still_catches_a_tampered_svg():
    from jester_api.binder.resources import check_resources

    tampered = Markup('<svg><image xlink:href="http://x/y"/></svg>')
    problems, _, _ = check_resources({"template.html": str(tampered)}, {}, [])
    assert [p.code for p in problems] == ["RESOURCE_NOT_ALLOWED"]
