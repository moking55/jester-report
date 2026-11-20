import { describe, expect, it } from "vitest";

import { readBlocks } from "@/lib/doc-blocks";
import { addSummaryRow, equalColumns } from "@/lib/doc-edit";

const first = (src: string) => readBlocks(src).items[0];

describe("edits behind the toolbar's buttons", () => {
  it("makes the columns of a row equal", () => {
    const src = '<div data-jd="row">\n  <div data-jd="col" style="flex: 2"><p>a</p></div>\n  <div data-jd="col" style="flex: 3"><p>b</p></div>\n</div>';
    const out = equalColumns(src, first(src));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.src).not.toMatch(/flex:\s*[23]/);
    expect(readBlocks(out.value.src).items[0].kind).toBe("row");
  });

  it("adds a summary row like the last one", () => {
    const src = '<table data-jd="summary">\n  <tr><td>รวม</td><td>{{ a }}</td></tr>\n  <tr><td>สุทธิ</td><td>{{ b }}</td></tr>\n</table>';
    const out = addSummaryRow(src, first(src));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const b = readBlocks(out.value.src).items[0];
    expect(b.detail.kind === "summary" && b.detail.rows.length).toBe(3);
    expect(out.value.src).toContain("<tr><td>สุทธิ</td><td>{{ b }}</td></tr>\n  <tr><td>สุทธิ</td><td>{{ b }}</td></tr>\n</table>");
  });

  it("refuses a block of another kind", () => {
    expect(addSummaryRow("<p>x</p>", first("<p>x</p>"))).toMatchObject({ ok: false });
    expect(equalColumns("<p>x</p>", first("<p>x</p>"))).toMatchObject({ ok: false });
  });
});
