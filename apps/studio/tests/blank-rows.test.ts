// v1.14: blank-form rows of a list table (SPEC-studio v1.14, tasks/v1.14/plan.md "รูปแบบ Jinja")
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allBlocks, readBlocks, type Block } from "@/lib/doc-blocks";
import { addColumn, insertBlock, newBlockHtml, removeColumn, setBlankRows } from "@/lib/doc-edit";
import { renderSource } from "@/lib/doc-render";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const starter = (name: string) => readFileSync(join(STARTERS, name, "template.html"), "utf8");

const tableOf = (src: string): Block => {
  const t = allBlocks(readBlocks(src)).find((b) => b.kind === "table");
  expect(t, "a list table").toBeTruthy();
  return t!;
};
const detail = (src: string) => {
  const d = tableOf(src).detail;
  if (d.kind !== "table") throw new Error("not a table");
  return d;
};
const set = (src: string, n: number) => {
  const r = setBlankRows(src, tableOf(src), n);
  if (!r.ok) throw new Error(r.error);
  return r.value.src;
};

const WITH_ELSE = `<table>
  <thead><tr><th>A</th><th>B</th></tr></thead>
  <tbody>
  {% for r in lists.rows %}
    <tr><td class="n">{{ r.a }}</td><td>{{ r.b }}</td></tr>
  {% else %}
    <tr><td colspan="2">ไม่มีรายการ</td></tr>
  {% endfor %}
    <tr><td>รวม</td><td>{{ totals.sum }}</td></tr>
  </tbody>
</table>
`;

describe("blank rows of a list table", () => {
  it("writes the planned form, reads it back as N, and 0 gives the file back exactly", () => {
    const ten = set(WITH_ELSE, 10);
    expect(ten).toContain("{% if meta.blank %}{% for _ in range(10 - lists.rows|length) %}");
    expect(ten).toContain('<tr data-jd="blank"><td class="n">&nbsp;</td><td>&nbsp;</td></tr>');
    expect(ten).toContain('{% if not meta.blank %}<tr><td colspan="2">ไม่มีรายการ</td></tr>{% endif %}');
    expect(tableOf(ten).kind).toBe("table");
    expect(detail(ten).blankRows?.count).toBe(10);
    expect(detail(ten).footer).toHaveLength(1); // the total row is still the footer
    const fifteen = set(ten, 15);
    expect(detail(fifteen).blankRows?.count).toBe(15);
    expect(set(fifteen, 0)).toBe(WITH_ELSE);
    expect(set(WITH_ELSE, 0)).toBe(WITH_ELSE);
  });

  it("a table without an else row or footer, and one with a detail row", () => {
    const plain = starter("quotation");
    expect(set(set(plain, 10), 0)).toBe(plain);
    const detailed = WITH_ELSE.replace(
      "<td>{{ r.b }}</td></tr>\n",
      '<td>{{ r.b }}</td></tr>\n    <tr data-jd="detail"><td colspan="2"></td></tr>\n',
    );
    expect(detail(set(detailed, 5)).blankRows?.count).toBe(5);
    expect(set(set(detailed, 5), 0)).toBe(detailed);
  });

  it("columns added or removed keep the blank row in step", () => {
    const ten = set(WITH_ELSE, 10);
    const added = addColumn(ten, tableOf(ten), 1, "C", "{{ r.c }}");
    if (!added.ok) throw new Error(added.error);
    expect(detail(added.value.src).blankRows?.cells).toHaveLength(3);
    const removed = removeColumn(ten, tableOf(ten), 0);
    if (!removed.ok) throw new Error(removed.error);
    expect(detail(removed.value.src).blankRows?.cells).toHaveLength(1);
  });

  it("a table dropped from the palette prints 10 empty rows on a blank form", () => {
    const page = "<p>a</p>\n";
    const html = newBlockHtml({ kind: "table", variable: "it", iterable: "lists.items", columns: [{ head: "A", expr: "it.a" }, { head: "B", expr: "it.b" }] });
    const src = insertBlock(page, readBlocks(page), 1, html).src;
    expect(detail(src).blankRows?.count).toBe(10);
    expect(detail(src).blankRows?.cells).toHaveLength(2);
    expect(detail(set(src, 0)).blankRows).toBeNull();
  });

  it("the paper does not draw the blank rows, with or without sample data", () => {
    const ten = set(WITH_ELSE, 10);
    for (const sample of [null, { lists: { rows: [] } }]) {
      const html = renderSource(ten, { sample, asset: (n: string) => n });
      expect(html).not.toContain('data-jd="blank"');
      expect(html).toContain("ไม่มีรายการ");
    }
  });

  it("refuses counts outside 0-100", () => {
    expect(setBlankRows(WITH_ELSE, tableOf(WITH_ELSE), 101).ok).toBe(false);
    expect(setBlankRows(WITH_ELSE, tableOf(WITH_ELSE), -1).ok).toBe(false);
  });

  it("something close to the form but not it stays Custom Code", () => {
    const other = set(WITH_ELSE, 10).replace("range(10 - lists.rows|length)", "range(10 - lists.other|length)");
    expect(allBlocks(readBlocks(other)).some((b) => b.kind === "table")).toBe(false);
  });

  const withTable = readdirSync(STARTERS).filter((n) => allBlocks(readBlocks(starter(n))).some((b) => b.kind === "table"));
  it.each(withTable)("%s: setting blank rows and back to 0 leaves the starter as it was", (name) => {
    const src = starter(name);
    const kinds = allBlocks(readBlocks(src)).map((b) => b.kind);
    const ten = set(src, 10);
    expect(allBlocks(readBlocks(ten)).map((b) => b.kind)).toEqual(kinds); // nothing became Custom Code
    expect(set(ten, 0)).toBe(src);
  });
});
