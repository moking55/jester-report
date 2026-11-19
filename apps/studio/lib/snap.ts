// Snapping on a free-layout sheet (SPEC-studio.md v1.8): while a box moves or is resized, its edges and centre
// jump to the sheet's edges and centre and to the edges and centres of the other boxes when they come within
// `threshold` mm; with no target near, an edge falls on a whole millimetre. `off` (Alt held) turns snapping off:
// the box follows the pointer to 0.1 mm. Pure functions of mm, so the canvas only converts pixels.

import type { Rect } from "./doc-blocks";

export type Guide = { axis: "x" | "y"; at: number }; // a line to draw: x = a vertical line at `at` mm
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type SnapOptions = {
  page: { w: number; h: number };
  others: Rect[];
  threshold: number; // mm: how near a target pulls
  off?: boolean;
  grid?: number; // mm, default 1
};
export type Snapped = { rect: Rect; guides: Guide[] };

export const MIN_BOX = 1; // mm
const round1 = (n: number) => Math.round(n * 10) / 10 + 0; // + 0: no -0

/** The places an edge can snap to, per axis: the sheet's edges and centre, then every other box's edges and centre. */
function targets(o: SnapOptions, axis: "x" | "y"): number[] {
  const size = axis === "x" ? o.page.w : o.page.h;
  const out = [0, size / 2, size];
  for (const r of o.others) {
    const [a, d] = axis === "x" ? [r.x, r.w] : [r.y, r.h];
    out.push(a, a + d / 2, a + d);
  }
  return out;
}

/** The closest target to any of `values`: the shift that brings that value onto it, and the target. */
function nearest(values: number[], ts: number[], threshold: number): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null;
  for (const v of values)
    for (const t of ts) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, at: t };
    }
  return best;
}

/** A moving box: its left, centre and right (top, middle, bottom) snap together, one shift per axis. */
export function snapMove(rect: Rect, o: SnapOptions): Snapped {
  if (o.off) return { rect: { ...rect, x: round1(rect.x), y: round1(rect.y) }, guides: [] };
  const grid = o.grid ?? 1;
  const guides: Guide[] = [];
  const axis = (pos: number, size: number, which: "x" | "y") => {
    const hit = nearest([pos, pos + size / 2, pos + size], targets(o, which), o.threshold);
    if (hit) {
      guides.push({ axis: which, at: hit.at });
      return pos + hit.shift;
    }
    return Math.round(pos / grid) * grid;
  };
  return { rect: { ...rect, x: round1(axis(rect.x, rect.w, "x")), y: round1(axis(rect.y, rect.h, "y")) }, guides };
}

/** A resized box: only the edges the handle drags snap; the others stay where they were. */
export function snapResize(rect: Rect, handle: Handle, o: SnapOptions): Snapped {
  const grid = o.grid ?? 1;
  const guides: Guide[] = [];
  let { x, y } = rect;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  const edge = (value: number, which: "x" | "y") => {
    if (o.off) return round1(value);
    const hit = nearest([value], targets(o, which), o.threshold);
    if (hit) {
      guides.push({ axis: which, at: hit.at });
      return round1(value + hit.shift);
    }
    return round1(Math.round(value / grid) * grid);
  };
  if (handle.includes("w")) x = edge(x, "x");
  if (handle.includes("e")) right = edge(right, "x");
  if (handle.includes("n")) y = edge(y, "y");
  if (handle.includes("s")) bottom = edge(bottom, "y");
  // never smaller than MIN_BOX: the dragged edge stops against the fixed one
  if (right - x < MIN_BOX) {
    if (handle.includes("w")) x = right - MIN_BOX;
    else right = x + MIN_BOX;
  }
  if (bottom - y < MIN_BOX) {
    if (handle.includes("n")) y = bottom - MIN_BOX;
    else bottom = y + MIN_BOX;
  }
  return { rect: { x: round1(x), y: round1(y), w: round1(right - x), h: round1(bottom - y) }, guides };
}
