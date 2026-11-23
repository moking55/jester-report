"""Pictures, header/footer and the draft as a whole (SPEC-template-store.md v1.15)."""

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.report_definition import DefinitionInput, load_definition
from jester_api.template_store.assets import detect
from jester_api.template_store.docx import read_docx

from .conftest import PNG, docx, p, rels
from .test_body import convert

LOGO = {"rIdImg": ("image", "media/image1.png")}


def picture(rid: str = "rIdImg", cx: int = 1800000, kind: str = "inline", link: bool = False) -> str:
    blip = f'<a:blip r:link="{rid}"/>' if link else f'<a:blip r:embed="{rid}"/>'
    return (
        f'<w:r><w:drawing><wp:{kind}><wp:extent cx="{cx}" cy="900000"/><a:graphic><a:graphicData><pic:pic>'
        f"<pic:blipFill>{blip}</pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:{kind}></w:drawing></w:r>"
    )


def para(*runs: str, ppr: str = "") -> str:
    return f"<w:p>{f'<w:pPr>{ppr}</w:pPr>' if ppr else ''}{''.join(runs)}</w:p>"


def codes(warnings):
    return [c for c, _ in warnings]


def test_an_inline_picture_is_an_asset_and_an_image_block():
    body = para(picture(), ppr='<w:jc w:val="center"/>') + para(picture(), "<w:r><w:t>โลโก้ซ้ำ</w:t></w:r>")
    html, bundle, warnings = convert(body, doc_rels=LOGO, parts={"word/media/image1.png": PNG})
    assert bundle.assets == {"image1.png": PNG} and warnings == []  # the same picture twice is one asset
    assert html.splitlines() == [
        '<img src="image1.png" alt="" '
        'style="display: block; margin-left: auto; margin-right: auto; width: 50mm">',
        '<img src="image1.png" alt="" style="width: 50mm">',
        '<p style="margin-top: 0mm; margin-bottom: 0mm">โลโก้ซ้ำ</p>',
    ]


def test_pictures_that_cannot_come_are_warnings():
    doc_rels = {**LOGO, "rIdEmf": ("image", "media/image2.emf"), "rIdBig": ("image", "media/big.png")}
    parts = {
        "word/media/image1.png": PNG,
        "word/media/image2.emf": b"emf",
        "word/media/big.png": PNG + b"\0" * (5 << 20),
    }
    body = (
        para(picture(kind="anchor"))
        + para(picture("rIdEmf"))
        + para(picture("rIdBig"))
        + para(picture("rIdNone", link=True))
        + para("<w:r><w:drawing><wp:inline><wps:txbx xmlns:wps='urn:wps'/></wp:inline></w:drawing></w:r>")
    )
    _, bundle, warnings = convert(body, doc_rels=doc_rels, parts=parts)
    assert bundle.assets == {}
    assert codes(warnings) == [
        "DOCX_FLOATING_IMAGE",
        "DOCX_IMAGE_TYPE",
        "DOCX_IMAGE_TOO_LARGE",
        "DOCX_EXTERNAL_IMAGE",
        "DOCX_TEXTBOX",
    ]


def test_a_picture_whose_bytes_are_not_what_its_name_says_is_skipped():
    _, bundle, warnings = convert(
        para(picture()), doc_rels=LOGO, parts={"word/media/image1.png": b"GIF89a.."}
    )
    assert bundle.assets == {} and codes(warnings) == ["DOCX_IMAGE_TYPE"]


HEADER_SECT = (
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/>'
    '<w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/>'
    '<w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1418"/></w:sectPr>'
)
NS = (
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
)


def running(body: str, extra_rels: dict | None = None, parts: dict | None = None):
    header = f"<w:hdr {NS}>{body}</w:hdr>"
    footer = (
        f"<w:ftr {NS}>"
        + para('<w:r><w:t xml:space="preserve">หน้า </w:t></w:r><w:fldSimple w:instr="PAGE"/>')
        + "</w:ftr>"
    )
    return convert(
        p("เนื้อหา"),
        sect=HEADER_SECT,
        doc_rels={"rIdH": ("header", "header1.xml"), "rIdF": ("footer", "footer1.xml")},
        parts={
            "word/header1.xml": header,
            "word/footer1.xml": footer,
            "word/_rels/header1.xml.rels": rels(extra_rels or {}),
            **(parts or {}),
        },
    )


def test_header_and_footer_with_page_numbers_and_a_picture():
    _, bundle, warnings = running(para(picture(cx=720000), "<w:r><w:t>บริษัท ตัวอย่าง</w:t></w:r>"), LOGO,
                                  {"word/media/image1.png": PNG})  # fmt: skip
    header, footer = bundle.files["header.html"], bundle.files["footer.html"]
    assert header.startswith(
        '<style>body { font-family: "TH Sarabun New"; font-size: 12px; padding: 0 15mm 0 25mm;'
    )
    assert '<img src="image1.png" alt="" style="width: 20mm">' in header and "บริษัท ตัวอย่าง</p>" in header
    assert 'หน้า <span class="pageNumber"></span></p>' in footer
    assert bundle.assets == {"image1.png": PNG} and warnings == []


def test_a_header_picture_over_1_mb_is_skipped():
    big = PNG + b"\0" * (1 << 20)
    _, bundle, warnings = running(para(picture()), LOGO, {"word/media/image1.png": big})
    assert "header.html" not in bundle.files and bundle.assets == {}
    assert codes(warnings) == ["DOCX_IMAGE_TOO_LARGE"] and warnings[0][1].startswith("หัวกระดาษ ย่อหน้าที่ 1:")


def test_sections_with_another_paper_warn():
    other = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="16838" w:h="11906"/></w:sectPr></w:pPr></w:p>'
    _, _, warnings = convert(p("x") + other)
    assert codes(warnings) == ["DOCX_SECTION_PAGE"]


def test_the_new_draft_validates_and_binds():
    body = (
        para(picture(), ppr='<w:jc w:val="center"/>')
        + p("{{ ไม่ใช่ Jinja }}")
        + '<w:tbl><w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid><w:tr><w:tc>'
        + p("ช่อง")
        + "</w:tc></w:tr></w:tbl>"
    )
    bundle, _ = read_docx(docx(body, doc_rels=LOGO, parts={"word/media/image1.png": PNG}), "form-a", "ฟอร์ม")
    infos = {name: detect(name, raw) for name, raw in bundle.assets.items()}
    loaded = load_definition(DefinitionInput(bundle.files, infos, frozenset({"TH Sarabun New"})))
    assert [p for p in loaded.problems if p.severity == "error"] == []
    prepared = prepare(loaded.definition, {}, {}, {})
    assert prepared.problems == []
    bound = bind(loaded.definition, bundle.files, infos, prepared.prepared)
    assert [p for p in bound.problems if p.severity == "error"] == []
    # kept as entities, which the browser shows as braces: printed as text, never evaluated by Jinja
    assert "&#123;&#123; ไม่ใช่ Jinja &#125;&#125;" in bound.bound.index_html.decode()
