"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

import { allBlocks, blockAt, readBlocks, type Block, type BlockKind, type BlockList } from "@/lib/doc-blocks";
import { insertBlock, moveBlock, newBlockHtml, removeBlock, replaceIn, setStyle, type Edited, type NewBlock, type Result } from "@/lib/doc-edit";
import { setTextTag, TEXT_LEVELS } from "@/lib/doc-text";
import { followPointer, placeNow, snapshot, type Place, type Snapshot } from "@/lib/drop-place";
import { fieldRefs, type FieldRef } from "@/lib/field-refs";
import type { Scope } from "@/lib/doc-sample";

import styles from "./Designer.module.css";
import { PaperCanvas, visible, type BlockFrame, type ListFrame } from "./PaperCanvas";
import { BlockPanel } from "./BlockPanels";
import { CustomCodeModal } from "./CustomCodeModal";
import { StylePanel } from "./StylePanel";
import { keepEditing, TextEditor, type Suggestion } from "./TextEditor";

// The Document Designer's work area (SPEC-studio v1.7): palette, the paper with selection, drag handles and the
// "วางที่นี่" slot, and the properties panel. Drops are placed against where things were when the drag began
// (lib/drop-place.ts, the same as the form builder); the source changes on drop only.

type Props = {
  src: string;
  blocks: BlockList;
  edit: (src: string) => void;
  readOnly: boolean;
  files: Record<string, string>;
  templateId: string;
  assets: string[];
  sample: Scope | null;
  zoom: number;
};

type Drop = Place & { reason: string | null };
type DragState = { active: string | null; drop: Drop | null; pointer: boolean; selected: string | null };
const DragCtx = createContext<DragState>({ active: null, drop: null, pointer: false, selected: null });

export const PALETTE: { kind: NewBlock["kind"]; label: string }[] = [
  { kind: "text", label: "ข้อความ" },
  { kind: "heading", label: "หัวข้อ" },
  { kind: "field", label: "ค่าช่องข้อมูล" },
  { kind: "image", label: "รูป / โลโก้" },
  { kind: "row", label: "แถวแบ่งคอลัมน์" },
  { kind: "table", label: "ตารางรายการ" },
  { kind: "summary", label: "สรุปยอด" },
  { kind: "code", label: "QR / บาร์โค้ด" },
  { kind: "rule", label: "เส้นคั่น" },
  { kind: "space", label: "ช่องว่าง" },
  { kind: "pagebreak", label: "ขึ้นหน้าใหม่" },
  { kind: "condition", label: "เงื่อนไข" },
  { kind: "repeat", label: "วนซ้ำ" },
  { kind: "set", label: "ตั้งค่าตัวแปร" },
  { kind: "custom", label: "Custom Code" },
];

export const KIND_NAME: Record<BlockKind, string> = {
  text: "ข้อความ",
  field: "ค่าช่องข้อมูล",
  image: "รูป",
  row: "แถวแบ่งคอลัมน์",
  table: "ตารางรายการ",
  summary: "สรุปยอด",
  code: "QR / บาร์โค้ด",
  rule: "เส้นคั่น",
  space: "ช่องว่าง",
  pagebreak: "ขึ้นหน้าใหม่",
  condition: "เงื่อนไข",
  repeat: "วนซ้ำ",
  set: "ตั้งค่าตัวแปร",
  head: "stylesheet",
  custom: "Custom Code",
};

const keyOf = (b: Block) => b.path.join(".");

