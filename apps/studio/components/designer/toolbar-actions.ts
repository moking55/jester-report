import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Bold,
  BringToFront,
  Columns3,
  Copy,
  Equal,
  Eraser,
  GitBranchPlus,
  Grid3x3,
  Heading,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  ListPlus,
  SendToBack,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Underline,
} from "lucide-react";
import { createElement } from "react";

import type { Block } from "@/lib/doc-blocks";
import {
  addColumn,
  addRowColumn,
  addSummaryRow,
  equalColumns,
  gridAddColumn,
  gridAddRow,
  gridBorders,
  gridHeader,
  gridRemoveColumn,
  gridRemoveRow,
  moveBoxOrder,
  readStyle,
  removeColumn,
  replaceIn,
  setBoxRect,
  setStyle,
  setTagArgs,
  type Edited,
  type Result,
} from "@/lib/doc-edit";
import { CODE_NAME, readCode, writeCode, type CodeType } from "@/lib/code-block";
import { setTextTag, TEXT_LEVELS } from "@/lib/doc-text";
import { convertValue, readVar, TYPE_NAME, writeVar, type Var, type VarType } from "@/lib/doc-var";
import { FORMAT_NAME, readFieldFormat, writeFieldFormat, type FieldFormat } from "@/lib/field-format";
import type { EditorHandle } from "@/lib/editor-bus";

import { ColorTool } from "./ColorTool";
import styles from "./Designer.module.css";
import type { ToolGroup, ToolNode } from "./Toolbar";

// What the toolbar's buttons do (SPEC-studio.md v1.9). Each group is built from what is selected and what is being
// typed; the buttons call the same edits as the panel beside the paper, so there is one way to do each thing.

/** Blocks whose text a style on the block formats (the style is inherited by what is inside). */
const FORMATTABLE = new Set(["text", "field", "summary", "table", "grid", "code", "box"]);
export const canFormat = (b: Block | null) => !!b && FORMATTABLE.has(b.kind);

