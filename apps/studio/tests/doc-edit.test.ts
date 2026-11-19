import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { blockAt, readBlocks, type Block } from "@/lib/doc-blocks";
import {
  addBranch,
  addRowColumn,
  mergeColumns,
  setColumnFlex,
  unwrapRow,
  type Edited,
  addColumn,
  insertBlock,
  moveBlock,
  moveColumn,
  newBlockHtml,
  record,
  redo,
  removeBlock,
  removeColumn,
  setAttr,
  setStyle,
  setTagArgs,
  startHistory,
  undo,
  type NewBlock,
  type Result,
} from "@/lib/doc-edit";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/doc", name), "utf8");
const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const quotation = () => readFileSync(join(STARTERS, "quotation", "template.html"), "utf8");

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** The changed region of an edit: everything outside it is byte-identical. */
function changed(a: string, b: string) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  return { start: s, endBefore: a.length - e };
}

const blocks = (src: string) => readBlocks(src);
const nth = (src: string, ...path: number[]): Block => blockAt(blocks(src), path)!;

describe("only the touched block changes", () => {
  it("style: sets and clears known properties, keeps the rest in order, adds style= when missing", () => {
    const src = fixture("hand-written.html");
    const page = blocks(src);
    const head = page.items.find((b) => b.kind === "custom" && src.slice(b.start, b.end).startsWith('<div   class="head"'))!;
    expect(head).toBeTruthy(); // the head div holds an h1 and a p: not a text block
    const p = readBlocks(src);
    const h1Doc = '<h1 style="color:#333;  font-size: 20pt">{{ title }}</h1>';
    const one = readBlocks(h1Doc).items[0];
    const out = unwrap(setStyle(h1Doc, one, { "font-size": "24pt", "text-align": "center" }));
    expect(out.src).toBe('<h1 style="color: #333; font-size: 24pt; text-align: center">{{ title }}</h1>');
    const added = unwrap(setStyle("<p>x</p>", readBlocks("<p>x</p>").items[0], { "font-weight": "bold" }));
    expect(added.src).toBe('<p style="font-weight: bold">x</p>');
    expect(p.items.length).toBeGreaterThan(0);
  });

  it("style with Jinja inside is refused", () => {
    const src = '<p style="width: {{ w }}mm">x</p>';
    expect(setStyle(src, readBlocks(src).items[0], { color: "red" }).ok).toBe(false);
  });

  it("attributes: replace a value in place, or add the attribute", () => {
    const src = '<img src="logo.png" alt="">';
    const img = readBlocks(src).items[0];
    expect(unwrap(setAttr(src, img, "src", "seal.png")).src).toBe('<img src="seal.png" alt="">');
    expect(unwrap(setAttr(src, img, "width", "40")).src).toBe('<img src="logo.png" alt="" width="40">');
  });

  it("inserting in the quotation keeps every other byte, with the list's indent", () => {
    const src = quotation();
    const page = blocks(src);
    const out = insertBlock(src, page, 2, newBlockHtml({ kind: "rule" }));
    const c = changed(src, out.src);
    expect(out.src.slice(out.at!.start, out.at!.end)).toBe("<hr>");
    expect(c.start).toBeGreaterThanOrEqual(page.items[1].end); // nothing before the insertion point moved
    expect(blocks(out.src).items.map((b) => b.kind)).toEqual(["head", "image", "rule", "text", "text", "table", "text"]);
  });

  it("removing takes the line break in front, so blank lines do not pile up", () => {
    const src = "<p>a</p>\n<hr>\n<p>b</p>\n";
    expect(removeBlock(src, nth(src, 1)).src).toBe("<p>a</p>\n<p>b</p>\n");
  });

  it("moves a block into a column and re-indents it; out again restores the text", () => {
    const src = '<p>a</p>\n<div data-jd="row">\n  <div data-jd="col">\n    <p>x</p>\n  </div>\n  <div data-jd="col"></div>\n</div>\n';
    const page = blocks(src);
    const col1 = page.items[1].lists[1].list; // empty column
    const moved = unwrap(moveBlock(src, page.items[0], col1, 0));
    expect(moved.src).toBe('<div data-jd="row">\n  <div data-jd="col">\n    <p>x</p>\n  </div>\n  <div data-jd="col">\n    <p>a</p>\n  </div>\n</div>\n');
    const back = blocks(moved.src);
    const a = back.items[0].lists[1].list.items[0];
    const again = unwrap(moveBlock(moved.src, a, back, 0));
    expect(blocks(again.src).items.map((b) => b.kind)).toEqual(["text", "row"]);
    expect(again.src.slice(again.at!.start, again.at!.end)).toBe("<p>a</p>");
  });

  it("refuses moving a container into itself; dropping where it was changes nothing", () => {
    const src = '<div data-jd="row"><div data-jd="col"><p>a</p></div><div data-jd="col"></div></div>';
    const row = nth(src, 0);
    expect(moveBlock(src, row, row.lists[0].list, 0).ok).toBe(false);
    const p = "<p>a</p>\n<p>b</p>";
    expect(unwrap(moveBlock(p, nth(p, 0), blocks(p), 0)).src).toBe(p);
  });

  it("reorders within a list", () => {
    const src = "<p>a</p>\n<p>b</p>\n<p>c</p>";
    const out = unwrap(moveBlock(src, nth(src, 0), blocks(src), 2));
    expect(out.src).toBe("<p>b</p>\n<p>c</p>\n<p>a</p>");
  });
});

