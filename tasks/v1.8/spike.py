"""T1 spike: what Gotenberg 9.4.1 does with arbitrary paper sizes and singlePage (run on the VM, next to Gotenberg).

python spike.py   (needs: pip install httpx pypdf; GOTENBERG_URL default http://127.0.0.1:3000)
"""

import io
import os

import httpx
from pypdf import PdfReader

URL = os.environ.get("GOTENBERG_URL", "http://127.0.0.1:3000") + "/forms/chromium/convert/html"
MM = 72 / 25.4


def html(lines: int) -> bytes:
    rows = "".join(f"<p style='margin:0'>รายการที่ {i} ........ 100.00</p>" for i in range(lines))
    return f"<!doctype html><html><body style='font-family:sans-serif;font-size:12pt;margin:0'>{rows}</body></html>".encode()


def render(width_mm: float, height_mm: float, lines: int, **extra) -> list[tuple[float, float]]:
    data = {
        "paperWidth": f"{width_mm / 25.4:.4f}",
        "paperHeight": f"{height_mm / 25.4:.4f}",
        "marginTop": "3mm", "marginBottom": "3mm", "marginLeft": "2mm", "marginRight": "2mm",
        **extra,
    }
    r = httpx.post(URL, data=data, files=[("files", ("index.html", html(lines)))], timeout=120)
    if r.status_code != 200:
        return [("HTTP", r.status_code, r.text[:200])]
    return [(round(float(p.mediabox.width) / MM, 1), round(float(p.mediabox.height) / MM, 1)) for p in PdfReader(io.BytesIO(r.content)).pages]


if __name__ == "__main__":
    print("A5 landscape 210x148:", render(210, 148, 5))
    print("custom 100x50:", render(100, 50, 3))
    print("custom 100x50, 12 lines (spills?):", render(100, 50, 12))
    for n in (5, 40, 200):
        print(f"roll 80mm singlePage, {n} lines:", render(80, 1000, n, singlePage="true"))
    print("roll 58mm singlePage, 40 lines:", render(58, 1000, 40, singlePage="true"))
    print("roll 80mm no singlePage, 40 lines (control):", render(80, 1000, 40))
