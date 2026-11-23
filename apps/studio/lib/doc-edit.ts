// Editing template.html in the Document Designer (SPEC-studio.md "v1.7"): every edit replaces ranges of the source
// and leaves every other byte alone, so hand-written HTML around a block survives. Each edit returns the new
// source and the new range of the block it touched (to reselect it after the file is read again).
// Undo is a stack of whole sources: small files, exact bytes back.

import { readBlocks, type Block, type BlockList, type GridCell, type Rect } from "./doc-blocks";
import type { ElementNode, Node, Range } from "./doc-parse";

export type Edited = { src: string; at: Range | null };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Patch = Range & { text: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

/** Apply patches (non-overlapping) from the end backwards so earlier offsets stay valid. */
export function applyPatches(src: string, patches: Patch[]): string {
  return [...patches]
    .sort((a, b) => b.start - a.start)
    .reduce((s, p) => s.slice(0, p.start) + p.text + s.slice(p.end), src);
}

/** How far a range moves after patches that end at or before its start. */
const shift = (patches: Patch[], at: number) =>
  patches.filter((p) => p.end <= at).reduce((d, p) => d + p.text.length - (p.end - p.start), 0);

// ---- layout helpers --------------------------------------------------------------------------------

const lineStart = (src: string, at: number) => src.lastIndexOf("\n", at - 1) + 1;
const indentAt = (src: string, at: number) => /^[ \t]*/.exec(src.slice(lineStart(src, at)))![0];

/** Indent every line after the first of a multi-line snippet. */
const indentRest = (html: string, indent: string) => html.replace(/\n/g, `\n${indent}`);

/** Move a block's text to another indent: lines after the first lose the old indent and gain the new one. */
function reindent(text: string, from: string, to: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? line : to + (line.startsWith(from) ? line.slice(from.length) : line.replace(/^[ \t]*/, ""))))
    .join("\n");
}

/** The indent new blocks get in a list: its own, or one step deeper than its container's line when empty. */
function listIndent(src: string, list: BlockList): string {
  if (list.items.length) return list.indent;
  return `${indentAt(src, list.range.start)}  `;
}

/** Where a block goes at `index` of `list`, and the text around it. */
function insertion(src: string, list: BlockList, index: number, html: string): Patch & { offset: number } {
  const indent = listIndent(src, list);
  const body = indentRest(html, indent);
  if (list.items.length === 0) {
    const outer = indentAt(src, list.range.start);
    const text = `\n${indent}${body}\n${outer}`;
    // an empty list keeps whatever whitespace it had; replace it so the result is tidy
    return { start: list.range.start, end: list.range.end, text, offset: 1 + indent.length };
  }
  if (index < list.items.length) {
    const before = list.items[index];
    return { start: before.start, end: before.start, text: `${body}\n${indent}`, offset: 0 };
  }
  const last = list.items[list.items.length - 1];
  return { start: last.end, end: last.end, text: `\n${indent}${body}`, offset: 1 + indent.length };
}

/** The range removing a block takes: the block and the line break + indent in front of it (if it starts its line). */
function removal(src: string, block: Range): Range {
  const ls = lineStart(src, block.start);
  if (src.slice(ls, block.start).trim() !== "") return block; // shares its line with something before it
  if (ls > 0) return { start: ls - 1, end: block.end };
  // the first line of the file: take the line break after it instead
  const after = /^[ \t]*\n/.exec(src.slice(block.end));
  return after ? { start: ls, end: block.end + after[0].length } : { start: ls, end: block.end };
}

// ---- edits -----------------------------------------------------------------------------------------

export function insertBlock(src: string, list: BlockList, index: number, html: string): Edited {
  const p = insertion(src, list, Math.max(0, Math.min(index, list.items.length)), html);
  const out = applyPatches(src, [p]);
  const start = p.start + p.offset;
  return { src: out, at: { start, end: start + indentRest(html, listIndent(src, list)).length } };
}

export function removeBlock(src: string, block: Block): Edited {
  const r = removal(src, block);
  return { src: applyPatches(src, [{ ...r, text: "" }]), at: null };
}

/** Move a block to `index` of `list` (index counts the list without the moved block when it is the same list). */
export function moveBlock(src: string, block: Block, list: BlockList, index: number): Result<Edited> {
  if (block.start <= list.range.start && list.range.end <= block.end) return fail("ย้ายเข้าไปในตัวเองไม่ได้");
  const text = reindent(src.slice(block.start, block.end), indentAt(src, block.start), listIndent(src, list));
  const others = list.items.filter((b) => b.start !== block.start);
  const now = list.items.findIndex((b) => b.start === block.start);
  if (now >= 0 && now === Math.max(0, Math.min(index, others.length))) return ok({ src, at: { start: block.start, end: block.end } }); // dropped where it was
  const target: BlockList = { ...list, items: others };
  const at = Math.max(0, Math.min(index, others.length));
  const ins = insertion(src, target, at, text);
  // in a list that only held the moved block, the empty-list form would swallow the block itself
  if (others.length === 0 && list.items.length === 1) return ok({ src, at: { start: block.start, end: block.end } });
  const rem = { ...removal(src, block), text: "" };
  if (ins.start < rem.end && ins.end > rem.start) return ok({ src, at: { start: block.start, end: block.end } }); // dropped where it was
  const out = applyPatches(src, [rem, ins]);
  const start = ins.start + ins.offset + shift([rem], ins.start);
  return ok({ src: out, at: { start, end: start + text.length } });
}

/** Replace a range (text content, a cell, an expression) and report the block's new range. */
export function replaceIn(src: string, block: Range, range: Range, text: string): Edited {
  return {
    src: applyPatches(src, [{ ...range, text }]),
    at: { start: block.start, end: block.end + text.length - (range.end - range.start) },
  };
}

// ---- style ----------------------------------------------------------------------------------------

/** The properties the style panel edits (SPEC v1.7); others in style="" stay as written, in order. */
export const STYLE_KEYS = [
  "font-size",
  "font-weight",
  "text-align",
  "color",
  "margin-top",
  "margin-bottom",
  "width",
  "height",
  "border",
  "border-collapse",
  "display",
  "gap",
  "flex",
] as const;

/** style="" as ordered declarations. */
export function readStyle(value: string): [string, string][] {
  return value
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(":");
      return (i < 0 ? [d, ""] : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]) as [string, string];
    });
}

const writeStyle = (decls: [string, string][]) => decls.map(([k, v]) => `${k}: ${v}`).join("; ");

