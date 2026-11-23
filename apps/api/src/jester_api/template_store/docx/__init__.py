"""Word (.docx) form -> a new Jester draft the Document Designer can edit (SPEC-template-store.md v1.15).

`read_docx` is pure: bytes in, a Bundle (the same shape a template zip gives) plus warnings out. Nothing here
touches the database or the blob store; `TemplateStore.import_docx` checks the result binds and writes it.
"""

from __future__ import annotations

import json
from xml.etree.ElementTree import Element

from ...report_definition.problems import Problem, warning
from ..bundle import Bundle
from ..errors import StoreError
from ..limits import MAX_TEXT_BYTES
from .body import ENGINE_FONT, Ctx, Numbering, Styles, blocks, val, w
from .package import open_docx
from .page import page_of

DOCUMENT = "word/document.xml"
REPORT_CSS = 'body { font-family: "TH Sarabun New"; font-size: 16pt; }\n'
SCHEMA = '{\n  "type": "object",\n  "properties": {}\n}\n'
HEADER_IMAGE_LIMIT = (
    1024 * 1024
)  # header.html / footer.html images are inlined as data URIs (SPEC-binder v1.8)
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def _running(
    ctx: Ctx, sect: Element | None, kind: str, label: str, side_mm: tuple[float, float]
) -> str | None:
    """header.html / footer.html from the section's default header or footer, or None when it has none."""
    ref = next((r for r in (sect if sect is not None else []) if r.tag == w(f"{kind}Reference")
                and (val(r, "type") or "default") == "default"), None)  # fmt: skip
    part = ctx.rels.get(ref.get(R + "id") or "") if ref is not None else None
    root = ctx.pkg.xml(part) if part else None
    if root is None:
        return None
    sub = Ctx(
        ctx.pkg, part or "", ctx.pkg.rels(part or ""), ctx.styles, ctx.numbering, ctx.warnings, ctx.assets,
        HEADER_IMAGE_LIMIT, 0, ctx.fonts, label=label,
    )  # fmt: skip
    content = [b for b in blocks(sub, root) if not b.startswith('<div data-jd="space"')]
    if not content:
        return None
    left, right = side_mm
    style = (
        f'<style>body {{ font-family: "{ENGINE_FONT}"; font-size: 12px; padding: 0 {right:g}mm 0 {left:g}mm; '
        "box-sizing: border-box; width: 100%; }\n"
        # Chromium's header/footer box does not stretch blocks: without this a right-aligned line prints left
        "p, h1, h2, h3 { width: 100%; }</style>"
    )
    return style + "\n" + "\n".join(content) + "\n"


def _sections(body: Element) -> list[Element]:
    """Section properties in document order: those that end a section inside the body, then the last one."""
    inner = [s for p in body.iter(w("p")) if (s := p.find(f"{w('pPr')}/{w('sectPr')}")) is not None]
    last = body.find(w("sectPr"))
    return inner + ([last] if last is not None else [])


def read_docx(data: bytes, template_id: str, name: str) -> tuple[Bundle, list[Problem]]:
    pkg = open_docx(data)
    document = pkg.xml(DOCUMENT)
    body = document.find(w("body")) if document is not None else None
    if body is None:
        raise StoreError("INPUT_INVALID", "ไม่ใช่ไฟล์ Word (.docx): ไม่มีเนื้อหาเอกสาร")
    ctx = Ctx(pkg, DOCUMENT, pkg.rels(DOCUMENT), Styles(pkg.xml("word/styles.xml")),
              Numbering(pkg.xml("word/numbering.xml")))  # fmt: skip
    sections = _sections(body)
    first = sections[0] if sections else None
    page = page_of(ctx, first)

    def paper(sect: Element) -> tuple[str | None, ...]:
        size = sect.find(w("pgSz"))
        return (val(size, "w"), val(size, "h")) if size is not None else (None, None)

    if first is not None and any(paper(s) != paper(first) for s in sections[1:]):
        ctx.warn("DOCX_SECTION_PAGE", "เอกสารมีหลาย section ที่ขนาดกระดาษต่างกัน: ใช้ขนาดของ section แรกทั้งเล่ม")

    content = blocks(ctx, body)
    ctx.paragraph = 0
    margins = page.get("marginsMm", {"left": 15, "right": 15})
    sides = (margins["left"], margins["right"])
    header = _running(ctx, first, "header", "หัวกระดาษ", sides)
    footer = _running(ctx, first, "footer", "ท้ายกระดาษ", sides)
    if ctx.fonts:
        fonts = ", ".join(sorted(ctx.fonts))
        ctx.warnings.append(warning("DOCX_FONT", f"ฟอนต์ {fonts} ใช้ไม่ได้ใน Jester: ใช้ {ENGINE_FONT} แทน"))

    report = {
        "schemaVersion": 1,
        "name": name,
        "fonts": {"body": [ENGINE_FONT], "headerFooter": [ENGINE_FONT]},
        "data": {"schema": "data.schema.json", "samples": ["sample.json"]},
        "page": page,
    }
    files = {
        "report.json": json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        "data.schema.json": SCHEMA,
        "sample.json": "{}\n",
        "report.css": REPORT_CSS,
        "template.html": '<link rel="stylesheet" href="report.css">\n' + "\n".join(content) + "\n",
    }
    if header:
        files["header.html"] = header
    if footer:
        files["footer.html"] = footer
    for file, text in files.items():
        if len(text.encode()) > MAX_TEXT_BYTES:
            raise StoreError("PAYLOAD_TOO_LARGE", f"เอกสาร Word นี้ยาวเกินไป: {file} เกิน 1 MB")
    return Bundle(template_id, name, files, dict(ctx.assets)), ctx.warnings
