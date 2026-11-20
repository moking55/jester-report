// Word-level formatting in the text editor (SPEC-studio.md v1.9): bold, italic, underline and colour over the selected
// part of a text block. It works on the contenteditable's DOM, not with execCommand (which writes <font> and behaves
// differently in a shadow root): a formatted piece is an inline element that carries its own source in
// data-jd-raw / data-jd-close, as readInner() writes them, so domUnits() and writeInner() take it back to template.html
// byte for byte. Chips ({{ }}) are one leaf each and are wrapped, never split.

export type Format = "bold" | "italic" | "underline" | "color";

const TAGS: Record<Exclude<Format, "color">, [string, string[]]> = {
  bold: ["strong", ["strong", "b"]],
  italic: ["em", ["em", "i"]],
  underline: ["u", ["u"]],
};

/** The colour a span of ours sets (`<span style="color: #b3261e">`), or null for any other element. */
export function colorOf(el: Element): string | null {
  if (el.tagName !== "SPAN" || el.classList.contains("jd-chip")) return null;
  const raw = el.getAttribute("data-jd-raw") ?? "";
  const m = /^<span\s+style="color:\s*(#[0-9a-fA-F]{3,8})\s*;?\s*">$/.exec(raw);
  return m ? m[1].toLowerCase() : null;
}

const is = (el: Element, f: Format): boolean => (f === "color" ? colorOf(el) !== null : TAGS[f][1].includes(el.tagName.toLowerCase()));
const isAny = (el: Element) => (["bold", "italic", "underline", "color"] as const).some((f) => is(el, f));

function make(f: Format, color?: string): HTMLElement {
  const [tag] = f === "color" ? ["span"] : TAGS[f];
  const el = document.createElement(tag);
  const open = f === "color" ? `<span style="color: ${color}">` : `<${tag}>`;
  el.setAttribute("data-jd-raw", open);
  el.setAttribute("data-jd-close", `</${tag}>`);
  return el;
}

const isChip = (n: Node): n is Element => n.nodeType === 1 && (n as Element).classList.contains("jd-chip");

/** The leaves of `root` the range covers: its text nodes and chips. With `split` the boundary text nodes are split, so every leaf is whole. */
function leavesIn(root: HTMLElement, range: Range, split = true): Node[] {
  const { endContainer: end, endOffset } = range;
  if (split && end.nodeType === 3 && endOffset < (end as Text).length && endOffset > 0) (end as Text).splitText(endOffset);
  const { startContainer: start, startOffset } = range;
  if (split && start.nodeType === 3 && startOffset > 0 && startOffset < (start as Text).length) range.setStart((start as Text).splitText(startOffset), 0);
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (isChip(n)) {
      if (range.intersectsNode(n)) out.push(n);
      return;
    }
    if (n.nodeType === 3) {
      if ((n as Text).length && range.intersectsNode(n) && !(n === range.endContainer && range.endOffset === 0) && !(n === range.startContainer && range.startOffset === (n as Text).length)) out.push(n);
      return;
    }
    n.childNodes.forEach(walk);
  };
  walk(root);
  return out;
}

/** The nearest ancestor of `n` inside `root` that is of format `f`. */
function ancestor(n: Node, root: HTMLElement, f: Format): HTMLElement | null {
  for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (is(p, f)) return p;
  return null;
}

/** Move `top` (a direct child of `el`) out of `el`, splitting `el` around it: el … top el'. Empty halves go. */
function peel(top: Node, el: HTMLElement) {
  const after = el.cloneNode(false) as HTMLElement;
  while (top.nextSibling) after.appendChild(top.nextSibling);
  el.after(top);
  if (after.childNodes.length) top.parentNode!.insertBefore(after, top.nextSibling);
  if (!el.childNodes.length) el.remove();
}

