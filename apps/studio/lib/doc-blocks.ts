// Blocks of a template (SPEC-studio.md "v1.7", the "บล็อก" table): the parse tree of lib/doc-parse.ts read as what
// the Document Designer can edit. A node is a known block only when that kind's model accounts for every part
// of it; anything else (or anything broken) is Custom Code, kept byte for byte. Every list of blocks (the page,
// a column, a branch, a loop body) is tiled by its blocks and the whitespace gaps between them.

import { attr, isBroken, parse, type ElementNode, type Node, type Range } from "./doc-parse";

export type BlockKind =
  | "text" // <p>/<h1-4>/<div> of inline content
  | "field" // <div>{{ expr }}</div>
  | "image" // <img src>
  | "row" // <div data-jd="row"> of <div data-jd="col">
  | "table" // a list table: thead, {% for %} rows, else row, footer rows
  | "summary" // <table data-jd="summary">: label | {{ value }}
  | "grid" // <table data-jd="grid">: a fixed table of inline cells (v1.7 รอบแก้ข้อ 7)
  | "code" // <div>{{ fmt.qr(...) }}</div> and promptpay / barcode
  | "rule" // <hr>
  | "space" // <div data-jd="space">
  | "pagebreak" // <div data-jd="page-break">
  | "condition" // {% if %}…{% elif %}…{% else %}…{% endif %} around blocks
  | "repeat" // {% for v in X %}…{% else %}…{% endfor %} around blocks
  | "set" // {% set x = … %}
  | "head" // <link rel="stylesheet" href="report.css">: not a block on the page, kept in place
  | "custom"; // anything else

/** A run of blocks inside a container: `range` is the container's inner range, tiled by items and gaps. */
export type BlockList = { range: Range; indent: string; items: Block[] };

export type Block = Range & {
  kind: BlockKind;
  path: number[]; // indexes from the page list down; recomputed on every parse
  node: Node;
  render: boolean; // false: comments, macros, {% set %}, the stylesheet link — nothing on the page
  style: { range: Range | null; readOnly: boolean } | null; // the style="…" value range (null: no attribute yet)
  lists: { key: string; label: string; list: BlockList }[]; // what can hold blocks: columns, branches, loop body
  detail: Detail;
};

export type Cell = { range: Range; inner: Range }; // a <th>/<td>: the whole cell and its content
export type GridCell = Cell & { node: ElementNode };
export type Detail =
  | { kind: "text"; tag: string; inner: Range }
  | { kind: "field" | "code"; expr: Range; inner: string }
  | { kind: "image"; src: Range | null; width: Range | null }
  | { kind: "row" }
  | {
      kind: "table";
      head: Cell[] | null;
      loop: { tag: Range; variable: string; iterable: string };
      cells: Cell[];
      emptyRow: Cell[] | null; // {% else %} row
      footer: Cell[][];
    }
  | { kind: "summary"; rows: { label: Cell; value: Cell }[] }
  | { kind: "grid"; rows: { range: Range; cells: GridCell[] }[]; head: boolean } // head: the first row is <th>
  | { kind: "condition"; branches: { tag: Range; keyword: string; test: string }[] }
  | { kind: "repeat"; tag: Range; variable: string; iterable: string }
  | { kind: "set"; inner: string }
  | { kind: "none" };

const INLINE = new Set(["b", "strong", "i", "em", "u", "small", "span", "br", "sub", "sup"]);
const TEXT_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "div"]);
const LOOP = /^for\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_][\w.]*)$/;

const isGap = (src: string, n: Node) => n.kind === "text" && src.slice(n.start, n.end).trim() === "";
const jd = (el: ElementNode) => attr(el, "data-jd");
const inner = (el: ElementNode): Range => ({ start: el.open.end, end: el.close ? el.close.start : el.end });
const solid = (src: string, nodes: Node[]) => nodes.filter((n) => !isGap(src, n));

