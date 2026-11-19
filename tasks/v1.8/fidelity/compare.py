"""v1.8 T15: the paper's anchor positions (measure.mjs) against the first page of the PDF; writes results.md.

python tasks/v1.8/fidelity/compare.py
"""

import io
import json
from pathlib import Path

from pypdf import PdfReader

HERE = Path(__file__).parent
PT_TO_MM = 25.4 / 72


def runs(pdf: Path):
    reader = PdfReader(io.BytesIO(pdf.read_bytes()))
    page = reader.pages[0]
    height = float(page.mediabox.height)
    width = float(page.mediabox.width)
    out = []

    def visit(text, cm, tm, _font, _size):
        if text.strip() and (tm[4], tm[5]) != (0, 0):  # a run that goes on from the one before has no position of its own
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            out.append((text, x * PT_TO_MM, (height - y) * PT_TO_MM))

    page.extract_text(visitor_text=visit)
    return out, len(reader.pages), width * PT_TO_MM, height * PT_TO_MM


lines = ["# v1.8 T15 ผืน vs PDF (หน้าแรก)", "", "x เทียบเฉพาะเมื่อข้อความเริ่มต้นบรรทัด/ชิ้นใน PDF · เกณฑ์ต่อกรณีดูในหัวข้อ", ""]
failed = []
for paper_file in sorted(HERE.glob("*.paper.json")):
    rid = paper_file.name.removesuffix(".paper.json")
    data = json.loads(paper_file.read_text(encoding="utf-8"))
    limit = data["limit"]
    pdf, pages, w, h = runs(HERE / f"{rid}.pdf")
    lines += [
        f"## {rid}",
        "",
        f"เกณฑ์ ≤ {limit} mm · PDF {w:.1f} × {h:.1f} mm, {pages} หน้า",
        "",
        "| ข้อความ | ผืน x, y (mm) | PDF x, y (mm) | ต่าง x | ต่าง y |",
        "|---|---|---|---|---|",
    ]
    worst = 0.0
    for anchor, p in data["anchors"].items():
        key = anchor.replace("ำ", "ํา").replace("ผู้", "ผู")  # how pypdf reads Thai marks from the PDF
        hit = next(((t, x, y) for t, x, y in pdf if t.strip().startswith((anchor, key))), None)
        if not hit:
            lines.append(f"| {anchor} | {p['x']}, {p['y']} | ไม่พบใน PDF | | |")
            worst = 999.0
            continue
        _, x, y = hit
        dx, dy = p["x"] - x, p["y"] - y
        worst = max(worst, abs(dx), abs(dy))
        lines.append(f"| {anchor} | {p['x']:.2f}, {p['y']:.2f} | {x:.2f}, {y:.2f} | {dx:+.2f} | {dy:+.2f} |")
    lines += ["", f"ต่างมากสุด {worst:.2f} mm → {'ผ่าน' if worst <= limit else 'ไม่ผ่าน'}", ""]
    if worst > limit:
        failed.append(rid)
lines.append("**ผล: " + ("ผ่านทุกกรณี" if not failed else "ไม่ผ่าน " + ", ".join(failed)) + "**")
(HERE / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("results.md written;", "all pass" if not failed else f"failed: {failed}")
