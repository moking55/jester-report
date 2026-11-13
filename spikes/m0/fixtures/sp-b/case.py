"""SP-B: grouped sales table across pages, repeated header, 0/1/50/500 rows, portrait/landscape.

Base rows from research/specimens/grouped-cases.json (S01-S04); larger sets are synthetic and deterministic.
"""

from decimal import Decimal

from common import Expect, Variant, font_face, footer, money

FAMILY = '"TH Sarabun New", "Noto Sans Thai"'
FONT_FILES = ["THSarabunNew-Regular.ttf", "THSarabunNew-Bold.ttf", "NotoSansThai.ttf"]
BASE = [("S01", "North", "1200.25"), ("S02", "North", "799.75"), ("S03", "South", "500.10"), ("S04", "South", "-100.10")]
REGION_TH = {"North": "ภาคเหนือ", "South": "ภาคใต้"}


def rows(n: int) -> list[tuple[str, str, Decimal]]:
    if n == 4:
        return [(i, r, Decimal(a)) for i, r, a in BASE]
    out = []
    for k in range(1, n + 1):
        region = "North" if k <= (n + 1) // 2 else "South"
        out.append((f"S{k:04d}", region, Decimal(k * 137 % 5000) + Decimal(k % 100) / 100))
    return out


def html(data: list[tuple[str, str, Decimal]]) -> tuple[str, list[str]]:
    css = (
        font_face("TH Sarabun New", "THSarabunNew-Regular.ttf")
        + font_face("TH Sarabun New", "THSarabunNew-Bold.ttf", "bold")
        + font_face("Noto Sans Thai", "NotoSansThai.ttf")
    )
    totals: list[str] = []
    body = []
    if not data:
        body.append('<tr><td colspan="4" class="nodata">ไม่มีข้อมูลในช่วงเวลาที่เลือก NO-DATA</td></tr>')
    grand = Decimal("0")
    for region in ("North", "South"):
        group = [r for r in data if r[1] == region]
        if not group:
            continue
        sub = sum((a for _, _, a in group), Decimal("0"))
        grand += sub
        body.append(f'<tr class="gh"><td colspan="4">กลุ่ม: {REGION_TH[region]} ({region})</td></tr>')
        for rid, _, amt in group:
            body.append(f"<tr><td>{rid}</td><td>{REGION_TH[region]}</td><td>2026-11-01</td>"
                        f'<td class="n">{money(amt)}</td></tr>')
        body.append(f'<tr class="gf"><td colspan="3">รวม {REGION_TH[region]}</td><td class="n">{money(sub)}</td></tr>')
        totals.append(money(sub))
    if data:
        body.append(f'<tr class="gt"><td colspan="3">รวมทั้งสิ้น</td><td class="n">{money(grand)}</td></tr>')
        totals.append(money(grand))
    doc = f"""<html><head><meta charset="utf-8"><style>{css}
body {{ font-family: {FAMILY}; font-size: 16pt; }}
h1 {{ font-size: 22pt; margin: 0 0 6mm; }}
table {{ width: 100%; border-collapse: collapse; }}
thead {{ display: table-header-group; }}
th {{ background: #e6f3fb; text-align: left; border-bottom: 1.5px solid #1e90d6; padding: 2mm; }}
td {{ padding: 1.5mm 2mm; border-bottom: 1px solid #ddd; }}
tr {{ break-inside: avoid; }}
.n {{ text-align: right; }} .gh td {{ font-weight: bold; background: #f4f4f4; }}
.gf td, .gt td {{ font-weight: bold; }} .gt td {{ border-top: 2px solid #222; }}
.nodata {{ text-align: center; padding: 10mm; color: #666; }}
</style></head><body>
<h1>รายงานสรุปยอดขายตามภูมิภาค</h1>
<p>ช่วงวันที่ 1–30 พฤศจิกายน 2569 · Asia/Bangkok</p>
<table><thead><tr><th>ROW-ID รหัส</th><th>ภูมิภาค</th><th>วันที่</th><th class="n">จำนวนเงิน (บาท)</th></tr></thead>
<tbody>{"".join(body)}</tbody></table></body></html>"""
    return doc, totals


def variants():
    out = []
    ff = footer(font_face("TH Sarabun New", "THSarabunNew-Regular.ttf", inline=True), FAMILY)
    for n, landscape, min_pages in [(0, False, 1), (1, False, 1), (4, False, 1), (50, False, 2),
                                    (50, True, 2), (500, False, 10)]:
        data = rows(n)
        doc, totals = html(data)
        out.append(Variant(
            name=f"rows-{n}-{'landscape' if landscape else 'portrait'}",
            index_html=doc, footer_html=ff, font_files=FONT_FILES, landscape=landscape,
            expect=Expect(
                ids=[r[0] for r in data], totals=totals,
                thai=["รายงานสรุปยอดขายตามภูมิภาค"] + (["ไม่มีข้อมูลในช่วงเวลาที่เลือก"] if not data else []),
                every_page=["ROW-ID", "PAGE-MARK"], fonts=["THSarabunNew"], min_pages=min_pages,
            ),
        ))
    return out
