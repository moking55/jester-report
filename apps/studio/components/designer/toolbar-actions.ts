import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Copy, Eraser, Italic, List, ListOrdered, Trash2, Underline } from "lucide-react";
import { createElement } from "react";

import type { Block } from "@/lib/doc-blocks";
import type { EditorHandle } from "@/lib/editor-bus";

import { ColorTool } from "./ColorTool";
import styles from "./Designer.module.css";
import type { ToolGroup } from "./Toolbar";

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
      { id: "duplicate", label: "ทำสำเนา", icon: Copy, keys: "Ctrl+D", disabled: true, onClick: () => undefined },
      { id: "remove", label: "ลบ", icon: Trash2, keys: "Delete", disabled: none, onClick: ctx.remove },
    ],
  };
}
