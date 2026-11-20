import { describe, expect, it } from "vitest";

import type { ToolButton, ToolGroup } from "@/components/designer/Toolbar";
import { paragraphTools, textTools, type ToolContext } from "@/components/designer/toolbar-actions";

const calls: Record<string, string | null>[] = [];
const base: ToolContext = { block: null, decls: null, readOnly: false, editor: null, fonts: ["TH Sarabun New"], list: { can: false, kind: null, toggle: () => undefined }, setStyle: (p) => void calls.push(p), remove: () => undefined };
const button = (g: ToolGroup, id: string) => g.items.find((i) => i.id === id) as ToolButton;

describe("toolbar text and paragraph tools", () => {
  it("are grey with nothing selected", () => {
    expect(button(textTools(base), "bold").disabled).toBe(true);
    expect(button(paragraphTools(base), "left").disabled).toBe(true);
  });

  it("format the selected block through its style, and show what is on", () => {
    calls.length = 0;
    const ctx = { ...base, decls: { "font-weight": "bold", "text-align": "center" } };
    const text = textTools(ctx);
    expect(button(text, "bold")).toMatchObject({ disabled: false, pressed: true });
    expect(button(text, "italic")).toMatchObject({ pressed: false });
    button(text, "bold").onClick(); // on -> off
    button(text, "italic").onClick();
    const para = paragraphTools(ctx);
    expect(button(para, "center").pressed).toBe(true);
    button(para, "center").onClick(); // toggles off
    button(para, "right").onClick();
    expect(calls).toEqual([{ "font-weight": null }, { "font-style": "italic" }, { "text-align": null }, { "text-align": "right" }]);
  });

  it("are for the selected words while a text is typed in; a caret alone formats nothing", () => {
    const toggled: string[] = [];
    const editor = (selected: boolean) => ({ toggle: (f: string) => void toggled.push(f), clear: () => undefined, state: () => ({ selected, format: { bold: true, italic: false, underline: false, color: null } }) });
    const caret = textTools({ ...base, decls: {}, editor: editor(false) });
    expect(button(caret, "bold").disabled).toBe(true);
    const words = textTools({ ...base, decls: {}, editor: editor(true) });
    expect(button(words, "bold")).toMatchObject({ disabled: false, pressed: true });
    button(words, "underline").onClick();
    expect(toggled).toEqual(["underline"]);
  });

  it("are off for a read-only document", () => {
    expect(button(textTools({ ...base, decls: {}, readOnly: true }), "bold").disabled).toBe(true);
  });
});
