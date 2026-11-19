"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { createContext, memo, useContext, useId, useMemo, useRef, useState } from "react";

import {
  canMove,
  KIND_LABEL,
  PARAM_KINDS,
  SCALAR_KINDS,
  type Builder,
  type BuilderField,
  type FieldPath,
  type Kind,
  type Section,
  type Target,
} from "@/lib/schema-edit";

import styles from "./FormBuilder.module.css";

// Drag and drop lives here only (SPEC-studio v1.6): the model knows nothing of @dnd-kit, it gets "move X to Y".
// Ids: a field is its pointer ("/data/customer/name"); a container is "c:" + section + keys ("c:data/customer");
// a palette item is "new:" + kind. While dragging, a slot ("วางที่นี่") stands where the drop would land, worked out
// from the pointer against where the cards were when the drag began; builder state changes on drop only.

type Tree = { params: BuilderField[]; data: BuilderField[] };
type Slot = { field: BuilderField; container: string; index: number };

const containerId = (section: Section, keys: string[]) => `c:${section}${keys.length ? `/${keys.join("/")}` : ""}`;
const containerOf = (id: string): { section: Section; parentKeys: string[] } => {
  const [section, ...keys] = id.slice(2).split("/");
  return { section: section as Section, parentKeys: keys };
};

/** Every field by pointer, with its container and place, for turning a drop into a model target. */
function index(tree: Tree): Map<string, Slot> {
  const out = new Map<string, Slot>();
  const walk = (fields: BuilderField[], section: Section, keys: string[]) =>
    fields.forEach((field, i) => {
      out.set(field.pointer, { field, container: containerId(section, keys), index: i });
      walk(field.children, section, field.path.keys);
    });
  walk(tree.params, "params", []);
  walk(tree.data, "data", []);
  return out;
}

const labelOf = (f: BuilderField) => f.props.label ?? f.key;

/**
 * Where the dragged thing would land now: a container and an index that counts its fields without the dragged one
 * (the model's `Target.index`), and why it cannot land there. The canvas draws the slot at that place.
 */
export type DropAt = { container: string; index: number; reason: string | null };
type Drag = { dropAt: DropAt | null; active: string | null; pointer: boolean };
const DragContext = createContext<Drag>({ dropAt: null, active: null, pointer: false });

type Box = { top: number; bottom: number; left: number; right: number };
/** The lists and their cards as drawn now, without the slot and the lifted card (they would move the answer). */
export type Layout = { containers: { id: string; box: Box }[]; children: Map<string, Box[]> };
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
};
const area = (b: Box) => (b.bottom - b.top) * (b.right - b.left);

/** The lists and cards as drawn when the drag began, and the canvas scroll then. */
type Snapshot = { layout: Layout; canvas: HTMLElement | null; scroll0: number };

/**
 * Measured once, as the drag begins and before the card lifts: the slot then takes the card's room on screen,
 * so near the pointer the form looks as it did and the places match what is seen. Places are worked out against
 * this snapshot (as @dnd-kit does with its own rects), so the slot can never chase itself; only the canvas scroll
 * since then is added back. The dragged card and the lists inside it are left out.
 */
function snapshot(dragged: string | null): Snapshot {
  const canvas = document.querySelector<HTMLElement>("[data-builder-canvas]");
  const card = dragged ? canvas?.querySelector(`[data-pointer="${CSS.escape(dragged)}"]`) : null;
  const lists = [...document.querySelectorAll<HTMLElement>("[data-builder-canvas] [data-container]")].filter(
    (el) => !card?.contains(el),
  );
  return {
    canvas,
    scroll0: canvas?.scrollTop ?? 0,
    layout: {
      containers: lists.map((el) => ({ id: el.dataset.container!, box: boxOf(el) })),
      children: new Map(
        lists.map((el) => [
          el.dataset.container!,
          [...el.querySelectorAll<HTMLElement>(":scope > [data-pointer]")].filter((c) => c !== card).map(boxOf),
        ]),
      ),
    },
  };
}

/** The innermost list under the point, and the place among its cards: before or after each by its halves. */
export function placeAt(layout: Layout, x: number, y: number): { container: string; index: number } | null {
  const pad = 10; // the gap around a list still counts as that list
  const hit = layout.containers
    .filter(({ box }) => x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad)
    .sort((a, b) => area(a.box) - area(b.box))[0];
  if (!hit) return null;
  const width = hit.box.right - hit.box.left;
  let at = 0;
  for (const box of layout.children.get(hit.id) ?? []) {
    const wide = box.right - box.left > width * 0.6; // a full-width card: above/below; a narrow one: left/right
    const after =
      y >= box.bottom || (y >= box.top && (wide ? y > (box.top + box.bottom) / 2 : x > (box.left + box.right) / 2));
    if (after) at++;
  }
  return { container: hit.id, index: at };
}

