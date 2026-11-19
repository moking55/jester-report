// template.html as the Document Designer reads it (SPEC-studio.md "v1.7"). The file is the only truth, so this
// parser never rewrites what it does not understand: every token and node keeps its [start, end) range in the
// source, the ranges tile the file with no gap, and edits replace ranges (lib/doc-edit.ts).
//
// Not the browser's DOM: an HTML parser moves `{% for %}` out of a <table> (foster parenting) and reformats.
// Here Jinja and HTML are tokens side by side; the tree pairs HTML tags and Jinja block tags and tolerates
// anything unpaired (the node is marked `broken` and the designer shows it as Custom Code).

export type Range = { start: number; end: number };

export type Token =
  | (Range & { type: "text" })
  | (Range & { type: "html-comment" })
  | (Range & { type: "open"; name: string; attrs: Attr[]; selfClosing: boolean })
  | (Range & { type: "close"; name: string })
  | (Range & { type: "expr"; inner: string }) // {{ … }}
  | (Range & { type: "stmt"; keyword: string; inner: string }) // {% keyword … %}
  | (Range & { type: "comment" }); // {# … #}

/** An attribute as written: name, the value without quotes (null = no value), and where the value sits. */
export type Attr = { name: string; value: string | null; valueRange: Range | null; range: Range };

export type Node =
  | (Range & { kind: "root"; children: Node[] })
  | (Range & { kind: "text" })
  | (Range & { kind: "html-comment" })
  | (Range & { kind: "comment" })
  | (Range & { kind: "expr"; inner: string })
  | (Range & { kind: "stmt"; keyword: string; inner: string }) // a statement that opens no block: {% set x = … %}, {% include %}
  | (Range & { kind: "stray"; token: Token }) // a close tag or {% endx %} with nothing to close
  | ElementNode
  | BlockNode;

export type ElementNode = Range & {
  kind: "element";
  name: string;
  attrs: Attr[];
  open: Token & { type: "open" };
  close: (Token & { type: "close" }) | null; // null: void element, self-closing, or never closed
  children: Node[];
  broken: boolean; // never closed, or closed out of order
};

/** A Jinja block: {% if %}…{% elif %}…{% else %}…{% endif %}, {% for %}…{% else %}…{% endfor %}, {% macro %}, … */
export type BlockNode = Range & {
  kind: "block";
  keyword: string; // if, for, macro, raw, call, filter, set (block form), with, autoescape
  branches: { tag: Token & { type: "stmt" }; children: Node[]; start: number; end: number }[];
  end: number;
  close: (Token & { type: "stmt" }) | null; // {% endif %}; null: never closed
  broken: boolean;
};

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
/** Jinja tags that open a block, and the tags that split it into branches. */
const BLOCKS: Record<string, string[]> = {
  if: ["elif", "else"],
  for: ["else"],
  macro: [],
  call: [],
  filter: [],
  with: [],
  autoescape: [],
  block: [],
  raw: [],
};
export const JINJA_TAGS = new Set([
  ...Object.keys(BLOCKS),
  ...Object.keys(BLOCKS).map((k) => `end${k}`),
  "elif",
  "else",
  "set",
  "endset",
  "include",
  "import",
  "from",
  "extends",
  "do",
  "break",
  "continue",
]);

// ---- tokenizer -------------------------------------------------------------------------------------

/** The end of a Jinja delimiter opened at `at` (`{{`, `{%`, `{#`), past its closing pair; strings inside are skipped. */
function jinjaEnd(src: string, at: number, close: string): number {
  let i = at + 2;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if ((c === '"' || c === "'") && close !== "#}") quote = c;
    else if (src.startsWith(close, i)) return i + 2;
    i++;
  }
  return src.length; // never closed: runs to the end (doc-check reports it)
}

const isJinja = (src: string, i: number) => src[i] === "{" && (src[i + 1] === "{" || src[i + 1] === "%" || src[i + 1] === "#");

function jinjaToken(src: string, i: number): Token {
  const kind = src[i + 1];
  const close = kind === "{" ? "}}" : kind === "%" ? "%}" : "#}";
  const end = jinjaEnd(src, i, close);
  if (kind === "#") return { type: "comment", start: i, end };
  const closed = end - i >= 4 && src.slice(end - 2, end) === close;
  const inner = src
    .slice(i + 2, closed ? end - 2 : end)
    .replace(/^[-+]|[-+]$/g, "") // whitespace control: {%- … -%}
    .trim();
  if (kind === "{") return { type: "expr", start: i, end, inner };
  return { type: "stmt", start: i, end, keyword: inner.split(/\s+/, 1)[0] ?? "", inner };
}

