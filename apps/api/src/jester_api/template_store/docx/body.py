"""Paragraphs and runs -> Designer text blocks (SPEC-template-store.md v1.15 "การแปลง").

Everything written here is HTML the Document Designer reads as blocks: <p>/<h1>-<h3> of b/i/u/br/span only,
`<div data-jd="space">`, `<div data-jd="page-break">`, top-level <img>. Text from Word is escaped once, in
`esc`, and its braces become entities, so nothing a Word user typed can turn into Jinja.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from xml.etree.ElementTree import Element

from ...report_definition.problems import Problem, warning
from .package import Package

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"
TWIPS_PER_MM = Decimal(1440) / Decimal("25.4")
LINE_MM = 6  # one empty Word line on paper, roughly
ENGINE_FONT = "TH Sarabun New"


def w(tag: str) -> str:
    return W + tag


def val(el: Element | None, name: str = "val") -> str | None:
    return None if el is None else el.get(w(name))


def on(el: Element | None) -> bool:
    """A Word toggle such as <w:b/>: present and not switched off."""
    return el is not None and (val(el) or "1").lower() not in ("0", "false", "off", "none")


def twips_mm(value: str | None, default: Decimal) -> Decimal:
    try:
        return (Decimal(value) / TWIPS_PER_MM).quantize(Decimal("0.1")) if value else default
    except InvalidOperation:
        return default


def css_mm(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    return f"{text}mm"


def esc(text: str) -> str:
    return html.escape(text, quote=False).replace("{", "&#123;").replace("}", "&#125;")


class Styles:
    """styles.xml: paragraph spacing, heading levels and table borders, through basedOn."""

    def __init__(self, root: Element | None) -> None:
        self.by_id: dict[str, Element] = {}
        self.default_spacing: tuple[str | None, str | None] = (None, None)
        if root is None:
            return
        for style in root.iter(w("style")):
            if sid := style.get(w("styleId")):
                self.by_id[sid] = style
        defaults = root.find(f"{w('docDefaults')}/{w('pPrDefault')}/{w('pPr')}/{w('spacing')}")
        if defaults is not None:
            self.default_spacing = (val(defaults, "before"), val(defaults, "after"))

    def _chain(self, sid: str | None):
        seen: set[str] = set()
        while sid and sid in self.by_id and sid not in seen:
            seen.add(sid)
            yield self.by_id[sid]
            sid = val(self.by_id[sid].find(w("basedOn")))

    def spacing(self, sid: str | None) -> tuple[str | None, str | None]:
        before, after = None, None
        for style in self._chain(sid):
            sp = style.find(f"{w('pPr')}/{w('spacing')}")
            if sp is not None:
                before = before if before is not None else val(sp, "before")
                after = after if after is not None else val(sp, "after")
        return (before if before is not None else self.default_spacing[0],
                after if after is not None else self.default_spacing[1])  # fmt: skip

    def alignment(self, sid: str | None) -> str | None:
        for style in self._chain(sid):
            jc = val(style.find(f"{w('pPr')}/{w('jc')}"))
            if jc:
                return jc
        return None

    def heading(self, sid: str | None) -> int | None:
        if not sid:
            return None
        name = (val(self.by_id[sid].find(w("name"))) if sid in self.by_id else sid) or sid
        name = name.lower().replace(" ", "")
        if name == "title":
            return 1
        m = re.fullmatch(r"heading([1-9])", name)
        return int(m.group(1)) if m and int(m.group(1)) <= 3 else None

    def table_borders(self, sid: str | None) -> bool:
        for style in self._chain(sid):
            borders = style.find(f"{w('tblPr')}/{w('tblBorders')}")
            if borders is not None:
                return any((val(b) or "nil") not in ("nil", "none") for b in borders)
        return False


class Numbering:
    """numbering.xml: whether a list level shows a bullet or a number, and the running counters."""

    def __init__(self, root: Element | None) -> None:
        self.formats: dict[tuple[str, int], str] = {}
        self.counters: dict[tuple[str, int], int] = {}
        if root is None:
            return
        abstract = {
            a.get(w("abstractNumId")): {int(val(lvl, "ilvl") or 0): val(lvl.find(w("numFmt"))) or "decimal"
                                        for lvl in a.iter(w("lvl"))}
            for a in root.iter(w("abstractNum"))
        }  # fmt: skip
        for num in root.iter(w("num")):
            levels = abstract.get(val(num.find(w("abstractNumId"))), {})
            for ilvl, fmt in levels.items():
                self.formats[(num.get(w("numId")) or "", ilvl)] = fmt

    def prefix(self, num_id: str, ilvl: int) -> str:
        if self.formats.get((num_id, ilvl), "decimal") == "bullet":
            return "• "
        n = self.counters.get((num_id, ilvl), 0) + 1
        self.counters[(num_id, ilvl)] = n
        for key in [k for k in self.counters if k[0] == num_id and k[1] > ilvl]:
            del self.counters[key]  # a deeper level starts again under the next item
        return f"{n}. "


@dataclass
class Ctx:
    pkg: Package
    part: str
    rels: dict[str, str]
    styles: Styles
    numbering: Numbering
    warnings: list[Problem] = field(default_factory=list)
    assets: dict[str, bytes] = field(default_factory=dict)
    image_limit: int = 5 * 1024 * 1024
    paragraph: int = 0
    fonts: set[str] = field(default_factory=set)
    label: str = ""  # "หัวกระดาษ" / "ท้ายกระดาษ" for a header or footer part
    _warned: set[tuple[str, str]] = field(default_factory=set)

    def warn(self, code: str, message: str) -> None:
        where = " ".join(x for x in (self.label, f"ย่อหน้าที่ {self.paragraph}" if self.paragraph else "") if x)
        where = f"{where}: " if where else ""
        if (code, message) not in self._warned:
            self._warned.add((code, message))
            self.warnings.append(warning(code, where + message))


Segment = tuple[str, tuple[bool, bool, bool], str]  # ("text"|"img"|"page", (b, i, u), html)


def _run(ctx: Ctx, r: Element, out: list[Segment], field_: dict) -> None:
    rpr = r.find(w("rPr"))
    fmt = (
        (on(rpr.find(w("b"))), on(rpr.find(w("i"))), on(rpr.find(w("u"))))
        if rpr is not None
        else (False,) * 3
    )
    fonts = rpr.find(w("rFonts")) if rpr is not None else None
    if fonts is not None:
        for attr in ("ascii", "hAnsi", "cs"):
            name = val(fonts, attr)
            if name and name != ENGINE_FONT:
                ctx.fonts.add(name)
    for el in r:
        tag = el.tag
        if tag == w("fldChar"):
            kind = val(el, "fldCharType")
            if kind == "begin":
                field_.update(state="instr", instr="")
            elif kind == "separate":
                instr = field_.get("instr", "").split()
                name = instr[0].upper() if instr else ""
                if name in ("PAGE", "NUMPAGES"):
                    cls = "pageNumber" if name == "PAGE" else "totalPages"
                    out.append(("text", fmt, f'<span class="{cls}"></span>'))
                    field_["state"] = "skip"
                else:
                    field_["state"] = "result"
            elif kind == "end":
                field_.clear()
            continue
        if field_.get("state") == "instr":
            if tag == w("instrText"):
                field_["instr"] = field_.get("instr", "") + (el.text or "")
            continue
        if field_.get("state") == "skip":
            continue
        if tag == w("t"):
            out.append(("text", fmt, esc(el.text or "")))
        elif tag == w("tab"):
            out.append(("text", fmt, "&emsp;"))
        elif tag in (w("br"), w("cr")):
            out.append(("page", fmt, "") if val(el, "type") == "page" else ("text", fmt, "<br>"))
        elif tag == w("noBreakHyphen"):
            out.append(("text", fmt, "-"))
        elif tag == w("drawing"):
            from .media import drawing

            img = drawing(ctx, el)
            if img:
                out.append(("img", fmt, img))
        elif tag == w("pict"):
            ctx.warn("DOCX_SHAPE", "รูปทรง/text box แบบเก่า (VML) ข้ามไป")
        elif tag in (w("footnoteReference"), w("endnoteReference")):
            ctx.warn("DOCX_FOOTNOTE", "footnote/endnote ไม่ถูกนำเข้า")
        elif tag == MC + "AlternateContent":
            ctx.warn("DOCX_TEXTBOX", "text box หรือรูปทรงข้ามไป (ข้อความในนั้นไม่ถูกนำเข้า)")


def _walk(ctx: Ctx, el: Element, out: list[Segment], field_: dict) -> None:
    """Runs in document order, through the wrappers Word puts around them."""
    for child in el:
        tag = child.tag
        if tag == w("r"):
            _run(ctx, child, out, field_)
        elif tag == w("fldSimple"):
            name = ((val(child, "instr") or "").split() or [""])[0].upper()
            if name in ("PAGE", "NUMPAGES"):
                cls = "pageNumber" if name == "PAGE" else "totalPages"
                out.append(("text", (False,) * 3, f'<span class="{cls}"></span>'))
            else:
                _walk(ctx, child, out, field_)
        elif tag in (w("hyperlink"), w("ins"), w("smartTag"), w("sdt"), w("sdtContent"), w("customXml"),
                     w("moveTo"), w("bdo"), w("dir")):  # fmt: skip
            _walk(ctx, child, out, field_)
        elif tag == MC + "AlternateContent":
            ctx.warn("DOCX_TEXTBOX", "text box หรือรูปทรงข้ามไป (ข้อความในนั้นไม่ถูกนำเข้า)")
        # w:del, w:moveFrom, w:pPr, bookmarks, comments: nothing on paper


def inline(ctx: Ctx, p: Element) -> list[Segment]:
    out: list[Segment] = []
    _walk(ctx, p, out, {})
    return out


def _wrap(segments: list[Segment]) -> str:
    """Text segments with runs of the same b/i/u joined and wrapped once."""
    out, last, buf = [], None, []
    for _, fmt, text in segments + [("text", None, "")]:  # type: ignore[list-item]
        if fmt != last and buf:
            joined = "".join(buf)
            for flag, tag in zip(last, ("b", "i", "u"), strict=True):
                if flag and joined.strip():
                    joined = f"<{tag}>{joined}</{tag}>"
            out.append(joined)
            buf = []
        last = fmt
        buf.append(text)
    return "".join(out)


def text_of(segments: list[Segment]) -> str:
    return _wrap([s for s in segments if s[0] == "text"])


def _has_text(html_text: str) -> bool:
    return bool(re.sub(r"<br>|&emsp;|\s", "", html_text))


def paragraph(ctx: Ctx, p: Element) -> list[str]:
    """One Word paragraph -> blocks; "" stands for an empty line (a run of them becomes one space block)."""
    ctx.paragraph += 1
    ppr = p.find(w("pPr"))
    sid = val(ppr.find(w("pStyle"))) if ppr is not None else None
    segments = inline(ctx, p)
    blocks: list[str] = []
    if ppr is not None and on(ppr.find(w("pageBreakBefore"))):
        blocks.append('<div data-jd="page-break" style="break-after: page"></div>')

    style: list[str] = []
    before, after = ctx.styles.spacing(sid)
    sp = ppr.find(w("spacing")) if ppr is not None else None
    before, after = (
        (val(sp, "before") or before, val(sp, "after") or after) if sp is not None else (before, after)
    )
    style.append(f"margin-top: {css_mm(twips_mm(before, Decimal(0)))}")
    style.append(f"margin-bottom: {css_mm(twips_mm(after, Decimal(0)))}")
    jc = (val(ppr.find(w("jc"))) if ppr is not None else None) or ctx.styles.alignment(sid)
    align = {
        "center": "center",
        "right": "right",
        "end": "right",
        "both": "justify",
        "distribute": "justify",
    }.get(jc or "")
    if align:
        style.append(f"text-align: {align}")

    prefix = ""
    num = ppr.find(w("numPr")) if ppr is not None else None
    if num is not None and val(num.find(w("numId"))) not in (None, "0"):
        ilvl = int(val(num.find(w("ilvl"))) or 0)
        prefix = ctx.numbering.prefix(val(num.find(w("numId"))) or "", ilvl)
        if ilvl:
            style.append(f"padding-left: {6 * ilvl}mm")

    level = ctx.styles.heading(sid)
    tag = f"h{level}" if level else "p"
    chunk: list[Segment] = []

    def flush() -> None:
        text = text_of(chunk)
        if _has_text(text):
            blocks.append(f'<{tag} style="{"; ".join(style)}">{esc(prefix) if prefix else ""}{text}</{tag}>')
        chunk.clear()

    for seg in segments:
        if seg[0] == "img":
            flush()
            img = seg[2]
            if align in ("center", "right"):
                margins = (
                    "margin-left: auto; margin-right: auto" if align == "center" else "margin-left: auto"
                )
                img = img.replace('style="', f'style="display: block; {margins}; ', 1)
            blocks.append(img)
        elif seg[0] == "page":
            flush()
            blocks.append('<div data-jd="page-break" style="break-after: page"></div>')
        else:
            chunk.append(seg)
    flush()
    return blocks or [""]


def space(lines: int) -> str:
    return f'<div data-jd="space" style="height: {LINE_MM * lines}mm"></div>'


def blocks(ctx: Ctx, container: Element) -> list[str]:
    """The block-level content of a body, header, footer or table cell, in order."""
    out: list[str] = []
    empty = 0

    def flush_empty() -> None:
        nonlocal empty
        if empty:
            out.append(space(empty))
            empty = 0

    for el in container:
        if el.tag == w("p"):
            for block in paragraph(ctx, el):
                if block:
                    flush_empty()
                    out.append(block)
                else:
                    empty += 1
        elif el.tag == w("tbl"):
            from .table import table

            flush_empty()
            out.append(table(ctx, el))
        elif el.tag in (w("sdt"), w("customXml")):
            content = el.find(w("sdtContent")) if el.tag == w("sdt") else el
            if content is not None:
                flush_empty()
                out.extend(blocks(ctx, content))
    flush_empty()
    return out
