// Where a drag would drop (form builder v1.6 and Document Designer v1.7): the innermost list under the pointer and
// the place among its items, worked out against where things were when the drag began (so the slot that shows the
// drop can never chase itself), plus the scroll of the scrolling area since then. Pure geometry + one DOM reader.

export type Box = { top: number; bottom: number; left: number; right: number };
/** Lists (by id) and the boxes of their items, in order. */
export type Layout = { containers: { id: string; box: Box }[]; children: Map<string, Box[]> };
export type Snapshot = { layout: Layout; scroller: HTMLElement | null; scroll0: number };
export type Place = { container: string; index: number };

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
};
const area = (b: Box) => (b.bottom - b.top) * (b.right - b.left);

/**
 * Read the lists and items under `root`: lists carry `listAttr` (their id), items carry `itemAttr` and sit directly
 * in a list. The dragged item and every list inside it are left out. Call it before the dragged item lifts.
 */
export function snapshot(opts: {
  root: ParentNode;
  scroller: HTMLElement | null;
  listAttr: string;
  itemAttr: string;
  dragged: Element | null;
}): Snapshot {
  const { root, listAttr, itemAttr, dragged } = opts;
  const lists = [...root.querySelectorAll<HTMLElement>(`[${listAttr}]`)].filter((el) => !dragged?.contains(el));
  return {
    scroller: opts.scroller,
    scroll0: opts.scroller?.scrollTop ?? 0,
    layout: {
      containers: lists.map((el) => ({ id: el.getAttribute(listAttr)!, box: boxOf(el) })),
      children: new Map(
        lists.map((el) => [
          el.getAttribute(listAttr)!,
          [...el.querySelectorAll<HTMLElement>(`:scope > [${itemAttr}]`)].filter((c) => c !== dragged).map(boxOf),
        ]),
      ),
    },
  };
}

/** The innermost list under the point, and the place among its items: before or after each by its halves. */
export function placeAt(layout: Layout, x: number, y: number): Place | null {
  const pad = 10; // the gap around a list still counts as that list
  const hit = layout.containers
    .filter(({ box }) => x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad)
    .sort((a, b) => area(a.box) - area(b.box))[0];
  if (!hit) return null;
  const width = hit.box.right - hit.box.left;
  let at = 0;
  for (const box of layout.children.get(hit.id) ?? []) {
    const wide = box.right - box.left > width * 0.6; // a full-width item: above/below; a narrow one: left/right
    const after =
      y >= box.bottom || (y >= box.top && (wide ? y > (box.top + box.bottom) / 2 : x > (box.left + box.right) / 2));
    if (after) at++;
  }
  return { container: hit.id, index: at };
}

/** The place for a viewport point, with the scrolling area's scroll since the snapshot added back. */
export const placeNow = (snap: Snapshot, x: number, y: number) =>
  placeAt(snap.layout, x, y + ((snap.scroller?.scrollTop ?? 0) - snap.scroll0));

export const pointOf = (e: Event | null): { x: number; y: number } | null => {
  if (!e) return null;
  if ("touches" in e && (e as TouchEvent).touches.length) {
    const t = (e as TouchEvent).touches[0];
    return { x: t.clientX, y: t.clientY };
  }
  return "clientX" in e ? { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY } : null;
};

/**
 * Follow the real pointer during a drag (e.delta of @dnd-kit includes scroll, so it is not the pointer).
 * Listens in the capture phase, before @dnd-kit's own handler; returns the stop function.
 */
export function followPointer(start: Event | null, on: (p: { x: number; y: number }) => void): () => void {
  const first = pointOf(start);
  if (first) on(first);
  const move = (e: Event) => {
    const p = pointOf(e);
    if (p) on(p);
  };
  window.addEventListener("pointermove", move, { capture: true });
  window.addEventListener("touchmove", move, { capture: true });
  return () => {
    window.removeEventListener("pointermove", move, { capture: true });
    window.removeEventListener("touchmove", move, { capture: true });
  };
}
