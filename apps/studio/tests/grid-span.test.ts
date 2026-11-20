import { describe, expect, it } from "vitest";

import { readBlocks } from "@/lib/doc-blocks";
import { gridAddColumn, gridCanMoveColumn, gridCellAt, gridInsertColumn, gridMergeRight, gridMoveColumn, gridRemoveColumn, gridSplit, type Edited, type Result } from "@/lib/doc-edit";

const grid = (src: string) => readBlocks(src).items[0];
const value = (r: Result<Edited>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value.src;
};
const T = (rows: string) => `<table data-jd="grid">${rows}</table>`;
const shape = (src: string) => {
  const d = grid(src).detail;
  return d.kind === "grid" ? d.rows.map((r) => r.cells.map((c) => c.span ?? 1)) : grid(src).kind;
};

describe("fixed tables with spans (v1.10)", () => {
  it("reads a table whose rows span the same number of columns", () => {
    const src = T('<tr><td colspan="2">a</td><td>b</td></tr><tr><td>c</td><td>d</td><td>e</td></tr>');
    expect(grid(src).kind).toBe("grid");
    expect(grid(src).detail).toMatchObject({ cols: 3 });
    expect(shape(src)).toEqual([[2, 1], [1, 1, 1]]);
    expect(grid(T('<tr><td colspan="2">a</td></tr><tr><td>c</td></tr>')).kind).toBe("custom"); // 2 and 1
    expect(grid(T('<tr><td colspan="x">a</td></tr>')).kind).toBe("custom");
  });

  it("finds the cell that covers a column", () => {
    const d = grid(T('<tr><td colspan="2">a</td><td>b</td></tr>')).detail;
    if (d.kind !== "grid") throw new Error();
    expect(gridCellAt(d.rows[0], 1)).toMatchObject({ index: 0, start: 0 });
    expect(gridCellAt(d.rows[0], 2)).toMatchObject({ index: 1, start: 2 });
    expect(gridCellAt(d.rows[0], 3)).toBeNull();
  });

  it("merges a cell with the one on its right, joining their texts, and splits it back", () => {
    const src = T("<tr><td>a</td><td>b</td><td>&nbsp;</td></tr><tr><td>c</td><td>d</td><td>e</td></tr>");
    const merged = value(gridMergeRight(src, grid(src), 0, 0));
    expect(merged).toBe(T('<tr><td colspan="2">a b</td><td>&nbsp;</td></tr><tr><td>c</td><td>d</td><td>e</td></tr>'));
    const twice = value(gridMergeRight(merged, grid(merged), 0, 1)); // column 1 is inside the merged cell
    expect(twice).toBe(T('<tr><td colspan="3">a b</td></tr><tr><td>c</td><td>d</td><td>e</td></tr>'));
    const split = value(gridSplit(twice, grid(twice), 0, 2));
    expect(split).toBe(T("<tr><td>a b</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>c</td><td>d</td><td>e</td></tr>"));
    expect(gridMergeRight(src, grid(src), 0, 2)).toMatchObject({ ok: false });
    expect(gridSplit(src, grid(src), 0, 0)).toMatchObject({ ok: false });
  });

  it("adds a column through a merged cell by widening it, and at its edges as a cell", () => {
    const src = T('<tr><td colspan="2">a</td></tr><tr><td>c</td><td>d</td></tr>');
    expect(value(gridInsertColumn(src, grid(src), 1))).toBe(T('<tr><td colspan="3">a</td></tr><tr><td>c</td><td>&nbsp;</td><td>d</td></tr>'));
    expect(value(gridInsertColumn(src, grid(src), 0))).toBe(T('<tr><td>&nbsp;</td><td colspan="2">a</td></tr><tr><td>&nbsp;</td><td>c</td><td>d</td></tr>'));
    expect(value(gridAddColumn(src, grid(src)))).toBe(T('<tr><td colspan="2">a</td><td>&nbsp;</td></tr><tr><td>c</td><td>d</td><td>&nbsp;</td></tr>'));
  });

  it("removes a column, narrowing a merged cell that spans it", () => {
    const src = T('<tr><td colspan="2">a</td><td>b</td></tr><tr><td>c</td><td>d</td><td>e</td></tr>');
    expect(value(gridRemoveColumn(src, grid(src), 0))).toBe(T("<tr><td>a</td><td>b</td></tr><tr><td>d</td><td>e</td></tr>"));
    expect(value(gridRemoveColumn(src, grid(src), 2))).toBe(T('<tr><td colspan="2">a</td></tr><tr><td>c</td><td>d</td></tr>'));
  });

  it("moves a column only where no merged cell lies across it", () => {
    const src = T('<tr><td colspan="2">a</td><td>b</td></tr><tr><td>c</td><td>d</td><td>e</td></tr>');
    expect(gridCanMoveColumn(grid(src), 0, 1)).toBe(false);
    expect(gridCanMoveColumn(grid(src), 2, -1)).toBe(false);
    const plain = T("<tr><td>a</td><td>b</td></tr>");
    expect(gridCanMoveColumn(grid(plain), 0, 1)).toBe(true);
    expect(value(gridMoveColumn(plain, grid(plain), 0, 1))).toBe(T("<tr><td>b</td><td>a</td></tr>"));
    expect(gridMoveColumn(src, grid(src), 0, 1)).toMatchObject({ ok: false });
  });
});
