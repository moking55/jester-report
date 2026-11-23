"""Word tables -> the Designer's fixed table (SPEC-template-store.md v1.15 "การแปลง").

The markup is what the Designer itself writes for a fixed table: data-jd="grid", column widths as
`width: N%` on the first row's cells, borders as `border: 1px solid #000` per cell. A vertical merge
(rowspan) is not part of that block, so such a table opens as Custom Code in the Designer, but prints
the same.
"""

from __future__ import annotations

from decimal import Decimal
from xml.etree.ElementTree import Element

from .body import Ctx, esc, inline, on, text_of, val, w

CELL_PADDING = "padding: 1mm 2mm"
BORDER = "border: 1px solid #000"
ALIGN = {"center": "center", "right": "right", "end": "right", "both": "justify"}


def _bordered(borders: Element | None) -> bool | None:
    """True/False when the element says, None when it says nothing."""
    if borders is None or not len(borders):
        return None
    return any((val(b) or "nil") not in ("nil", "none") for b in borders)


def _cell(ctx: Ctx, tc: Element) -> tuple[str, str | None]:
    """The cell's inline HTML and the alignment of its first paragraph."""
    lines: list[str] = []
    align = None
    for el in tc:
        if el.tag == w("p"):
            ctx.paragraph += 1
            if align is None:
                align = ALIGN.get(val(el.find(f"{w('pPr')}/{w('jc')}")) or "", "")
            segments = inline(ctx, el)
            lines.append(text_of(segments) + "".join(s[2] for s in segments if s[0] == "img"))
        elif el.tag == w("tbl"):
            ctx.warn("DOCX_NESTED_TABLE", "ตารางซ้อนในตาราง: เก็บแค่ข้อความ")
            lines.append(esc(" ".join(t.text or "" for t in el.iter(w("t"))).strip()))
    while lines and not lines[-1].strip():
        lines.pop()
    return "<br>".join(lines), align or None


def table(ctx: Ctx, tbl: Element) -> str:
    tblpr = tbl.find(w("tblPr"))
    direct = _bordered(tblpr.find(w("tblBorders"))) if tblpr is not None else None
    style_id = val(tblpr.find(w("tblStyle"))) if tblpr is not None else None
    table_borders = direct if direct is not None else ctx.styles.table_borders(style_id)
    grid = [Decimal(val(c, "w") or 0) for c in tbl.findall(f"{w('tblGrid')}/{w('gridCol')}")]
    total = sum(grid) or Decimal(1)

    rows: list[tuple[bool, list[dict]]] = []
    merging: dict[int, dict] = {}  # grid column -> the cell a vertical merge is growing
    for i, tr in enumerate(tbl.findall(w("tr"))):
        trpr = tr.find(w("trPr"))
        head = i == 0 and trpr is not None and on(trpr.find(w("tblHeader")))
        col = int(val(trpr.find(w("gridBefore"))) or 0) if trpr is not None else 0
        cells: list[dict] = []
        for tc in tr.findall(w("tc")):
            tcpr = tc.find(w("tcPr"))
            span = int(val(tcpr.find(w("gridSpan"))) or 1) if tcpr is not None else 1
            vmerge = tcpr.find(w("vMerge")) if tcpr is not None else None
            if vmerge is not None and val(vmerge) != "restart" and col in merging:
                merging[col]["rowspan"] += 1
                col += span
                continue
            content, align = _cell(ctx, tc)
            cell = {"tc": tc, "col": col, "span": span, "rowspan": 1, "content": content, "align": align}
            if vmerge is not None:
                merging[col] = cell
            else:
                merging.pop(col, None)
            cells.append(cell)
            col += span
        rows.append((head, cells))

    out = ['<table data-jd="grid" style="width: 100%; border-collapse: collapse">']
    for r, (head, cells) in enumerate(rows):
        tag = "th" if head else "td"
        html_cells = []
        for c in cells:
            tcpr = c["tc"].find(w("tcPr"))
            own = _bordered(tcpr.find(w("tcBorders"))) if tcpr is not None else None
            style = [BORDER, CELL_PADDING] if (own if own is not None else table_borders) else [CELL_PADDING]
            fill = val(tcpr.find(w("shd")), "fill") if tcpr is not None else None
            if fill and fill.lower() != "auto":
                style.append(f"background-color: #{fill.upper()}")
            if c["align"]:
                style.append(f"text-align: {c['align']}")
            if r == 0 and grid:
                width = sum(grid[c["col"] : c["col"] + c["span"]]) * 100 / total
                style.append(f"width: {format(width.quantize(Decimal('0.1')).normalize(), 'f')}%")
            attrs = f' colspan="{c["span"]}"' if c["span"] > 1 else ""
            attrs += f' rowspan="{c["rowspan"]}"' if c["rowspan"] > 1 else ""
            html_cells.append(f'<{tag}{attrs} style="{"; ".join(style)}">{c["content"] or "&nbsp;"}</{tag}>')
        out.append(f"  <tr>{''.join(html_cells)}</tr>")
    out.append("</table>")
    return "\n".join(out)
