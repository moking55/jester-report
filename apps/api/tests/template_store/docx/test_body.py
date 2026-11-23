"""Page and paragraphs (SPEC-template-store.md v1.15 "การแปลง"): one test per rule."""

import json

from jester_api.template_store.docx import read_docx

from .conftest import docx, p


def convert(body: str, **kw):
    bundle, warnings = read_docx(docx(body, **kw), "form-a", "แบบฟอร์ม")
    html = bundle.files["template.html"].removeprefix('<link rel="stylesheet" href="report.css">\n')
    return html.strip(), bundle, [(w.code, w.message) for w in warnings]


def page(**kw):
    return json.loads(convert(p("x"), **kw)[1].files["report.json"])["page"]


def test_a4_portrait_with_its_margins():
    assert page() == {
        "size": "A4",
        "orientation": "portrait",
        "layout": "flow",
        "marginsMm": {"top": 20.0, "bottom": 20.0, "left": 25.0, "right": 15.0},
    }


def test_landscape_letter_custom_and_clamped_margins():
    letter = '<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/></w:sectPr>'
    assert page(sect=letter) == {"size": "Letter", "orientation": "landscape", "layout": "flow"}
    odd = (
        '<w:sectPr><w:pgSz w:w="5669" w:h="8504"/>'
        '<w:pgMar w:top="4000" w:bottom="0" w:left="0" w:right="0"/></w:sectPr>'
    )
    html, bundle, warnings = convert(p("x"), sect=odd)
    got = json.loads(bundle.files["report.json"])["page"]
    assert (got["size"], got["widthMm"], got["heightMm"]) == ("custom", 100.0, 150.0)
    assert got["marginsMm"]["top"] == 50.0 and warnings[0][0] == "PAGE_MARGIN_CLAMPED"


def test_headings_and_alignment():
    styles = (
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>'
        '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>'
    )
    html, _, _ = convert(
        p("หัวข้อ", '<w:pStyle w:val="Heading1"/>')
        + p("ชื่อเรื่อง", '<w:pStyle w:val="Title"/><w:jc w:val="center"/>'),
        styles=styles,
    )
    assert html.splitlines() == [
        '<h1 style="margin-top: 0mm; margin-bottom: 0mm">หัวข้อ</h1>',
        '<h1 style="margin-top: 0mm; margin-bottom: 0mm; text-align: center">ชื่อเรื่อง</h1>',
    ]


def test_spacing_direct_then_style_then_defaults():
    styles = (
        '<w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault>'
        "</w:docDefaults>"
        '<w:style w:type="paragraph" w:styleId="Gap"><w:pPr><w:spacing w:before="567"/></w:pPr></w:style>'
    )
    html, _, _ = convert(
        p("ก") + p("ข", '<w:pStyle w:val="Gap"/>') + p("ค", '<w:spacing w:before="0" w:after="1134"/>'),
        styles=styles,
    )
    assert html.splitlines() == [
        '<p style="margin-top: 0mm; margin-bottom: 2.8mm">ก</p>',
        '<p style="margin-top: 10mm; margin-bottom: 2.8mm">ข</p>',
        '<p style="margin-top: 0mm; margin-bottom: 20mm">ค</p>',
    ]


def test_runs_bold_italic_underline_break_and_tab():
    body = (
        "<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ชื่อ</w:t></w:r><w:r><w:tab/><w:t>...........</w:t></w:r>"
        '<w:r><w:rPr><w:i/><w:u w:val="single"/></w:rPr><w:t>หมายเหตุ</w:t></w:r>'
        '<w:r><w:br/><w:t>บรรทัดสอง</w:t></w:r><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t> ปกติ</w:t></w:r></w:p>'
    )
    html, _, _ = convert(body)
    assert html == (
        '<p style="margin-top: 0mm; margin-bottom: 0mm"><b>ชื่อ</b>&emsp;...........'
        "<u><i>หมายเหตุ</i></u><br>บรรทัดสอง ปกติ</p>"
    )


