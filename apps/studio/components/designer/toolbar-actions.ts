import { Copy, Trash2 } from "lucide-react";

import type { Block } from "@/lib/doc-blocks";

import type { ToolGroup } from "./Toolbar";

// What the toolbar's buttons do (SPEC-studio.md v1.9). Each group is built from what is selected and what is being
// typed; the buttons call the same edits as the panel beside the paper, so there is one way to do each thing.

export type ToolContext = {
  block: Block | null; // the selected block
  readOnly: boolean;
  remove: () => void;
};

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