/** An HTML tag at `i` (`<name …>` or `</name>`), or null when the `<` is just text. Jinja inside attributes is allowed. */
function tagToken(src: string, i: number): Token | null {
  const close = src[i + 1] === "/";
  const nameMatch = /^[A-Za-z][A-Za-z0-9-]*/.exec(src.slice(i + (close ? 2 : 1)));
  if (!nameMatch) return null;
  const name = nameMatch[0].toLowerCase();
  let j = i + (close ? 2 : 1) + nameMatch[0].length;
  const attrs: Attr[] = [];
  while (j < src.length) {
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === ">") break;
    if (src.startsWith("/>", j)) break;
    if (isJinja(src, j)) {
      j = jinjaEnd(src, j, src[j + 1] === "{" ? "}}" : src[j + 1] === "%" ? "%}" : "#}"); // {% if %} inside a tag
      continue;
    }
    const an = /^[^\s"'>/=]+/.exec(src.slice(j));
    if (!an) {
      j++;
      continue;
    }
    const aStart = j;
    j += an[0].length;
    let k = j;
    while (k < src.length && /\s/.test(src[k])) k++;
    let value: string | null = null;
    let valueRange: Range | null = null;
    if (src[k] === "=") {
      k++;
      while (k < src.length && /\s/.test(src[k])) k++;
      const q = src[k];
      if (q === '"' || q === "'") {
        let m = k + 1;
        while (m < src.length && src[m] !== q) m = isJinja(src, m) ? jinjaEnd(src, m, src[m + 1] === "{" ? "}}" : "%}") : m + 1;
        valueRange = { start: k + 1, end: Math.min(m, src.length) };
        j = Math.min(m + 1, src.length);
      } else {
        const uq = /^[^\s>]*/.exec(src.slice(k))![0];
        valueRange = { start: k, end: k + uq.length };
        j = k + uq.length;
      }
      value = src.slice(valueRange.start, valueRange.end);
    }
    attrs.push({ name: an[0].toLowerCase(), value, valueRange, range: { start: aStart, end: j } });
  }
  if (j >= src.length) return null; // `<` with no `>`: text
  const selfClosing = src.startsWith("/>", j);
  const end = j + (selfClosing ? 2 : 1);
  return close ? { type: "close", name, start: i, end } : { type: "open", name, attrs, selfClosing, start: i, end };
}

/** The file as tokens that tile it exactly: concatenating every token's range gives the source back. */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let textStart = 0;
  let i = 0;
  const flush = (to: number) => {
    if (to > textStart) out.push({ type: "text", start: textStart, end: to });
  };
  const push = (t: Token) => {
    flush(t.start);
    out.push(t);
    i = t.end;
    textStart = t.end;
  };
  while (i < src.length) {
    if (isJinja(src, i)) {
      const t = jinjaToken(src, i);
      push(t);
      if (t.type === "stmt" && t.keyword === "raw") {
        // {% raw %}: everything up to {% endraw %} is text
        const m = /\{%-?\s*endraw\s*-?%\}/.exec(src.slice(i));
        const stop = m ? i + m.index : src.length;
        flush(stop);
        i = textStart = stop;
      }
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      push({ type: "html-comment", start: i, end: e < 0 ? src.length : e + 3 });
      continue;
    }
    if (src[i] === "<") {
      const t = tagToken(src, i);
      if (t) {
        push(t);
        if (t.type === "open" && RAW_TEXT.has(t.name) && !t.selfClosing) {
          // <style>, <script>: the content is text up to the closing tag
          const m = new RegExp(`</${t.name}\\s*>`, "i").exec(src.slice(i));
          const stop = m ? i + m.index : src.length;
          flush(stop);
          i = textStart = stop;
        }
        continue;
      }
    }
    i++;
  }
  flush(src.length);
  return out;
}

// ---- tree ------------------------------------------------------------------------------------------

type Frame =
  | { kind: "root"; node: Node & { kind: "root" } }
  | { kind: "element"; node: ElementNode }
  | { kind: "block"; node: BlockNode };

const childrenOf = (f: Frame): Node[] =>
  f.kind === "block" ? f.node.branches[f.node.branches.length - 1].children : f.node.children;

