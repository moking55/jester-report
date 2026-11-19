// Editing a text block on the Document Designer's paper (SPEC-studio.md "v1.7" ข้อความบนผืน): the inner source of a
// <p>/<h1>… becomes HTML for a contenteditable, where every piece of Jinja is a chip that cannot be typed into and
// inline elements keep their tags as written. Going back, the new content is compared with the old one unit by unit
// (a character of text, a chip, an open or a close tag) and only the changed middle is written anew: bytes the user
// did not touch (entities, <br />, attribute quotes, whitespace) stay exactly as they were.

import { escapeHtml } from "./doc-render";
import { applyPatches, type Edited, type Result } from "./doc-edit";
import { checkCode } from "./doc-check";
import { parse, type BlockNode, type Node, type Range } from "./doc-parse";

/** Inline elements a text block keeps (the same set lib/doc-blocks accepts). */
export const INLINE = new Set(["b", "strong", "i", "em", "u", "small", "span", "br", "sub", "sup"]);

/** One piece of content: a character of text (`ch`), or a chip / open tag / close tag as written. */
export type Unit = { ch: string; raw: string } | { ch: null; raw: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The characters of HTML text, each with the source it came from (an entity stays one unit). */
export function textUnits(raw: string): Unit[] {
  const out: Unit[] = [];
  const re = /&(#\d+|#x[0-9a-f]+|[a-z]+);/iy;
  for (let i = 0; i < raw.length; ) {
    re.lastIndex = i;
    const m = raw[i] === "&" ? re.exec(raw) : null;
    if (m) {
      const name = m[1];
      const code = name[0] === "#" ? (name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)) : NaN;
      const ch = name[0] === "#" ? (Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m[0]) : (ENTITIES[name.toLowerCase()] ?? m[0]);
      out.push({ ch, raw: m[0] });
      i += m[0].length;
      continue;
    }
    if (raw[i] === "\r") {
      // the HTML parser reads \r\n (and a lone \r) as \n
      const crlf = raw[i + 1] === "\n";
      out.push({ ch: "\n", raw: crlf ? "\r\n" : "\r" });
      i += crlf ? 2 : 1;
      continue;
    }
    const ch = String.fromCodePoint(raw.codePointAt(i)!);
    out.push({ ch, raw: ch });
    i += ch.length;
  }
  return out;
}

const chipLabel = (src: string, n: Node): { cls: string; label: string } => {
  switch (n.kind) {
    case "expr":
      return { cls: "jd-expr", label: `{{ ${n.inner} }}` };
    case "block": {
      const first = n.branches[0].tag.inner.replace(/^if\s+/, "");
      return { cls: "jd-tag jd-if", label: `ถ้า ${first}${n.branches.length > 1 ? " …" : ""}` };
    }
    case "comment":
    case "html-comment":
      return { cls: "jd-tag", label: "หมายเหตุ" };
    case "stmt":
      return { cls: "jd-tag", label: `{% ${n.inner} %}` };
    default:
      return { cls: "jd-tag", label: src.slice(n.start, n.end) };
  }
};

const chipHtml = (raw: string, cls: string, label: string) =>
  `<span class="jd-chip ${cls}" contenteditable="false" data-jd-raw="${escapeHtml(raw)}">${escapeHtml(label)}</span>`;

/** A chip for new Jinja source (a field picked while typing). */
export const newChipHtml = (raw: string) => {
  const n = parse(raw).children[0];
  const { cls, label } = n ? chipLabel(raw, n) : { cls: "jd-tag", label: raw };
  return chipHtml(raw, cls, label);
};

/** The units of the inner source of a text block, and the HTML a contenteditable starts from. */
export function readInner(inner: string): { units: Unit[]; html: string } {
  const units: Unit[] = [];
  const html: string[] = [];
  const walk = (n: Node) => {
    const raw = inner.slice(n.start, n.end);
    if (n.kind === "text") {
      units.push(...textUnits(raw));
      html.push(raw);
    } else if (n.kind === "element" && INLINE.has(n.name) && !n.broken) {
      const open = inner.slice(n.open.start, n.open.end);
      const close = n.close ? inner.slice(n.close.start, n.close.end) : "";
      units.push({ ch: null, raw: open });
      html.push(open.replace(/^<[A-Za-z][\w-]*/, (m) => `${m} data-jd-raw="${escapeHtml(open)}" data-jd-close="${escapeHtml(close)}"`));
      n.children.forEach(walk);
      if (close) {
        units.push({ ch: null, raw: close });
        html.push(close);
      }
    } else {
      const { cls, label } = chipLabel(inner, n);
      units.push({ ch: null, raw });
      html.push(chipHtml(raw, cls, label));
    }
  };
  parse(inner).children.forEach(walk);
  return { units, html: html.join("") };
}

/** The units of an edited contenteditable: chips and kept tags by their source, anything the browser invented flattened. */
export function domUnits(root: globalThis.Node): Unit[] {
  const out: Unit[] = [];
  const walk = (n: globalThis.Node) => {
    if (n.nodeType === 3) {
      for (const ch of n.nodeValue ?? "") out.push({ ch, raw: "" });
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const raw = el.getAttribute("data-jd-raw");
    const name = el.tagName.toLowerCase();
    if (raw !== null && el.classList.contains("jd-chip")) {
      out.push({ ch: null, raw });
      return;
    }
    if (raw !== null || INLINE.has(name)) {
      const open = raw ?? `<${name}>`;
      const close = raw !== null ? (el.getAttribute("data-jd-close") ?? "") : name === "br" ? "" : `</${name}>`;
      out.push({ ch: null, raw: open });
      el.childNodes.forEach(walk);
      if (close) out.push({ ch: null, raw: close });
      return;
    }
    el.childNodes.forEach(walk); // <div>, <font>, … from the browser: keep their text only
  };
  root.childNodes.forEach(walk);
  return out;
}

const same = (a: Unit, b: Unit) => (a.ch !== null && b.ch !== null ? a.ch === b.ch : a.ch === null && b.ch === null && a.raw === b.raw);

const encode = (u: Unit, prev: Unit | undefined): string => {
  if (u.ch === null) return u.raw;
  if (u.ch === "&") return "&amp;";
  if (u.ch === "<") return "&lt;";
  if (u.ch === ">") return "&gt;";
  // the browser types U+00A0 for a space it would otherwise collapse; keep it only after another space
  if (u.ch === " ") return prev?.ch === " " || prev?.ch === " " ? "&nbsp;" : " ";
  return u.ch;
};

/** The new inner source: the old source for the unchanged start and end, the edited middle written anew. */
export function writeInner(old: Unit[], next: Unit[]): string {
  let p = 0;
  while (p < old.length && p < next.length && same(old[p], next[p])) p++;
  let s = 0;
  while (s < old.length - p && s < next.length - p && same(old[old.length - 1 - s], next[next.length - 1 - s])) s++;
  const mid = next.slice(p, next.length - s).map((u, i, a) => encode(u, i ? a[i - 1] : next[p - 1]));
  return [...old.slice(0, p).map((u) => u.raw), ...mid, ...old.slice(old.length - s).map((u) => u.raw)].join("");
}

// ---- inline conditions: {% if c %}…{% else %}…{% endif %} inside a text block ----

export type InlineIf = { branches: { keyword: string; test: string; body: string }[] };

const ifNode = (raw: string): BlockNode | null => {
  const n = parse(raw).children[0];
  return n?.kind === "block" && n.keyword === "if" && n.close && n.start === 0 && n.end === raw.length ? n : null;
};

/** An inline condition's branches: keyword, test (empty for else) and body source. */
export function readInlineIf(raw: string): InlineIf | null {
  const n = ifNode(raw);
  if (!n) return null;
  return {
    branches: n.branches.map((b) => ({
      keyword: b.tag.keyword,
      test: b.tag.keyword === "else" ? "" : b.tag.inner.replace(/^(el)?if\s+/, ""),
      body: raw.slice(b.tag.end, b.end),
    })),
  };
}

/** The condition with new tests and bodies (same branches); `{%-` and `-%}` are kept. Bodies are checked. */
export function writeInlineIf(raw: string, next: InlineIf): Result<string> {
  const n = ifNode(raw);
  if (!n || n.branches.length !== next.branches.length) return { ok: false, error: "เงื่อนไขนี้แก้ใน popover ไม่ได้" };
  const patches: (Range & { text: string })[] = [];
  for (const [i, b] of n.branches.entries()) {
    const want = next.branches[i];
    if (b.tag.keyword !== "else") {
      const test = want.test.trim();
      if (!test) return { ok: false, error: "เงื่อนไขว่างไม่ได้" };
      if (/%\}|\{%/.test(test)) return { ok: false, error: "ห้ามมี {% หรือ %} ในเงื่อนไข" };
      const m = /^(\{%[-+]?\s*)(\w+)(\s+)([\s\S]*?)(\s*[-+]?%\})$/.exec(raw.slice(b.tag.start, b.tag.end));
      if (!m) return { ok: false, error: "แท็กไม่ตรงรูปแบบ" };
      patches.push({ start: b.tag.start, end: b.tag.end, text: `${m[1]}${m[2]} ${test}${m[5]}` });
    }
    patches.push({ start: b.tag.end, end: b.end, text: want.body });
  }
  const out = applyPatches(raw, patches);
  const problem = checkCode(out)[0];
  if (problem) return { ok: false, error: problem.message };
  if (!ifNode(out)) return { ok: false, error: "ข้อความในสาขาทำให้เงื่อนไขไม่ครบคู่" };
  return { ok: true, value: out };
}

// ---- heading level ----

export const TEXT_LEVELS = [
  ["p", "ย่อหน้า"],
  ["h1", "หัวข้อ 1"],
  ["h2", "หัวข้อ 2"],
  ["h3", "หัวข้อ 3"],
] as const;

/** Rename a text block's element (p ↔ h1–h3), open and close tag. */
export function setTextTag(src: string, block: Range & { node: Node }, tag: string): Result<Edited> {
  const el = block.node;
  if (el.kind !== "element" || !el.close) return { ok: false, error: "ไม่ใช่บล็อกข้อความ" };
  if (el.name === tag) return { ok: true, value: { src, at: { start: block.start, end: block.end } } };
  const at = (start: number) => ({ start, end: start + el.name.length, text: tag });
  const next = applyPatches(src, [at(el.open.start + 1), at(el.close.start + 2)]);
  const grow = 2 * (tag.length - el.name.length);
  return { ok: true, value: { src: next, at: { start: block.start, end: block.end + grow } } };
}
