"""Word tables -> the Designer's fixed table (SPEC-template-store.md v1.15)."""

from .conftest import p
from .test_body import convert

GRID = '<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="6000"/><w:gridCol w:w="2000"/></w:tblGrid>'
BORDERS = (
    '<w:tblBorders><w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/>'
    '<w:right w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders>'
)

RIGHT = '<w:jc w:val="right"/>'
SPAN2 = '<w:gridSpan w:val="2"/>'
SHADE = '<w:shd w:val="clear" w:fill="d9e2f3"/>'
V_START = '<w:vMerge w:val="restart"/>'
V_GO_ON = "<w:vMerge/>"
NO_TOP = '<w:tcBorders><w:top w:val="nil"/></w:tcBorders>'


def tc(text: str = "", tcpr: str = "", ppr: str = "") -> str:
    return f"<w:tc>{f'<w:tcPr>{tcpr}</w:tcPr>' if tcpr else ''}{p(text, ppr)}</w:tc>"


def tbl(rows: str, tblpr: str = BORDERS) -> str:
    return f"<w:tbl><w:tblPr>{tblpr}</w:tblPr>{GRID}{rows}</w:tbl>"


def test_widths_borders_padding_and_colspan():
    rows = f"<w:tr>{tc('รหัส')}{tc('รายการ')}{tc('จำนวน', ppr=RIGHT)}</w:tr>"
    rows += f"<w:tr>{tc('รวม', SPAN2)}{tc()}</w:tr>"
    html, _, _ = convert(tbl(rows))
    cell = "border: 1px solid #000; padding: 1mm 2mm"
    assert html.splitlines() == [
        '<table data-jd="grid" style="width: 100%; border-collapse: collapse">',
        f'  <tr><td style="{cell}; width: 20%">รหัส</td><td style="{cell}; width: 60%">รายการ</td>'
        f'<td style="{cell}; text-align: right; width: 20%">จำนวน</td></tr>',
        f'  <tr><td colspan="2" style="{cell}">รวม</td><td style="{cell}">&nbsp;</td></tr>',
        "</table>",
    ]


def test_header_row_shading_and_several_paragraphs():
    head = "<w:trPr><w:tblHeader/></w:trPr>"
    rows = f"<w:tr>{head}{tc('ก', SHADE)}{tc('ข')}{tc('ค')}</w:tr>"
    rows += f"<w:tr><w:tc>{p('บรรทัด 1')}{p('บรรทัด 2')}</w:tc>{tc()}{tc()}</w:tr>"
    html, _, _ = convert(tbl(rows))
    lines = html.splitlines()
    assert lines[1].startswith("  <tr><th ") and "background-color: #D9E2F3" in lines[1]
    assert "บรรทัด 1<br>บรรทัด 2</td>" in lines[2]


def test_vertical_merge_becomes_rowspan():
    rows = f"<w:tr>{tc('ก', V_START)}{tc('ข')}{tc('ค')}</w:tr>"
    rows += f"<w:tr>{tc('', V_GO_ON)}{tc('ง')}{tc('จ')}</w:tr>"
    html, _, _ = convert(tbl(rows))
    lines = html.splitlines()
    assert '<td rowspan="2" style=' in lines[1] and lines[2].count("<td") == 2


def test_borders_from_the_table_style_and_none():
    styles = f'<w:style w:type="table" w:styleId="TableGrid"><w:tblPr>{BORDERS}</w:tblPr></w:style>'
    row = f"<w:tr>{tc('ก')}{tc('ข')}{tc('ค')}</w:tr>"
    styled, _, _ = convert(tbl(row, '<w:tblStyle w:val="TableGrid"/>'), styles=styles)
    plain, _, _ = convert(tbl(row, ""))
    cleared, _, _ = convert(tbl(f"<w:tr>{tc('ก', NO_TOP)}{tc()}{tc()}</w:tr>"))
    assert "border: 1px solid #000" in styled
    assert "border:" not in plain and 'style="padding: 1mm 2mm; width: 20%"' in plain
    first, second = cleared.splitlines()[1].split("</td>")[:2]
    assert first == '  <tr><td style="padding: 1mm 2mm; width: 20%">ก' and second.startswith(
        '<td style="border'
    )


def test_a_nested_table_keeps_its_text_and_warns():
    inner = f"<w:tbl>{GRID}<w:tr>{tc('ใน')}</w:tr></w:tbl>"
    html, _, warnings = convert(tbl(f"<w:tr><w:tc>{inner}{p()}</w:tc>{tc()}{tc()}</w:tr>"))
    assert ">ใน</td>" in html and [c for c, _ in warnings] == ["DOCX_NESTED_TABLE"]
