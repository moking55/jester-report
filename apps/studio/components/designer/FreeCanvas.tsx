"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Block, BlockList, Rect } from "@/lib/doc-blocks";
import { setBoxRect, setGuide, removeBlock, type Edited, type Result } from "@/lib/doc-edit";
import styles from "./Designer.module.css";
import { snapMove, snapResize, type Guide, type Handle } from "@/lib/snap";

// The free-layout sheet's interaction (SPEC-studio.md v1.8): boxes are dragged and resized with the pointer, snap to
// the sheet and to each other (Alt turns snapping off), and move with the arrow keys (0.5 mm, Shift 5 mm). While a
// box is dragged only a preview rect changes; one edit of the source is written on release, so one undo step.

export const SNAP_PX = 6; // how near (screen px) a target pulls
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const LINE_HANDLES: Handle[] = ["w", "e"]; // a line has no height

export type RenderBox = (a: {
  block: Block;
  style: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) => React.ReactNode;

type Drag = { key: string; mode: "move" | Handle; rect: Rect; guides: Guide[] };

type Opts = {
  blocks: BlockList;
  page: { w: number; h: number }; // the sheet, mm
  readOnly: boolean;
  selected: string | null;
  current: Block | null; // the selected block
  editing: string | null; // a text block being typed in: its pointer events are the editor's
  keyOf: (b: Block) => string;
  select: (key: string) => void;
  edit: (box: Block) => void; // double-click on a box
  apply: (r: Result<Edited>) => void;
  src: string;
};

/** The place of every box on the sheet (the ones a move or resize snaps to). */
export const boxRects = (page: Block | undefined): { block: Block; rect: Rect }[] =>
  (page?.lists[0]?.list.items ?? []).flatMap((b) => (b.rect ? [{ block: b, rect: b.rect }] : []));

export function useFree({ blocks, page, readOnly, selected, current, editing, keyOf, select, edit, apply, src }: Opts) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const latest = useRef({ blocks, src, apply });
  useEffect(() => {
    latest.current = { blocks, src, apply };
  });

  const sheet = blocks.items.find((b) => b.kind === "page");
  const others = (except: Block) => boxRects(sheet).filter((o) => o.block.start !== except.start).map((o) => o.rect);

  /** Start a move (mode "move") or a resize from a handle; follows the pointer until it is released. */
  function begin(e: React.PointerEvent, block: Block, mode: "move" | Handle) {
    if (readOnly || e.button !== 0 || !block.rect) return;
    const target = e.nativeEvent.composedPath()[0] as HTMLElement | undefined;
    if (editing === keyOf(block) || target?.closest("[contenteditable]")) return;
    e.stopPropagation();
    const pageEl = (e.currentTarget as HTMLElement).closest("[data-jd-page]");
    if (!pageEl) return;
    const scale = pageEl.getBoundingClientRect().width / page.w; // screen px per mm, whatever the zoom
    const key = keyOf(block);
    const start = block.rect;
    const from = { x: e.clientX, y: e.clientY };
    const near = others(block);
    select(key);
    let moved = false;
    let last: Drag = { key, mode, rect: start, guides: [] };

    const onMove = (m: PointerEvent) => {
      const dx = (m.clientX - from.x) / scale;
      const dy = (m.clientY - from.y) / scale;
      if (!moved && Math.hypot(m.clientX - from.x, m.clientY - from.y) < 3) return; // a click, not a drag
      moved = true;
      const opts = { page, others: near, threshold: SNAP_PX / scale, off: m.altKey };
      let r: Rect = { ...start };
      if (mode === "move") r = { ...start, x: start.x + dx, y: start.y + dy };
      else {
        if (mode.includes("w")) r = { ...r, x: start.x + dx, w: start.w - dx };
        if (mode.includes("e")) r = { ...r, w: start.w + dx };
        if (mode.includes("n")) r = { ...r, y: start.y + dy, h: start.h - dy };
        if (mode.includes("s")) r = { ...r, h: start.h + dy };
      }
      const out = mode === "move" ? snapMove(r, opts) : snapResize(r, mode, opts);
      last = { key, mode, rect: block.kind === "line" ? { ...out.rect, h: 0 } : out.rect, guides: out.guides };
      setDrag(last);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDrag(null);
      const same = last.rect.x === start.x && last.rect.y === start.y && last.rect.w === start.w && last.rect.h === start.h;
      if (!moved || same) return;
      const { src: now, apply: write } = latest.current;
      write(setBoxRect(now, block, last.rect)); // one edit: one undo step
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // arrow keys nudge the selected box: 0.5 mm, Shift 5 mm (not while typing)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (readOnly || !current?.rect || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const t = e.composedPath()[0] as HTMLElement | undefined;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      const step = e.shiftKey ? 5 : 0.5;
      const r = current.rect;
      const next = {
        x: r.x + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0),
        y: r.y + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0),
      };
      apply(setBoxRect(src, current, next));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const placed = (b: Block): Rect | undefined => (drag && drag.key === keyOf(b) ? drag.rect : undefined);

  const overlay = drag?.guides.length ? (
    <>
      {drag.guides.map((g) => (
        <div key={`${g.axis}${g.at}`} className={g.axis === "x" ? "jd-gl jd-gl-x" : "jd-gl jd-gl-y"} style={g.axis === "x" ? { left: `${g.at}mm` } : { top: `${g.at}mm` }} />
      ))}
    </>
  ) : null;

  const renderBox: RenderBox = ({ block, style, className, children }) => {
    const key = keyOf(block);
    const r = block.rect;
    const outside = !!r && (r.x < -0.05 || r.y < -0.05 || r.x + r.w > page.w + 0.05 || r.y + r.h > page.h + 0.05);
    return (
      <BoxView
        block={block}
        style={style}
        className={[className ?? "", selected === key ? "jd-selected" : "", drag?.key === key ? "jd-moving" : "", outside ? "jd-outside" : ""].join(" ").trim()}
        on={selected === key}
        readOnly={readOnly}
        onPointerDown={(e, mode) => begin(e, block, mode)}
        onSelect={() => select(key)}
        onEdit={() => edit(block)}
        keyName={key}
      >
        {children}
      </BoxView>
    );
  };

  return { placed, overlay, renderBox, sheet };
}

