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
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { allBlocks, blockAt, readBlocks, type Block, type BlockKind, type BlockList, type Rect } from "@/lib/doc-blocks";
import { addBox, addListItem, boxSize, fromList, setBoxRect, toList, insertBlock, moveBlock, newBlockHtml, removeBlock, removeListItem, readStyle, replaceIn, setStyle, setTableSizes, type Edited, type NewBlock, type NewBox, type Result } from "@/lib/doc-edit";
import { fontNames } from "@/lib/doc-render";
import { readVar, TYPE_NAME, varSummary } from "@/lib/doc-var";
import { useEditor } from "@/lib/editor-bus";
import { cellAtPlace, cellPlace, type CellPlace } from "@/lib/table-cell";
import { setTextTag } from "@/lib/doc-text";
import { IMAGE_ACCEPT, isImageName } from "@/lib/asset-name";
import { paperOf, setMargins } from "@/lib/paper";
import { followPointer, placeNow, snapshot, type Place, type Snapshot } from "@/lib/drop-place";
import { fieldRefs, type FieldRef } from "@/lib/field-refs";
import type { Range } from "@/lib/doc-parse";
import type { Scope } from "@/lib/doc-sample";

import styles from "./Designer.module.css";
import { PaperCanvas, visible, type BlockFrame, type ListFrame } from "./PaperCanvas";
import { boxRects, FreeBoxPanel, GuidePanel, useFree } from "./FreeCanvas";
import { snapMove } from "@/lib/snap";
import { BlockPanel, TableSizePanel } from "./BlockPanels";
import { Toolbar } from "./Toolbar";
import { arrangeTools, blockTools, canFormat, kindTools, listTools, paragraphTools, textTools, type ToolContext } from "./toolbar-actions";
import { CustomCodeModal } from "./CustomCodeModal";
import { Resizer } from "../Resizer";
import { Rulers } from "./Rulers";
import { StylePanel } from "./StylePanel";
import { keepEditing, TextEditor, type Suggestion } from "./TextEditor";

// The Document Designer's work area (SPEC-studio v1.7): palette, the paper with selection, drag handles and the
// "วางที่นี่" slot, and the properties panel. Drops are placed against where things were when the drag began
// (lib/drop-place.ts, the same as the form builder); the source changes on drop only.

type Props = {
  src: string;
  blocks: BlockList;
  edit: (src: string) => void;
  onReport?: (reportJson: string) => void; // report.json with new page margins (one undo step)
  part?: "body" | "header" | "footer"; // the file `src` is: a header or footer has a smaller set of blocks (v1.8)
  onZone?: (part: "body" | "header" | "footer") => void; // double-click on a zone of the paper; on the document while a zone is edited
  onUpload?: (file: File) => Promise<string | null>; // an image into the draft's assets; its name, or null
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
  { kind: "grid", label: "ตารางเปล่า" },
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

/** The palette's groups (SPEC v1.7 รอบแก้ข้อ 2): Jinja-made blocks are "มาโคร". */
export const MACROS = new Set<string>(["condition", "repeat", "set", "custom"]);
/** What a free-layout sheet can hold (v1.8): each is dropped as a box at the pointer. */
export const FREE_PALETTE: { kind: string; label: string }[] = [
  { kind: "text", label: "ข้อความ" },
  { kind: "heading", label: "หัวข้อ" },
  { kind: "field", label: "ค่าช่องข้อมูล" },
  { kind: "image", label: "รูป / โลโก้" },
  { kind: "code", label: "QR / บาร์โค้ด" },
  { kind: "grid", label: "ตารางเปล่า" },
  { kind: "rect", label: "สี่เหลี่ยม" },
  { kind: "line", label: "เส้น" },
];
/** What a header or footer can hold: text, fields, an image, a row of columns, a rule, a gap. */
export const RUNNING_KINDS = new Set<string>(["text", "heading", "field", "image", "row", "rule", "space"]);
const PAGE_FIELDS = [
  { label: "เลขหน้า", expression: '<span class="pageNumber"></span>' },
  { label: "จำนวนหน้า", expression: '<span class="totalPages"></span>' },
];
type Group = "blocks" | "macros" | "fields";

/** The palette as a drop target while a block on the paper is dragged: dropping there removes it (รอบแก้ข้อ 3). */
export const TRASH = "jd-trash";

const PANES_KEY = "jester.designer.panes";
const GROUPS_KEY = "jester.designer.groups";
export const PANE_LIMITS = { left: [120, 420], right: [200, 560] } as const;
const DEFAULT_PANES = { left: 170, right: 280 };
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.round(Math.min(hi, Math.max(lo, v)));

/** Pane widths and open groups as this browser last left them (try/catch: storage may be blocked). */
function remembered<T extends object>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<T> | null;
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not kept: fine
  }
}

