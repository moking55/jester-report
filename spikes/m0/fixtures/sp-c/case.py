"""SP-C: master-detail purchase orders; a detail row taller than one page, and PO02 with no detail.

Base from research/specimens/master-detail-cases.json; long-detail text extended (specimen text is too short).
"""

from common import Expect, Variant, font_face, footer

FAMILY = '"TH Sarabun New", "Noto Sans Thai"'
FILES = ["THSarabunNew-Regular.ttf", "THSarabunNew-Bold.ttf"]
MARKS = [f"MARK{i:03d}" for i in range(1, 121)]
LONG = " ".join(f"{m} ข้อความรายละเอียดสินค้าที่ยาวมากเพื่อทดสอบการแบ่งหน้าของแถวที่สูงเกินหนึ่งหน้า" for m in MARKS)


def po(order_id: str, details: list[tuple[str, str, str]], total: str) -> str:
    if details:
        rows = "".join(f"<tr><td>{d}</td><td>{desc}</td><td class='n'>{amt}</td></tr>" for d, desc, amt in details)
    else:
        rows = "<tr><td colspan='3' class='empty'>ไม่มีรายการ NO-DETAIL</td></tr>"
    return f"""<section class="po"><h2>ใบสั่งซื้อ {order_id}</h2>
<table><thead><tr><th>DETAIL-ID</th><th>รายละเอียด</th><th class="n">จำนวนเงิน</th></tr></thead>
<tbody>{rows}</tbody><tfoot><tr><td colspan="2">รวม {order_id}</td><td class="n">{total}</td></tr></tfoot></table></section>"""


def doc(break_inside: str) -> str:
    css = font_face("TH Sarabun New", "THSarabunNew-Regular.ttf") + font_face(
        "TH Sarabun New", "THSarabunNew-Bold.ttf", "bold"
    )
    return f"""<html><head><meta charset="utf-8"><style>{css}
body {{ font-family: {FAMILY}; font-size: 16pt; }} h2 {{ margin: 6mm 0 2mm; }}
table {{ width: 100%; border-collapse: collapse; }} thead {{ display: table-header-group; }}
th {{ background: #e6f3fb; text-align: left; padding: 2mm; }} td {{ padding: 2mm; border-bottom: 1px solid #ddd; vertical-align: top; }}
tr {{ break-inside: {break_inside}; }} .n {{ text-align: right; white-space: nowrap; }}
tfoot td {{ font-weight: bold; border-top: 2px solid #222; }} .empty {{ text-align: center; color: #666; }}
</style></head><body>
{po("PO01", [("D01", "กระดาษ A4 80 แกรม", "200.00"), ("D02", "หมึกพิมพ์สีดำ", "150.00")], "350.00")}
{po("PO02", [], "0.00")}
{po("PO04", [("D04", LONG, "5.00")], "5.00")}
</body></html>"""


def variants():
    ff = footer(font_face("TH Sarabun New", "THSarabunNew-Regular.ttf", inline=True), FAMILY)
    exp = Expect(
        ids=["D01", "D02", "D04", *MARKS],
        totals=["350.00", "0.00", "5.00"],
        thai=["ใบสั่งซื้อ", "ไม่มีรายการ", "กระดาษ A4 80 แกรม"],
        every_page=["PAGE-MARK"],
        fonts=["THSarabunNew"],
        min_pages=2,
    )
    return [
        Variant("oversize-avoid", doc("avoid"), footer_html=ff, font_files=FILES, expect=exp,
                note="tr { break-inside: avoid } with a row taller than a page"),
        Variant("oversize-auto", doc("auto"), footer_html=ff, font_files=FILES, expect=exp,
                note="tr { break-inside: auto }"),
    ]
