// Editing template.html in the Document Designer (SPEC-studio.md "v1.7"): every edit replaces ranges of the source
// and leaves every other byte alone, so hand-written HTML around a block survives. Each edit returns the new
// source and the new range of the block it touched (to reselect it after the file is read again).
// Undo is a stack of whole sources: small files, exact bytes back.

import type { Block, BlockList, GridCell } from "./doc-blocks";
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
  if (block.kind !== "condition" || block.node.kind !== "block" || !block.node.close) return fail("ไม่ใช่บล็อกเงื่อนไข");
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
  for (const row of [...(d.emptyRow ? [d.emptyRow] : []), ...d.footer]) {
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
  for (const row of [...(d.emptyRow ? [d.emptyRow] : []), ...d.footer]) {
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

/** A row of empty cells after row `after` (-1: at the end), shaped like the body rows. */
export function gridAddRow(src: string, block: Block, after = -1): Result<Edited> {
  const g = gridOf(block);
  if (!g) return fail("ไม่ใช่ตารางเปล่า");
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

/** An empty column after column `after` (-1: at the end), each new cell shaped like its neighbour. */
export function gridAddColumn(src: string, block: Block, after = -1): Result<Edited> {
  const g = gridOf(block);
  if (!g) return fail("ไม่ใช่ตารางเปล่า");
  const col = after < 0 ? g.rows[0].cells.length - 1 : after;
  return tableEdit(
    src,
    block,
    g.rows.map((r) => {
      const c = r.cells[col];
      return { start: c.range.end, end: c.range.end, text: `${openAs(src, c, c.node.name)}&nbsp;</${c.node.name}>` };
    }),
  );
}

export function gridRemoveColumn(src: string, block: Block, col: number): Result<Edited> {
  const g = gridOf(block);
  if (!g || col < 0 || col >= g.rows[0].cells.length) return fail("ไม่มีคอลัมน์นี้");
  if (g.rows[0].cells.length <= 1) return fail("ตารางต้องมีอย่างน้อย 1 คอลัมน์");
  return tableEdit(src, block, g.rows.map((r) => ({ ...r.cells[col].range, text: "" })));
}

export function gridMoveColumn(src: string, block: Block, col: number, dir: -1 | 1): Result<Edited> {
  const g = gridOf(block);
  const other = col + dir;
  if (!g || other < 0 || other >= g.rows[0].cells.length) return fail("ย้ายต่อไม่ได้");
  const text = (c: GridCell) => src.slice(c.range.start, c.range.end);
  return tableEdit(
    src,
    block,
    g.rows.flatMap((r) => [
      { ...r.cells[col].range, text: text(r.cells[other]) },
      { ...r.cells[other].range, text: text(r.cells[col]) },
    ]),
  );
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

export function newBlockHtml(b: NewBlock): string {
  switch (b.kind) {
    case "text":
      return "<p>ข้อความ</p>";
    case "heading":
      return "<h2>หัวข้อ</h2>";
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
