import { describe, expect, it } from "vitest";

import { allBlocks, blockAt, readBlocks } from "@/lib/doc-blocks";
import { addDetailRow, insertBlock, newBlockHtml, removeDetailRow, type Edited, type Result } from "@/lib/doc-edit";

const TABLE = [
  '<table style="width: 100%">',
  "  <thead><tr><th>ใบสั่งซื้อ</th><th>ผู้ขาย</th></tr></thead>",
  "  <tbody>",
  "  {% for o in lists.orders %}",
  "    <tr><td>{{ o.orderId }}</td><td>{{ o.supplier }}</td></tr>",
  "  {% endfor %}",
  "  </tbody>",
  "</table>",
  "",
].join("\n");

const value = (r: Result<Edited>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value.src;
};
const table = (src: string) => readBlocks(src).items[0];

describe("a detail row under every row (v1.8)", () => {
  it("a list table has none until it is added; then its cell is a list of blocks", () => {
    expect(table(TABLE).kind).toBe("table");
    expect(table(TABLE).lists).toEqual([]);
    const withRow = value(addDetailRow(TABLE, table(TABLE)));
    expect(withRow).toContain('<tr data-jd="detail"><td colspan="2"></td></tr>');
    const b = table(withRow);
    expect(b.kind).toBe("table");
    expect(b.lists.map((l) => l.key)).toEqual(["detail"]);
    expect(b.detail.kind === "table" && b.detail.detailRow !== null).toBe(true);
    // only the table changed, and adding it again is refused
    expect(withRow.replace('\n    <tr data-jd="detail"><td colspan="2"></td></tr>', "")).toBe(TABLE);
    expect(addDetailRow(withRow, b).ok).toBe(false);
  });

  it("blocks go in it, three levels deep, with a table of the child list inside", () => {
    let src = value(addDetailRow(TABLE, table(TABLE)));
    let t = table(src);
    src = insertBlock(src, t.lists[0].list, 0, newBlockHtml({ kind: "repeat", variable: "d", iterable: "o.details" })).src;
    t = table(src);
    const repeat = t.lists[0].list.items[0];
    expect(repeat.kind).toBe("repeat");
    src = insertBlock(src, repeat.lists[0].list, 0, newBlockHtml({ kind: "repeat", variable: "p", iterable: "d.parts" })).src;
    const all = allBlocks(readBlocks(src));
    expect(all.filter((b) => b.kind === "repeat").length).toBe(2);
    expect(blockAt(readBlocks(src), [0, 0, 0, 0, 0])?.kind).toBe("repeat"); // table > detail > repeat > repeat
    expect(all.some((b) => b.kind === "custom")).toBe(false);
  });

  it("removing it takes its blocks too; the table is as before", () => {
    const withRow = value(addDetailRow(TABLE, table(TABLE)));
    const t = table(withRow);
    const filled = insertBlock(withRow, t.lists[0].list, 0, newBlockHtml({ kind: "text" })).src;
    expect(value(removeDetailRow(filled, table(filled)))).toBe(TABLE);
  });

  it("a detail row that is not <tr data-jd=detail><td> is Custom Code", () => {
    const odd = TABLE.replace("  {% endfor %}", '    <tr><td colspan="2">x</td></tr>\n  {% endfor %}');
    expect(table(odd).kind).toBe("custom");
  });
});