/** One box on the sheet: selectable, moved by dragging, resized by its handles; red when its text overflows it. */
function BoxView({
  block,
  style,
  className,
  on,
  readOnly,
  keyName,
  onPointerDown,
  onSelect,
  onEdit,
  children,
}: {
  block: Block;
  style: React.CSSProperties;
  className: string;
  on: boolean;
  readOnly: boolean;
  keyName: string;
  onPointerDown: (e: React.PointerEvent, mode: "move" | Handle) => void;
  onSelect: () => void;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- after every render: the text can change anywhere; setOver bails out on the same value
  useLayoutEffect(() => {
    // text that runs past the box's height (a box of text, a field): the PDF would draw it over what is below
    const e = el.current;
    if (!e || block.kind !== "box") return setOver(false);
    setOver(e.scrollHeight > e.clientHeight + 1);
  });
  return (
    <div
      ref={el}
      data-jd-block={keyName}
      data-kind={block.kind}
      style={style}
      className={`jd-fbox ${className} ${over ? "jd-over" : ""}`.trim()}
      title={over ? "ข้อความยาวเกินกล่อง: ขยายกล่องหรือลดขนาดตัวอักษร" : undefined}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={() => !readOnly && onEdit()}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
      {on &&
        !readOnly &&
        block.rect &&
        (block.kind === "line" ? LINE_HANDLES : HANDLES).map((h) => (
          <span key={h} className={`jd-rh jd-rh-${h}`} data-handle={h} onPointerDown={(e) => onPointerDown(e, h)} />
        ))}
    </div>
  );
}

type PanelOpts = { src: string; readOnly: boolean; apply: (r: Result<Edited>) => void };

/** X / Y / width / height of the selected box in mm, and its place in the stack (SPEC v1.8 "แผงแบบอิสระ"). */
export function FreeBoxPanel({ block, src, readOnly, apply }: PanelOpts & { block: Block }) {
  const r = block.rect;
  const field = (label: string, k: keyof Rect, off = false) => (
    <label className={styles.prop} key={k}>
      {label}
      <input
        type="number"
        step="0.1"
        min={k === "w" || k === "h" ? 1 : undefined}
        disabled={readOnly || off || !r}
        key={`${block.start}-${k}-${r?.[k]}`}
        defaultValue={r ? r[k] : ""}
        aria-label={`${label} (mm)`}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (r && e.target.value !== "" && Number.isFinite(n) && n !== r[k]) apply(setBoxRect(src, block, { [k]: n }));
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
  );
  return (
    <div data-free-panel>
      <h4>ตำแหน่งและขนาด (mm)</h4>
      {!r && <p>ตำแหน่งนี้มี Jinja หรือหน่วยอื่น แก้ได้ใน HTML เท่านั้น</p>}
      <div className={styles.freeGrid}>
        {field("X", "x")}
        {field("Y", "y")}
        {field("กว้าง", "w")}
        {field("สูง", "h", block.kind === "line")}
      </div>
    </div>
  );
}

/** The picture to trace on the sheet (SPEC v1.8): shown faintly while designing, never printed. */
export function GuidePanel({
  sheet,
  page,
  src,
  readOnly,
  apply,
  shown,
  onShown,
  onUpload,
}: PanelOpts & { sheet: Block; page: { w: number; h: number }; shown: boolean; onShown: (on: boolean) => void; onUpload?: (file: File) => Promise<string | null> }) {
  const input = useRef<HTMLInputElement>(null);
  const guide = sheet.lists[0]?.list.items.find((b) => b.kind === "guide");
  return (
    <div data-guide-panel>
      <h4>ภาพพื้นหลังนำทาง</h4>
      <p>วางภาพแบบพิมพ์เดิมไว้ใต้กล่องเพื่อลากตาม — ไม่พิมพ์ลง PDF</p>
      {!readOnly && onUpload && (
        <button type="button" onClick={() => input.current?.click()}>
          {guide ? "เปลี่ยนภาพ" : "อัปโหลดภาพ"}
        </button>
      )}
      {guide && (
        <>
          <label>
            <input type="checkbox" checked={shown} onChange={(e) => onShown(e.target.checked)} /> แสดงภาพ
          </label>
          {!readOnly && (
            <button type="button" onClick={() => apply({ ok: true, value: removeBlock(src, guide) })}>
              ลบภาพ
            </button>
          )}
        </>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        aria-label="เลือกภาพพื้นหลังนำทาง"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !onUpload) return;
          const name = await onUpload(file);
          if (name) {
            apply(setGuide(src, sheet, name, page.w, page.h));
            onShown(true);
          }
        }}
      />
    </div>
  );
}