/** Sensible first values for a new block, from what the report has (fields, lists, assets); edited after. */
export function newBlockFor(kind: NewBlock["kind"], files: Record<string, string>, assets: string[]): NewBlock {
  const refs = fieldRefs(files);
  const flat = (rs: FieldRef[]): FieldRef[] => rs.flatMap((r) => [r, ...flat(r.children)]);
  const all = refs.ok ? flat([...refs.value.params, ...refs.value.data]) : [];
  const scalar = all.find((r) => r.expression.startsWith("{{") && !r.expression.includes("item.") && !r.expression.includes("row."));
  const expr = scalar ? scalar.expression.replace(/^\{\{\s*|\s*\}\}$/g, "") : "data";
  let lists: string[] = [];
  try {
    lists = Object.keys((JSON.parse(files["report.json"] ?? "{}") as { lists?: object }).lists ?? {});
  } catch {
    lists = [];
  }
  const list = lists[0] ? `lists.${lists[0]}` : "lists.items";
  const table = refs.ok ? refs.value.data.find((r) => r.kind === "table") : undefined;
  const columns = (table?.children ?? []).slice(0, 3).map((c) => ({ head: c.label, expr: `item.${c.key}` }));
  switch (kind) {
    case "field":
      return { kind, expr };
    case "image":
      return { kind, src: assets.find((a) => /\.(png|jpe?g|svg|webp)$/i.test(a)) ?? "logo.png" };
    case "row":
      return { kind, columns: 2 };
    case "table":
      return { kind, variable: "item", iterable: list, columns: columns.length ? columns : [{ head: "รายการ", expr: "item" }] };
    case "summary":
      return { kind, rows: [{ label: "รวม", expr: "fmt.money(totals.grand)" }] };
    case "code":
      return { kind, expr: `fmt.qr(${expr})` };
    case "condition":
      return { kind, test: expr };
    case "repeat":
      return { kind, variable: "row", iterable: list };
    case "set":
      return { kind, name: "x", expr: "1" };
    default:
      return { kind } as NewBlock;
  }
}

/** Fields to put in text: every value field's expression (tables are blocks of their own). */
export function suggestions(files: Record<string, string>): Suggestion[] {
  const refs = fieldRefs(files);
  if (!refs.ok) return [];
  const flat = (rs: FieldRef[]): FieldRef[] => rs.flatMap((r) => [r, ...flat(r.children)]);
  return flat([...refs.value.params, ...refs.value.data])
    .filter((r) => r.expression.startsWith("{{") && !r.children.length)
    .map((r) => ({ label: r.label || r.key, expression: r.expression }));
}

/**
 * The model index for a drop at `shown` among the drawn blocks of `list` (blocks that draw nothing are skipped on
 * the paper but still hold places in the file); `moving` is left out, as moveBlock counts without it.
 */
export function modelIndex(list: BlockList, shown: number, moving: Block | null): number {
  const others = list.items.filter((b) => b.start !== moving?.start);
  const drawn = others.filter(visible);
  if (shown < drawn.length) return others.indexOf(drawn[shown]);
  return drawn.length ? others.indexOf(drawn[drawn.length - 1]) + 1 : others.length;
}

/** The list a list id names in the current blocks. */
export function listById(blocks: BlockList, id: string): BlockList | null {
  if (id === "root") return blocks;
  const [path, index] = id.split("/");
  const owner = blockAt(blocks, path.split(".").map(Number));
  return owner?.lists[Number(index)]?.list ?? null;
}