export const FONT_SIZES = ["10pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "28pt"];

export type ToolContext = {
  block: Block | null; // the selected block
  decls: Record<string, string> | null; // its style, when it can be formatted and the style is not Jinja
  readOnly: boolean;
  editor: EditorHandle | null; // the text being typed in, if any
  fonts: string[]; // the fonts of the report
  src: string; // template.html as it is now
  apply: (r: Result<Edited> | Edited) => void; // one undo step
  duplicate: () => void; // a copy after the selected block
  pickImage: () => void; // choose a picture to replace the selected image's
  sheet: Block | null; // the one sheet of a free layout
  page: { w: number; h: number }; // its size, mm
  list: { can: boolean; kind: "ul" | "ol" | null; toggle: (ordered: boolean) => void }; // a paragraph as a list, a list back
  setStyle: (props: Record<string, string | null>) => void; // write the selected block's style (one undo step)
  remove: () => void;
};

const bolder = (w: string | undefined) => !!w && /^(bold|bolder|[6-9]00)$/.test(w);

/**
 * Bold, italic, underline, colour and clear. While typing, the selected words; otherwise the selected block
 * (a style on it, which what is inside inherits).
 */
export function textTools(ctx: ToolContext): ToolGroup {
  const typing = ctx.editor?.state() ?? null;
  const words = !!typing; // an editor is open: a caret alone formats nothing
  const off = ctx.readOnly || (words ? !typing?.selected : !ctx.decls);
  const d = ctx.decls ?? {};
  const now = words ? typing!.format : { bold: bolder(d["font-weight"]), italic: d["font-style"] === "italic", underline: /underline/.test(d["text-decoration"] ?? ""), color: d.color ?? null };
  const button = (id: string, label: string, icon: typeof Bold, keys: string, f: "bold" | "italic" | "underline", prop: [string, string]) => ({
    id,
    label,
    icon,
    keys,
    disabled: off,
    pressed: now[f],
    onClick: () => (words ? ctx.editor?.toggle(f) : ctx.setStyle({ [prop[0]]: now[f] ? null : prop[1] })),
  });
  return {
    id: "text",
    label: "จัดรูปแบบข้อความ",
    items: [
      button("bold", "ตัวหนา", Bold, "Ctrl+B", "bold", ["font-weight", "bold"]),
      button("italic", "ตัวเอียง", Italic, "Ctrl+I", "italic", ["font-style", "italic"]),
      button("underline", "ขีดเส้นใต้", Underline, "Ctrl+U", "underline", ["text-decoration", "underline"]),
      {
        id: "color",
        node: createElement(ColorTool, {
          label: "สีตัวอักษร",
          value: now.color,
          disabled: off,
          onPick: (c) => (words ? ctx.editor?.toggle("color", c) : ctx.setStyle({ color: c })),
        }),
      },
      {
        id: "clear",
        label: "ล้างรูปแบบ",
        icon: Eraser,
        disabled: off,
        onClick: () => (words ? ctx.editor?.clear() : ctx.setStyle({ "font-weight": null, "font-style": null, "text-decoration": null, color: null })),
      },
    ],
  };
}

/** Bulleted and numbered list: a paragraph becomes one (a line per item), the same button turns it back. */
/** A list the toolbar offers (a level, a format): its options and what picking one does. */
function select(id: string, label: string, value: string, options: [string, string][], disabled: boolean, onPick: (v: string) => void): ToolNode {
  const shown = value && !options.some(([v]) => v === value) ? [...options, [value, value] as [string, string]] : options;
  return {
    id,
    node: createElement(
      "select",
      { className: styles.toolSelect, "aria-label": label, title: label, value, disabled, onChange: (e: { target: { value: string } }) => onPick(e.target.value) },
      [["", label] as [string, string], ...shown].map(([v, l]) => createElement("option", { key: v, value: v }, l)),
    ),
  };
}

/** What only this kind of block has: a heading level for text, a number format for a field, … */
export function kindTools(ctx: ToolContext): ToolGroup | null {
  const b = ctx.block;
  if (!b) return null;
  const off = ctx.readOnly;
  if (b.kind === "text" && b.detail.kind === "text") {
    const name = b.node.kind === "element" ? b.node.name : "p";
    return {
      id: "kind",
      label: "ข้อความ",
      items: [
        select("level", "ระดับ", name === "div" ? "" : name, TEXT_LEVELS.map(([v, l]) => [v, l]), off || name === "div", (v) => v && ctx.apply(setTextTag(ctx.src, b, v))),
      ],
    };
  }
  if (b.kind === "field" && b.detail.kind === "field") {
    const d = b.detail;
    const now = readFieldFormat(d.inner);
    const names = (Object.keys(FORMAT_NAME) as FieldFormat[]).map((f): [string, string] => [f, FORMAT_NAME[f]]);
    return {
      id: "kind",
      label: "ค่าช่องข้อมูล",
      items: [
        select("format", "รูปแบบ", now?.format ?? "", names, off || !now, (v) => {
          if (!v || !now) return;
          ctx.apply(replaceIn(ctx.src, b, d.expr, `{{ ${writeFieldFormat(now.path, v as FieldFormat, now.places)} }}`));
        }),
      ],
    };
  }
  const act = (id: string, label: string, icon: typeof Bold, run: () => Result<Edited> | Edited, disabled = false, pressed?: boolean) => ({
    id,
    label,
    icon,
    disabled: off || disabled,
    pressed,
    onClick: () => ctx.apply(run()),
  });
  const styleOf = (): Record<string, string> => (b.style?.range ? Object.fromEntries(readStyle(ctx.src.slice(b.style.range.start, b.style.range.end))) : {});
  switch (b.detail.kind) {
    case "image":
      return {
        id: "kind",
        label: "รูป",
        items: [
          { id: "upload", label: "อัปโหลดรูปใหม่", icon: ImagePlus, disabled: off, onClick: ctx.pickImage },
          select("width", "ความกว้าง", styleOf().width ?? "", [["25%", "25%"], ["50%", "50%"], ["75%", "75%"], ["100%", "100%"]], off || !!b.style?.readOnly, (v) => ctx.apply(setStyle(ctx.src, b, { width: v || null }))),
        ],
      };
    case "row": {
      const cols = b.node.kind === "element" ? b.node.children.filter((c) => c.kind === "element").length : 0;
      return {
        id: "kind",
        label: "แถวแบ่งคอลัมน์",
        items: [act("addcol", "เพิ่มคอลัมน์", Columns3, () => addRowColumn(ctx.src, b), cols >= 4), act("equal", "สัดส่วนคอลัมน์เท่ากัน", Equal, () => equalColumns(ctx.src, b))],
      };
    }
    case "table": {
      const d = b.detail;
      const last = d.cells.length - 1;
      return {
        id: "kind",
        label: "ตารางรายการ",
        items: [
          act("addcol", "เพิ่มคอลัมน์ท้าย", BetweenVerticalStart, () => addColumn(ctx.src, b, last, "หัวคอลัมน์", `{{ ${d.loop.variable} }}`)),
          act("delcol", "ลบคอลัมน์ท้าย", TableColumnsSplit, () => removeColumn(ctx.src, b, last), last < 1),
          select("border", "เส้นตาราง", styleOf().border ?? "", [["1px solid #000", "เส้นนอก"], ["none", "ไม่มี"]], off || !!b.style?.readOnly, (v) => ctx.apply(setStyle(ctx.src, b, { border: v || null }))),
        ],
      };
    }
    case "grid": {
      const d = b.detail;
      const rows = d.rows.length;
      const cols = d.rows[0].cells.length;
      const bordered = d.rows.every((r) => r.cells.every((c) => /(?:^|;)\s*border\s*:/.test(c.node.attrs.find((a) => a.name === "style")?.value ?? "")));
      return {
        id: "kind",
        label: "ตารางเปล่า",
        items: [
          act("addrow", "เพิ่มแถวท้าย", BetweenHorizontalStart, () => gridAddRow(ctx.src, b, rows - 1)),
          act("delrow", "ลบแถวท้าย", TableRowsSplit, () => gridRemoveRow(ctx.src, b, rows - 1), rows <= 1),
          act("addcol", "เพิ่มคอลัมน์ท้าย", BetweenVerticalStart, () => gridAddColumn(ctx.src, b, cols - 1)),
          act("delcol", "ลบคอลัมน์ท้าย", TableColumnsSplit, () => gridRemoveColumn(ctx.src, b, cols - 1), cols <= 1),
          act("head", "แถวแรกเป็นหัวตาราง", Heading, () => gridHeader(ctx.src, b, !d.head), false, d.head),
          act("borders", "เส้นตาราง", Grid3x3, () => gridBorders(ctx.src, b, !bordered), false, bordered),
        ],
      };
    }
    case "summary":
      return { id: "kind", label: "สรุปยอด", items: [act("addrow", "เพิ่มแถว", ListPlus, () => addSummaryRow(ctx.src, b))] };
    case "code": {
      const d = b.detail;
      const code = readCode(d.inner);
      const names = (Object.keys(CODE_NAME) as CodeType[]).map((t): [string, string] => [t, CODE_NAME[t]]);
      return {
        id: "kind",
        label: "QR / บาร์โค้ด",
        items: [select("type", "ชนิด", code?.type ?? "", names, off || !code, (v) => code && v && ctx.apply(replaceIn(ctx.src, b, d.expr, `{{ ${writeCode({ ...code, type: v as CodeType })} }}`)))],
      };
    }
    case "set": {
      const v = readVar(b.detail.inner);
      if (!v) return null;
      const write = (next: Var): Result<Edited> => {
        const out = writeVar(next);
        return out.ok ? setTagArgs(ctx.src, b, b, "set", out.value) : { ok: false, error: out.error };
      };
      const names = (Object.keys(TYPE_NAME) as VarType[]).map((t): [string, string] => [t, TYPE_NAME[t]]);
      const conv = (t: VarType) => (x: string) => convertValue(x, v.type, t);
      return {
        id: "kind",
        label: "ตัวแปร",
        items: [
          select("type", "ประเภท", v.type, names, off, (t) => t && ctx.apply(write({ ...v, type: t as VarType, rows: v.rows.map((r) => ({ ...r, value: conv(t as VarType)(r.value) })), otherwise: conv(t as VarType)(v.otherwise) }))),
          act(
            "conditional",
            v.rows.length ? "ค่าเดียว (เอาเงื่อนไขออก)" : "ตั้งค่าตามเงื่อนไข",
            GitBranchPlus,
            () => write(v.rows.length ? { ...v, rows: [], otherwise: v.rows[0].value } : { ...v, rows: [{ test: "true", value: v.otherwise }] }),
            false,
            v.rows.length > 0,
          ),
        ],
      };
    }
    default:
      return null;
  }
}

/** Stacking order and alignment to the sheet, for a box, a rectangle or a line of a free layout. */
export function arrangeTools(ctx: ToolContext): ToolGroup | null {
  const b = ctx.block;
  const r = b?.rect;
  if (!b || !r || !ctx.sheet || !["box", "rect", "line"].includes(b.kind)) return null;
  const sheet = ctx.sheet;
  const off = ctx.readOnly;
  const order = (id: string, label: string, icon: typeof ArrowUp, to: "front" | "back" | "up" | "down") => ({ id, label, icon, disabled: off, onClick: () => ctx.apply(moveBoxOrder(ctx.src, b, sheet, to)) });
  const place = (id: string, label: string, icon: typeof ArrowUp, rect: { x?: number; y?: number }) => ({ id, label, icon, disabled: off, onClick: () => ctx.apply(setBoxRect(ctx.src, b, rect)) });
  const { w: W, h: H } = ctx.page;
  return {
    id: "arrange",
    label: "ลำดับและการจัดแนว",
    items: [
      order("front", "ยกขึ้นหน้าสุด", BringToFront, "front"),
      order("up", "ขึ้นหนึ่งชั้น", ArrowUp, "up"),
      order("down", "ลงหนึ่งชั้น", ArrowDown, "down"),
      order("back", "ส่งไปหลังสุด", SendToBack, "back"),
      place("left", "ชิดซ้ายของกระดาษ", AlignStartVertical, { x: 0 }),
      place("center", "กึ่งกลางกระดาษ (แนวนอน)", AlignCenterVertical, { x: (W - r.w) / 2 }),
      place("right", "ชิดขวาของกระดาษ", AlignEndVertical, { x: W - r.w }),
      place("top", "ชิดบนของกระดาษ", AlignStartHorizontal, { y: 0 }),
      place("middle", "กึ่งกลางกระดาษ (แนวตั้ง)", AlignCenterHorizontal, { y: (H - r.h) / 2 }),
      place("bottom", "ชิดล่างของกระดาษ", AlignEndHorizontal, { y: H - r.h }),
    ],
  };
}

export function listTools(ctx: ToolContext): ToolGroup {
  const button = (id: string, label: string, icon: typeof List, ordered: boolean) => ({
    id,
    label,
    icon,
    disabled: ctx.readOnly || !ctx.list.can,
    pressed: ctx.list.kind === (ordered ? "ol" : "ul"),
    onClick: () => ctx.list.toggle(ordered),
  });
  return { id: "list", label: "รายการ", items: [button("bullets", "รายการจุด", List, false), button("numbers", "รายการตัวเลข", ListOrdered, true)] };
}

/** Font, size and alignment of the selected block. */
export function paragraphTools(ctx: ToolContext): ToolGroup {
  const off = ctx.readOnly || !ctx.decls;
  const d = ctx.decls ?? {};
  const pick = (id: string, label: string, value: string, options: [string, string][], prop: string) => ({
    id,
    node: createElement(
      "select",
      { className: styles.toolSelect, "aria-label": label, title: label, value, disabled: off, onChange: (e: { target: { value: string } }) => ctx.setStyle({ [prop]: e.target.value || null }) },
      [["", label] as [string, string], ...options, ...(value && !options.some(([v]) => v === value) ? [[value, value] as [string, string]] : [])].map(([v, l]) => createElement("option", { key: v, value: v }, l)),
    ),
  });
  const font = (d["font-family"] ?? "").replace(/^["']|["']$/g, "");
  const align = (id: string, label: string, icon: typeof AlignLeft, value: string) => ({
    id,
    label,
    icon,
    disabled: off,
    pressed: d["text-align"] === value,
    onClick: () => ctx.setStyle({ "text-align": d["text-align"] === value ? null : value }),
  });
  return {
    id: "paragraph",
    label: "ฟอนต์ ขนาด และการจัดชิด",
    items: [
      pick("font", "ฟอนต์", font, ctx.fonts.map((f) => [f, f]), "font-family"),
      pick("size", "ขนาด", d["font-size"] ?? "", FONT_SIZES.map((s) => [s, s.replace("pt", "")]), "font-size"),
      align("left", "ชิดซ้าย", AlignLeft, "left"),
      align("center", "กึ่งกลาง", AlignCenter, "center"),
      align("right", "ชิดขวา", AlignRight, "right"),
      align("justify", "เต็มบรรทัด", AlignJustify, "justify"),
    ],
  };
}

/** The buttons every block has: duplicate and delete. */
export function blockTools(ctx: ToolContext): ToolGroup {
  const none = !ctx.block || ctx.readOnly;
  return {
    id: "block",
    label: "บล็อกที่เลือก",
    items: [
      { id: "duplicate", label: "ทำสำเนา", icon: Copy, keys: "Ctrl+D", disabled: none, onClick: ctx.duplicate },
      { id: "remove", label: "ลบ", icon: Trash2, keys: "Delete", disabled: none, onClick: ctx.remove },
    ],
  };
}
