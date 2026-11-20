// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { cellAtPlace, cellPlace } from "@/lib/table-cell";

const table = (html: string) => {
  const t = document.createElement("table");
  t.innerHTML = html;
  return t;
};

describe("table cells on the paper", () => {
  it("gives a cell's row and its column counting spans", () => {
    const t = table('<thead><tr><th>h1</th><th>h2</th><th>h3</th></tr></thead><tbody><tr><td colspan="2">a</td><td>b</td></tr></tbody>');
    expect(cellPlace(t.rows[0].cells[2])).toEqual({ row: 0, col: 2 });
    expect(cellPlace(t.rows[1].cells[1])).toEqual({ row: 1, col: 2 });
    expect(cellPlace(t.rows[1].cells[0])).toEqual({ row: 1, col: 0 });
    expect(cellPlace(document.createElement("div"))).toBeNull();
  });

  it("finds the cell covering a place", () => {
    const t = table('<tr><td colspan="2">a</td><td>b</td></tr>');
    expect(cellAtPlace(t, { row: 0, col: 1 })?.textContent).toBe("a");
    expect(cellAtPlace(t, { row: 0, col: 2 })?.textContent).toBe("b");
    expect(cellAtPlace(t, { row: 1, col: 0 })).toBeNull();
  });
});
