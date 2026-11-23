"""A realistic Word form made in code: no real form was available (SPEC-template-store.md v1.15).

What Word writes for a typical Thai office form: a logo and the office name in the header, page numbers
in the footer, a centred title, dotted lines to write on, a ruled items table with a shaded header row and
a total row (colspan), an approval table with a vertical merge (rowspan), a numbered list and a heading.

    python -m tests.template_store.docx.form   (from apps/api) rewrites fixtures/docx/form.docx
"""

from __future__ import annotations

from pathlib import Path

from .conftest import PNG, docx, rels

FIXTURES = Path(__file__).parents[1] / "fixtures" / "docx"
W_NS = (
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
)
FONT = '<w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/>'
STYLES = (
    '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="32"/></w:rPr></w:rPrDefault>'
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
    "</w:docDefaults>"
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>'
    '<w:pPr><w:spacing w:after="120"/><w:jc w:val="center"/></w:pPr></w:style>'
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
    '<w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr></w:style>'
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>'
    '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/>'
    '<w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/>'
    '<w:insideV w:val="single" w:sz="4"/>'
    "</w:tblBorders></w:tblPr></w:style>"
)
NUMBERING = (
    '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>'
    "</w:lvl></w:abstractNum>"
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
)


def run(text: str, bold: bool = False) -> str:
    rpr = f"<w:rPr>{FONT}{'<w:b/>' if bold else ''}</w:rPr>"
    return f'<w:r>{rpr}<w:t xml:space="preserve">{text}</w:t></w:r>'


def para(*runs: str, ppr: str = "") -> str:
    return f"<w:p>{f'<w:pPr>{ppr}</w:pPr>' if ppr else ''}{''.join(runs)}</w:p>"


def cell(text: str = "", width: int = 0, tcpr: str = "", jc: str = "", bold: bool = False) -> str:
    props = (f'<w:tcW w:w="{width}" w:type="dxa"/>' if width else "") + tcpr
    ppr = f'<w:jc w:val="{jc}"/>' if jc else ""
    return f"<w:tc><w:tcPr>{props}</w:tcPr>{para(run(text, bold) if text else '', ppr=ppr)}</w:tc>"


def grid(*widths: int) -> str:
    return "<w:tblGrid>" + "".join(f'<w:gridCol w:w="{w}"/>' for w in widths) + "</w:tblGrid>"


SHADE = '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>'
ITEM_WIDTHS = (850, 4250, 1300, 1300, 1937)


def items_table() -> str:
    head = "<w:tr><w:trPr><w:tblHeader/></w:trPr>" + "".join(
        cell(t, w, SHADE, "center", True)
        for t, w in zip(("ลำดับ", "รายการ", "จำนวน", "หน่วย", "หมายเหตุ"), ITEM_WIDTHS, strict=True)
    ) + "</w:tr>"  # fmt: skip
    empty = "<w:tr>" + "".join(cell(width=w) for w in ITEM_WIDTHS) + "</w:tr>"
    total = (
        "<w:tr>"
        + cell("รวม", ITEM_WIDTHS[0] + ITEM_WIDTHS[1], '<w:gridSpan w:val="2"/>', "right", True)
        + "".join(cell(width=w) for w in ITEM_WIDTHS[2:])
        + "</w:tr>"
    )
    return (
        '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>'
        + grid(*ITEM_WIDTHS)
        + head
        + empty * 5
        + total
        + "</w:tbl>"
    )


def approval_table() -> str:
    widths = (2400, 3368, 3869)
    return (
        '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>'
        + grid(*widths)
        + "<w:tr>"
        + cell("ผู้อนุมัติ", widths[0], '<w:vMerge w:val="restart"/>', "center", True)
        + cell("ลงชื่อ ..................................", widths[1])
        + cell("วันที่ ........./........./.........", widths[2])
        + "</w:tr><w:tr>"
        + cell(width=widths[0], tcpr="<w:vMerge/>")
        + cell("( .................................. )", widths[1], jc="center")
        + cell("ตำแหน่ง ..................................", widths[2])
        + "</w:tr></w:tbl>"
    )


def logo(cx: int) -> str:
    return (
        f'<w:r><w:drawing><wp:inline><wp:extent cx="{cx}" cy="{cx}"/><a:graphic><a:graphicData><pic:pic>'
        '<pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>'
        "</wp:inline></w:drawing></w:r>"
    )


HEADER = f"<w:hdr {W_NS}>" + para(logo(540000), run("  หน่วยงานตัวอย่าง (ข้อมูลสมมติ)", True)) + "</w:hdr>"
FOOTER = (
    f"<w:ftr {W_NS}>"
    + para(
        run("หน้า "),
        '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>',
        run(" / "),
        '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple>',
        ppr='<w:jc w:val="right"/>',
    )
    + "</w:ftr>"
)
BODY = (
    para(run("แบบคำขอเบิกพัสดุ", True), ppr='<w:pStyle w:val="Title"/>')
    + para(run("เลขที่ ..................  วันที่ ........./........./........."), ppr='<w:jc w:val="right"/>')
    + para()
    + para(
        run("ชื่อผู้ขอเบิก", True),
        run(" ........................................................  "),
        run("หน่วยงาน", True),
        run(" ........................................"),
    )  # fmt: skip
    + para(run("มีความประสงค์ขอเบิกพัสดุตามรายการต่อไปนี้"), ppr='<w:spacing w:before="120" w:after="120"/>')
    + items_table()
    + para()
    + para(run("เงื่อนไข"), ppr='<w:pStyle w:val="Heading1"/>')
    + para(
        run("ผู้ขอเบิกต้องลงชื่อรับพัสดุภายใน 7 วัน"), ppr='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    )
    + para(run("พัสดุที่เบิกแล้วไม่รับคืน"), ppr='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')
    + para()
    + para()
    + approval_table()
)
SECT = (
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/>'
    '<w:footerReference w:type="default" r:id="rIdF"/>'
    '<w:pgSz w:w="11906" w:h="16838"/>'
    '<w:pgMar w:top="1440" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/>'
    "</w:sectPr>"
)


def form_docx() -> bytes:
    return docx(
        BODY,
        sect=SECT,
        styles=STYLES,
        numbering=NUMBERING,
        doc_rels={"rIdH": ("header", "header1.xml"), "rIdF": ("footer", "footer1.xml")},
        parts={
            "word/header1.xml": HEADER,
            "word/footer1.xml": FOOTER,
            "word/_rels/header1.xml.rels": rels({"rIdLogo": ("image", "media/image1.png")}),
            "word/media/image1.png": PNG,
        },
    )


if __name__ == "__main__":
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "form.docx").write_bytes(form_docx())
    print(FIXTURES / "form.docx")
