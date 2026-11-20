import { describe, expect, it } from "vitest";

import { readBlocks } from "@/lib/doc-blocks";
import { addBranch, addSummaryRow, equalColumns, removeElse } from "@/lib/doc-edit";

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

describe("else of conditions and loops", () => {
  it("adds and removes the else of a loop", () => {
    const src = "{% for r in lists.a %}\n  <p>{{ r.x }}</p>\n{% endfor %}";
    const withElse = addBranch(src, first(src), "else");
    expect(withElse.ok && withElse.value.src).toBe("{% for r in lists.a %}\n  <p>{{ r.x }}</p>\n{% else %}\n{% endfor %}");
    if (!withElse.ok) return;
    const b = first(withElse.value.src);
    expect(b.lists).toHaveLength(2);
    const gone = removeElse(withElse.value.src, b);
    expect(gone.ok && gone.value.src).toBe(src);
  });

  it("removes the else of a condition with its content", () => {
    const src = "{% if a %}\n  <p>x</p>\n{% else %}\n  <p>y</p>\n{% endif %}";
    const out = removeElse(src, first(src));
    expect(out.ok && out.value.src).toBe("{% if a %}\n  <p>x</p>\n{% endif %}");
    expect(removeElse("{% if a %}x{% endif %}", first("{% if a %}x{% endif %}"))).toMatchObject({ ok: false });
  });

  it("only a loop takes an else; an elif is for conditions", () => {
    const src = "{% for r in lists.a %}<p>x</p>{% endfor %}";
    expect(addBranch(src, first(src), "elif")).toMatchObject({ ok: false });
  });
});

describe("columns of a row", () => {
  it("sets the number of columns, keeping blocks of a column that goes", async () => {
    const { setRowColumns } = await import("@/lib/doc-edit");
    const src = '<div data-jd="row">\n  <div data-jd="col" style="flex: 1"><p>a</p></div>\n  <div data-jd="col" style="flex: 1"><p>b</p></div>\n  <div data-jd="col" style="flex: 1"><p>c</p></div>\n</div>';
    const two = setRowColumns(src, first(src), 2);
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    const b = readBlocks(two.value.src).items[0];
    expect(b.lists).toHaveLength(2);
    expect(two.value.src).toContain("<p>c</p>");
    const four = setRowColumns(two.value.src, b, 4);
    expect(four.ok && readBlocks(four.value.src).items[0].lists).toHaveLength(4);
    expect(setRowColumns(src, first(src), 5)).toMatchObject({ ok: false });
  });
});