const pointOf = (e: Event | null): { x: number; y: number } | null => {
  if (!e) return null;
  if ("touches" in e && (e as TouchEvent).touches.length) {
    const t = (e as TouchEvent).touches[0];
    return { x: t.clientX, y: t.clientY };
  }
  return "clientX" in e ? { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY } : null;
};

/** Nothing slides aside while dragging: the slot shows the place instead. */
const noShift = () => null;

type DndProps = {
  builder: Builder;
  tree: Tree;
  readOnly: boolean;
  onMove: (from: FieldPath, to: Target) => void;
  onAdd: (kind: Kind, to: Target) => void;
  onMessage: (text: string | null) => void;
  children: React.ReactNode;
};

/** The drag-and-drop context around the palette and the canvas. */
export function BuilderDnd({ builder, tree, readOnly, onMove, onAdd, onMessage, children }: DndProps) {
  const slots = useMemo(() => index(tree), [tree]);
  const id = useId(); // the same aria-describedby ids on the server and in the browser (no hydration mismatch)
  const [active, setActive] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<DropAt | null>(null);
  const [pointerDrag, setPointerDrag] = useState(false);
  const drop = useRef<DropAt | null>(null); // the latest place, for the drop itself
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // a click still selects
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // the keyboard reorders among the same level's cards ("อยู่ใน" in the properties panel moves across groups);
  // a pointer's place comes from placeAt, so collisions only matter for the keyboard
  const collision: CollisionDetection = (args) => {
    const own = slots.get(String(args.active.id))?.container;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((d) => slots.get(String(d.id))?.container === own),
    });
  };

  /** Why the dragged thing cannot go to `place` (Thai), or null. */
  function reasonFor(dragged: string, place: { container: string; index: number }): string | null {
    const to: Target = { ...containerOf(place.container), index: place.index };
    if (dragged.startsWith("new:")) {
      const kind = dragged.slice(4) as Kind;
      if (to.section === "params") return PARAM_KINDS.includes(kind) ? null : `${KIND_LABEL[kind]} ใช้ใน "ข้อมูลเอกสาร" ไม่ได้`;
      const parent = to.parentKeys.length ? slots.get(`/data/${to.parentKeys.join("/")}`)?.field : null;
      return parent?.kind === "table" && !SCALAR_KINDS.includes(kind) ? "คอลัมน์ในตารางต้องเป็นช่องธรรมดา" : null;
    }
    const slot = slots.get(dragged);
    return slot ? canMove(builder, slot.field.path, to) : "ไม่พบช่องนี้";
  }

  function show(dragged: string, place: { container: string; index: number } | null) {
    const next = place ? { ...place, reason: reasonFor(dragged, place) } : null;
    const prev = drop.current;
    if (prev?.container === next?.container && prev?.index === next?.index && prev?.reason === next?.reason) return;
    drop.current = next;
    setDropAt(next); // only when the place changes: moving within it draws nothing
  }

  function finish() {
    if (follow.current) {
      window.removeEventListener("pointermove", follow.current, { capture: true });
      window.removeEventListener("touchmove", follow.current, { capture: true });
      follow.current = null;
    }
    setActive(null);
    setDropAt(null);
    drop.current = null;
    shot.current = null;
  }

  const describe = (target: string | number) => {
    const s = String(target);
    if (s.startsWith("new:")) return `ช่องใหม่ ${KIND_LABEL[s.slice(4) as Kind]}`;
    if (s.startsWith("c:")) {
      const c = containerOf(s);
      if (!c.parentKeys.length) return c.section === "params" ? "ข้อมูลเอกสาร" : "ข้อมูล";
      const owner = slots.get(`/${c.section}/${c.parentKeys.join("/")}`)?.field;
      return `ใน ${owner ? labelOf(owner) : c.parentKeys.join(".")}`;
    }
    const slot = slots.get(s);
    return slot ? labelOf(slot.field) : s;
  };

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `ยก ${describe(a.id)} แล้ว ใช้ลูกศรเพื่อย้าย Space เพื่อวาง Esc เพื่อยกเลิก`,
    onDragOver: ({ active: a, over }) => (over ? `${describe(a.id)} อยู่ที่ ${describe(over.id)}` : `${describe(a.id)} ไม่อยู่บนที่วาง`),
    onDragEnd: ({ active: a }) => `ปล่อย ${describe(a.id)}`,
    onDragCancel: ({ active: a }) => `ยกเลิกการย้าย ${describe(a.id)}`,
  };

  function onDragStart(e: DragStartEvent) {
    shot.current = snapshot(String(e.active.id).startsWith("new:") ? null : String(e.active.id)); // before the lift
    setActive(String(e.active.id));
    setPointerDrag(!(e.activatorEvent instanceof KeyboardEvent));
    at.current = pointOf(e.activatorEvent);
    follow.current = (ev: Event) => {
      at.current = pointOf(ev) ?? at.current;
    };
    // capture: before @dnd-kit's own handler runs onDragMove, and whatever it stops
    window.addEventListener("pointermove", follow.current, { capture: true });
    window.addEventListener("touchmove", follow.current, { capture: true });
    drop.current = null;
    setDropAt(null);
    onMessage(null);
  }

  const shot = useRef<Snapshot | null>(null);

  // where the pointer is: e.delta of @dnd-kit includes the scroll of the lists it scrolled, so read the events
  const at = useRef<{ x: number; y: number } | null>(null);
  const follow = useRef<((e: Event) => void) | null>(null);

  function onDragMove(e: DragMoveEvent) {
    if (e.activatorEvent instanceof KeyboardEvent || !at.current) return;
    const snap = shot.current;
    if (!snap) return;
    const scrolled = (snap.canvas?.scrollTop ?? 0) - snap.scroll0;
    show(String(e.active.id), placeAt(snap.layout, at.current.x, at.current.y + scrolled));
  }

  function onDragOver(e: DragOverEvent) {
    // the keyboard: the slot goes where the card it is over is
    if (!(e.activatorEvent instanceof KeyboardEvent) || !e.over) return;
    const over = slots.get(String(e.over.id));
    if (over) show(String(e.active.id), { container: over.container, index: over.index });
  }

  function onDragEnd(e: DragEndEvent) {
    const at = drop.current;
    finish();
    if (!at || readOnly) return;
    if (at.reason) return onMessage(at.reason); // nothing changes; the slot already said why
    const dragged = String(e.active.id);
    const to: Target = { ...containerOf(at.container), index: at.index };
    if (dragged.startsWith("new:")) return onAdd(dragged.slice(4) as Kind, to);
    const slot = slots.get(dragged);
    if (!slot || (slot.container === at.container && slot.index === at.index)) return; // dropped where it was
    onMove(slot.field.path, to);
  }

  const dragged = active && !active.startsWith("new:") ? slots.get(active)?.field : null;
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collision}
      autoScroll={{ threshold: { x: 0, y: 0.08 } }} // only the last 8% of the canvas scrolls it, not a fifth
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "กด Space เพื่อยกช่องนี้ ใช้ลูกศรเพื่อย้าย กด Space อีกครั้งเพื่อวาง หรือ Esc เพื่อยกเลิก",
        },
      }}
    >
      <DragContext.Provider value={{ dropAt, active, pointer: pointerDrag }}>{children}</DragContext.Provider>
      <DragOverlay>
        {active ? (
          <div className={styles.overlay}>
            {dragged ? labelOf(dragged) : active.startsWith("new:") ? KIND_LABEL[active.slice(4) as Kind] : ""}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** A palette entry: drag it onto the canvas, or press it (Enter) to add at the end of the section in use. */
export function PaletteItem({ kind, disabled, onAdd }: { kind: Kind; disabled: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${kind}`, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.paletteItem} ${isDragging ? styles.dragging : ""}`}
      data-kind={kind}
      disabled={disabled}
      {...attributes}
      {...listeners}
      onClick={onAdd}
      onKeyDown={(e) => {
        // Enter adds; Space is left to @dnd-kit's keyboard drag
        if (e.key === "Enter") {
          e.preventDefault();
          onAdd();
        } else listeners?.onKeyDown?.(e);
      }}
    >
      {KIND_LABEL[kind]}
    </button>
  );
}

export type CanvasProps = {
  tree: Tree;
  selected: FieldPath | null;
  readOnly: boolean;
  onSelect: (path: FieldPath) => void;
  onSection: (section: Section) => void;
  onRemove: (path: FieldPath) => void;
};

const isSelected = (selected: FieldPath | null, f: BuilderField) =>
  !!selected && selected.section === f.path.section && selected.keys.join("/") === f.path.keys.join("/");

/** The card's title and remove button: memoized, so a drag (which re-renders every sortable) skips it. */
const CardHead = memo(function CardHead({
  field,
  selected,
  readOnly,
  onSelect,
  onRemove,
}: {
  field: BuilderField;
  selected: boolean;
  readOnly: boolean;
  onSelect: (path: FieldPath) => void;
  onRemove: (path: FieldPath) => void;
}) {
  const p = field.props;
  return (
    <>
      <button type="button" className={styles.cardTitle} onClick={() => onSelect(field.path)} aria-pressed={selected}>
        <span>
          {p.label ?? field.key}
          {p.required && <span className={styles.required}> *</span>}
        </span>
        <span className={styles.kind}>{field.kind ? KIND_LABEL[field.kind] : "แก้ใน JSON"}</span>
        <code>{field.key}</code>
      </button>
      {!readOnly && (
        <button type="button" className={styles.remove} onClick={() => onRemove(field.path)} aria-label={`ลบ ${p.label ?? field.key}`}>
          ×
        </button>
      )}
    </>
  );
});

/**
 * One field: a sortable shell around a memoized head and the children it was given.
 * Groups and tables hold their fields inside.
 */
export function FieldCard({
  field,
  selected,
  readOnly,
  onSelect,
  onRemove,
  children,
}: {
  field: BuilderField;
  selected: boolean;
  readOnly: boolean;
  onSelect: (path: FieldPath) => void;
  onRemove: (path: FieldPath) => void;
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: field.pointer,
    disabled: readOnly,
  });
  const { pointer } = useContext(DragContext);
  const width = field.kind && field.kind !== "group" && field.kind !== "table" ? (field.props.width ?? "full") : "full";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: DndCSS.Translate.toString(transform), transition }}
      className={[
        styles.card,
        selected ? styles.selected : "",
        field.kind ? "" : styles.readOnly,
        styles[width],
        // with a pointer the card leaves the flow, so the form shows what the drop will make; the keyboard fades it
        isDragging ? (pointer ? styles.lifted : styles.dragging) : "",
      ].join(" ")}
      data-pointer={field.pointer}
      data-lifted={isDragging && pointer ? "" : undefined}
    >
      <div className={styles.cardHead}>
        {!readOnly && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className={styles.handle}
            aria-label={`ลาก ${field.props.label ?? field.key}`}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
        <CardHead field={field} selected={selected} readOnly={readOnly} onSelect={onSelect} onRemove={onRemove} />
      </div>
      {children}
    </div>
  );
}

