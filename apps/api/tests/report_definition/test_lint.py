import pytest

from jester_api.report_definition.lint import lint_templates
from jester_api.report_definition.model import ReportJson
from jester_api.report_definition.problems import AssetInfo

FONTS = frozenset({"TH Sarabun New", "Noto Sans Thai"})
LOGO = {"logo.png": AssetInfo("image/png", "aa")}
OK_TEMPLATE = """<link rel="stylesheet" href="report.css">
<img src="logo.png">
{% for item in lists.items %}<tr><td>{{ item.id }}</td><td>{{ fmt.money(item.amount) }}</td></tr>{% endfor %}
{{ totals.grand }} {{ params.quoteId }} {{ data.customer.name }} {{ meta.version }}
{% for i in range(3) %}{{ loop.index }}{% endfor %}"""
OK_HEADER = '<style>body { font-family: "TH Sarabun New", sans-serif; }</style>{{ data.company }}'


def report(**fonts):
    return ReportJson.model_validate(
        {
            "schemaVersion": 1,
            "name": "x",
            "data": {"schema": "s.json", "samples": ["x.json"]},
            "fonts": {"body": ["TH Sarabun New"], "headerFooter": ["TH Sarabun New"], **fonts},
        }
    )


def lint(files, assets=LOGO, rep=None, fonts=FONTS):
    base = {"template.html": OK_TEMPLATE, "report.css": "body{}", "header.html": OK_HEADER}
    base.update(files)
    return lint_templates({k: v for k, v in base.items() if v is not None}, assets, rep, fonts)


def found(problems):
    return {(p.code, p.file, p.line) for p in problems}


def test_valid_files_pass():
    assert lint({}, rep=report()) == []


def test_jinja_syntax_error_has_line():
    problems = lint({"template.html": "<p>\n{% for x in lists.items %}\n<p>"})
    assert (
        problems[0].code == "TEMPLATE_SYNTAX" and problems[0].line == 2
    )  # Jinja points at the unclosed block


def test_unknown_top_level_variable():
    problems = lint({"template.html": "<p>\n{{ customer.name }}</p>"})
    assert ("TEMPLATE_UNKNOWN_VAR", "template.html", 2) in found(problems)


def test_missing_include():
    problems = lint({"template.html": '{% include "parts.html" %}'})
    assert problems[0].code == "FILE_MISSING"
    assert lint({"template.html": '{% include "parts.html" %}', "parts.html": "<p>"}) == []


def test_tfoot_forbidden_but_not_in_comments():
    assert ("TFOOT_FORBIDDEN", "template.html", 2) in found(
        lint({"template.html": "<table>\n<tfoot></tfoot>"})
    )
    assert lint({"template.html": "<!-- no <tfoot> here -->{# <tfoot> #}"}) == []


@pytest.mark.parametrize(
    "url", ["https://cdn.example.com/a.css", "http://x/a.png", "//cdn/x.js", "file:///etc/passwd"]
)
def test_external_urls_rejected(url):
    problems = lint({"template.html": f'<img src="{url}">'})
    assert problems[0].code == "EXTERNAL_URL"


def test_css_url_and_missing_files():
    problems = lint(
        {"report.css": "a { background: url('bg.png'); }\nb { background: url(nope.png) }"},
        assets={**LOGO, "bg.png": AssetInfo("image/png", "bb")},
    )
    assert found(problems) == {("FILE_MISSING", "report.css", 2)}


def test_skips_data_uri_anchor_and_jinja_refs():
    html = '<img src="data:image/png;base64,AA"><a href="#top"></a><img src="{{ data.logo }}">'
    assert lint({"template.html": html}) == []


def test_header_font_face_rejected():
    hdr = '<style>@font-face { font-family: X; src: url("logo.png"); }</style>'
    assert "HEADER_FONT_FACE" in {p.code for p in lint({"header.html": hdr})}
    # allowed in the body template
    assert (
        lint({"template.html": '<style>@font-face { font-family: X; src: url("logo.png"); }</style>'}) == []
    )


def test_header_footer_font_families_checked():
    footer = "<style>\n.r { font-family: 'Tahoma', 'th sarabun new', serif }</style>"
    problems = lint({"footer.html": footer})
    assert found(problems) == {("FONT_MISSING", "footer.html", 2)}
    assert "Tahoma" in problems[0].message


def test_fonts_unverified_is_warning_only():
    problems = lint({"footer.html": "<style>body{font-family: Tahoma}</style>"}, fonts=None)
    assert [(p.severity, p.code) for p in problems] == [("warning", "FONT_UNVERIFIED")] * 2


def test_reserved_index_html():
    assert "RESERVED_NAME" in {p.code for p in lint({"index.html": "<p>"})}


def test_declared_fonts():
    rep = report(body=["Tahoma", "My Brand"], headerFooter=["My Brand"])
    assets = {**LOGO, "brand.ttf": AssetInfo("font/ttf", "cc", font_family="My Brand")}
    problems = lint({}, assets=assets, rep=rep)
    by_ptr = {p.pointer: p.code for p in problems}
    # body font from an uploaded asset is fine; header/footer must be an engine font (D1)
    assert by_ptr == {"/fonts/body/0": "FONT_MISSING", "/fonts/headerFooter/0": "FONT_MISSING"}


def test_declared_fonts_unverified():
    problems = lint({}, rep=report(), fonts=None)
    assert {p.code for p in problems} == {"FONT_UNVERIFIED"}