def test_empty_lines_become_one_space_block_and_page_breaks_a_block():
    body = (
        p("ก")
        + p()
        + p()
        + p()
        + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
        + p("ข", "<w:pageBreakBefore/>")
    )
    html, _, _ = convert(body)
    assert html.splitlines() == [
        '<p style="margin-top: 0mm; margin-bottom: 0mm">ก</p>',
        '<div data-jd="space" style="height: 18mm"></div>',
        '<div data-jd="page-break" style="break-after: page"></div>',
        '<div data-jd="page-break" style="break-after: page"></div>',
        '<p style="margin-top: 0mm; margin-bottom: 0mm">ข</p>',
    ]


def test_lists_numbers_bullets_and_levels():
    numbering = (
        '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>'
        '<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>'
        '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
    )
    item = lambda text, lvl: p(text, f'<w:numPr><w:ilvl w:val="{lvl}"/><w:numId w:val="1"/></w:numPr>')  # noqa: E731
    html, _, _ = convert(item("หนึ่ง", 0) + item("ย่อย", 1) + item("สอง", 0), numbering=numbering)
    assert [line.split(">", 1)[1] for line in html.splitlines()] == ["1. หนึ่ง</p>", "• ย่อย</p>", "2. สอง</p>"]
    assert "padding-left: 6mm" in html.splitlines()[1]


def test_track_changes_wrappers_and_fields():
    body = (
        "<w:p><w:ins><w:r><w:t>เพิ่ม</w:t></w:r></w:ins><w:del><w:r><w:delText>ลบ</w:delText></w:r></w:del>"
        '<w:hyperlink r:id="x"><w:r><w:t> ลิงก์</w:t></w:r></w:hyperlink>'
        "<w:sdt><w:sdtContent><w:r><w:t> ช่อง</w:t></w:r></w:sdtContent></w:sdt></w:p>"
        '<w:p><w:r><w:t>หน้า </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r>'
        '<w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        '<w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'
        '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>9</w:t></w:r></w:fldSimple></w:p>'
    )
    html, _, _ = convert(body)
    assert html.splitlines() == [
        '<p style="margin-top: 0mm; margin-bottom: 0mm">เพิ่ม ลิงก์ ช่อง</p>',
        '<p style="margin-top: 0mm; margin-bottom: 0mm">หน้า <span class="pageNumber"></span>'
        '<span class="totalPages"></span></p>',
    ]


def test_word_text_never_becomes_jinja_or_markup():
    # as Word stores it: the text "{{ data.x }} {% if 1 %} <script>alert(1)</script> &amp;"
    html, bundle, _ = convert(p("{{ data.x }} {% if 1 %} &lt;script&gt;alert(1)&lt;/script&gt; &amp;amp;"))
    assert "{" not in html and "}" not in html and "<script>" not in html
    assert "&#123;&#123; data.x &#125;&#125;" in html and "&lt;script&gt;" in html and "&amp;amp;" in html


def test_fonts_textboxes_footnotes_are_warnings():
    body = (
        '<w:p><w:r><w:rPr><w:rFonts w:ascii="Angsana New" w:cs="Angsana New"/></w:rPr><w:t>ก</w:t></w:r>'
        '<w:r><w:footnoteReference w:id="1"/></w:r></w:p>'
        '<w:p><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"/></w:p>'
        "<w:p><w:r><w:pict/></w:r></w:p>"
    )
    _, _, warnings = convert(body)
    assert [c for c, _ in warnings] == ["DOCX_FOOTNOTE", "DOCX_TEXTBOX", "DOCX_SHAPE", "DOCX_FONT"]
    assert warnings[0][1].startswith("ย่อหน้าที่ 1:") and "Angsana New" in warnings[-1][1]


def test_files_of_the_new_draft():
    _, bundle, _ = convert(p("x"))
    assert sorted(bundle.files) == [
        "data.schema.json",
        "report.css",
        "report.json",
        "sample.json",
        "template.html",
    ]
    assert json.loads(bundle.files["data.schema.json"]) == {"type": "object", "properties": {}}
    assert json.loads(bundle.files["sample.json"]) == {} and bundle.assets == {}
    assert (bundle.id, bundle.name) == ("form-a", "แบบฟอร์ม")