/** Where a drop would go: a dashed slot in the form, red with the reason when it cannot go there. */
function DropSlot({ reason }: { reason: string | null }) {
  return (
    <div className={reason ? styles.slotBad : styles.slot} data-drop-slot role="status">
      {reason ? `วางไม่ได้: ${reason}` : "วางที่นี่"}
    </div>
  );
}

/** A list of fields that accepts drops, even when empty; it draws the slot when the drop would land in it. */
function Container({
  id,
  fields,
  className,
  empty,
  render,
}: {
  id: string;
  fields: BuilderField[];
  className: string;
  empty: string;
  render: (f: BuilderField) => React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  const { dropAt, active } = useContext(DragContext);
  const here = dropAt?.container === id ? dropAt : null;
  const items: React.ReactNode[] = [];
  let before = 0; // fields drawn so far, not counting the dragged one
  let slotDrawn = false;
  for (const f of fields) {
    if (here && !slotDrawn && f.pointer !== active && before === here.index) {
      items.push(<DropSlot key="drop-slot" reason={here.reason} />);
      slotDrawn = true;
    }
    items.push(render(f));
    if (f.pointer !== active) before++;
  }
  if (here && !slotDrawn) items.push(<DropSlot key="drop-slot" reason={here.reason} />);
  const empty_ = !here && fields.every((f) => f.pointer === active);
  return (
    <SortableContext id={id} items={fields.map((f) => f.pointer)} strategy={noShift}>
      <div ref={setNodeRef} className={className} data-container={id}>
        {items}
        {empty_ && <p className={styles.empty}>{empty}</p>}
      </div>
    </SortableContext>
  );
}

/** The two sections of the form. */
export function BuilderCanvas({ tree, selected, readOnly, onSelect, onSection, onRemove }: CanvasProps) {
  const render = (f: BuilderField): React.ReactNode => (
    <FieldCard key={f.pointer} field={f} selected={isSelected(selected, f)} readOnly={readOnly} onSelect={onSelect} onRemove={onRemove}>
      {(f.kind === "group" || f.kind === "table") && (
        <Container
          id={containerId(f.path.section, f.path.keys)}
          fields={f.children}
          className={f.kind === "table" ? styles.columns : styles.fields}
          empty={f.kind === "table" ? "ลากช่องมาเป็นคอลัมน์" : "ลากช่องมาวางในกลุ่มนี้"}
          render={render}
        />
      )}
    </FieldCard>
  );
  return (
    <div className={styles.canvas} data-builder-canvas>
      <section className={styles.section} onFocus={() => onSection("params")} onClick={() => onSection("params")}>
        <h3>ข้อมูลเอกสาร</h3>
        <Container id="c:params" fields={tree.params} className={styles.fields} empty="ยังไม่มี parameter — ลากช่องมาวาง" render={render} />
      </section>
      <section className={styles.section} onFocus={() => onSection("data")} onClick={() => onSection("data")}>
        <h3>ข้อมูล</h3>
        <Container id="c:data" fields={tree.data} className={styles.fields} empty="ยังไม่มีช่อง — ลากช่องมาวาง" render={render} />
      </section>
    </div>
  );
}