describe("Jinja tags", () => {
  it("edits a condition's test keeping whitespace control", () => {
    const src = "{%- if data.a -%}<p>x</p>{%- endif -%}";
    const cond = nth(src, 0);
    if (cond.detail.kind !== "condition") throw new Error();
    const out = unwrap(setTagArgs(src, cond, cond.detail.branches[0].tag, "if", "data.b == 'y'"));
    expect(out.src).toBe("{%- if data.b == 'y' -%}<p>x</p>{%- endif -%}");
    expect(setTagArgs(src, cond, cond.detail.branches[0].tag, "if", "x %} {% y").ok).toBe(false);
  });

  it("adds elif before else and else before endif", () => {
    const src = "{% if a %}\n<p>A</p>\n{% endif %}";
    const withElse = unwrap(addBranch(src, nth(src, 0), "else"));
    expect(withElse.src).toBe("{% if a %}\n<p>A</p>\n{% else %}\n{% endif %}");
    const withElif = unwrap(addBranch(withElse.src, nth(withElse.src, 0), "elif", "b"));
    expect(withElif.src).toBe("{% if a %}\n<p>A</p>\n{% elif b %}\n{% else %}\n{% endif %}");
    expect(nth(withElif.src, 0).lists.map((l) => l.label)).toEqual(["ถ้า a", "ไม่เช่นนั้นถ้า b", "ไม่เช่นนั้น"]);
    expect(addBranch(withElif.src, nth(withElif.src, 0), "else").ok).toBe(false);
  });

  it("edits a repeat's loop header", () => {
    const src = "{% for o in lists.orders %}<h2>{{ o.id }}</h2>{% endfor %}";
    const rep = nth(src, 0);
    if (rep.detail.kind !== "repeat") throw new Error();
    expect(unwrap(setTagArgs(src, rep, rep.detail.tag, "for", "o in lists.pos")).src).toBe("{% for o in lists.pos %}<h2>{{ o.id }}</h2>{% endfor %}");
  });
});

describe("tables", () => {
  const table = () => quotation().slice(quotation().indexOf("<table>"), quotation().indexOf("</table>") + 8);

  it("adds a column to head and loop row, widening the footer colspans", () => {
    const src = table();
    const t = nth(src, 0);
    const out = unwrap(addColumn(src, t, 1, "หน่วย", "{{ item.unit }}"));
    const after = nth(out.src, 0);
    expect(after.kind).toBe("table");
    if (after.detail.kind !== "table") throw new Error();
    expect([after.detail.head!.length, after.detail.cells.length]).toEqual([6, 6]);
    expect(out.src).toContain('<td colspan="5">รวม</td>');
  });

  it("removes and moves columns, still a table", () => {
    const src = table();
    const removed = unwrap(removeColumn(src, nth(src, 0), 0));
    const r = nth(removed.src, 0);
    if (r.detail.kind !== "table") throw new Error();
    expect(r.detail.cells.length).toBe(4);
    expect(removed.src).toContain('<td colspan="3">รวม</td>');
    const moved = unwrap(moveColumn(src, nth(src, 0), 0, 1));
    expect(moved.src).toContain("<th>รายการ</th><th>รหัส</th>");
    expect(nth(moved.src, 0).kind).toBe("table");
  });
});

