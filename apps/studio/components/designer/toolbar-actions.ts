import { Bold, Copy, Eraser, Italic, Trash2, Underline } from "lucide-react";
import { createElement } from "react";

import type { Block } from "@/lib/doc-blocks";
import type { EditorHandle } from "@/lib/editor-bus";

import { ColorTool } from "./ColorTool";
import type { ToolGroup } from "./Toolbar";

// What the toolbar's buttons do (SPEC-studio.md v1.9). Each group is built from what is selected and what is being
// typed; the buttons call the same edits as the panel beside the paper, so there is one way to do each thing.

export type ToolContext = {
  block: Block | null; // the selected block
  readOnly: boolean;
  editor: EditorHandle | null; // the text being typed in, if any
  remove: () => void;
};

/** Bold, italic, underline, colour and clear: on the selected words while typing in a text. */
export function textTools(ctx: ToolContext): ToolGroup {
  const at = ctx.editor?.state() ?? null;
  const off = ctx.readOnly || !at?.selected; // a caret alone formats nothing
  const on = at?.format;
  const button = (id: string, label: string, icon: typeof Bold, keys: string, f: "bold" | "italic" | "underline") => ({
    id,
    label,
    icon,
    keys,
    disabled: off,
    pressed: on ? on[f] : false,
    onClick: () => ctx.editor?.toggle(f),
  });
  return {
    id: "text",
    label: "จัดรูปแบบข้อความ",
    items: [
      button("bold", "ตัวหนา", Bold, "Ctrl+B", "bold"),
      button("italic", "ตัวเอียง", Italic, "Ctrl+I", "italic"),
      button("underline", "ขีดเส้นใต้", Underline, "Ctrl+U", "underline"),
      {
        id: "color",
        node: createElement(ColorTool, { label: "สีตัวอักษร", value: on?.color ?? null, disabled: off, onPick: (c) => ctx.editor?.toggle("color", c) }),
      },
      { id: "clear", label: "ล้างรูปแบบ", icon: Eraser, disabled: off, onClick: () => ctx.editor?.clear() },
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