/** Split the wrappers between `leaf` and `el` so a copy of each holds the leaf alone; the child of `el` that holds it. */
function isolate(leaf: Node, el: HTMLElement): Node {
  let node = leaf;
  while (node.parentNode !== el) {
    const p = node.parentNode as HTMLElement;
    const after = p.cloneNode(false);
    while (node.nextSibling) after.appendChild(node.nextSibling);
    const before = p.cloneNode(false);
    while (p.firstChild !== node) before.appendChild(p.firstChild!);
    if (after.childNodes.length) p.after(after);
    if (before.childNodes.length) p.before(before);
    node = p;
  }
  return node;
}

/** Remove format `f` from one leaf: split the element of that format around it, keeping what wraps the leaf inside it. */
function strip(leaf: Node, root: HTMLElement, f: Format) {
  for (let el = ancestor(leaf, root, f); el; el = ancestor(leaf, root, f)) {
    peel(isolate(leaf, el), el);
  }
}

/** Neighbouring elements of the same source become one (so a word made bold in two steps is one <strong>). */
function merge(root: HTMLElement) {
  const walk = (el: Element) => {
    for (let c = el.firstElementChild; c; ) {
      const next = c.nextElementSibling;
      const prev = c.previousSibling;
      if (prev && prev.nodeType === 1 && c.getAttribute("data-jd-raw") !== null && (prev as Element).getAttribute("data-jd-raw") === c.getAttribute("data-jd-raw") && isAny(c)) {
        while (c.firstChild) prev.appendChild(c.firstChild);
        c.remove();
        walk(prev as Element);
      } else walk(c);
      c = next;
    }
  };
  walk(root);
}

/** Every leaf of the range has the format. */
export function covers(root: HTMLElement, range: Range, f: Format): boolean {
  const leaves = leavesIn(root, range);
  return leaves.length > 0 && leaves.every((l) => ancestor(l, root, f));
}

/**
 * Turn `f` on over the range (off when it is on for all of it). For colour pass `color`: a hex colour sets it, null
 * clears it. Returns the range now covering the same leaves, to select again.
 */
export function toggle(root: HTMLElement, range: Range, f: Format, color?: string | null): Range | null {
  const leaves = leavesIn(root, range);
  if (!leaves.length) return null;
  const off = f === "color" ? !color : leaves.every((l) => ancestor(l, root, f));
  for (const leaf of leaves) {
    strip(leaf, root, f); // a colour is replaced, not stacked
    if (off) continue;
    const wrap = make(f, color ?? undefined);
    leaf.parentNode!.insertBefore(wrap, leaf);
    wrap.appendChild(leaf);
  }
  merge(root);
  const out = document.createRange();
  out.setStartBefore(leaves[0]);
  out.setEndAfter(leaves[leaves.length - 1]);
  return out;
}

/** Remove bold, italic, underline and colour from the range. */
export function clear(root: HTMLElement, range: Range): Range | null {
  const leaves = leavesIn(root, range);
  if (!leaves.length) return null;
  for (const leaf of leaves) for (const f of ["bold", "italic", "underline", "color"] as const) strip(leaf, root, f);
  merge(root);
  const out = document.createRange();
  out.setStartBefore(leaves[0]);
  out.setEndAfter(leaves[leaves.length - 1]);
  return out;
}

export type FormatState = { bold: boolean; italic: boolean; underline: boolean; color: string | null };

/** What is on at a point (the caret) or over a range (on only when on for all of it). */
export function stateAt(root: HTMLElement, range: Range): FormatState {
  const nodes: Node[] = range.collapsed ? [range.startContainer] : leavesIn(root, range, false);
  const per = (f: Exclude<Format, "color">) => nodes.length > 0 && nodes.every((n) => ancestor(n, root, f) || (n.nodeType === 1 && n !== root && is(n as Element, f)));
  const colors = nodes.map((n) => {
    const el = ancestor(n, root, "color");
    return el ? colorOf(el) : null;
  });
  return { bold: per("bold"), italic: per("italic"), underline: per("underline"), color: colors.length && colors.every((c) => c === colors[0]) ? colors[0] : null };
}