describe("new blocks read back as their kind", () => {
  const cases: [NewBlock, string][] = [
    [{ kind: "text" }, "text"],
    [{ kind: "heading" }, "text"],
    [{ kind: "field", expr: "data.x" }, "field"],
    [{ kind: "image", src: "logo.png" }, "image"],
    [{ kind: "row", columns: 3 }, "row"],
    [{ kind: "table", variable: "item", iterable: "lists.items", columns: [{ head: "A", expr: "item.a" }] }, "table"],
    [{ kind: "summary", rows: [{ label: "รวม", expr: "fmt.money(totals.grand)" }] }, "summary"],
    [{ kind: "code", expr: "fmt.qr(data.url)" }, "code"],
    [{ kind: "rule" }, "rule"],
    [{ kind: "space" }, "space"],
    [{ kind: "pagebreak" }, "pagebreak"],
    [{ kind: "condition", test: "data.note" }, "condition"],
    [{ kind: "repeat", variable: "o", iterable: "lists.orders" }, "repeat"],
    [{ kind: "set", name: "n", expr: "1" }, "set"],
    [{ kind: "custom" }, "text"], // an editable starting point; it becomes Custom Code once edited in the modal
  ];
  for (const [b, kind] of cases) {
    it(b.kind, () => {
      const src = "<p>a</p>\n";
      const out = insertBlock(src, blocks(src), 1, newBlockHtml(b));
      expect(blocks(out.src).items.map((x) => x.kind)).toEqual(["text", kind]);
    });
  }

  it("inserts into an empty condition branch with an indent", () => {
    const src = "{% if a %}\n{% endif %}";
    const out = insertBlock(src, nth(src, 0).lists[0].list, 0, "<p>x</p>");
    expect(out.src).toBe("{% if a %}\n  <p>x</p>\n{% endif %}");
  });
});

describe("undo / redo", () => {
  it("returns every byte, across many steps; a new edit drops the redo branch", () => {
    let h = startHistory("<p>a</p>");
    h = record(h, "<p>b</p>");
    h = record(h, "<p>c</p>");
    h = undo(undo(h));
    expect(h.now).toBe("<p>a</p>");
    h = redo(h);
    expect(h.now).toBe("<p>b</p>");
    h = record(h, "<p>z</p>");
    expect(redo(h).now).toBe("<p>z</p>");
    expect(undo(startHistory("x")).now).toBe("x");
  });
});

describe("row columns (v1.7 รอบแก้)", () => {
  const ROW = [
    "<h1>x</h1>",
    '<div data-jd="row" style="display: flex; gap: 4mm">',
    '  <div data-jd="col" style="flex: 1">',
    "    <p>a</p>",
    "  </div>",
    '  <div data-jd="col" style="flex: 2">',
    "    <p>b</p>",
    "    <p>c</p>",
    "  </div>",
    '  <div data-jd="col"></div>',
    "</div>",
    "<p>after</p>",
    "",
  ].join("\n");
  const row = (src: string) => readBlocks(src).items.find((b) => b.kind === "row")!;
  const value = (r: Result<Edited>) => {
    if (!r.ok) throw new Error(r.error);
    return r.value.src;
  };

  it("adds a column at the end, and no more than 4", () => {
    const out = value(addRowColumn(ROW, row(ROW)));
    expect(out).toContain('  <div data-jd="col"></div>\n  <div data-jd="col" style="flex: 1"></div>\n</div>');
    expect(addRowColumn(out, row(out)).ok).toBe(false);
  });

  it("merges the right column into the left: blocks follow, shares add up, only the row changes", () => {
    const out = value(mergeColumns(ROW, row(ROW), 0));
    expect(out).toBe(
      [
        "<h1>x</h1>",
        '<div data-jd="row" style="display: flex; gap: 4mm">',
        '  <div data-jd="col" style="flex: 3">',
        "    <p>a</p>",
        "    <p>b</p>",
        "    <p>c</p>",
        "  </div>",
        '  <div data-jd="col"></div>',
        "</div>",
        "<p>after</p>",
        "",
      ].join("\n"),
    );
    expect(readBlocks(out).items.find((b) => b.kind === "row")!.lists.length).toBe(2);
  });

  it("merging into an empty column and a column with no style", () => {
    const out = value(mergeColumns(ROW, row(ROW), 1));
    expect(out).toContain('<div data-jd="col" style="flex: 3">\n    <p>b</p>\n    <p>c</p>\n  </div>\n</div>');
  });

  it("refuses to merge a two-column row; unwrapping it keeps the blocks in place", () => {
    const two = value(mergeColumns(ROW, row(ROW), 1));
    expect(mergeColumns(two, row(two), 0).ok).toBe(false);
    const out = value(unwrapRow(two, row(two)));
    expect(out).toBe("<h1>x</h1>\n<p>a</p>\n<p>b</p>\n<p>c</p>\n<p>after</p>\n");
    expect(readBlocks(out).items.map((b) => b.kind)).toEqual(["text", "text", "text", "text", "text"]);
  });

  it("sets a column's share, adding flex when it is not written", () => {
    expect(value(setColumnFlex(ROW, row(ROW), 2, 1.5))).toContain('<div data-jd="col" style="flex: 1.5"></div>');
    expect(value(setColumnFlex(ROW, row(ROW), 1, 4))).toContain('<div data-jd="col" style="flex: 4">');
  });
});