export function Workbench({ src, blocks, edit, readOnly, files, templateId, assets, sample, zoom }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [pointerDrag, setPointerDrag] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // the text block being typed in
  const [coding, setCoding] = useState<number | null>(null); // the start of the block in the Custom Code modal
  const codeNext = useRef(false); // a Custom Code block was just dropped: open the modal on it
  const reselect = useRef<number | null>(null); // the start of the block to select after the next parse
  const shot = useRef<Snapshot | null>(null);
  const at = useRef<{ x: number; y: number } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const dropRef = useRef<Drop | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const flat = useMemo(() => allBlocks(blocks), [blocks]);
  const fields = useMemo(() => suggestions(files), [files]);
  const current = flat.find((b) => keyOf(b) === selected) ?? null;
  const codeBlock = coding === null ? null : (flat.find((b) => b.start === coding) ?? null);

  // after an edit: select the block that starts where the edit said it is now
  useEffect(() => {
    if (reselect.current === null) return;
    const b = flat.find((x) => x.start === reselect.current);
    reselect.current = null;
    setSelected(b ? keyOf(b) : null);
    if (codeNext.current && b) setCoding(b.start);
    codeNext.current = false;
  }, [flat]);

  function apply(r: Result<Edited> | Edited) {
    const out = "ok" in r ? (r.ok ? r.value : null) : r;
    if (!out) return setMessage("ok" in r && !r.ok ? r.error : null);
    setMessage(null);
    if (out.at) reselect.current = out.at.start;
    edit(out.src);
  }

  const shadow = () => document.querySelector<HTMLElement>("[data-paper]")?.shadowRoot ?? null;

  function reasonFor(dragged: string, place: Place): string | null {
    if (dragged.startsWith("b:")) {
      const key = dragged.slice(2);
      if (place.container === "root") return null;
      const owner = place.container.split("/")[0];
      if (owner === key || owner.startsWith(`${key}.`)) return "ย้ายเข้าไปในตัวเองไม่ได้";
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const root = shadow();
    shot.current = root
      ? snapshot({
          root,
          scroller: scroller.current,
          listAttr: "data-jd-list",
          itemAttr: "data-jd-block",
          dragged: id.startsWith("b:") ? root.querySelector(`[data-jd-block="${CSS.escape(id.slice(2))}"]`) : null,
        })
      : null;
    // the whole sheet counts as the page's list, so a drop in the empty paper below the last block appends
    const sheet = root?.querySelector(".jd-sheet")?.getBoundingClientRect();
    const page = shot.current?.layout.containers.find((c) => c.id === "root");
    if (sheet && page) page.box = { top: sheet.top, bottom: sheet.bottom, left: sheet.left, right: sheet.right };
    setActive(id);
    setPointerDrag(true);
    stop.current = followPointer(e.activatorEvent, (p) => (at.current = p));
    if (id.startsWith("b:")) setSelected(id.slice(2));
    setMessage(null);
  }

  function onDragMove(e: DragMoveEvent) {
    if (!shot.current || !at.current) return;
    const place = placeNow(shot.current, at.current.x, at.current.y);
    const next = place ? { ...place, reason: reasonFor(String(e.active.id), place) } : null;
    const prev = dropRef.current;
    if (prev?.container === next?.container && prev?.index === next?.index && prev?.reason === next?.reason) return;
    dropRef.current = next;
    setDrop(next);
  }

  function finish() {
    stop.current?.();
    stop.current = null;
    shot.current = null;
    dropRef.current = null;
    setActive(null);
    setDrop(null);
  }

  function onDragEnd(e: DragEndEvent) {
    const d = dropRef.current;
    finish();
    if (!d || readOnly) return;
    if (d.reason) return setMessage(d.reason);
    const list = listById(blocks, d.container);
    if (!list) return;
    const id = String(e.active.id);
    if (id.startsWith("new:")) {
      const kind = id.slice(4) as NewBlock["kind"];
      codeNext.current = kind === "custom";
      return apply(insertBlock(src, list, modelIndex(list, d.index, null), newBlockHtml(newBlockFor(kind, files, assets))));
    }
    const block = flat.find((b) => keyOf(b) === id.slice(2));
    if (block) apply(moveBlock(src, block, list, modelIndex(list, d.index, block)));
  }

  function step(dir: -1 | 1) {
    if (!current) return;
    const parentKey = current.path.slice(0, -1);
    const list =
      parentKey.length === 0
        ? blocks
        : listById(blocks, `${parentKey.slice(0, -1).join(".")}/${parentKey[parentKey.length - 1]}`);
    if (!list) return;
    const i = list.items.findIndex((b) => b.start === current.start);
    apply(moveBlock(src, current, list, i + dir));
  }

  function remove() {
    if (!current) return;
    if (current.kind === "custom" && !window.confirm("ลบ Custom Code นี้?")) return;
    apply(removeBlock(src, current));
    setSelected(null);
  }

  // Delete removes the selected block (not while typing)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.composedPath()[0] as HTMLElement | undefined;
      if (e.key !== "Delete" || readOnly || !current) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      remove();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  /** Leaving the text editor: one undo step, refused if the text no longer reads as a text block. */
  function typed(block: Block, inner: string | null) {
    setEditing(null);
    if (inner === null || block.detail.kind !== "text") return;
    const out = replaceIn(src, block, block.detail.inner, inner);
    const still = allBlocks(readBlocks(out.src)).some((b) => b.start === block.start && b.kind === "text");
    if (!still) return setMessage("ข้อความที่พิมพ์ทำให้บล็อกนี้ไม่ใช่ข้อความแล้ว (เช่นมี {% … %} ไม่ครบคู่) จึงไม่ได้ใช้ — แก้เป็น Custom Code ได้ในหน้า code");
    apply(out);
  }

  const frame: BlockFrame = ({ block, children }) => (
    <Frame
      block={block}
      readOnly={readOnly}
      onSelect={setSelected}
      onEdit={block.kind === "text" && !readOnly ? setEditing : block.kind === "custom" ? () => setCoding(block.start) : undefined}
    >
      {children}
    </Frame>
  );
  const editor = (b: Block) =>
    editing === keyOf(b) && b.kind === "text" ? <TextEditor key={b.start} block={b} src={src} fields={fields} onDone={(inner) => typed(b, inner)} /> : null;
  const list: ListFrame = ({ id, children }) => <ListBox id={id}>{children}</ListBox>;

  const label = active
    ? active.startsWith("new:")
      ? PALETTE.find((p) => p.kind === active.slice(4))?.label
      : KIND_NAME[flat.find((b) => keyOf(b) === active.slice(2))?.kind ?? "custom"]
    : "";

  return (
    <DndContext id={dndId} sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={finish} autoScroll={{ threshold: { x: 0, y: 0.08 } }}>
      <DragCtx.Provider value={{ active, drop, pointer: pointerDrag, selected }}>
        {!readOnly && (
          <aside className={styles.palette} aria-label="บล็อก">
            <h3>บล็อก</h3>
            <p className={styles.hint}>ลากลงกระดาษ</p>
            {PALETTE.map((p) => (
              <PaletteItem key={p.kind} kind={p.kind} label={p.label} />
            ))}
            <h3>ช่องข้อมูล</h3>
            <p className={styles.hint}>ดับเบิลคลิกข้อความ แล้วลากลงในข้อความ หรือพิมพ์ {"{{"}</p>
            {fields.map((f) => (
              <span
                key={f.expression}
                className={styles.fieldItem}
                draggable
                title={f.expression}
                onMouseDown={() => (keepEditing.on = true)} // pressing a field does not end typing
                onDragStart={(e) => e.dataTransfer.setData("text/plain", f.expression)}
              >
                {f.label}
              </span>
            ))}
          </aside>
        )}
        <div ref={scroller} className={styles.paperScroll} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          {message && (
            <p role="alert" className={styles.inlineAlert}>
              {message}
            </p>
          )}
          <div style={{ zoom }}>
            <PaperCanvas src={src} blocks={blocks} files={files} templateId={templateId} sample={sample} frame={frame} list={list} editor={editor} />
          </div>
        </div>
        <aside className={styles.panel} aria-label="คุณสมบัติของบล็อก">
          {current ? (
            <div className={styles.props}>
              <h3>{KIND_NAME[current.kind]}</h3>
              {!readOnly && (
                <div className={styles.row}>
                  <button type="button" onClick={() => step(-1)}>
                    ขึ้น
                  </button>
                  <button type="button" onClick={() => step(1)}>
                    ลง
                  </button>
                  <button type="button" className={styles.danger} onClick={remove}>
                    ลบ (Delete)
                  </button>
                </div>
              )}
              {current.kind === "text" && current.node.kind === "element" && (
                <label className={styles.prop}>
                  ระดับ
                  <select value={current.node.name} disabled={readOnly} onChange={(e) => apply(setTextTag(src, current, e.target.value))}>
                    {TEXT_LEVELS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                    {!TEXT_LEVELS.some(([v]) => v === (current.node.kind === "element" ? current.node.name : "")) && (
                      <option value={current.node.name}>{current.node.name}</option>
                    )}
                  </select>
                </label>
              )}
              {current.kind === "text" && !readOnly && <p className={styles.hint}>ดับเบิลคลิกบนกระดาษเพื่อพิมพ์ · Enter จบ · Shift+Enter ขึ้นบรรทัด</p>}
              <BlockPanel
                block={current}
                src={src}
                files={files}
                assets={assets}
                readOnly={readOnly}
                fields={fields}
                apply={apply}
                onCode={() => setCoding(current.start)}
              />
              {current.style && <StylePanel src={src} block={current} readOnly={readOnly} onChange={(props) => apply(setStyle(src, current, props))} />}
            </div>
          ) : (
            <p className={styles.hint}>คลิกบล็อกบนกระดาษเพื่อแก้ ลากจากด้านซ้ายเพื่อเพิ่ม</p>
          )}
        </aside>
        {codeBlock && (
          <CustomCodeModal
            code={src.slice(codeBlock.start, codeBlock.end)}
            reportJson={files["report.json"]}
            readOnly={readOnly}
            onClose={() => setCoding(null)}
            onSave={(code) => {
              setCoding(null);
              apply(replaceIn(src, codeBlock, codeBlock, code));
            }}
          />
        )}
        <DragOverlay dropAnimation={null}>{active ? <div className={styles.overlay}>{label}</div> : null}</DragOverlay>
      </DragCtx.Provider>
    </DndContext>
  );
}

function PaletteItem({ kind, label }: { kind: string; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${kind}` });
  return (
    <button ref={setNodeRef} type="button" className={`${styles.paletteItem} ${isDragging ? styles.dragging : ""}`} data-kind={kind} {...attributes} {...listeners}>
      {label}
    </button>
  );
}

/** One block on the paper: selectable, with a drag handle; lifted out of the flow while a pointer drags it. */
function Frame({
  block,
  readOnly,
  onSelect,
  onEdit,
  children,
}: {
  block: Block;
  readOnly: boolean;
  onSelect: (k: string) => void;
  onEdit?: (k: string) => void;
  children: React.ReactNode;
}) {
  const key = keyOf(block);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: `b:${key}`, disabled: readOnly });
  const { selected, pointer } = useContext(DragCtx);
  const cls = ["jd-block", selected === key ? "jd-selected" : "", isDragging ? (pointer ? "jd-lifted" : "jd-faded") : ""].join(" ");
  return (
    <div
      ref={setNodeRef}
      className={cls}
      data-jd-block={key}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(key);
      }}
      onDoubleClick={onEdit && (() => onEdit(key))}
    >
      {!readOnly && (
        <button ref={setActivatorNodeRef} type="button" className="jd-handle" aria-label={`ลาก ${KIND_NAME[block.kind]}`} {...attributes} {...listeners}>
          ⠿
        </button>
      )}
      {children}
    </div>
  );
}

/** A list of blocks on the paper; while dragging, the slot stands where the drop would land. */
function ListBox({ id, children }: { id: string; children: React.ReactNode[] }) {
  const { drop, active } = useContext(DragCtx);
  const here = drop?.container === id ? drop : null;
  const items: React.ReactNode[] = [];
  let before = 0;
  let drawn = false;
  const activeKey = active?.startsWith("b:") ? active.slice(2) : null;
  for (const child of children) {
    const key = (child as { key?: string } | null)?.key ?? "";
    const isActive = !!activeKey && key.startsWith(`${activeKey}@`);
    if (here && !drawn && !isActive && before === here.index) {
      items.push(<Slot key="jd-slot" reason={here.reason} />);
      drawn = true;
    }
    items.push(child);
    if (!isActive) before++;
  }
  if (here && !drawn) items.push(<Slot key="jd-slot" reason={here.reason} />);
  return (
    <div className="jd-list" data-jd-list={id}>
      {items.length ? items : <div className="jd-empty">ลากบล็อกมาวางที่นี่</div>}
    </div>
  );
}

const Slot = ({ reason }: { reason: string | null }) => (
  <div className={reason ? "jd-slot-bad" : "jd-slot"} data-drop-slot>
    {reason ? `วางไม่ได้: ${reason}` : "วางที่นี่"}
  </div>
);
