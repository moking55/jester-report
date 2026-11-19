import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allBlocks, blockAt, coverage, readBlocks, type Block, type BlockList } from "@/lib/doc-blocks";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const starter = (name: string) => readFileSync(join(STARTERS, name, "template.html"), "utf8");
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/doc", name), "utf8");

const kinds = (src: string) => readBlocks(src).items.map((b) => b.kind);
const one = (src: string): Block => {
  const items = readBlocks(src).items;
  expect(items).toHaveLength(1);
  return items[0];
};

/** Blocks and whitespace gaps tile every list exactly. */
function tiles(src: string, list: BlockList) {
  let at = list.range.start;
  for (const b of list.items) {
    expect(src.slice(at, b.start).trim()).toBe("");
    at = b.end;
    for (const l of b.lists) tiles(src, l.list);
  }
  expect(src.slice(at, list.range.end).trim()).toBe("");
}

describe("block kinds (designer forms)", () => {
  it("text: p/h1-4/div of inline content, with chips and an if inside the sentence", () => {
    expect(one("<p>เรียน {{ data.customer.name }}<br><b>ด่วน</b></p>").kind).toBe("text");
    expect(one('<h1 style="text-align:center">ใบเสนอราคา</h1>').kind).toBe("text");
    expect(one("<p>ผู้ซื้อ{% if x %} · {{ x }}{% endif %}</p>").kind).toBe("text");
    expect(one("<p>a<div>b</div></p>").kind).toBe("custom"); // a block inside a paragraph
  });

  it("field and code: a div with one expression", () => {
    expect(one("<div>{{ data.total }}</div>")).toMatchObject({ kind: "field", detail: { inner: "data.total" } });
    expect(one("<div>{{ fmt.qr(data.url) }}</div>").kind).toBe("code");
    expect(one('<div>{{ fmt.promptpay("0812345678", totals.grand) }}</div>').kind).toBe("code");
    expect(one("<div>{{ a }}{{ b }}</div>").kind).toBe("text");
  });

  it("image, rule, space, page break", () => {
    expect(one('<img src="logo.png" alt="">').kind).toBe("image");
    expect(one("<img alt=x>").kind).toBe("custom");
    expect(one("<hr>").kind).toBe("rule");
    expect(one('<div data-jd="space" style="height:6mm"></div>').kind).toBe("space");
    expect(one('<div data-jd="page-break" style="break-after:page"></div>').kind).toBe("pagebreak");
  });

  it("row of 2-4 columns, each a list of blocks", () => {
    const b = one('<div data-jd="row"><div data-jd="col"><p>A</p></div><div data-jd="col"><div>{{ x }}</div><hr></div></div>');
    expect(b.kind).toBe("row");
    expect(b.lists.map((l) => l.list.items.map((i) => i.kind))).toEqual([["text"], ["field", "rule"]]);
    expect(one('<div data-jd="row"><div data-jd="col"></div></div>').kind).toBe("custom"); // one column
    expect(one('<div data-jd="row"><div data-jd="col"></div><p>x</p></div>').kind).toBe("custom");
  });

  it("list table: head, loop row, else row, footer rows", () => {
    const b = one(`<table>
  <thead><tr><th>รายการ</th><th class="n">เงิน</th></tr></thead>
  <tbody>
  {% for item in lists.items %}
    <tr><td>{{ item.description }}</td><td class="n">{{ fmt.money(item.amount) }}</td></tr>
  {% else %}
    <tr><td colspan="2">ไม่มีรายการ</td></tr>
  {% endfor %}
    <tr><td>รวม</td><td class="n">{{ fmt.money(totals.grand) }}</td></tr>
  </tbody>
</table>`);
    expect(b.kind).toBe("table");
    expect(b.detail).toMatchObject({ kind: "table", loop: { variable: "item", iterable: "lists.items" } });
    if (b.detail.kind !== "table") throw new Error();
    expect([b.detail.head?.length, b.detail.cells.length, b.detail.emptyRow?.length, b.detail.footer.length]).toEqual([2, 2, 1, 1]);
  });

  it("a table outside the model is Custom Code (caption, tfoot, column count mismatch, block in a cell)", () => {
    const loop = "<tbody>{% for i in lists.x %}<tr><td>{{ i.a }}</td></tr>{% endfor %}</tbody>";
    expect(one(`<table><caption>c</caption>${loop}</table>`).kind).toBe("custom");
    expect(one(`<table>${loop}<tfoot><tr><td>x</td></tr></tfoot></table>`).kind).toBe("custom");
    expect(one(`<table><thead><tr><th>a</th><th>b</th></tr></thead>${loop}</table>`).kind).toBe("custom");
    expect(one("<table><tbody>{% for i in lists.x %}<tr><td><p>x</p></td></tr>{% endfor %}</tbody></table>").kind).toBe("custom");
    expect(one("<table><tbody><tr><td>no loop</td></tr></tbody></table>").kind).toBe("custom");
  });

  it("summary table: label | value rows", () => {
    const b = one('<table data-jd="summary"><tr><td>รวม</td><td>{{ fmt.money(totals.sub) }}</td></tr><tr><td>สุทธิ</td><td>{{ fmt.money(totals.grand) }}</td></tr></table>');
    expect(b.kind).toBe("summary");
  });

  it("condition and repeat hold blocks in their branches; set and comments do not render", () => {
    const src = "{% if data.note %}<p>{{ data.note }}</p>{% else %}<hr>{% endif %}{% for o in lists.orders %}<h2>{{ o.id }}</h2>{% endfor %}{% set n = 1 %}{# c #}";
    const items = readBlocks(src).items;
    expect(items.map((b) => [b.kind, b.render])).toEqual([
      ["condition", true],
      ["repeat", true],
      ["set", false],
      ["custom", false],
    ]);
    expect(items[0].lists.map((l) => [l.label, l.list.items.map((i) => i.kind)])).toEqual([
      ["ถ้า data.note", ["text"]],
      ["ไม่เช่นนั้น", ["rule"]],
    ]);
    expect(items[1].lists[0].list.items[0].kind).toBe("text");
    expect(blockAt(readBlocks(src), [1, 0, 0])?.kind).toBe("text");
  });

  it("the stylesheet link is kept in place but is not a page block; a macro does not render", () => {
    expect(readBlocks('<link rel="stylesheet" href="report.css">\n{% macro m() %}x{% endmacro %}').items.map((b) => [b.kind, b.render])).toEqual([
      ["head", false],
      ["custom", false],
    ]);
  });

  it("a style with Jinja in it is read-only", () => {
    expect(one('<p style="width: {{ w }}mm">x</p>').style).toEqual({ range: expect.anything(), readOnly: true });
    expect(one('<p style="color:red">x</p>').style?.readOnly).toBe(false);
    expect(one("<p>x</p>").style).toEqual({ range: null, readOnly: false });
  });

  it("broken nodes and stray text at block level are Custom Code", () => {
    expect(kinds("<div><p>open</div>")).toEqual(["custom"]);
    expect(kinds("loose text<p>a</p>")).toEqual(["custom", "text"]);
  });
});

