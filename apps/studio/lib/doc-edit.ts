// Editing template.html in the Document Designer (SPEC-studio.md "v1.7"): every edit replaces ranges of the source
// and leaves every other byte alone, so hand-written HTML around a block survives. Each edit returns the new
// source and the new range of the block it touched (to reselect it after the file is read again).
// Undo is a stack of whole sources: small files, exact bytes back.

import type { Block, BlockList } from "./doc-blocks";
import type { Range } from "./doc-parse";

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

// ---- new blocks (the designer's own forms, SPEC v1.7 "บล็อก") -----------------------------------

export type NewBlock =
  | { kind: "text" }
  | { kind: "heading" }
  | { kind: "field"; expr: string }
  | { kind: "image"; src: string }
  | { kind: "row"; columns: 2 | 3 | 4 }
  | { kind: "table"; variable: string; iterable: string; columns: { head: string; expr: string }[] }
  | { kind: "summary"; rows: { label: string; expr: string }[] }
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
export type History = { past: string[]; now: string; future: string[] };

export const startHistory = (src: string): History => ({ past: [], now: src, future: [] });

export function record(h: History, src: string): History {
  if (src === h.now) return h;
  return { past: [...h.past, h.now].slice(-200), now: src, future: [] };
}

export const undo = (h: History): History =>
  h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h;

export const redo = (h: History): History =>
  h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h;
