"""SP-A: one-page quotation Q-DEMO-001 with Thai header/footer; font delivery and fallback variants.

Figures from docs/research/findings/01-product-brief.md (synthetic): subtotal 3,100.70, grand 3,210.00.
"""

from common import HEADER_FOOTER_BASE, Expect, Variant, font_face

TH_FILES = ["THSarabunNew-Regular.ttf", "THSarabunNew-Bold.ttf"]
HEADER_TEXT = "บริษัท ตัวอย่าง จำกัด (สำนักงานใหญ่) เลขประจำตัวผู้เสียภาษี 0105556000000"
BODY_THAI = ["ใบเสนอราคา", "บริการติดตั้งระบบรายงาน", "ค่าอบรมผู้ใช้งาน", "สามพันสองร้อยสิบบาทถ้วน", "เงื่อนไขการชำระเงิน"]


def th_css(inline: bool = False) -> str:
    return font_face("TH Sarabun New", "THSarabunNew-Regular.ttf", inline=inline) + font_face(
        "TH Sarabun New", "THSarabunNew-Bold.ttf", "bold", inline=inline
    )


def body(css: str) -> str:
    return f"""<html><head><meta charset="utf-8"><style>{css}
body {{ font-family: "TH Sarabun New", "Noto Sans Thai"; font-size: 16pt; }}
h1 {{ font-size: 26pt; margin: 0; }} table {{ width: 100%; border-collapse: collapse; margin-top: 6mm; }}
th {{ background: #e6f3fb; text-align: left; padding: 2mm; }} td {{ padding: 2mm; border-bottom: 1px solid #ddd; }}
.n {{ text-align: right; }} .tot {{ width: 50%; margin-left: auto; }} .g td {{ font-weight: bold; border-top: 2px solid #222; }}
</style></head><body>
<h1>ใบเสนอราคา</h1>
<p>เลขที่ Q-DEMO-001 · วันที่ 12 พฤศจิกายน 2569<br>เรียน บริษัท ลูกค้า จำกัด</p>
<table><thead><tr><th>รหัส</th><th>รายการ</th><th class="n">จำนวน</th><th class="n">ราคา/หน่วย</th><th class="n">จำนวนเงิน</th></tr></thead>
<tbody><tr><td>QL01</td><td>บริการติดตั้งระบบรายงาน</td><td class="n">2</td><td class="n">1,250.50</td><td class="n">2,501.00</td></tr>
<tr><td>QL02</td><td>ค่าอบรมผู้ใช้งาน</td><td class="n">3</td><td class="n">199.90</td><td class="n">599.70</td></tr></tbody></table>
<table class="tot"><tr><td>รวม</td><td class="n">3,100.70</td></tr><tr><td>ส่วนลด</td><td class="n">-100.70</td></tr>
<tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td class="n">210.00</td></tr><tr class="g"><td>ยอดสุทธิ</td><td class="n">3,210.00</td></tr></table>
<p>(สามพันสองร้อยสิบบาทถ้วน)</p>
<p>เงื่อนไขการชำระเงิน: ชำระภายใน 30 วัน นับจากวันที่ออกใบเสนอราคา ราคานี้ยืนยันได้ 15 วัน</p>
</body></html>"""


def header(css: str, family: str) -> str:
    return f"""<html><head><style>{css}{HEADER_FOOTER_BASE}
body {{ font-family: {family}; font-size: 12px; }}</style></head><body>{HEADER_TEXT} HEAD-MARK</body></html>"""


def footer(css: str, family: str) -> str:
    return f"""<html><head><style>{css}{HEADER_FOOTER_BASE}
body {{ font-family: {family}; font-size: 12px; text-align: right; }}</style></head>
<body>หน้า <span class="pageNumber"></span>/<span class="totalPages"></span> ผู้อนุมัติ PAGE-MARK</body></html>"""


def footer_fixed(family: str) -> str:
    # attempt to fix right-alignment and collapsed spaces seen with the plain footer
    return f"""<html><head><style>{HEADER_FOOTER_BASE}
body {{ font-family: {family}; font-size: 12px; }} .r {{ width: 100%; text-align: right; white-space: pre; }}</style></head>
<body><div class="r">หน้า <span class="pageNumber"></span>/<span class="totalPages"></span>  ผู้อนุมัติ PAGE-MARK</div></body></html>"""


def expect(fonts: list[str]) -> Expect:
    return Expect(
        ids=["QL01", "QL02", "Q-DEMO-001"],
        totals=["3,100.70", "-100.70", "210.00", "3,210.00"],
        thai=BODY_THAI + [HEADER_TEXT, "ผู้อนุมัติ"],
        every_page=["HEAD-MARK", "PAGE-MARK"],
        fonts=fonts,
    )


def variants():
    fam = '"TH Sarabun New", "Noto Sans Thai"'
    return [
        Variant("hf-font-inline", body(th_css()), header(th_css(True), fam), footer(th_css(True), fam),
                TH_FILES, expect=expect(["THSarabunNew"]),
                note="body loads font files; header/footer embed the font as data URI"),
        Variant("hf-font-url", body(th_css()), header(th_css(), fam), footer(th_css(), fam),
                TH_FILES, expect=expect(["THSarabunNew"]),
                note="header/footer reference the font file by url() like the body"),
        Variant("hf-system-font", body(th_css()), header("", '"TH Sarabun New"'), footer("", '"TH Sarabun New"'),
                TH_FILES, expect=expect(["THSarabunNew"]),
                note="custom image: TH Sarabun New installed as system font; header/footer use it by name only"),
        Variant("hf-system-font-fixed", body(th_css()), header("", '"TH Sarabun New"'), footer_fixed('"TH Sarabun New"'),
                TH_FILES, expect=expect(["THSarabunNew"]),
                note="as hf-system-font plus footer layout fix (div width 100%, white-space: pre)"),
        Variant("fallback-noto", body(font_face("Noto Sans Thai", "NotoSansThai.ttf")),
                header(font_face("Noto Sans Thai", "NotoSansThai.ttf", inline=True), fam),
                footer(font_face("Noto Sans Thai", "NotoSansThai.ttf", inline=True), fam),
                ["NotoSansThai.ttf"], expect=expect(["NotoSansThai"]),
                note="TH Sarabun New missing; bundled Noto Sans Thai must take over"),
        Variant("no-fonts", body(""), header("", fam), footer("", fam), [],
                expect=expect([]),
                note="no font shipped: shows what the Gotenberg image falls back to"),
    ]
