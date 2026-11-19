import { describe, expect, it } from "vitest";

import { allBlocks, readBlocks, type Rect } from "@/lib/doc-blocks";
import { addBox, boxSize, moveBoxOrder, removeBlock, setBoxRect, setStyle, type Edited, type Result } from "@/lib/doc-edit";
import { snapMove, snapResize, type SnapOptions } from "@/lib/snap";

const PAGE = '<div data-jd="page" style="position: relative; width: 210mm; height: 148mm">\n</div>\n';

const value = (r: Result<Edited>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value.src;
};
const page = (src: string) => readBlocks(src).items[0];
const boxes = (src: string) => page(src).lists[0].list.items;
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** a sheet with a text box, a rectangle and a line */
function sheet(): string {
  let src = PAGE;
  src = value(addBox(src, page(src), { kind: "text" }, R(10, 20, 60, 8)));
  src = value(addBox(src, page(src), { kind: "rect" }, R(100, 30, 40, 20)));
  src = value(addBox(src, page(src), { kind: "line" }, R(10, 60, 80, 5)));
  return src;
}

describe("the free-layout model (v1.8)", () => {
  it("the sheet is a page block whose list holds the boxes", () => {
    const p = page(PAGE);
    expect(p.kind).toBe("page");
    expect(p.lists[0].list.items).toEqual([]);
  });

  it("adds a text box, a rectangle and a line; each reads back with its place in mm", () => {
    const src = sheet();
    expect(boxes(src).map((b) => b.kind)).toEqual(["box", "rect", "line"]);
    expect(boxes(src).map((b) => b.rect)).toEqual([R(10, 20, 60, 8), R(100, 30, 40, 20), R(10, 60, 80, 0)]); // a line is flat
    // the text box holds its block
    expect(boxes(src)[0].lists[0].list.items.map((b) => b.kind)).toEqual(["text"]);
    // nothing on the sheet is Custom Code
    expect(allBlocks(readBlocks(src)).filter((b) => b.kind === "custom")).toEqual([]);
  });

  it("every other kind goes in a box too (field, QR, empty table)", () => {
    let src = PAGE;
    src = value(addBox(src, page(src), { kind: "field", expr: "data.title" }, R(5, 5, 50, 7)));
    src = value(addBox(src, page(src), { kind: "code", expr: "fmt.qr(data.id)" }, R(5, 20, 25, 25)));
    src = value(addBox(src, page(src), { kind: "grid", rows: 2, columns: 3 }, R(5, 60, 80, 20)));
    expect(boxes(src).map((b) => b.lists[0].list.items[0].kind)).toEqual(["field", "code", "grid"]);
    expect(boxSize({ kind: "grid", rows: 2, columns: 3 })).toEqual({ w: 80, h: 20 });
  });

  it("sets a place to 0.1 mm and keeps every other byte", () => {
    const src = sheet();
    const out = value(setBoxRect(src, boxes(src)[0], { x: 12.345, y: 30, w: 61.04 }));
    expect(boxes(out)[0].rect).toEqual(R(12.3, 30, 61, 8)); // 12.345 -> 12.3, 61.04 -> 61, height untouched
    expect(out.replace(/left: 12.3mm; top: 30mm; width: 61mm/, "")).toBe(src.replace(/left: 10mm; top: 20mm; width: 60mm/, ""));
  });

  it("never makes a box smaller than 1 mm, and a line keeps its height", () => {
    const src = sheet();
    expect(boxes(value(setBoxRect(src, boxes(src)[1], { w: 0, h: -5 })))[1].rect).toEqual(R(100, 30, 1, 1));
    const line = value(setBoxRect(src, boxes(src)[2], { h: 40 }));
    expect(boxes(line)[2].rect!.h).toBe(0);
  });

  it("refuses a box whose style holds Jinja", () => {
    const src = '<div data-jd="page" style="position: relative"><div data-jd="box" style="left: {{ x }}mm; top: 1mm; width: 2mm; height: 2mm"></div></div>';
    const b = page(src).lists[0].list.items[0];
    expect(b.rect).toBeUndefined();
    expect(setBoxRect(src, b, { x: 3 }).ok).toBe(false);
  });

  it("stack order is document order: front, back, one step", () => {
    let src = sheet();
    const order = (s: string) => boxes(s).map((b) => b.kind);
    src = value(moveBoxOrder(src, boxes(src)[0], page(src), "front"));
    expect(order(src)).toEqual(["rect", "line", "box"]);
    src = value(moveBoxOrder(src, boxes(src)[2], page(src), "back"));
    expect(order(src)).toEqual(["box", "rect", "line"]);
    src = value(moveBoxOrder(src, boxes(src)[0], page(src), "up"));
    expect(order(src)).toEqual(["rect", "box", "line"]);
    src = value(moveBoxOrder(src, boxes(src)[1], page(src), "down"));
    expect(order(src)).toEqual(["box", "rect", "line"]);
    // at the end already: nothing changes
    const same = value(moveBoxOrder(src, boxes(src)[2], page(src), "front"));
    expect(same).toBe(src);
  });

  it("deletes a box with its block", () => {
    const src = sheet();
    const out = removeBlock(src, boxes(src)[0]).src;
    expect(boxes(out).map((b) => b.kind)).toEqual(["rect", "line"]);
    expect(out).not.toContain("ข้อความ");
  });

  it("a box's own style (border, font) edits like any block's", () => {
    const src = sheet();
    const out = value(setStyle(src, boxes(src)[1], { border: "1mm solid #f00" }));
    expect(boxes(out)[1].rect).toEqual(R(100, 30, 40, 20));
    expect(out).toContain("border: 1mm solid #f00");
  });
});