export const KIND_NAME: Record<BlockKind, string> = {
  text: "ข้อความ",
  field: "ค่าช่องข้อมูล",
  image: "รูป",
  row: "แถวแบ่งคอลัมน์",
  table: "ตารางรายการ",
  grid: "ตารางเปล่า",
  summary: "สรุปยอด",
  code: "QR / บาร์โค้ด",
  rule: "เส้นคั่น",
  space: "ช่องว่าง",
  pagebreak: "ขึ้นหน้าใหม่",
  list: "รายการ",
  condition: "เงื่อนไข",
  repeat: "วนซ้ำ",
  set: "ตั้งค่าตัวแปร",
  page: "หน้ากระดาษ",
  box: "กล่อง",
  rect: "สี่เหลี่ยม",
  line: "เส้น",
  guide: "ภาพพื้นหลังนำทาง",
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
      return { kind, src: assets.find(isImageName) ?? "logo.png" };
    case "row":
      return { kind, columns: 2 };
    case "table":
      return { kind, variable: "item", iterable: list, columns: columns.length ? columns : [{ head: "รายการ", expr: "item" }] };
    case "summary":
      return { kind, rows: [{ label: "รวม", expr: "fmt.money(totals.grand)" }] };
    case "grid":
      return { kind, rows: 3, columns: 2 };
    case "code":
      return { kind, expr: `fmt.qr(${scalar ? expr : '"ข้อความในโค้ด"'})` }; // plain text unless the report has a field
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
  // the end of the page is the end of the file: after a {% set %} dropped last, so a text dropped later can use it
  return others.length;
}

/** The list a list id names in the current blocks. */
export function listById(blocks: BlockList, id: string): BlockList | null {
  if (id === "root") return blocks;
  const [path, index] = id.split("/");
  const owner = blockAt(blocks, path.split(".").map(Number));
  return owner?.lists[Number(index)]?.list ?? null;
}

