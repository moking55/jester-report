from decimal import Decimal

from jester_api.binder.document import css_string, header_footer_html, index_html, page_setup
from jester_api.report_definition.model import ReportJson
from jester_api.report_definition.problems import AssetInfo


def report(**changes):
    base = {
        "schemaVersion": 1,
        "name": "r",
        "fonts": {"body": ["TH Sarabun New", "My Font"], "headerFooter": ["TH Sarabun New"]},
        "data": {"schema": "data.schema.json", "samples": ["sample.json"]},
    }
    return ReportJson.model_validate({**base, **changes})


ASSETS = {
    "myfont.ttf": AssetInfo("font/ttf", "a" * 64, "My Font"),
    "other.ttf": AssetInfo("font/ttf", "b" * 64, "Other"),
    "logo.png": AssetInfo("image/png", "c" * 64),
}


def test_index_wraps_body_with_base_css_before_author_content():
    html = index_html("<p>สวัสดี</p>", report(), ASSETS)
    assert (
        html.startswith("<!doctype html>") and '<html lang="th">' in html and '<meta charset="utf-8">' in html
    )
    assert html.index("table-header-group") < html.index("<p>สวัสดี</p>")
    assert "break-inside: auto" in html
    assert 'font-family: "TH Sarabun New", "My Font";' in html  # no extra fallback fonts (D2)


def test_font_face_only_for_declared_body_fonts():
    html = index_html("", report(), ASSETS)
    assert '@font-face { font-family: "My Font"; src: url("myfont.ttf"); }' in html
    assert "other.ttf" not in html and "logo.png" not in html


def test_header_footer_use_engine_fonts_without_font_face():
    out = header_footer_html('<span class="pageNumber"></span>', report())
    assert "@font-face" not in out and "box-sizing: border-box" in out
    assert 'font-family: "TH Sarabun New";' in out and out.endswith('<span class="pageNumber"></span>')
    assert "font-family" not in header_footer_html("x", report(fonts={"body": ["A"]}))


def test_css_string_cannot_break_out():
    assert css_string('a"b</style><script>') == '"a\\"b\\3c /style>\\3c script>"'


def test_page_setup_from_report():
    page = page_setup(report(page={"orientation": "landscape", "marginsMm": {"top": 10, "left": 5}}))
    assert page.landscape and page.margin_top_mm == Decimal(10) and page.margin_left_mm == Decimal(5)
    assert page.margin_bottom_mm == Decimal(20) and page.margin_right_mm == Decimal(15)
    assert page_setup(report()).landscape is False


# ---- v1.8 ----


def test_guide_images_are_never_printed_and_free_layout_counts_from_the_edge():
    flow = index_html("", report(), ASSETS)
    free = index_html("", report(page={"size": "A5", "layout": "free"}), ASSETS)
    assert '[data-jd="guide"] { display: none; }' in flow and 'data-jd="page"' not in flow
    assert "body { margin: 0; }" in free and '[data-jd="page"] { overflow: hidden; }' in free


def test_page_setup_from_page():
    setup = page_setup(report(page={"size": "A5", "orientation": "landscape"}))
    assert (setup.width_mm, setup.height_mm, setup.landscape, setup.single_page) == (148, 210, True, False)
    assert page_setup(report()).form_fields()["paperWidth"] == "8.27"  # A4 as before
    roll = page_setup(report(page={"size": "roll", "rollWidthMm": 80}))
    assert (roll.width_mm, roll.single_page, roll.margin_left_mm, roll.margin_top_mm) == (80, True, 2, 3)
    free = page_setup(report(page={"size": "A5", "layout": "free", "marginsMm": {"top": 10}}))
    assert (free.margin_top_mm, free.margin_left_mm) == (0, 0)  # positions count from the sheet's edge