/** Inline content: text, {{ }}, inline elements, and an {% if %} of inline content inside a sentence. */
function isInline(src: string, n: Node): boolean {
  switch (n.kind) {
    case "text":
    case "expr":
    case "comment":
      return true;
    case "element":
      return INLINE.has(n.name) && !n.broken && n.children.every((c) => isInline(src, c));
    case "block":
      return n.keyword === "if" && !n.broken && n.branches.every((b) => b.children.every((c) => isInline(src, c)));
    default:
      return false;
  }
}

function styleOf(el: ElementNode): Block["style"] {
  const s = el.attrs.find((a) => a.name === "style");
  if (!s) return { range: null, readOnly: false };
  const v = s.value ?? "";
  return { range: s.valueRange, readOnly: v.includes("{{") || v.includes("{%") }; // Jinja in a style: hands off
}

/** Cells of a <tr>: only <th>/<td> of inline content, else null. */
function cellsOf(src: string, tr: Node, tag: "th" | "td"): Cell[] | null {
  if (tr.kind !== "element" || tr.name !== "tr" || tr.broken) return null;
  const cells: Cell[] = [];
  for (const c of solid(src, tr.children)) {
    if (c.kind !== "element" || c.name !== tag || c.broken || !c.children.every((k) => isInline(src, k))) return null;
    cells.push({ range: { start: c.start, end: c.end }, inner: inner(c) });
  }
  return cells;
}

/** A list table, or null when any part of it is outside the model. */
function tableDetail(src: string, el: ElementNode): Detail | null {
  let head: Cell[] | null = null;
  let body: ElementNode | null = null;
  for (const c of solid(src, el.children)) {
    if (c.kind !== "element") return null;
    if (c.name === "thead" && !head && !body) {
      const rows = solid(src, c.children);
      if (rows.length !== 1) return null;
      head = cellsOf(src, rows[0], "th");
      if (!head) return null;
    } else if (c.name === "tbody" && !body) body = c;
    else return null; // caption, tfoot, a second tbody, rows outside tbody
  }
  if (!body) return null;
  const parts = solid(src, body.children);
  const loop = parts[0];
  if (!loop || loop.kind !== "block" || loop.keyword !== "for" || loop.broken) return null;
  const m = LOOP.exec(loop.branches[0].tag.inner);
  if (!m) return null;
  const rowOf = (nodes: Node[]) => {
    const rows = solid(src, nodes);
    return rows.length === 1 ? cellsOf(src, rows[0], "td") : null;
  };
  const cells = rowOf(loop.branches[0].children);
  if (!cells || (head && head.length !== cells.length)) return null;
  let emptyRow: Cell[] | null = null;
  if (loop.branches.length === 2) {
    emptyRow = rowOf(loop.branches[1].children);
    if (!emptyRow) return null;
  }
  const footer: Cell[][] = [];
  for (const tr of parts.slice(1)) {
    const row = cellsOf(src, tr, "td");
    if (!row) return null;
    footer.push(row);
  }
  return {
    kind: "table",
    head,
    loop: { tag: { start: loop.branches[0].tag.start, end: loop.branches[0].tag.end }, variable: m[1], iterable: m[2] },
    cells,
    emptyRow,
    footer,
  };
}

/** A fixed table: rows (directly or in one <tbody>) of the same number of plain <td>/<th> cells; the first row may be <th>. */
function gridDetail(src: string, el: ElementNode): Detail | null {
  let rows = solid(src, el.children);
  if (rows.length === 1 && rows[0].kind === "element" && rows[0].name === "tbody") rows = solid(src, rows[0].children);
  const out: { range: Range; cells: GridCell[] }[] = [];
  let head = false;
  for (const [i, tr] of rows.entries()) {
    if (tr.kind !== "element" || tr.name !== "tr" || tr.broken) return null;
    const cells: GridCell[] = [];
    for (const c of solid(src, tr.children)) {
      const ok = c.kind === "element" && (c.name === "td" || (i === 0 && c.name === "th"));
      if (!ok || c.broken || attr(c, "colspan") || attr(c, "rowspan") || !c.children.every((k) => isInline(src, k))) return null;
      cells.push({ range: { start: c.start, end: c.end }, inner: inner(c), node: c });
    }
    if (!cells.length || (out.length && cells.length !== out[0].cells.length)) return null;
    if (i === 0) head = cells[0].node.name === "th";
    if (cells.some((c) => (c.node.name === "th") !== (i === 0 && head))) return null;
    out.push({ range: { start: tr.start, end: tr.end }, cells });
  }
  return out.length ? { kind: "grid", rows: out, head } : null;
}

