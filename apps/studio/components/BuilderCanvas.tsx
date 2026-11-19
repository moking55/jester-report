"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useId, useMemo, useState } from "react";

import {
  canMove,
  KIND_LABEL,
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
// a palette item is "new:" + kind. Builder state changes on drop only, so dragging re-renders nothing but the card.

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // a click still selects
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Where a drop over `overId` puts things: before that field, or at the end of an (empty) container. */
  function target(overId: string): Target | null {
    if (overId.startsWith("c:")) {
      const c = containerOf(overId);
      const owner = c.parentKeys.length ? [...slots.values()].find((s) => s.field.path.keys.join("/") === c.parentKeys.join("/") && s.field.path.section === c.section) : null;
      const count = owner ? owner.field.children.length : tree[c.section].length;
      return { ...c, index: count };
    }
    const slot = slots.get(overId);
    return slot ? { ...containerOf(slot.container), index: slot.index } : null;
  }

  // nested lists confuse closestCenter (ArrowUp lands inside the group above): with a pointer, take the innermost
  // place under it; with the keyboard, reorder among the same level's fields only
  const collision: CollisionDetection = (args) => {
    if (args.pointerCoordinates) {
      const within = pointerWithin(args);
      if (within.length) {
        const area = (id: string | number) => {
          const r = args.droppableRects.get(id);
          return r ? r.width * r.height : Infinity;
        };
        return [...within].sort((a, b) => area(a.id) - area(b.id)).slice(0, 1);
      }
      return closestCenter(args);
    }
    const own = slots.get(String(args.active.id))?.container;
    return closestCenter({
      ...args,
      // across groups the keyboard uses "อยู่ใน" in the properties panel instead
      droppableContainers: args.droppableContainers.filter((d) => slots.get(String(d.id))?.container === own),
    });
  };

  const describe = (id: string | number) => {
    const s = String(id);
    if (s.startsWith("new:")) return `ช่องใหม่ ${KIND_LABEL[s.slice(4) as Kind]}`;
    if (s.startsWith("c:")) return containerOf(s).parentKeys.length ? `ใน ${containerOf(s).parentKeys.join(".")}` : containerOf(s).section === "params" ? "ข้อมูลเอกสาร" : "ข้อมูล";
    const slot = slots.get(s);
    return slot ? labelOf(slot.field) : s;
  };

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `ยก ${describe(a.id)} แล้ว ใช้ลูกศรเพื่อย้าย Space เพื่อวาง Esc เพื่อยกเลิก`,
    onDragOver: ({ active: a, over }) => (over ? `${describe(a.id)} อยู่ที่ ${describe(over.id)}` : `${describe(a.id)} ไม่อยู่บนที่วาง`),
    onDragEnd: ({ active: a, over }) => (over ? `วาง ${describe(a.id)} ที่ ${describe(over.id)}` : `วาง ${describe(a.id)} ไม่สำเร็จ`),
    onDragCancel: ({ active: a }) => `ยกเลิกการย้าย ${describe(a.id)}`,
  };

  function onDragStart(e: DragStartEvent) {
    setActive(String(e.active.id));
    onMessage(null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    if (!e.over || readOnly) return;
    const id = String(e.active.id);
    const to = target(String(e.over.id));
    if (!to) return;
    if (id.startsWith("new:")) return onAdd(id.slice(4) as Kind, to);
    const slot = slots.get(id);
    if (!slot || id === String(e.over.id)) return;
    const reason = canMove(builder, slot.field.path, to);
    if (reason) return onMessage(reason); // the card goes back where it was
    onMove(slot.field.path, to);
  }

  const dragged = active && !active.startsWith("new:") ? slots.get(active)?.field : null;
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "กด Space เพื่อยกช่องนี้ ใช้ลูกศรเพื่อย้าย กด Space อีกครั้งเพื่อวาง หรือ Esc เพื่อยกเลิก",
        },
      }}
    >
      {children}
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
 * One field: a sortable shell (moves with the drag) around a memoized head and the children it was given.
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
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: field.pointer,
    disabled: readOnly,
  });
  const width = field.kind && field.kind !== "group" && field.kind !== "table" ? (field.props.width ?? "full") : "full";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={[
        styles.card,
        selected ? styles.selected : "",
        field.kind ? "" : styles.readOnly,
        styles[width],
        isDragging ? styles.dragging : "",
        isOver ? styles.dropLine : "",
      ].join(" ")}
      data-pointer={field.pointer}
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

/** A list of fields that accepts drops, even when empty. */
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
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext id={id} items={fields.map((f) => f.pointer)} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className={`${className} ${isOver ? styles.dropLine : ""}`} data-container={id}>
        {fields.length ? fields.map(render) : <p className={styles.empty}>{empty}</p>}
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
    <div className={styles.canvas}>
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