/** Set or clear (null) style properties of a block's element. */
export function setStyle(src: string, block: Block, props: Record<string, string | null>): Result<Edited> {
  if (!block.style || block.node.kind !== "element") return fail("บล็อกนี้ไม่มีสไตล์ให้แก้");
  if (block.style.readOnly) return fail("สไตล์นี้มี Jinja อยู่ แก้ได้ใน HTML เท่านั้น");
  const range = block.style.range;
  const decls = range ? readStyle(src.slice(range.start, range.end)) : [];
  for (const [k, v] of Object.entries(props)) {
    const i = decls.findIndex(([name]) => name === k);
    if (v === null || v === "") {
      if (i >= 0) decls.splice(i, 1);
    } else if (/[;"<>{}]/.test(v)) return fail(`ค่า ${k} ไม่ถูกต้อง`);
    else if (i >= 0) decls[i] = [k, v];
    else decls.push([k, v]);
  }
  const value = writeStyle(decls);
  if (range) return ok(replaceIn(src, block, range, value));
  if (!value) return ok({ src, at: { start: block.start, end: block.end } });
  // no style attribute yet: add one before the end of the open tag
  const open = block.node.open;
  const end = src.slice(open.start, open.end).endsWith("/>") ? open.end - 2 : open.end - 1;
  const lead = src[end - 1] === " " ? "" : " ";
  return ok(replaceIn(src, block, { start: end, end }, `${lead}style="${value}"`));
}

/** A patch that sets or clears (null) style properties on any element (cells, columns); a string is the reason it cannot. */
export function stylePatch(src: string, el: ElementNode, props: Record<string, string | null>): Patch | string {
  const attr = el.attrs.find((a) => a.name === "style");
  const value0 = attr?.value ?? "";
  if (value0.includes("{{") || value0.includes("{%")) return "สไตล์นี้มี Jinja อยู่ แก้ได้ใน HTML เท่านั้น";
  const decls = readStyle(value0);
  for (const [k, v] of Object.entries(props)) {
    const i = decls.findIndex(([name]) => name === k);
    if (v === null || v === "") {
      if (i >= 0) decls.splice(i, 1);
    } else if (/[;"<>{}]/.test(v)) return `ค่า ${k} ไม่ถูกต้อง`;
    else if (i >= 0) decls[i] = [k, v];
    else decls.push([k, v]);
  }
  const value = writeStyle(decls);
  if (attr?.valueRange) return { ...attr.valueRange, text: value };
  if (attr) return { ...attr.range, text: value ? `style="${value}"` : "" };
  const end = src.slice(el.open.start, el.open.end).endsWith("/>") ? el.open.end - 2 : el.open.end - 1;
  return value ? { start: end, end, text: `${src[end - 1] === " " ? "" : " "}style="${value}"` } : { start: end, end, text: "" };
}

/** Set an attribute's value on a block's element (img src/width); adds it when missing. */
export function setAttr(src: string, block: Block, name: string, value: string): Result<Edited> {
  if (block.node.kind !== "element") return fail("บล็อกนี้ไม่ใช่ element");
  if (/["<>]/.test(value)) return fail(`ค่า ${name} ไม่ถูกต้อง`);
  const a = block.node.attrs.find((x) => x.name === name);
  if (a?.valueRange) return ok(replaceIn(src, block, a.valueRange, value));
  if (a) return ok(replaceIn(src, block, a.range, `${name}="${value}"`));
  const open = block.node.open;
  const end = src.slice(open.start, open.end).endsWith("/>") ? open.end - 2 : open.end - 1;
  const lead = src[end - 1] === " " ? "" : " ";
  return ok(replaceIn(src, block, { start: end, end }, `${lead}${name}="${value}"`));
}

// ---- Jinja tags -----------------------------------------------------------------------------------

/** Replace what follows the keyword inside a {% … %} tag, keeping its delimiters and whitespace control. */
export function setTagArgs(src: string, block: Range, tag: Range, keyword: string, args: string): Result<Edited> {
  const text = src.slice(tag.start, tag.end);
  const m = /^(\{%[-+]?\s*)(\w+)(\s*)([\s\S]*?)(\s*[-+]?%\})$/.exec(text);
  if (!m || m[2] !== keyword) return fail("แท็กไม่ตรงรูปแบบ");
  if (/%\}|\{%/.test(args)) return fail("ห้ามมี {% หรือ %} ในเงื่อนไข");
  const next = `${m[1]}${keyword} ${args.trim()} ${m[5].trimStart()}`;
  return ok(replaceIn(src, block, tag, next));
}

/** A condition's branches as source: add an {% elif %} or {% else %} before the end tag. */
export function addBranch(src: string, block: Block, keyword: "elif" | "else", test = ""): Result<Edited> {
  const loop = block.kind === "repeat" && keyword === "else"; // a loop's "ถ้าไม่มีแถว"
  if ((block.kind !== "condition" && !loop) || block.node.kind !== "block" || !block.node.close) return fail("ไม่ใช่บล็อกเงื่อนไข");
  if (block.node.branches.some((b) => b.tag.keyword === "else")) {
    if (keyword === "else") return fail("มี \"ไม่เช่นนั้น\" แล้ว");
  }
  const indent = indentAt(src, block.start);
  const tag = keyword === "else" ? "{% else %}" : `{% elif ${test.trim() || "true"} %}`;
  // elif goes before an existing else; else goes before the end tag
  const elseBranch = block.node.branches.find((b) => b.tag.keyword === "else");
  const at = keyword === "elif" && elseBranch ? elseBranch.tag.start : block.node.close.start;
  const before = src.slice(lineStart(src, at), at).trim() === "" ? "" : `\n${indent}`;
  return ok(replaceIn(src, block, { start: at, end: at }, `${before}${tag}\n${indent}`));
}

// ---- tables ---------------------------------------------------------------------------------------

const colspanOf = (src: string, cell: Range) => Number(/\bcolspan\s*=\s*["']?(\d+)/.exec(src.slice(cell.start, cell.end))?.[1] ?? 1);

/** A footer/empty row's cell that spans column `col` (counting colspans), or null. */
function spanning(src: string, row: { range: Range }[], col: number): { cell: Range; span: number } | null {
  let at = 0;
  for (const c of row) {
    const span = colspanOf(src, c.range);
    if (col >= at && col < at + span) return { cell: c.range, span };
    at += span;
  }
  return null;
}

function setColspan(src: string, cell: Range, span: number): Patch {
  const text = src.slice(cell.start, cell.end);
  const m = /\bcolspan\s*=\s*(["']?)\d+\1/.exec(text);
  if (m) {
    const s = cell.start + m.index;
    return span <= 1
      ? { start: s - (text[m.index - 1] === " " ? 1 : 0), end: s + m[0].length, text: "" }
      : { start: s, end: s + m[0].length, text: `colspan="${span}"` };
  }
  const tagEnd = cell.start + text.indexOf(">");
  return { start: tagEnd, end: tagEnd, text: ` colspan="${span}"` };
}

/** Add a column after `after` (-1 = first): a header cell, a loop cell, and room in the else/footer rows. */
export function addColumn(src: string, block: Block, after: number, head: string, cell: string): Result<Edited> {
  if (block.detail.kind !== "table") return fail("ไม่ใช่ตาราง");
  const d = block.detail;
  const patches: Patch[] = [];
  const put = (cells: { range: Range }[], html: string) => {
    const ref = after < 0 ? cells[0] : cells[Math.min(after, cells.length - 1)];
    patches.push(after < 0 ? { start: ref.range.start, end: ref.range.start, text: html } : { start: ref.range.end, end: ref.range.end, text: html });
  };
  if (d.head) put(d.head, `<th>${head}</th>`);
  put(d.cells, `<td>${cell}</td>`);
  for (const row of [...(d.emptyRow ? [d.emptyRow] : []), ...(d.blankRows ? [d.blankRows.cells] : []), ...d.footer]) {
    const s = spanning(src, row, Math.max(0, after));
    if (s && s.span > 1) patches.push(setColspan(src, s.cell, s.span + 1));
    else put(row, "<td></td>");
  }
  const out = applyPatches(src, patches);
  return ok({ src: out, at: { start: block.start, end: block.end + out.length - src.length } });
}

/** Remove column `col` from the header, loop row, and the else/footer rows (shrinking a colspan). */
export function removeColumn(src: string, block: Block, col: number): Result<Edited> {
  if (block.detail.kind !== "table") return fail("ไม่ใช่ตาราง");
  const d = block.detail;
  if (d.cells.length <= 1) return fail("ตารางต้องมีอย่างน้อย 1 คอลัมน์");
  const patches: Patch[] = [];
  const drop = (cells: { range: Range }[], i: number) => patches.push({ ...cells[i].range, text: "" });
  if (d.head) drop(d.head, col);
  drop(d.cells, col);
  for (const row of [...(d.emptyRow ? [d.emptyRow] : []), ...(d.blankRows ? [d.blankRows.cells] : []), ...d.footer]) {
    const s = spanning(src, row, col);
    if (!s) continue;
    if (s.span > 1) patches.push(setColspan(src, s.cell, s.span - 1));
    else patches.push({ ...s.cell, text: "" });
  }
  const out = applyPatches(src, patches);
  return ok({ src: out, at: { start: block.start, end: block.end + out.length - src.length } });
}

/** Swap columns `col` and `col + dir` in the header and loop row (else/footer rows keep their layout). */
export function moveColumn(src: string, block: Block, col: number, dir: -1 | 1): Result<Edited> {
  if (block.detail.kind !== "table") return fail("ไม่ใช่ตาราง");
  const d = block.detail;
  const other = col + dir;
  if (other < 0 || other >= d.cells.length) return fail("ย้ายต่อไม่ได้");
  const swap = (cells: { range: Range }[]): Patch[] => [
    { ...cells[col].range, text: src.slice(cells[other].range.start, cells[other].range.end) },
    { ...cells[other].range, text: src.slice(cells[col].range.start, cells[col].range.end) },
  ];
  const out = applyPatches(src, [...(d.head ? swap(d.head) : []), ...swap(d.cells)]);
  return ok({ src: out, at: { start: block.start, end: block.end + out.length - src.length } });
}

// ---- rows (SPEC v1.7 รอบแก้ข้อ 4) -------------------------------------------------------------------

type Col = { el: Range & { open: Range; close: Range | null }; inner: Range; style: Range | null; hasStyle: boolean; flex: number };

/** A row's columns: their ranges, inner ranges, style values and flex shares (1 when not written). */
function columnsOf(src: string, block: Block): Col[] | null {
  if (block.kind !== "row" || block.node.kind !== "element") return null;
  return block.node.children.flatMap((c) => {
    if (c.kind !== "element") return [];
    const style = c.attrs.find((a) => a.name === "style");
    const flex = Number(/(?:^|;)\s*flex\s*:\s*([\d.]+)/.exec(style?.value ?? "")?.[1] ?? 1);
    return [
      {
        el: { start: c.start, end: c.end, open: c.open, close: c.close },
        inner: { start: c.open.end, end: c.close ? c.close.start : c.end },
        style: style?.valueRange ?? null,
        hasStyle: !!style,
        flex: Number.isFinite(flex) && flex > 0 ? flex : 1,
      },
    ];
  });
}

/** The col's style with its flex share set (kept as written otherwise). */
function flexPatch(src: string, col: Col, flex: number): Patch {
  const value = `${+flex.toFixed(2)}`;
  if (col.style) {
    const text = src.slice(col.style.start, col.style.end);
    const m = /((?:^|;)\s*flex\s*:\s*)([\d.]+)/.exec(text);
    if (m) {
      const at = col.style.start + m.index + m[1].length;
      return { start: at, end: at + m[2].length, text: value };
    }
    const sep = text.trim() === "" || text.trim().endsWith(";") ? "" : "; ";
    return { start: col.style.end, end: col.style.end, text: `${sep}flex: ${value}` };
  }
  const end = col.el.open.end - 1;
  return { start: end, end, text: ` style="flex: ${value}"` };
}

const rowEdit = (src: string, block: Block, patches: Patch[]): Edited => {
  const out = applyPatches(src, patches);
  return { src: out, at: { start: block.start, end: block.end + out.length - src.length } };
};

/** One more column at the end of a row (at most 4), as wide as one share. */
export function addRowColumn(src: string, block: Block): Result<Edited> {
  const cols = columnsOf(src, block);
  if (!cols) return fail("ไม่ใช่แถวแบ่งคอลัมน์");
  if (cols.length >= 4) return fail("แถวมีได้ไม่เกิน 4 คอลัมน์");
  const last = cols[cols.length - 1];
  const indent = indentAt(src, last.el.start);
  return ok(rowEdit(src, block, [{ start: last.el.end, end: last.el.end, text: `\n${indent}<div data-jd="col" style="flex: 1"></div>` }]));
}

/** Set a column's share of the row's width. */
export function setColumnFlex(src: string, block: Block, col: number, flex: number): Result<Edited> {
  const cols = columnsOf(src, block);
  if (!cols?.[col]) return fail("ไม่มีคอลัมน์นี้");
  if (!(flex > 0 && flex <= 12)) return fail("สัดส่วนต้องอยู่ระหว่าง 0.1–12");
  return ok(rowEdit(src, block, [flexPatch(src, cols[col], flex)]));
}

/** The blocks of column `col + 1` move to the end of column `col`, their shares add up, the right column goes. */
export function mergeColumns(src: string, block: Block, col: number): Result<Edited> {
  const cols = columnsOf(src, block);
  if (!cols) return fail("ไม่ใช่แถวแบ่งคอลัมน์");
  const [a, b] = [cols[col], cols[col + 1]];
  if (!a || !b) return fail("ไม่มีคอลัมน์ทางขวาให้รวม");
  if (cols.length <= 2) return fail("แถวต้องมีอย่างน้อย 2 คอลัมน์ (ยกเลิกแถวแทน)");
  const moved = src.slice(b.inner.start, b.inner.end).trim();
  const patches: Patch[] = [flexPatch(src, a, a.flex + b.flex), { start: a.el.end, end: b.el.end, text: "" }];
  if (moved) {
    const own = src.slice(a.inner.start, a.inner.end);
    const indent = `${indentAt(src, a.el.start)}  `;
    const body = reindent(moved, indentAt(src, b.inner.start + (src.slice(b.inner.start, b.inner.end).length - src.slice(b.inner.start, b.inner.end).trimStart().length)), indent);
    const trail = own.length - own.trimEnd().length;
    const at = a.inner.end - trail;
    patches.push(
      own.trim()
        ? { start: at, end: at, text: `\n${indent}${body}` }
        : { start: a.inner.start, end: a.inner.end, text: `\n${indent}${body}\n${indentAt(src, a.el.start)}` },
    );
  }
  return ok(rowEdit(src, block, patches));
}

/** The row goes; the blocks of its columns stay where it was, one after another. */
export function unwrapRow(src: string, block: Block): Result<Edited> {
  const cols = columnsOf(src, block);
  if (!cols) return fail("ไม่ใช่แถวแบ่งคอลัมน์");
  const indent = indentAt(src, block.start);
  const parts = cols
    .map((c) => {
      const text = src.slice(c.inner.start, c.inner.end);
      const lead = text.length - text.trimStart().length;
      return text.trim() ? reindent(text.trim(), indentAt(src, c.inner.start + lead), indent) : "";
    })
    .filter(Boolean);
  const text = parts.join(`\n${indent}`);
  const out = applyPatches(src, [{ start: block.start, end: block.end, text }]);
  return ok({ src: out, at: { start: block.start, end: block.start + text.length } });
}

// ---- fixed tables: <table data-jd="grid"> (SPEC v1.7 รอบแก้ข้อ 7) --------------------------------------

export const GRID_CELL_STYLE = "border: 1px solid #000; padding: 1mm 2mm";

const gridOf = (block: Block) => (block.detail.kind === "grid" ? block.detail : null);
/** A cell's open tag as written, under another tag name; and its close tag. */
const openAs = (src: string, c: GridCell, name: string) => src.slice(c.node.open.start, c.node.open.end).replace(/^<\w+/, `<${name}`);
const tableEdit = (src: string, block: Block, patches: Patch[]): Result<Edited> => {
  const out = applyPatches(src, patches);
  return ok({ src: out, at: { start: block.start, end: block.end + out.length - src.length } });
};

/** A row of empty cells after row `after` (-1: at the end; with `top`, -1 is before the first row), shaped like the body rows. */
export function gridAddRow(src: string, block: Block, after = -1, top = false): Result<Edited> {
  const g = gridOf(block);
  if (!g) return fail("ไม่ใช่ตารางเปล่า");
  if (top && after < 0) {
    const first = g.rows[0];
    const cells = first.cells.map((c) => `${openAs(src, c, "td")}&nbsp;</td>`).join("");
    return tableEdit(src, block, [{ start: first.range.start, end: first.range.start, text: `<tr>${cells}</tr>\n${indentAt(src, first.range.start)}` }]);
  }
  const at = after < 0 ? g.rows.length - 1 : Math.min(after, g.rows.length - 1);
  const model = g.rows[g.head && g.rows.length > 1 ? Math.max(1, at) : at];
  const cells = model.cells.map((c) => `${openAs(src, c, "td")}&nbsp;</td>`).join("");
  const end = g.rows[at].range.end;
  return tableEdit(src, block, [{ start: end, end, text: `\n${indentAt(src, g.rows[at].range.start)}<tr>${cells}</tr>` }]);
}

export function gridRemoveRow(src: string, block: Block, row: number): Result<Edited> {
  const g = gridOf(block);
  if (!g?.rows[row]) return fail("ไม่มีแถวนี้");
  if (g.rows.length <= 1) return fail("ตารางต้องมีอย่างน้อย 1 แถว");
  return tableEdit(src, block, [{ ...removal(src, g.rows[row].range), text: "" }]);
}

const spanOf = (c: GridCell) => c.span ?? 1;

/** The cell of a fixed table's row that covers column `col` (counting spans), its index and the column it starts at. */
export function gridCellAt(row: { cells: GridCell[] }, col: number): { cell: GridCell; index: number; start: number } | null {
  let at = 0;
  for (const [index, cell] of row.cells.entries()) {
    if (col >= at && col < at + spanOf(cell)) return { cell, index, start: at };
    at += spanOf(cell);
  }
  return null;
}

const emptyLike = (src: string, c: GridCell) => `${openAs(src, c, c.node.name).replace(/\s+colspan\s*=\s*(["']?)\d+\1/i, "")}&nbsp;</${c.node.name}>`;

/** An empty column at column `at` (0 … cols): a cell that spans across that place grows by one instead. */
export function gridInsertColumn(src: string, block: Block, at: number): Result<Edited> {
  const g = gridOf(block);
  if (!g || at < 0 || at > g.cols) return fail("ไม่มีคอลัมน์นี้");
  return tableEdit(
    src,
    block,
    g.rows.map((r) => {
      if (at === g.cols) {
        const last = r.cells[r.cells.length - 1];
        return { start: last.range.end, end: last.range.end, text: emptyLike(src, last) };
      }
      const hit = gridCellAt(r, at)!;
      if (hit.start === at) return { start: hit.cell.range.start, end: hit.cell.range.start, text: emptyLike(src, hit.cell) };
      return setColspan(src, hit.cell.range, spanOf(hit.cell) + 1);
    }),
  );
}

/** An empty column after column `after` (-1: at the end). */
export function gridAddColumn(src: string, block: Block, after = -1): Result<Edited> {
  const g = gridOf(block);
  if (!g) return fail("ไม่ใช่ตารางเปล่า");
  return gridInsertColumn(src, block, after < 0 ? g.cols : Math.min(after + 1, g.cols));
}

/** Column `col` out: a cell spanning it gets one narrower. */
export function gridRemoveColumn(src: string, block: Block, col: number): Result<Edited> {
  const g = gridOf(block);
  if (!g || col < 0 || col >= g.cols) return fail("ไม่มีคอลัมน์นี้");
  if (g.cols <= 1) return fail("ตารางต้องมีอย่างน้อย 1 คอลัมน์");
  return tableEdit(
    src,
    block,
    g.rows.map((r) => {
      const hit = gridCellAt(r, col)!;
      return spanOf(hit.cell) > 1 ? setColspan(src, hit.cell.range, spanOf(hit.cell) - 1) : { ...hit.cell.range, text: "" };
    }),
  );
}

/** Whether column `col` can trade places with its neighbour: in every row both are cells of their own. */
export function gridCanMoveColumn(block: Block, col: number, dir: -1 | 1): boolean {
  const g = gridOf(block);
  const other = col + dir;
  if (!g || other < 0 || other >= g.cols) return false;
  return g.rows.every((r) => spanOf(gridCellAt(r, col)!.cell) === 1 && spanOf(gridCellAt(r, other)!.cell) === 1);
}

export function gridMoveColumn(src: string, block: Block, col: number, dir: -1 | 1): Result<Edited> {
  const g = gridOf(block);
  if (!g || !gridCanMoveColumn(block, col, dir)) return fail("ย้ายต่อไม่ได้ (คอลัมน์คร่อมช่องที่รวมอยู่)");
  const text = (c: GridCell) => src.slice(c.range.start, c.range.end);
  return tableEdit(
    src,
    block,
    g.rows.flatMap((r) => {
      const a = gridCellAt(r, col)!.cell;
      const b = gridCellAt(r, col + dir)!.cell;
      return [
        { ...a.range, text: text(b) },
        { ...b.range, text: text(a) },
      ];
    }),
  );
}

/** The cell at (row, col) and the one on its right become one cell spanning both; their texts join with a space. */
export function gridMergeRight(src: string, block: Block, row: number, col: number): Result<Edited> {
  const g = gridOf(block);
  const r = g?.rows[row];
  const hit = r ? gridCellAt(r, col) : null;
  const next = hit && r ? r.cells[hit.index + 1] : null;
  if (!hit || !next) return fail("ไม่มีช่องทางขวาให้รวม");
  const textOf = (c: GridCell) => src.slice(c.inner.start, c.inner.end);
  const blank = (t: string) => !t.replace(/&nbsp;|\s/g, "");
  const joined = [textOf(hit.cell), textOf(next)].filter((t) => !blank(t)).join(" ") || "&nbsp;";
  const open = setColspan(src, { start: hit.cell.node.open.start, end: hit.cell.node.open.end }, spanOf(hit.cell) + spanOf(next));
  return tableEdit(src, block, [open, { ...hit.cell.inner, text: joined }, { start: hit.cell.range.end, end: next.range.end, text: "" }]);
}

/** A cell that spans columns back to one cell per column (the new ones empty). */
export function gridSplit(src: string, block: Block, row: number, col: number): Result<Edited> {
  const g = gridOf(block);
  const r = g?.rows[row];
  const hit = r ? gridCellAt(r, col) : null;
  if (!hit || spanOf(hit.cell) < 2) return fail("ช่องนี้ไม่ได้รวมอยู่");
  const more = Array.from({ length: spanOf(hit.cell) - 1 }, () => emptyLike(src, hit.cell)).join("");
  return tableEdit(src, block, [
    setColspan(src, { start: hit.cell.node.open.start, end: hit.cell.node.open.end }, 1),
    { start: hit.cell.range.end, end: hit.cell.range.end, text: more },
  ]);
}

/** The first row as header cells (<th>) or back to <td>. */
export function gridHeader(src: string, block: Block, on: boolean): Result<Edited> {
  const g = gridOf(block);
  if (!g) return fail("ไม่ใช่ตารางเปล่า");
  if (g.head === on) return ok({ src, at: { start: block.start, end: block.end } });
  const name = on ? "th" : "td";
  return tableEdit(
    src,
    block,
    g.rows[0].cells.flatMap((c) => {
      const old = c.node.name;
      const patches: Patch[] = [{ start: c.node.open.start + 1, end: c.node.open.start + 1 + old.length, text: name }];
      if (c.node.close) patches.push({ start: c.node.close.start + 2, end: c.node.close.start + 2 + old.length, text: name });
      return patches;
    }),
  );
}

/** Lines around every cell, or none. */
export function gridBorders(src: string, block: Block, on: boolean): Result<Edited> {
  const g = gridOf(block);
  if (!g) return fail("ไม่ใช่ตารางเปล่า");
  const patches: Patch[] = [];
  for (const r of g.rows)
    for (const c of r.cells) {
      const p = stylePatch(src, c.node, { border: on ? "1px solid #000" : null });
      if (typeof p === "string") return fail(p);
      patches.push(p);
    }
  return tableEdit(src, block, patches);
}

// ---- a detail row under every row of a list table (SPEC v1.8 ซ้อนหลายชั้น) ---------------------------------

/** `<tr data-jd="detail"><td colspan="n"></td></tr>` after the row of cells, inside the loop: room for blocks. */
export function addDetailRow(src: string, block: Block): Result<Edited> {
  if (block.detail.kind !== "table" || block.node.kind !== "element") return fail("ไม่ใช่ตารางรายการ");
  if (block.detail.detailRow) return fail("มีแถวรายละเอียดอยู่แล้ว");
  const d = block.detail;
  const colspan = d.cells.length;
  const indent = indentAt(src, d.row.start);
  const text = `
${indent}<tr data-jd="detail"><td colspan="${colspan}"></td></tr>`;
  return tableEdit(src, block, [{ start: d.row.end, end: d.row.end, text }]);
}

/** v1.14: how many empty rows a blank form prints after the list's rows (0 = none: the table is as it was). */
export function setBlankRows(src: string, block: Block, count: number): Result<Edited> {
  if (block.detail.kind !== "table") return fail("ไม่ใช่ตารางรายการ");
  if (!Number.isInteger(count) || count < 0 || count > 100) return fail("จำนวนบรรทัดเปล่าต้องเป็น 0–100");
  const d = block.detail;
  const patches: Patch[] = [];
  if (count === 0) {
    if (!d.blankRows) return ok({ src, at: { start: block.start, end: block.end } });
    patches.push({ ...removal(src, d.blankRows.range), text: "" });
    if (d.emptyGuard) patches.push({ ...d.emptyGuard.range, text: src.slice(d.emptyGuard.row.start, d.emptyGuard.row.end) });
  } else if (d.blankRows) {
    patches.push({ ...d.blankRows.countAt, text: String(count) });
  } else {
    const indent = indentAt(src, d.loopRange.start);
    // one empty cell per loop cell, keeping its attributes so borders and widths match
    const cells = d.cells.map((c) => `${src.slice(c.range.start, c.inner.start)}&nbsp;</td>`).join("");
    const text = `
${indent}{% if meta.blank %}{% for _ in range(${count} - ${d.loop.iterable}|length) %}
${indent}<tr data-jd="blank">${cells}</tr>
${indent}{% endfor %}{% endif %}`;
    patches.push({ start: d.loopRange.end, end: d.loopRange.end, text });
    if (d.emptyRow && !d.emptyGuard) {
      // the "no items" row would sit above the empty rows of a blank form: only a normal form shows it
      const row = { start: d.emptyRow[0].range.start, end: d.emptyRow[d.emptyRow.length - 1].range.end };
      const tr = trAround(src, row);
      if (tr) patches.push({ start: tr.start, end: tr.end, text: `{% if not meta.blank %}${src.slice(tr.start, tr.end)}{% endif %}` });
    }
  }
  const out = applyPatches(src, patches);
  return ok({ src: out, at: { start: block.start, end: block.end + out.length - src.length } });
}

/** The <tr>…</tr> around a run of cells (the else row of a list table). */
function trAround(src: string, cells: Range): Range | null {
  const start = src.lastIndexOf("<tr", cells.start);
  const close = src.indexOf("</tr>", cells.end);
  return start < 0 || close < 0 ? null : { start, end: close + "</tr>".length };
}

/** The detail row goes, with everything in it. */
export function removeDetailRow(src: string, block: Block): Result<Edited> {
  if (block.detail.kind !== "table" || !block.detail.detailRow) return fail("ไม่มีแถวรายละเอียด");
  return tableEdit(src, block, [{ ...removal(src, block.detail.detailRow.range), text: "" }]);
}

// ---- table sizes (SPEC v1.7 รอบแก้ข้อ 8): list tables and fixed tables ---------------------------------

/** The element that starts at `start` inside a node (cells of a list table are found this way). */
function elementAt(node: Node, start: number): ElementNode | null {
  if (node.kind === "element" && node.start === start) return node;
  const kids = node.kind === "element" || node.kind === "root" ? node.children : node.kind === "block" ? node.branches.flatMap((b) => b.children) : [];
  for (const k of kids) {
    if (start < k.start || start >= k.end) continue;
    const hit = elementAt(k, start);
    if (hit) return hit;
  }
  return null;
}

/** The cells that set column widths (the first row) and every cell (for padding), as elements. */
export function tableCells(block: Block): { first: ElementNode[]; all: ElementNode[] } | null {
  const d = block.detail;
  const at = (c: { range: Range }) => elementAt(block.node, c.range.start);
  let first: (ElementNode | null)[];
  let all: (ElementNode | null)[];
  if (d.kind === "grid") {
    first = d.rows[0].cells.map((c) => c.node);
    all = d.rows.flatMap((r) => r.cells.map((c) => c.node));
  } else if (d.kind === "table") {
    first = (d.head ?? d.cells).map(at);
    all = [...(d.head ?? []), ...d.cells, ...(d.emptyRow ?? []), ...d.footer.flat()].map(at);
  } else return null;
  if (first.some((e) => !e) || all.some((e) => !e)) return null;
  return { first: first as ElementNode[], all: all as ElementNode[] };
}

/** A column width as written on the first row (a % number), or null when the table sizes it. */
export function columnWidths(block: Block): (number | null)[] {
  const cells = tableCells(block);
  return (cells?.first ?? []).map((el) => {
    const w = readStyle(el.attrs.find((a) => a.name === "style")?.value ?? "").find(([k]) => k === "width")?.[1] ?? "";
    const m = /^([\d.]+)%$/.exec(w);
    return m ? Number(m[1]) : null;
  });
}

export type TableSizes = { width?: number | null; columns?: (number | null)[]; padding?: number | null };

/** Table width (% of the page), column widths (% each, null = automatic) and cell padding (mm) as inline style. */
export function setTableSizes(src: string, block: Block, sizes: TableSizes): Result<Edited> {
  const cells = tableCells(block);
  if (!cells || block.node.kind !== "element") return fail("ไม่ใช่ตาราง");
  const bad = (v: number | null | undefined, max: number) => v !== null && v !== undefined && !(v > 0 && v <= max);
  if (bad(sizes.width, 100) || sizes.columns?.some((c) => bad(c, 100)) || bad(sizes.padding, 20))
    return fail("ขนาดไม่ถูกต้อง (ความกว้าง 1–100%, ระยะในเซลล์ 0.1–20 mm)");
  const pct = (v: number | null) => (v === null ? null : `${+v.toFixed(1)}%`);
  const patches: Patch[] = [];
  const add = (el: ElementNode, props: Record<string, string | null>) => {
    const p = stylePatch(src, el, props);
    if (typeof p === "string") throw new Error(p);
    patches.push(p);
  };
  try {
    if (sizes.width !== undefined) add(block.node, { width: pct(sizes.width) });
    // one patch per element: a first-row cell may get a width and a padding together
    const own = new Map<ElementNode, Record<string, string | null>>();
    sizes.columns?.forEach((w, i) => cells.first[i] && own.set(cells.first[i], { width: pct(w) }));
    if (sizes.padding !== undefined)
      for (const el of cells.all) own.set(el, { ...(own.get(el) ?? {}), padding: sizes.padding === null ? null : `${sizes.padding}mm` });
    for (const [el, props] of own) add(el, props);
  } catch (e) {
    return fail((e as Error).message);
  }
  return tableEdit(src, block, patches);
}

// ---- new blocks (the designer's own forms, SPEC v1.7 "บล็อก") -----------------------------------

export type NewBlock =
  | { kind: "text" }
  | { kind: "heading" }
  | { kind: "field"; expr: string }
  | { kind: "image"; src: string }
  | { kind: "row"; columns: 2 | 3 | 4 }
  | { kind: "table"; variable: string; iterable: string; columns: { head: string; expr: string }[] }
  | { kind: "summary"; rows: { label: string; expr: string }[] }
  | { kind: "grid"; rows: number; columns: number }
  | { kind: "code"; expr: string }
  | { kind: "rule" }
  | { kind: "space" }
  | { kind: "pagebreak" }
  | { kind: "condition"; test: string }
  | { kind: "repeat"; variable: string; iterable: string }
  | { kind: "set"; name: string; expr: string }
  | { kind: "custom" };

export const NEW_TABLE_BLANK_ROWS = 10; // SPEC-studio v1.14

export function newBlockHtml(b: NewBlock): string {
  switch (b.kind) {
    case "text":
      return '<p style="margin-top: 0mm; margin-bottom: 2mm">ข้อความ</p>'; // the browser gives a <p> 1em above and below; start small
    case "heading":
      return '<h2 style="margin-top: 2mm; margin-bottom: 3mm">หัวข้อ</h2>';
    case "field":
      return `<div>{{ ${b.expr} }}</div>`;
    case "image":
      return `<img src="${b.src}" alt="" style="width: 40mm">`;
    case "row":
      return [
        '<div data-jd="row" style="display: flex; gap: 4mm">',
        ...Array.from({ length: b.columns }, () => '  <div data-jd="col" style="flex: 1"></div>'),
        "</div>",
      ].join("\n");
    case "table":
      return [
        '<table style="width: 100%; border-collapse: collapse">',
        `  <thead><tr>${b.columns.map((c) => `<th>${c.head}</th>`).join("")}</tr></thead>`,
        "  <tbody>",
        `  {% for ${b.variable} in ${b.iterable} %}`,
        `    <tr>${b.columns.map((c) => `<td>{{ ${c.expr} }}</td>`).join("")}</tr>`,
        "  {% endfor %}",
        // v1.14: a new table prints 10 empty rows on a blank form (setBlankRows writes the same form)
        `  {% if meta.blank %}{% for _ in range(${NEW_TABLE_BLANK_ROWS} - ${b.iterable}|length) %}`,
        `  <tr data-jd="blank">${"<td>&nbsp;</td>".repeat(b.columns.length)}</tr>`,
        "  {% endfor %}{% endif %}",
        "  </tbody>",
        "</table>",
      ].join("\n");
    case "summary":
      return [
        '<table data-jd="summary" style="margin-left: auto">',
        ...b.rows.map((r) => `  <tr><td>${r.label}</td><td style="text-align: right">{{ ${r.expr} }}</td></tr>`),
        "</table>",
      ].join("\n");
    case "code":
      return `<div>{{ ${b.expr} }}</div>`;
    case "grid": {
      const cell = `<td style="${GRID_CELL_STYLE}">&nbsp;</td>`;
      return [
        '<table data-jd="grid" style="width: 100%; border-collapse: collapse">',
        ...Array.from({ length: b.rows }, () => `  <tr>${cell.repeat(b.columns)}</tr>`),
        "</table>",
      ].join("\n");
    }
    case "rule":
      return "<hr>";
    case "space":
      return '<div data-jd="space" style="height: 6mm"></div>';
    case "pagebreak":
      return '<div data-jd="page-break" style="break-after: page"></div>';
    case "condition":
      return `{% if ${b.test} %}\n{% endif %}`;
    case "repeat":
      return `{% for ${b.variable} in ${b.iterable} %}\n{% endfor %}`;
    case "set":
      return `{% set ${b.name} = ${b.expr} %}`;
    case "custom":
      return "<div>Custom Code</div>";
  }
}

// ---- history --------------------------------------------------------------------------------------

/** Undo/redo over whole sources (SPEC v1.7: not cleared by a save). */
export type History<T = string> = { past: T[]; now: T; future: T[] };

export const startHistory = <T,>(now: T): History<T> => ({ past: [], now, future: [] });

/** One undo step, unless nothing changed (`same` compares states; strings by value). */
export function record<T>(h: History<T>, next: T, same: (a: T, b: T) => boolean = Object.is): History<T> {
  if (same(next, h.now)) return h;
  return { past: [...h.past, h.now].slice(-200), now: next, future: [] };
}

export const undo = <T,>(h: History<T>): History<T> =>
  h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h;

export const redo = <T,>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h;

// ---- free layout (v1.8): boxes on a sheet, in mm ---------------------------------------------------

/** Millimetres as written in style="": to 0.1 mm, no trailing zero ("12.5mm", "30mm"). */
export const mmText = (n: number) => `${Math.round(n * 10) / 10 + 0}mm`;

const rectStyle = (r: Rect) =>
  `position: absolute; left: ${mmText(r.x)}; top: ${mmText(r.y)}; width: ${mmText(r.w)}; height: ${mmText(r.h)}`;

/** What a free layout can put on the sheet: the blocks that make sense at a spot, a rectangle and a line. */
export type NewBox = NewBlock | { kind: "rect" } | { kind: "line" };

/** A starting size for each kind (mm), used when a drop gives only a point. */
export function boxSize(b: NewBox): { w: number; h: number } {
  switch (b.kind) {
    case "text":
      return { w: 60, h: 8 };
    case "heading":
      return { w: 70, h: 10 };
    case "field":
      return { w: 50, h: 7 };
    case "image":
      return { w: 40, h: 30 };
    case "code":
      return { w: 25, h: 25 };
    case "grid":
      return { w: 80, h: 26 }; // three rows of the fixed table are 23.7 mm tall
    case "rect":
      return { w: 40, h: 20 };
    case "line":
      return { w: 60, h: 0 };
    default:
      return { w: 60, h: 10 };
  }
}

/** The element of a new box: a rect / line itself, otherwise a box around the block. */
export function boxHtml(b: NewBox, r: Rect): string {
  if (b.kind === "rect") return `<div data-jd="rect" style="${rectStyle(r)}; border: 0.3mm solid #000"></div>`;
  if (b.kind === "line") return `<div data-jd="line" style="${rectStyle({ ...r, h: 0 })}; border-top: 0.3mm solid #000"></div>`;
  // a block in a box has no margin of its own: the box is its place
  const inner =
    b.kind === "text"
      ? '<p style="margin-top: 0mm; margin-bottom: 0mm">ข้อความ</p>'
      : b.kind === "heading"
        ? '<h2 style="margin-top: 0mm; margin-bottom: 0mm">หัวข้อ</h2>'
        : b.kind === "image"
          ? `<img src="${b.src}" alt="" style="width: 100%">`
          : newBlockHtml(b);
  return `<div data-jd="box" style="${rectStyle(r)}">\n  ${indentRest(inner, "  ")}\n</div>`;
}

/** Put a new box on the sheet, in front of every other (last in the page). */
export function addBox(src: string, page: Block, b: NewBox, r: Rect): Result<Edited> {
  if (page.kind !== "page") return fail("ไม่ใช่หน้ากระดาษแบบอิสระ");
  const list = page.lists[0].list;
  return ok(insertBlock(src, list, list.items.length, boxHtml(b, r)));
}

/** Set any of a box's place (mm, 0.1). A line keeps its height: it is only a line. */
export function setBoxRect(src: string, block: Block, rect: Partial<Rect>): Result<Edited> {
  const props: Record<string, string | null> = {};
  const put = (key: string, n: number | undefined) => {
    if (n !== undefined && Number.isFinite(n)) props[key] = mmText(n);
  };
  put("left", rect.x);
  put("top", rect.y);
  put("width", rect.w === undefined ? undefined : Math.max(1, rect.w));
  if (block.kind !== "line") put("height", rect.h === undefined ? undefined : Math.max(1, rect.h));
  return setStyle(src, block, props);
}

/** Stack order is document order (later = in front): front, back, one step up or one step down. */
export function moveBoxOrder(src: string, block: Block, page: Block, to: "front" | "back" | "up" | "down"): Result<Edited> {
  const list = page.lists[0]?.list;
  const now = list ? list.items.findIndex((b) => b.start === block.start) : -1;
  if (!list || now < 0) return fail("กล่องนี้ไม่ได้อยู่บนหน้ากระดาษ");
  const last = list.items.length - 1;
  const floor = list.items[0]?.kind === "guide" ? 1 : 0; // the guide picture stays behind every box
  const index = to === "front" ? last : to === "back" ? floor : to === "up" ? now + 1 : now - 1;
  return moveBlock(src, block, list, Math.max(floor, Math.min(index, last)));
}

/** The sheet's own size in template.html (a free layout writes it there too, as the engine's page is that big). */
export function setPageSize(src: string, page: Block, w: number, h: number): Result<Edited> {
  return setStyle(src, page, { width: mmText(w), height: mmText(h) });
}

/** How many boxes reach outside a `w` × `h` mm sheet (a size change leaves them there: they would be cut off). */
export function boxesOutside(page: Block | undefined, w: number, h: number): number {
  const eps = 0.05;
  return (page?.lists[0]?.list.items ?? []).filter((b) => {
    const r = b.rect;
    return r && (r.x < -eps || r.y < -eps || r.x + r.w > w + eps || r.y + r.h > h + eps);
  }).length;
}

/** Put a picture to trace behind the boxes (replacing the one there); `data-jd="guide"` is never printed. */
export function setGuide(src: string, page: Block, name: string, w: number, h: number): Result<Edited> {
  if (page.kind !== "page") return fail("ไม่ใช่หน้ากระดาษแบบอิสระ");
  if (/["<>]/.test(name)) return fail("ชื่อไฟล์ไม่ถูกต้อง");
  const list = page.lists[0].list;
  const html = `<img data-jd="guide" src="${name}" alt="" style="position: absolute; left: 0mm; top: 0mm; width: ${mmText(w)}; height: ${mmText(h)}; opacity: 0.3">`;
  const old = list.items.find((b) => b.kind === "guide");
  const base = old ? removeBlock(src, old).src : src;
  const fresh = readBlocks(base).items.find((b) => b.kind === "page");
  if (!fresh) return fail("ไม่พบหน้ากระดาษ");
  return ok({ src: insertBlock(base, fresh.lists[0].list, 0, html).src, at: null }); // nothing to select: the guide is not a box
}

// ---- lists (v1.9) ----------------------------------------------------------------------------------

const renameTag = (el: ElementNode, tag: string): Patch[] => [
  { start: el.open.start + 1, end: el.open.start + 1 + el.name.length, text: tag },
  { start: el.close!.start + 2, end: el.close!.start + 2 + el.name.length, text: tag },
];

/** A paragraph as a list: one item per line (split at <br>). */
export function toList(src: string, block: Block, ordered: boolean): Result<Edited> {
  const el = block.node;
  if (block.kind !== "text" || el.kind !== "element" || !el.close || !["p", "div"].includes(el.name)) return fail("แปลงเป็นรายการได้เฉพาะย่อหน้า");
  const raw = src.slice(el.open.end, el.close.start);
  const parts = raw.split(/<br\s*\/?>/i).map((p) => p.trim());
  const items = parts.length > 1 ? parts.filter((p) => p) : parts;
  const indent = indentAt(src, block.start);
  const body = `${items.map((p) => `
${indent}  <li>${p}</li>`).join("")}
${indent}`;
  const patches = [...renameTag(el, ordered ? "ol" : "ul"), { start: el.open.end, end: el.close.start, text: body }];
  const grow = 2 * (2 - el.name.length) + body.length - raw.length;
  return ok({ src: applyPatches(src, patches), at: { start: block.start, end: block.end + grow } });
}

/** A list as a paragraph again: its items joined with <br>. */
export function fromList(src: string, block: Block): Result<Edited> {
  const el = block.node;
  if (block.detail.kind !== "list" || el.kind !== "element" || !el.close) return fail("ไม่ใช่รายการ");
  const body = block.detail.items.map((i) => src.slice(i.inner.start, i.inner.end)).join("<br>");
  const raw = src.slice(el.open.end, el.close.start);
  const patches = [...renameTag(el, "p"), { start: el.open.end, end: el.close.start, text: body }];
  return ok({ src: applyPatches(src, patches), at: { start: block.start, end: block.end + 2 * (1 - el.name.length) + body.length - raw.length } });
}

/** An item after item `after` (-1: first), empty, written like the one before it. */
export function addListItem(src: string, block: Block, after: number): Result<Edited> {
  if (block.detail.kind !== "list") return fail("ไม่ใช่รายการ");
  const items = block.detail.items;
  const at = items[Math.max(0, after)];
  const indent = indentAt(src, at.range.start);
  const text = `
${indent}<li></li>`;
  const pos = after < 0 ? at.range.start : at.range.end;
  const patch = after < 0 ? { start: pos, end: pos, text: `<li></li>
${indent}` } : { start: pos, end: pos, text };
  return ok({ src: applyPatches(src, [patch]), at: { start: block.start, end: block.end + patch.text.length } });
}

/** Item `i` out of the list (the last one cannot go: remove the block). */
export function removeListItem(src: string, block: Block, i: number): Result<Edited> {
  if (block.detail.kind !== "list" || block.node.kind !== "element") return fail("ไม่ใช่รายการ");
  const items = block.detail.items;
  if (items.length < 2) return fail("เหลือข้อเดียว: ลบบล็อกแทน");
  const from = i === 0 ? block.node.open.end : items[i - 1].range.end;
  const patch = { start: from, end: items[i].range.end, text: "" };
  return ok({ src: applyPatches(src, [patch]), at: { start: block.start, end: block.end - (patch.end - patch.start) } });
}

// ---- rows of columns and summary rows (v1.9 toolbar) -------------------------------------------------

/** Every column of a row of columns the same width (flex: 1). */
export function equalColumns(src: string, block: Block): Result<Edited> {
  if (block.kind !== "row" || block.node.kind !== "element") return fail("ไม่ใช่แถวแบ่งคอลัมน์");
  let out = src;
  let at: Block = block;
  const count = at.node.kind === "element" ? at.node.children.filter((c) => c.kind === "element").length : 0;
  for (let i = 0; i < count; i++) {
    const r = setColumnFlex(out, at, i, 1);
    if (!r.ok) return r;
    out = r.value.src;
    const again = readBlocks(out);
    const found = flatten(again.items).find((b) => b.start === block.start && b.kind === "row");
    if (!found) return fail("อ่านแถวกลับไม่ได้");
    at = found;
  }
  return ok({ src: out, at: { start: block.start, end: at.end } });
}

const flatten = (items: Block[]): Block[] => items.flatMap((b) => [b, ...b.lists.flatMap((l) => flatten(l.list.items))]);

/** The summary row after the last one, a copy of it (label and value to be changed). */
export function addSummaryRow(src: string, block: Block): Result<Edited> {
  if (block.detail.kind !== "summary" || !block.detail.rows.length) return fail("ไม่ใช่สรุปยอด");
  const last = block.detail.rows[block.detail.rows.length - 1];
  const start = src.lastIndexOf("<tr", last.label.range.start);
  const end = src.indexOf("</tr>", last.value.range.end) + 5;
  const lead = src.slice(src.lastIndexOf("\n", start - 1) + 1, start);
  const text = `\n${/^[ \t]*$/.test(lead) ? lead : ""}${src.slice(start, end)}`;
  return ok(replaceIn(src, block, { start: end, end }, text));
}

/** An {% if %} without its "ไม่เช่นนั้น", or a {% for %} without its "ถ้าไม่มีแถว": the {% else %} and what is in it go. */
export function removeElse(src: string, block: Block): Result<Edited> {
  if (block.node.kind !== "block" || !block.node.close) return fail("ไม่ใช่บล็อกเงื่อนไข");
  const els = block.node.branches.find((b) => b.tag.keyword === "else");
  if (!els) return fail("ไม่มี \"ไม่เช่นนั้น\"");
  const close = block.node.close;
  const own = (at: number) => src.slice(lineStart(src, at), at).trim() === "";
  const start = own(els.tag.start) ? lineStart(src, els.tag.start) : els.tag.start;
  const end = own(close.start) ? lineStart(src, close.start) : close.start;
  return ok({ src: applyPatches(src, [{ start, end, text: "" }]), at: { start: block.start, end: block.end - (end - start) } });
}

/** A row of columns with `n` columns (2–4): new empty ones at the end, or the last ones merged in (their blocks kept). */
export function setRowColumns(src: string, block: Block, n: number): Result<Edited> {
  if (block.kind !== "row") return fail("ไม่ใช่แถวแบ่งคอลัมน์");
  if (n < 2 || n > 4) return fail("แถวมีได้ 2–4 คอลัมน์");
  let out = src;
  let at: Block = block;
  for (let guard = 0; guard < 4; guard++) {
    const now = columnsOf(out, at)?.length ?? 0;
    if (now === n) return ok({ src: out, at: { start: block.start, end: at.end } });
    const r = now < n ? addRowColumn(out, at) : mergeColumns(out, at, now - 2);
    if (!r.ok) return r;
    out = r.value.src;
    const again = flatten(readBlocks(out).items).find((b) => b.start === block.start && b.kind === "row");
    if (!again) return fail("อ่านแถวกลับไม่ได้");
    at = again;
  }
  return fail("ปรับจำนวนคอลัมน์ไม่สำเร็จ");
}