function summaryDetail(src: string, el: ElementNode): Detail | null {
  let rows = solid(src, el.children);
  if (rows.length === 1 && rows[0].kind === "element" && rows[0].name === "tbody") rows = solid(src, rows[0].children);
  const out: { label: Cell; value: Cell }[] = [];
  for (const tr of rows) {
    const cells = cellsOf(src, tr, "td");
    if (!cells || cells.length !== 2) return null;
    out.push({ label: cells[0], value: cells[1] });
  }
  return out.length ? { kind: "summary", rows: out } : null;
}

type Classified = Omit<Block, "path" | "start" | "end" | "node">;
const custom = (render: boolean): Classified => ({ kind: "custom", render, style: null, lists: [], detail: { kind: "none" } });

/** What one node of a block list is. `path` is the list's own path, for the lists inside the block. */
function classify(src: string, n: Node, path: number[]): Classified {
  if (n.kind === "comment" || n.kind === "html-comment") return custom(false);
  if (n.kind === "stmt") {
    return n.keyword === "set" && /=/.test(n.inner)
      ? { kind: "set", render: false, style: null, lists: [], detail: { kind: "set", inner: n.inner } }
      : custom(false); // {% include %}, {% import %}, …
  }
  if (isBroken(n)) return custom(true);
  if (n.kind === "block") {
    if (n.keyword === "macro") return custom(false);
    if (n.keyword === "if") {
      return {
        kind: "condition",
        render: true,
        style: null,
        lists: n.branches.map((b, i) => ({
          key: `branch${i}`,
          label: b.tag.keyword === "else" ? "ไม่เช่นนั้น" : `${b.tag.keyword === "if" ? "ถ้า" : "ไม่เช่นนั้นถ้า"} ${b.tag.inner.replace(/^(el)?if\s+/, "")}`,
          list: listOf(src, b.children, { start: b.tag.end, end: b.end }, [...path, i]),
        })),
        detail: {
          kind: "condition",
          branches: n.branches.map((b) => ({
            tag: { start: b.tag.start, end: b.tag.end },
            keyword: b.tag.keyword,
            test: b.tag.inner.replace(/^(el)?if\s+|^else$/, ""),
          })),
        },
      };
    }
    if (n.keyword === "for") {
      const m = LOOP.exec(n.branches[0].tag.inner);
      if (!m) return custom(true);
      return {
        kind: "repeat",
        render: true,
        style: null,
        lists: n.branches.map((b, i) => ({
          key: i === 0 ? "body" : "empty",
          label: i === 0 ? `ทุก ${m[1]} ใน ${m[2]}` : "ไม่มีรายการ",
          list: listOf(src, b.children, { start: b.tag.end, end: b.end }, [...path, i]),
        })),
        detail: { kind: "repeat", tag: { start: n.branches[0].tag.start, end: n.branches[0].tag.end }, variable: m[1], iterable: m[2] },
      };
    }
    return custom(true);
  }
  if (n.kind !== "element") return custom(true);

  const el = n;
  const style = styleOf(el);
  const known = (kind: BlockKind, detail: Detail, lists: Block["lists"] = []): Classified => ({ kind, render: true, style, lists, detail });
  const tag = jd(el);
  const kids = solid(src, el.children);

  if (el.name === "link" && attr(el, "rel") === "stylesheet") return { ...custom(false), kind: "head" };
  if (el.name === "img") {
    const a = (name: string) => el.attrs.find((x) => x.name === name)?.valueRange ?? null;
    return attr(el, "src") ? known("image", { kind: "image", src: a("src"), width: a("width") }) : custom(true);
  }
  if (el.name === "hr") return known("rule", { kind: "none" });
  if (el.name === "div" && tag === "space" && kids.length === 0) return known("space", { kind: "none" });
  if (el.name === "div" && tag === "page-break" && kids.length === 0) return known("pagebreak", { kind: "none" });
  if (el.name === "div" && tag === "row") {
    const cols = kids.filter((k): k is ElementNode => k.kind === "element" && k.name === "div" && jd(k) === "col");
    if (cols.length !== kids.length || cols.length < 2 || cols.length > 4) return custom(true);
    return known(
      "row",
      { kind: "row" },
      cols.map((c, i) => ({ key: `col${i}`, label: `คอลัมน์ ${i + 1}`, list: listOf(src, c.children, inner(c), [...path, i]) })),
    );
  }
  if (el.name === "table") {
    const d = tag === "summary" ? summaryDetail(src, el) : tag === "grid" ? gridDetail(src, el) : tag ? null : tableDetail(src, el);
    return d ? known(d.kind as BlockKind, d) : custom(true);
  }
  if (el.name === "div" && !tag && kids.length === 1 && kids[0].kind === "expr") {
    const e = kids[0];
    const kind = /^fmt\.(qr|promptpay|barcode)\(/.test(e.inner) ? "code" : "field";
    return known(kind, { kind, expr: { start: e.start, end: e.end }, inner: e.inner });
  }
  if (TEXT_TAGS.has(el.name) && !tag && el.children.every((c) => isInline(src, c))) {
    return known("text", { kind: "text", tag: el.name, inner: inner(el) });
  }
  return custom(true);
}

/** The blocks of a node list that tiles `range`; `path` is this list's path (block i is path + [i]). */
function listOf(src: string, nodes: Node[], range: Range, path: number[]): BlockList {
  const items: Block[] = [];
  for (const n of nodes) {
    if (isGap(src, n)) continue;
    const i = items.length;
    const c = classify(src, n, [...path, i]);
    items.push({ ...c, path: [...path, i], start: n.start, end: n.end, node: n });
  }
  let indent = "";
  if (items.length) {
    const lineStart = src.lastIndexOf("\n", items[0].start - 1) + 1;
    const lead = src.slice(lineStart, items[0].start);
    indent = /^[ \t]*$/.test(lead) ? lead : "";
  }
  return { range, indent, items };
}

/** The page: the blocks of a template, top level. */
export function readBlocks(src: string): BlockList {
  return listOf(src, parse(src).children, { start: 0, end: src.length }, []);
}

/** Every block in the tree, depth first (for summaries and lookups). */
export function allBlocks(list: BlockList): Block[] {
  return list.items.flatMap((b) => [b, ...b.lists.flatMap((l) => allBlocks(l.list))]);
}

/** The block at a path, or null. */
export function blockAt(list: BlockList, path: number[]): Block | null {
  let cur: BlockList | null = list;
  let found: Block | null = null;
  for (let i = 0; i < path.length && cur; i++) {
    found = cur.items[path[i]] ?? null;
    if (!found) return null;
    if (i + 1 < path.length) {
      // the next index picks a list of this block (columns/branches), then the one after picks a block in it
      cur = found.lists[path[++i]]?.list ?? null;
      if (i + 1 >= path.length) return null;
    }
  }
  return found;
}

/** How much of a template the designer can edit: per kind, and whether anything rendered is Custom Code. */
export function coverage(src: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of allBlocks(readBlocks(src))) {
    const key = b.kind === "custom" && !b.render ? "custom (ไม่แสดงผล)" : b.kind;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