export function Workbench({ src, blocks, edit, readOnly, files, templateId, assets, sample, zoom, onReport, onUpload, part = "body", onZone }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  // the cell clicked in the selected table (v1.10): the toolbar's table buttons work on its row and column
  const [cell, setCell] = useState<(CellPlace & { key: string }) | null>(null);
  const cellNow = cell && cell.key === selected ? cell : null;
  const [active, setActive] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [pointerDrag, setPointerDrag] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // the text block being typed in
  const [coding, setCoding] = useState<number | null>(null); // the start of the block in the Custom Code modal
  const [panes, setPanes] = useState(DEFAULT_PANES);
  const [guideShown, setGuideShown] = useState(true); // the free sheet's guide picture: shown while designing, never printed
  const imagePicker = useRef<HTMLInputElement>(null);
  const imageAt = useRef<{ list: string; index: number; rect?: Rect } | null>(null); // where a dropped image goes once uploaded (rect: on a free sheet)
  const latest = useRef({ src, blocks });
  useEffect(() => {
    latest.current = { src, blocks };
  });
  const [open, setOpen] = useState<Record<Group, boolean>>({ blocks: true, macros: true, fields: true });
  const area = useRef<HTMLElement | null>(null); // the palette: its parent is the whole work area
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage exists only after hydration
    setPanes(remembered(PANES_KEY, DEFAULT_PANES));
    setOpen(remembered(GROUPS_KEY, { blocks: true, macros: true, fields: true }));
  }, []);
  function resize(next: { left?: number; right?: number }) {
    setPanes((p) => {
      const out = {
        left: clamp(next.left ?? p.left, PANE_LIMITS.left),
        right: clamp(next.right ?? p.right, PANE_LIMITS.right),
      };
      remember(PANES_KEY, out);
      return out;
    });
  }
  const toggle = (g: Group) =>
    setOpen((o) => {
      const out = { ...o, [g]: !o[g] };
      remember(GROUPS_KEY, out);
      return out;
    });
  const bounds = () => (area.current?.parentElement ?? document.body).getBoundingClientRect();
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
  // {% set %} blocks draw nothing on the paper: they are listed beside it, and their names are fields to put in text
  const variables = useMemo(
    () =>
      allBlocks(blocks).flatMap((b, _i, all) => {
        const v = b.kind === "set" && b.detail.kind === "set" ? readVar(b.detail.inner) : null;
        if (!v) return [];
        // used in a {{ }} or {% %} above its first {% set %}: it is not set yet there
        const first = all.find((o) => o.kind === "set" && o.detail.kind === "set" && readVar(o.detail.inner)?.name === v.name);
        const early = first === b && new RegExp(`(\{\{|\{%)[^}%]*\b${v.name}\b`).test(src.slice(0, b.start));
        return [{ block: b, name: v.name, type: v.type, summary: varSummary(v), early }];
      }),
    [blocks, src],
  );
  const fields = useMemo(
    () => [...(part === "body" ? [] : PAGE_FIELDS), ...variables.map((v) => ({ label: `ตัวแปร ${v.name}`, expression: `{{ ${v.name} }}` })), ...suggestions(files)],
    [files, part, variables],
  );
  const paper = useMemo(() => paperOf(files["report.json"]), [files]);
  const free = paper.layout === "free" && part === "body"; // one sheet of boxes placed in mm (v1.8)
  const kinds = (macro: boolean) =>
    free ? (macro ? [] : (FREE_PALETTE as { kind: NewBlock["kind"]; label: string }[])) : PALETTE.filter((p) => (part === "body" ? MACROS.has(p.kind) === macro : !macro && RUNNING_KINDS.has(p.kind)));
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
    const sheet = (root?.querySelector("[data-jd-zone]") ?? root?.querySelector(".jd-sheet"))?.getBoundingClientRect();
    const page = shot.current?.layout.containers.find((c) => c.id === "root");
    if (sheet && page) page.box = { top: sheet.top, bottom: sheet.bottom, left: sheet.left, right: sheet.right };
    setActive(id);
    setPointerDrag(true);
    stop.current = followPointer(e.activatorEvent, (p) => (at.current = p));
    if (id.startsWith("b:")) setSelected(id.slice(2));
    setMessage(null);
  }

  function onDragMove(e: DragMoveEvent) {
    if (free || !shot.current || !at.current) return; // a free sheet has no drop slots: the box lands at the pointer
    const pal = area.current?.getBoundingClientRect();
    const { x, y } = at.current;
    const overPalette = !!pal && String(e.active.id).startsWith("b:") && x >= pal.left && x <= pal.right && y >= pal.top && y <= pal.bottom;
    const place = overPalette ? { container: TRASH, index: 0 } : placeNow(shot.current, x, y);
    const next = place ? { ...place, reason: overPalette ? null : reasonFor(String(e.active.id), place) } : null;
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

  /** Drop a palette item on a free sheet: a box with its top-left corner at the pointer (snapped, kept on the sheet). */
  function placeNew(kind: string, p: { x: number; y: number } | null) {
    const sheet = blocks.items.find((b) => b.kind === "page");
    if (!sheet) return setMessage("ไม่พบหน้ากระดาษ (data-jd=\"page\") ในไฟล์นี้ — แก้ใน HTML");
    const el = shadow()?.querySelector("[data-jd-page]");
    const box = el?.getBoundingClientRect();
    if (!p || !box || p.x < box.left || p.x > box.right || p.y < box.top || p.y > box.bottom) return; // dropped off the sheet
    const scale = box.width / paper.widthMm;
    const nb: NewBox = kind === "rect" || kind === "line" ? { kind } : newBlockFor(kind as NewBlock["kind"], files, assets);
    const size = boxSize(nb);
    const clamp = (v: number, max: number) => Math.max(0, Math.min(v, Math.max(0, max)));
    const raw = { x: clamp((p.x - box.left) / scale, paper.widthMm - size.w), y: clamp((p.y - box.top) / scale, paper.heightMm - size.h), ...size };
    const rect = snapMove(raw, { page: { w: paper.widthMm, h: paper.heightMm }, others: boxRects(sheet).map((o) => o.rect), threshold: 6 / scale }).rect;
    if (nb.kind === "image" && onUpload && !assets.some(isImageName)) {
      imageAt.current = { list: "root", index: 0, rect };
      return imagePicker.current?.click();
    }
    apply(addBox(src, sheet, nb, rect));
  }

  function onDragEnd(e: DragEndEvent) {
    const d = dropRef.current;
    const pointer = at.current;
    finish();
    if (free && String(e.active.id).startsWith("new:")) return readOnly ? undefined : placeNew(String(e.active.id).slice(4), pointer);
    if (!d || readOnly) return;
    if (d.reason) return setMessage(d.reason);
    if (d.container === TRASH) {
      const gone = flat.find((b) => keyOf(b) === String(e.active.id).slice(2));
      if (!gone || (gone.kind === "custom" && !window.confirm("ลบ Custom Code นี้?"))) return;
      setSelected(null);
      return apply(removeBlock(src, gone));
    }
    const list = listById(blocks, d.container);
    if (!list) return;
    const id = String(e.active.id);
    if (id.startsWith("new:")) {
      const kind = id.slice(4) as NewBlock["kind"];
      codeNext.current = kind === "custom";
      if (kind === "image" && onUpload && !assets.some(isImageName)) {
        // no image yet: pick one now; it lands where the block was dropped
        imageAt.current = { list: d.container, index: modelIndex(list, d.index, null) };
        return imagePicker.current?.click();
      }
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

  /** A copy right after the selected block; in a free sheet, shifted 5 mm so it shows. */
  function duplicate() {
    if (!current) return;
    const parentKey = current.path.slice(0, -1);
    const list = parentKey.length === 0 ? blocks : listById(blocks, `${parentKey.slice(0, -1).join(".")}/${parentKey[parentKey.length - 1]}`);
    if (!list) return;
    const i = list.items.findIndex((b) => b.start === current.start);
    const out = insertBlock(src, list, i + 1, src.slice(current.start, current.end));
    const rect = current.rect;
    const copy = rect && out.at ? allBlocks(readBlocks(out.src)).find((b) => b.start === out.at!.start) : null;
    const moved = copy && rect ? setBoxRect(out.src, copy, { x: rect.x + 5, y: rect.y + 5 }) : null;
    apply(moved?.ok ? { src: moved.value.src, at: out.at } : out);
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
      const copy = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d";
      if ((e.key !== "Delete" && !copy) || readOnly || !current) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      if (copy) duplicate();
      else remove();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // the selected cell drawn with a frame (the paper is drawn by React from the file; the frame is set on the DOM after)
  useLayoutEffect(() => {
    const root = scroller.current?.querySelector("[data-paper]")?.shadowRoot;
    if (!root) return;
    root.querySelectorAll(".jd-cell-on").forEach((e) => e.classList.remove("jd-cell-on"));
    if (!cellNow) return;
    const block = root.querySelector(`[data-jd-block="${cellNow.key}"]`);
    const table = [...(block?.querySelectorAll("table") ?? [])].find((t) => t.closest("[data-jd-block]") === block);
    if (table) cellAtPlace(table, cellNow)?.classList.add("jd-cell-on");
  });

  /** Leaving the text editor: one undo step, refused if the text no longer reads as a text block. */
  function typed(block: Block, range: Range, inner: string | null) {
    setEditing(null);
    if (inner === null) return;
    const out = replaceIn(src, block, range, inner);
    const still = allBlocks(readBlocks(out.src)).some((b) => b.start === block.start && b.kind === block.kind);
    if (!still) return setMessage("ข้อความที่พิมพ์ทำให้บล็อกนี้ไม่ใช่ข้อความแล้ว (เช่นมี {% … %} ไม่ครบคู่) จึงไม่ได้ใช้ — แก้เป็น Custom Code ได้ในหน้า code");
    apply(out);
  }

  const innerOf = (box: Block) => box.lists[0]?.list.items.find((b) => b.render) ?? null;
  const freeSheet = useFree({
    blocks,
    page: { w: paper.widthMm, h: paper.heightMm },
    readOnly: readOnly || !free,
    selected,
    current,
    editing,
    keyOf,
    select: setSelected,
    edit: (box) => {
      const inner = innerOf(box);
      if (inner?.kind === "text") setEditing(keyOf(inner));
    },
    apply,
    src,
  });

  const frame: BlockFrame = ({ block, children }) => (
    <Frame
      block={block}
      readOnly={readOnly}
      onSelect={(k, place) => {
        setSelected(k);
        setCell(place ? { key: k, ...place } : null);
      }}
      onEdit={block.kind === "text" && !readOnly ? setEditing : block.kind === "custom" ? () => setCoding(block.start) : undefined}
      onColumns={!readOnly && (block.kind === "table" || block.kind === "grid") ? (cols) => apply(setTableSizes(src, block, { columns: cols })) : undefined}
    >
      {children}
    </Frame>
  );
  const editor = (b: Block) =>
    editing === keyOf(b) && b.detail.kind === "text" && b.node.kind === "element" ? (
      <TextEditor key={b.start} el={b.node} inner={b.detail.inner} src={src} fields={fields} onDone={(inner) => typed(b, (b.detail as { inner: Range }).inner, inner)} />
    ) : null;
  /** A cell of a fixed table being typed in (key "block#row.col"). */
  /** Enter in an item of a list: the item is kept and a new one opens after it; Enter in an empty item ends the list. */
  function nextItem(b: Block, i: number, inner: string | null) {
    const item = b.detail.kind === "list" ? b.detail.items[i] : null;
    if (!item) return setEditing(null);
    const text = inner ?? src.slice(item.inner.start, item.inner.end);
    let out: Edited = inner === null ? { src, at: null } : replaceIn(src, b, item.inner, inner);
    const again = () => allBlocks(readBlocks(out.src)).find((x) => x.start === b.start && x.kind === "list") ?? null;
    if (!text.trim()) {
      const fresh = again();
      const gone = fresh ? removeListItem(out.src, fresh, i) : null;
      setEditing(null);
      if (gone?.ok) apply(gone.value);
      else if (inner !== null) apply(out);
      return;
    }
    const fresh = again();
    const added = fresh ? addListItem(out.src, fresh, i) : null;
    if (!added?.ok) return typed(b, item.inner, inner);
    out = added.value;
    apply(out);
    setEditing(`${keyOf(b)}#${i + 1}.0`);
  }
  const cellEditor = (b: Block, r: number, c: number) => {
    if (editing !== `${keyOf(b)}#${r}.${c}`) return null;
    if (b.detail.kind === "list") {
      const item = b.detail.items[r];
      return item ? <TextEditor key={`${b.start}-${r}`} el={item.node} inner={item.inner} src={src} fields={fields} onDone={(inner) => typed(b, item.inner, inner)} onEnter={(inner) => nextItem(b, r, inner)} /> : null;
    }
    if (b.detail.kind !== "grid") return null;
    const cell = b.detail.rows[r]?.cells[c];
    return cell ? <TextEditor key={`${b.start}-${r}-${c}`} el={cell.node} inner={cell.inner} src={src} fields={fields} onDone={(inner) => typed(b, cell.inner, inner)} /> : null;
  };
  const list: ListFrame = ({ id, children }) => (free ? <>{children}</> : <ListBox id={id}>{children}</ListBox>);

  const label = active
    ? active.startsWith("new:")
      ? [...PALETTE, ...FREE_PALETTE].find((p) => p.kind === active.slice(4))?.label
      : KIND_NAME[flat.find((b) => keyOf(b) === active.slice(2))?.kind ?? "custom"]
    : "";

  const editorNow = useEditor(); // the text being typed in: the toolbar formats its selection
  const formattable = !!current && canFormat(current) && !!current.style && !current.style.readOnly; // a style with Jinja in it is hands off
  const styleRange = formattable ? current.style!.range : null;
  const tool: ToolContext = {
    block: current,
    decls: formattable ? Object.fromEntries(styleRange ? readStyle(src.slice(styleRange.start, styleRange.end)) : []) : null,
    readOnly,
    editor: editorNow,
    fonts: fontNames(files["report.json"]),
    src,
    apply,
    duplicate: () => duplicate(),
    cell: cellNow,
    move: free ? undefined : (dir) => step(dir),
    sheet: blocks.items.find((b) => b.kind === "page") ?? null,
    page: { w: paper.widthMm, h: paper.heightMm },
    list: {
      kind: current?.detail.kind === "list" ? (current.detail.ordered ? "ol" : "ul") : null,
      // a paragraph or a list, in the body, when no text is being typed in (Enter finishes that first)
      can: part === "body" && !editorNow && !!current && ((current.kind === "text" && current.detail.kind === "text" && ["p", "div"].includes(current.detail.tag)) || current.detail.kind === "list"),
      toggle: (ordered) => {
        if (!current) return;
        if (current.detail.kind !== "list") apply(toList(src, current, ordered));
        else if ((current.detail.ordered ? "ol" : "ul") === (ordered ? "ol" : "ul")) apply(fromList(src, current));
        else apply(setTextTag(src, current, ordered ? "ol" : "ul"));
      },
    },
    setStyle: (props) => current && apply(setStyle(src, current, props)),
    remove: () => remove(),
  }; // what the toolbar's buttons work on
  return (
    <DndContext id={dndId} sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={finish} autoScroll={{ threshold: { x: 0, y: 0.08 } }}>
      <DragCtx.Provider value={{ active, drop, pointer: pointerDrag, selected }}>
        {!readOnly && (
          <aside
            ref={area}
            className={`${styles.palette} ${active?.startsWith("b:") ? styles.trash : ""} ${drop?.container === TRASH ? styles.trashHot : ""}`}
            style={{ width: panes.left }}
            aria-label="บล็อก"
            data-trash={active?.startsWith("b:") ? (drop?.container === TRASH ? "hot" : "on") : undefined}
          >
            <GroupHead label="บล็อกทั่วไป" open={open.blocks} onToggle={() => toggle("blocks")} />
            {open.blocks && (
              <>
                <p className={styles.hint}>ลากลงกระดาษ</p>
                {kinds(false).map((p) => (
                  <PaletteItem key={p.kind} kind={p.kind} label={p.label} />
                ))}
              </>
            )}
            {part === "body" && <GroupHead label="มาโคร" open={open.macros} onToggle={() => toggle("macros")} />}
            {part === "body" && open.macros && kinds(true).map((p) => <PaletteItem key={p.kind} kind={p.kind} label={p.label} />)}
            {part === "body" && open.macros && variables.length > 0 && (
              <>
                <p className={styles.hint}>ตัวแปรที่ตั้งไว้ (ไม่แสดงบนกระดาษ คลิกเพื่อแก้)</p>
                {variables.map((v) => (
                  <button
                    key={keyOf(v.block)}
                    type="button"
                    className={`${styles.varItem} ${selected === keyOf(v.block) ? styles.varItemOn : ""}`}
                    title={`${TYPE_NAME[v.type]}${v.early ? " · ใช้ก่อนตั้งค่า" : ""}`}
                    onClick={() => setSelected(keyOf(v.block))}
                  >
                    {v.early && "⚠ "}{v.name} = <code>{v.summary}</code>
                  </button>
                ))}
              </>
            )}
            <GroupHead label="ช่องข้อมูล" open={open.fields} onToggle={() => toggle("fields")} />
            {open.fields && <p className={styles.hint}>ดับเบิลคลิกข้อความ แล้วลากลงในข้อความ หรือพิมพ์ {"{{"}</p>}
            {open.fields && fields.map((f) => (
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
        {!readOnly && (
          <Resizer
            orientation="vertical"
            label="ปรับความกว้างแผงบล็อก"
            className={styles.handle}
            onMove={(x) => resize({ left: x - bounds().left })}
            onStep={(d) => resize({ left: panes.left + d })}
            onReset={() => resize({ left: DEFAULT_PANES.left })}
          />
        )}
        <div className={styles.paperColumn}>
        {/* eslint-disable-next-line react-hooks/refs -- the buttons run the handlers on click; nothing reads a ref while rendering */}
        {!readOnly && <Toolbar groups={[...(kindTools(tool) ? [kindTools(tool)!] : []), ...(arrangeTools(tool) ? [arrangeTools(tool)!] : []), blockTools(tool), textTools(tool), paragraphTools(tool), listTools(tool)]} />}
        <div ref={scroller} className={styles.paperScroll} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          {message && (
            <p role="alert" className={styles.inlineAlert}>
              {message}
            </p>
          )}
          <div style={{ zoom }}>
            <Rulers
              paper={paperOf(files["report.json"])}
              zoom={zoom}
              readOnly={readOnly || !onReport}
              onMargins={(m) => {
                const next = setMargins(files["report.json"] ?? "{}", m);
                if (next === null) return setMessage("report.json อ่านไม่ได้ — แก้ขอบกระดาษในหน้า code");
                setMessage(null);
                onReport?.(next);
              }}
            >
            <PaperCanvas src={src} blocks={blocks} files={files} templateId={templateId} sample={sample} frame={frame} list={list} editor={editor} part={part} onZone={onZone} guide={guideShown} renderBox={free ? freeSheet.renderBox : undefined} placed={free ? freeSheet.placed : undefined} overlay={free ? freeSheet.overlay : undefined} onPage={free ? () => setSelected(null) : undefined} cellEditor={readOnly ? undefined : cellEditor} onCell={readOnly ? undefined : (b, r, c) => setEditing(`${keyOf(b)}#${r}.${c}`)} />
            </Rulers>
          </div>
        </div>
        </div>
        <Resizer
          orientation="vertical"
          label="ปรับความกว้างแผงคุณสมบัติ"
          className={styles.handle}
          onMove={(x) => resize({ right: bounds().right - x })}
          onStep={(d) => resize({ right: panes.right - d })}
          onReset={() => resize({ right: DEFAULT_PANES.right })}
        />
        <aside className={styles.panel} style={{ width: panes.right }} aria-label="คุณสมบัติของบล็อก">
          {current ? (
            <div className={styles.props}>
              <h3>{KIND_NAME[current.kind]}</h3>
              {free && freeSheet.sheet && (current.kind === "box" || current.kind === "rect" || current.kind === "line") && (
                <FreeBoxPanel block={current} src={src} readOnly={readOnly} apply={apply} />
              )}
              {free && current.kind === "box" && innerOf(current) && (
                <BlockPanel block={innerOf(current)!} src={src} files={files} assets={assets} readOnly={readOnly} fields={fields} apply={apply} onCode={() => setCoding(innerOf(current)!.start)} onUpload={onUpload} />
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
                onUpload={onUpload}
              />
              <TableSizePanel block={current} src={src} readOnly={readOnly} apply={apply} />
              {current.style && <StylePanel src={src} block={current} readOnly={readOnly} onChange={(props) => apply(setStyle(src, current, props))} />}
            </div>
          ) : free && freeSheet.sheet ? (
            <div className={styles.props}>
              <p className={styles.hint}>คลิกกล่องเพื่อแก้ ลากจากด้านซ้ายมาวางตรงที่ต้องการ · ลูกศรขยับ 0.5 mm (Shift 5 mm) · Alt ปิดการดูด</p>
              <GuidePanel
                sheet={freeSheet.sheet}
                page={{ w: paper.widthMm, h: paper.heightMm }}
                src={src}
                readOnly={readOnly}
                apply={apply}
                shown={guideShown}
                onShown={setGuideShown}
                onUpload={onUpload}
              />
            </div>
          ) : (
            <p className={styles.hint}>คลิกบล็อกบนกระดาษเพื่อแก้ ลากจากด้านซ้ายเพื่อเพิ่ม</p>
          )}
        </aside>
        <input
          ref={imagePicker}
          type="file"
          hidden
          accept={IMAGE_ACCEPT}
          aria-label="เลือกรูปสำหรับบล็อกรูป"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            const at = imageAt.current;
            imageAt.current = null;
            if (!file || !at || !onUpload) return;
            const name = await onUpload(file);
            const { src: now, blocks: tree } = latest.current;
            const target = name ? listById(tree, at.list) : null;
            if (name && at.rect) {
              const sheet = tree.items.find((b) => b.kind === "page");
              if (sheet) apply(addBox(now, sheet, { kind: "image", src: name }, at.rect));
            } else if (name && target) apply(insertBlock(now, target, at.index, newBlockHtml({ kind: "image", src: name })));
          }}
        />
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

/** A palette group's heading: a button that folds the group. */
function GroupHead({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <h3 className={styles.groupHead}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span aria-hidden>{open ? "▾" : "▸"}</span> {label}
      </button>
    </h3>
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
  onColumns,
  children,
}: {
  block: Block;
  readOnly: boolean;
  onSelect: (k: string, cell: CellPlace | null) => void;
  onEdit?: (k: string) => void;
  onColumns?: (widths: number[]) => void; // a table's column widths (%) after dragging a line between columns
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
        // a click in a cell of this table (not of a block inside it) picks that cell too
        const td = block.kind === "grid" || block.kind === "table" ? (e.target as Element).closest?.("td, th") : null;
        const own = td && td.closest("[data-jd-block]") === e.currentTarget ? cellPlace(td) : null;
        onSelect(key, own);
      }}
      onDoubleClick={onEdit && (() => onEdit(key))}
    >
      {!readOnly && (
        <button ref={setActivatorNodeRef} type="button" className="jd-handle" aria-label={`ลาก ${KIND_NAME[block.kind]}`} {...attributes} {...listeners}>
          ⠿
        </button>
      )}
      {children}
      {onColumns && selected === key && <ColumnHandles onCommit={onColumns} />}
    </div>
  );
}

/**
 * Lines between the columns of the selected table's first row: drag one to share the width of the two columns
 * beside it (shown live), let go to write every column's width as % of the table (SPEC v1.7 รอบแก้ข้อ 8).
 */
function ColumnHandles({ onCommit }: { onCommit: (widths: number[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ x: number; top: number; height: number }[]>([]);
  const drag = useRef<{ i: number; x0: number; widths: number[]; total: number; cells: HTMLElement[]; scale: number } | null>(null);
  const parts = () => {
    const frame = box.current?.parentElement;
    const table = frame?.querySelector("table");
    const row = table?.rows[0];
    if (!frame || !table || !row) return null;
    const scale = frame.getBoundingClientRect().width / (frame.offsetWidth || 1); // the paper's zoom
    return { frame, table, cells: [...row.cells] as HTMLElement[], scale };
  };
  // the table is drawn anew after every edit (a drag commits new widths): measure the table that is there now
  useLayoutEffect(() => {
    const frame = box.current?.parentElement;
    if (!frame) return;
    const measure = () => {
      const p = parts();
      if (!p) return setEdges([]);
      const f = p.frame.getBoundingClientRect();
      const t = p.table.getBoundingClientRect();
      const next = p.cells.slice(0, -1).map((c) => ({
        x: (c.getBoundingClientRect().right - f.left) / p.scale,
        top: (t.top - f.top) / p.scale,
        height: t.height / p.scale,
      }));
      setEdges((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    // a changed table (new cells, new widths) — but not the handles themselves moving
    const mo = new MutationObserver((records) => {
      if (records.some((r) => !box.current?.contains(r.target))) measure();
    });
    mo.observe(frame, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return (
    <div ref={box} aria-hidden>
      {edges.map((e, i) => (
        <div
          key={i}
          className="jd-col-handle"
          style={{ left: e.x, top: e.top, height: e.height }}
          onClick={(ev) => ev.stopPropagation()}
          onPointerDown={(ev) => {
            const p = parts();
            if (!p) return;
            ev.preventDefault();
            ev.stopPropagation();
            ev.currentTarget.setPointerCapture(ev.pointerId);
            drag.current = {
              i,
              x0: ev.clientX,
              widths: p.cells.map((c) => c.getBoundingClientRect().width),
              total: p.table.getBoundingClientRect().width,
              cells: p.cells,
              scale: p.scale,
            };
          }}
          onPointerMove={(ev) => {
            const d = drag.current;
            if (!d) return;
            const min = 12 * d.scale;
            const delta = Math.max(min - d.widths[d.i], Math.min(d.widths[d.i + 1] - min, ev.clientX - d.x0));
            const w = d.widths.map((v, j) => (j === d.i ? v + delta : j === d.i + 1 ? v - delta : v));
            w.forEach((v, j) => (d.cells[j].style.width = `${(v / d.total) * 100}%`)); // live, until the source changes
          }}
          onPointerUp={(ev) => {
            const d = drag.current;
            drag.current = null;
            if (!d || ev.clientX === d.x0) return;
            onCommit(d.cells.map((c) => Math.round((c.getBoundingClientRect().width / d.total) * 1000) / 10));
          }}
        />
      ))}
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
