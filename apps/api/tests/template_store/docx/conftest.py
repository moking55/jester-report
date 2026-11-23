"""Build small .docx files in tests: the OOXML parts Word writes, by hand (no Word or LibreOffice needed)."""

from __future__ import annotations

import io
import zipfile

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
NS = f'xmlns:w="{W}" xmlns:r="{R}" xmlns:wp="{WP}" xmlns:a="{A}" xmlns:pic="{PIC}"'
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="png" ContentType="image/png"/>'
    '<Override PartName="/word/document.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    "</Types>"
)
A4_SECT = (
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    '<w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1418" w:header="709" w:footer="709"/>'
    "</w:sectPr>"
)
# a 1x1 transparent PNG
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c90000000049454e44ae426082"
)


def rels(items: dict[str, tuple[str, str]], external: frozenset[str] = frozenset()) -> str:
    """{rId: (type suffix, target)} -> a .rels part; ids in `external` get TargetMode="External"."""
    out = "".join(
        f'<Relationship Id="{rid}" Type="{REL}/{kind}" Target="{target}"'
        + (' TargetMode="External"' if rid in external else "")
        + "/>"
        for rid, (kind, target) in items.items()
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="{PKG_RELS}">{out}</Relationships>'


def p(text: str = "", ppr: str = "", rpr: str = "") -> str:
    run = (
        f'<w:r>{f"<w:rPr>{rpr}</w:rPr>" if rpr else ""}<w:t xml:space="preserve">{text}</w:t></w:r>'
        if text
        else ""
    )
    return f"<w:p>{f'<w:pPr>{ppr}</w:pPr>' if ppr else ''}{run}</w:p>"


def docx(
    body: str,
    *,
    sect: str = A4_SECT,
    styles: str | None = None,
    numbering: str | None = None,
    doc_rels: dict[str, tuple[str, str]] | None = None,
    external: frozenset[str] = frozenset(),
    parts: dict[str, bytes | str] | None = None,
) -> bytes:
    """A .docx whose document body is `body` (+ the section properties)."""
    files: dict[str, bytes | str] = {
        "[Content_Types].xml": CONTENT_TYPES,
        "_rels/.rels": rels({"rId1": ("officeDocument", "word/document.xml")}),
        "word/document.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:document {NS}><w:body>{body}{sect}</w:body></w:document>",
        "word/_rels/document.xml.rels": rels(doc_rels or {}, external),
    }
    if styles is not None:
        files["word/styles.xml"] = f'<?xml version="1.0" encoding="UTF-8"?><w:styles {NS}>{styles}</w:styles>'
    if numbering is not None:
        files["word/numbering.xml"] = (
            f'<?xml version="1.0" encoding="UTF-8"?><w:numbering {NS}>{numbering}</w:numbering>'
        )
    files.update(parts or {})
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():  # a fixed date: the same parts give the same bytes
            zf.writestr(
                zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)),
                content.encode() if isinstance(content, str) else content,
                zipfile.ZIP_DEFLATED,
            )
    return out.getvalue()