describe("snapping (v1.8)", () => {
  const o = (others: Rect[] = [], extra: Partial<SnapOptions> = {}): SnapOptions => ({
    page: { w: 210, h: 148 },
    others,
    threshold: 1.5,
    ...extra,
  });

  it("falls on a whole millimetre when nothing is near", () => {
    expect(snapMove(R(33.4, 40.6, 20, 10), o()).rect).toEqual(R(33, 41, 20, 10));
  });

  it("jumps to the sheet's edge and centre", () => {
    expect(snapMove(R(0.8, 10, 20, 10), o()).rect.x).toBe(0);
    const c = snapMove(R(94.4, 10, 20, 10), o()); // centre at 104.4 -> the sheet's centre 105
    expect(c.rect.x).toBe(95);
    expect(c.guides).toContainEqual({ axis: "x", at: 105 });
    expect(snapMove(R(190.7, 10, 20, 10), o()).rect.x).toBe(190); // right edge 210.7 -> 210
  });

  it("jumps to another box's edges and centre, and says which line", () => {
    const other = R(100, 30, 40, 20); // right edge 140, middle y 40
    const s = snapMove(R(140.9, 70, 10, 10), o([other]));
    expect(s.rect.x).toBe(140);
    expect(s.guides).toContainEqual({ axis: "x", at: 140 });
    const m = snapMove(R(20, 35.8, 10, 8), o([other])); // middle y 39.8 -> 40
    expect(m.rect.y).toBe(36);
    expect(m.guides).toContainEqual({ axis: "y", at: 40 });
  });

  it("pulls only within the threshold", () => {
    const other = R(100, 30, 40, 20);
    expect(snapMove(R(142.6, 70, 10, 10), o([other])).rect.x).toBe(143); // 2.6 mm away: just the grid
  });

  it("Alt: no snapping, the pointer to 0.1 mm", () => {
    const s = snapMove(R(0.84, 10.06, 20, 10), o([], { off: true }));
    expect(s.rect).toEqual(R(0.8, 10.1, 20, 10));
    expect(s.guides).toEqual([]);
  });

  it("a resize snaps only the edges the handle drags", () => {
    const other = R(100, 30, 40, 20);
    const s = snapResize(R(10.2, 20.2, 89.4, 20), "e", o([other])); // right edge 99.6 -> 100
    expect(s.rect).toEqual(R(10.2, 20.2, 89.8, 20)); // left edge not touched
    expect(s.guides).toContainEqual({ axis: "x", at: 100 });
    const nw = snapResize(R(10.4, 20.4, 30, 20), "nw", o());
    expect(nw.rect).toEqual(R(10, 20, 30.4, 20.4)); // left and top snap; the right and bottom edges stay at 40.4 / 40.4
  });

  it("a resize stops at 1 mm", () => {
    expect(snapResize(R(10, 10, 5, 5), "e", o([], { off: true })).rect.w).toBe(5);
    const small = snapResize(R(10, 10, -3, 5), "e", o([], { off: true }));
    expect(small.rect.w).toBe(1);
    const west = snapResize(R(20, 10, -3, 5), "w", o([], { off: true })); // dragged past the right edge
    expect(west.rect).toEqual(R(16, 10, 1, 5)); // right edge is 17 (20 + -3)
  });
});
