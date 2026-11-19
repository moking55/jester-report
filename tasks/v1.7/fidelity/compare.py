"""T11: the paper's anchor positions (measure.mjs) against the first page of the PDF; writes results.md.

python tasks/v1.7/fidelity/compare.py
"""

import io
import json
from pathlib import Path

from pypdf import PdfReader

HERE = Path(__file__).parent
PT_TO_MM = 25.4 / 72
LIMIT_MM = 2.0


def runs(pdf: Path):
    page = PdfReader(io.BytesIO(pdf.read_bytes())).pages[0]
    height = float(page.mediabox.height)
    out = []

    def visit(text, cm, tm, _font, _size):
        if text.strip() and (tm[4], tm[5]) != (0, 0):  # a run that goes on from the one before has no position of its own
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            out.append((text, x * PT_TO_MM, (height - y) * PT_TO_MM))

    page.extract_text(visitor_text=visit)
    return out


lines = ["# T11 ผืน vs PDF (หน้าแรก)", "", f"เกณฑ์: ต่างไม่เกิน {LIMIT_MM} mm · x เทียบเฉพาะเมื่อข้อความเริ่มต้นบรรทัด/ชิ้นใน PDF", ""]
worst = 0.0
for paper_file in sorted(HERE.glob("*.paper.json")):
    rid = paper_file.name.removesuffix(".paper.json")
    paper = json.loads(paper_file.read_text(encoding="utf-8"))
    pdf = runs(HERE / f"{rid}.pdf")
    lines += [f"## {rid}", "", "| ข้อความ | ผืน x, y (mm) | PDF x, y (mm) | ต่าง x | ต่าง y |", "|---|---|---|---|---|"]
    for anchor, p in paper.items():
        key = anchor.replace("ำ", "ํา").replace("ผู้", "ผู")  # how pypdf reads Thai marks from the PDF
        hit = next(((t, x, y) for t, x, y in pdf if t.strip().startswith((anchor, key))), None)
        if not hit:
            lines.append(f"| {anchor} | {p['x']}, {p['y']} | ไม่พบใน PDF | | |")
            continue
        text, x, y = hit
        dy = p["y"] - y
        dx = p["x"] - x
        worst = max(worst, abs(dy), abs(dx or 0))
        lines.append(
            f"| {anchor} | {p['x']:.2f}, {p['y']:.2f} | {x:.2f}, {y:.2f} | {'—' if dx is None else f'{dx:+.2f}'} | {dy:+.2f} |"
        )
    lines.append("")
lines.append(f"ต่างมากสุด {worst:.2f} mm → {'ผ่าน' if worst <= LIMIT_MM else 'ไม่ผ่าน'}")
(HERE / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("results.md written")
