import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isBroken, leaves, parse, print, tokenize, type BlockNode, type ElementNode, type Node } from "@/lib/doc-parse";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const starter = (name: string) => readFileSync(join(STARTERS, name, "template.html"), "utf8");
const FIXTURES = join(__dirname, "fixtures/doc");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

/** The leaves of the tree follow each other with no gap or overlap from 0 to the end of the file. */
function tiles(src: string) {
  const ls = leaves(parse(src));
  let at = 0;
  for (const l of ls) {
    expect(l.start).toBe(at);
    at = l.end;
  }
  expect(at).toBe(src.length);
}

const find = (n: Node, pred: (n: Node) => boolean): Node | null => {
  if (pred(n)) return n;
  const kids =
    n.kind === "root" || n.kind === "element" ? n.children : n.kind === "block" ? n.branches.flatMap((b) => b.children) : [];
  for (const k of kids) {
    const f = find(k, pred);
    if (f) return f;
  }
  return null;
};

describe("round trip: every byte stays", () => {
  for (const name of readdirSync(STARTERS)) {
    it(`starter ${name}`, () => {
      const src = starter(name);
      expect(print(src, parse(src))).toBe(src);
      tiles(src);
      expect(isBroken(parse(src))).toBe(false);
    });
  }
  for (const name of readdirSync(FIXTURES)) {
    it(`fixture ${name}`, () => {
      const src = fixture(name);
      expect(print(src, parse(src))).toBe(src);
      tiles(src);
    });
  }
  it("odd inputs: empty, only text, a lone <, unclosed delimiters", () => {
    for (const src of ["", "สวัสดี", "a < b", "{{ x", "{% if x %}", "<div", "{# c", "<p>a</div>"]) {
      expect(print(src, parse(src))).toBe(src);
      tiles(src);
    }
  });
});

describe("structure", () => {
  it("keeps {% for %} inside the table body, unlike a browser", () => {
    const tree = parse(starter("quotation"));
    const tbody = find(tree, (n) => n.kind === "element" && n.name === "tbody") as ElementNode;
    const loop = tbody.children.find((c) => c.kind === "block") as BlockNode;
    expect(loop.keyword).toBe("for");
    expect(loop.branches[0].children.some((c) => c.kind === "element" && c.name === "tr")).toBe(true);
  });

  it("splits if/elif/else and for/else into branches", () => {
    const src = "{% if a %}A{% elif b %}B{% else %}C{% endif %}{% for x in xs %}{{ x }}{% else %}none{% endfor %}";
    const [ifb, forb] = parse(src).children as BlockNode[];
    expect(ifb.branches.map((b) => b.tag.keyword)).toEqual(["if", "elif", "else"]);
    expect(forb.branches.map((b) => src.slice(b.children[0].start, b.children[0].end))).toEqual(["{{ x }}", "none"]);
    expect(ifb.close).not.toBeNull();
  });

  it("reads macro, set (both forms), whitespace control and comments", () => {
    const src = '{%- macro b(c) -%}{{ c }}{%- endmacro -%}{% set n = 1 %}{% set t %}x{% endset %}{# note #}';
    const kids = parse(src).children;
    expect(kids.map((k) => (k.kind === "block" ? `block:${k.keyword}` : k.kind))).toEqual([
      "block:macro",
      "stmt",
      "block:set",
      "comment",
    ]);
  });

  it("does not take < or > inside {{ }} or attributes for a tag", () => {
    const src = '<p class="{{ "a" if x > 1 else "b" }}">{{ a < b }}</p>';
    const p = parse(src).children[0] as ElementNode;
    expect(p.kind).toBe("element");
    expect(p.attrs[0]).toMatchObject({ name: "class", value: '{{ "a" if x > 1 else "b" }}' });
    expect(p.children.map((c) => c.kind)).toEqual(["expr"]);
    expect(p.broken).toBe(false);
  });

  it("keeps <style> and {% raw %} content as text", () => {
    const tree = parse("<style>p > a { x: 1 }</style>{% raw %}{{ not }}{% endraw %}");
    const style = tree.children[0] as ElementNode;
    expect(style.children.map((c) => c.kind)).toEqual(["text"]);
    const raw = tree.children[1] as BlockNode;
    expect(raw.branches[0].children.map((c) => c.kind)).toEqual(["text"]);
  });

  it("marks what is unclosed or misnested as broken, never throws", () => {
    expect(isBroken(parse("<div><p>a</div>"))).toBe(true); // <p> left open inside the div
    expect(isBroken(parse("<p>a</div>"))).toBe(true); // stray close
    expect(isBroken(parse("{% if x %}<div>{% endif %}</div>"))).toBe(true); // element across a block
    expect(isBroken(parse("{% if x %}a"))).toBe(true);
    expect(isBroken(parse("<img src=a.png><br><hr/>"))).toBe(false); // void elements
  });

  it("reads {# #} and {% %} inside attribute values", () => {
    const div = parse(fixture("jinja-in-attrs.html")).children[0] as ElementNode;
    expect(div.broken).toBe(false);
    expect(div.attrs.map((a) => a.name)).toEqual(["title", "data-a"]);
    expect(div.children.map((c) => c.kind)).toEqual(["text"]);
  });

  it("knows where an attribute value sits, quotes excluded", () => {
    const src = '<img src="logo.png" alt=x>';
    const img = parse(src).children[0] as ElementNode;
    const [s, a] = img.attrs;
    expect(src.slice(s.valueRange!.start, s.valueRange!.end)).toBe("logo.png");
    expect(a).toMatchObject({ name: "alt", value: "x" });
  });

  it("tokens of a tax invoice include the inline if inside text", () => {
    const tokens = tokenize(starter("tax-invoice"));
    expect(tokens.some((t) => t.type === "stmt" && t.keyword === "if")).toBe(true);
    expect(tokens.some((t) => t.type === "comment")).toBe(true);
  });
});