/** The tree of a template. Never throws; ranges of children tile their parent's inner range. */
export function parse(src: string): Node & { kind: "root" } {
  const tokens = tokenize(src);
  const root: Node & { kind: "root" } = { kind: "root", start: 0, end: src.length, children: [] };
  const stack: Frame[] = [{ kind: "root", node: root }];
  const top = () => stack[stack.length - 1];
  const add = (n: Node) => childrenOf(top()).push(n);

  /** Close frames down to (and including) index `to`; frames closed on the way are left unclosed (broken). */
  const unwind = (to: number, at: number) => {
    while (stack.length - 1 > to) {
      const f = stack.pop()!;
      if (f.kind === "element") {
        f.node.broken = true;
        f.node.end = at;
      } else if (f.kind === "block") {
        f.node.broken = true;
        f.node.end = at;
        const last = f.node.branches[f.node.branches.length - 1];
        last.end = at;
      }
    }
  };

  for (const t of tokens) {
    switch (t.type) {
      case "text":
      case "html-comment":
      case "comment":
        add({ kind: t.type, start: t.start, end: t.end });
        break;
      case "expr":
        add({ kind: "expr", start: t.start, end: t.end, inner: t.inner });
        break;
      case "open": {
        const el: ElementNode = {
          kind: "element",
          name: t.name,
          attrs: t.attrs,
          open: t,
          close: null,
          children: [],
          start: t.start,
          end: t.end,
          broken: false,
        };
        add(el);
        if (!t.selfClosing && !VOID.has(t.name)) stack.push({ kind: "element", node: el });
        break;
      }
      case "close": {
        // the nearest open element of that name, not crossing a Jinja block (that would be misnesting)
        let at = -1;
        for (let s = stack.length - 1; s > 0; s--) {
          const f = stack[s];
          if (f.kind === "block") break;
          if (f.kind === "element" && f.node.name === t.name) {
            at = s;
            break;
          }
        }
        if (at < 0) {
          add({ kind: "stray", start: t.start, end: t.end, token: t });
          break;
        }
        unwind(at, t.start);
        const f = stack.pop() as Frame & { kind: "element" };
        f.node.close = t;
        f.node.end = t.end;
        break;
      }
      case "stmt": {
        const kw = t.keyword;
        const isSetBlock = kw === "set" && !/=/.test(t.inner);
        if (kw in BLOCKS || isSetBlock) {
          const block: BlockNode = {
            kind: "block",
            keyword: kw,
            branches: [{ tag: t, children: [], start: t.start, end: t.end }],
            start: t.start,
            end: t.end,
            close: null,
            broken: false,
          };
          add(block);
          stack.push({ kind: "block", node: block });
          break;
        }
        const branchOf = Object.entries(BLOCKS).filter(([, split]) => split.includes(kw)).map(([k]) => k);
        if (branchOf.length) {
          // elif/else: the innermost open block that takes it, not crossing an open element (misnesting)
          let at = -1;
          for (let s = stack.length - 1; s > 0; s--) {
            const f = stack[s];
            if (f.kind === "block" && branchOf.includes(f.node.keyword)) {
              at = s;
              break;
            }
            if (f.kind !== "block") break;
          }
          if (at < 0) {
            add({ kind: "stray", start: t.start, end: t.end, token: t });
            break;
          }
          unwind(at, t.start);
          const b = (top() as Frame & { kind: "block" }).node;
          const last = b.branches[b.branches.length - 1];
          last.end = t.start;
          b.branches.push({ tag: t, children: [], start: t.start, end: t.end });
          break;
        }
        if (kw.startsWith("end") && (kw.slice(3) in BLOCKS || kw === "endset")) {
          const name = kw.slice(3);
          let at = -1;
          for (let s = stack.length - 1; s > 0; s--) {
            const f = stack[s];
            if (f.kind === "block" && f.node.keyword === name) {
              at = s;
              break;
            }
          }
          if (at < 0) {
            add({ kind: "stray", start: t.start, end: t.end, token: t });
            break;
          }
          unwind(at, t.start);
          const f = stack.pop() as Frame & { kind: "block" };
          const last = f.node.branches[f.node.branches.length - 1];
          last.end = t.start;
          f.node.close = t;
          f.node.end = t.end;
          break;
        }
        add({ kind: "stmt", start: t.start, end: t.end, keyword: kw, inner: t.inner });
        break;
      }
    }
  }
  unwind(0, src.length);
  return root;
}

// ---- reading the tree back -------------------------------------------------------------------------

/** Every leaf range in order (tags, branch tags, text, …): used to prove the tree tiles the source. */
export function leaves(node: Node): Range[] {
  switch (node.kind) {
    case "root":
      return node.children.flatMap(leaves);
    case "element": {
      const out: Range[] = [{ start: node.open.start, end: node.open.end }, ...node.children.flatMap(leaves)];
      if (node.close) out.push({ start: node.close.start, end: node.close.end });
      return out;
    }
    case "block": {
      const out: Range[] = [];
      for (const b of node.branches) out.push({ start: b.tag.start, end: b.tag.end }, ...b.children.flatMap(leaves));
      if (node.close) out.push({ start: node.close.start, end: node.close.end });
      return out;
    }
    default:
      return [{ start: node.start, end: node.end }];
  }
}

/** The source rebuilt from the tree's leaves — equals the file when the tree tiles it. */
export const print = (src: string, root: Node): string =>
  leaves(root)
    .map((r) => src.slice(r.start, r.end))
    .join("");

/** The value of an attribute, or null. */
export const attr = (el: ElementNode, name: string): string | null => el.attrs.find((a) => a.name === name)?.value ?? null;

/** Whether a node or anything inside it is broken (unclosed, misnested, stray). */
export function isBroken(node: Node): boolean {
  if (node.kind === "stray") return true;
  if (node.kind === "element") return node.broken || node.children.some(isBroken);
  if (node.kind === "block") return node.broken || node.branches.some((b) => b.children.some(isBroken));
  if (node.kind === "root") return node.children.some(isBroken);
  return false;
}