describe("lists tile their range; starters baseline", () => {
  for (const name of readdirSync(STARTERS)) {
    it(`starter ${name}`, () => {
      const src = starter(name);
      tiles(src, readBlocks(src));
    });
  }
  for (const name of ["hand-written.html", "broken.html", "jinja-in-attrs.html"]) {
    it(`fixture ${name}`, () => {
      const src = fixture(name);
      tiles(src, readBlocks(src));
    });
  }

  it("records each list's indentation for new blocks", () => {
    const b = one('<div data-jd="row">\n  <div data-jd="col">\n    <p>a</p>\n  </div>\n  <div data-jd="col"></div>\n</div>');
    expect(b.lists[0].list.indent).toBe("    ");
  });

  it("quotation reads as designer blocks already; the baseline of every starter", () => {
    const base = Object.fromEntries(readdirSync(STARTERS).map((n) => [n, coverage(starter(n))]));
    expect(base.quotation).toEqual({ head: 1, image: 1, text: 3, table: 1 });
    // the rest is the T10 rewrite's work list (tasks/v1.7/todo.md, checkpoint G1)
    console.log(JSON.stringify(base, null, 1));
    expect(allBlocks(readBlocks(starter("blank"))).map((b) => b.kind)).toEqual(["text", "text"]);
  });
});
