import { describe, expect, it } from "vitest";

import type { ToolButton, ToolGroup } from "@/components/designer/Toolbar";
import { readBlocks } from "@/lib/doc-blocks";
import { kindTools, paragraphTools, textTools, type ToolContext } from "@/components/designer/toolbar-actions";

const calls: Record<string, string | null>[] = [];
const base: ToolContext = { block: null, decls: null, readOnly: false, editor: null, fonts: ["TH Sarabun New"], src: "", apply: () => undefined, duplicate: () => undefined, list: { can: false, kind: null, toggle: () => undefined }, setStyle: (p) => void calls.push(p), remove: () => undefined };
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

describe("kind tools", () => {
  const withBlock = (src: string, apply: (r: unknown) => void) => ({ ...base, src, block: readBlocks(src).items[0], apply });
  const node = (g: ToolGroup | null, id: string) => (g?.items.find((i) => i.id === id) as unknown as { node: { props: { value: string; disabled: boolean; onChange: (e: { target: { value: string } }) => void } } }).node.props;

  it("text: a heading level through the tag", () => {
    const got: unknown[] = [];
    const g = kindTools(withBlock("<p>ก</p>", (r) => got.push(r)));
    const level = node(g, "level");
    expect(level.value).toBe("p");
    level.onChange({ target: { value: "h2" } });
    expect(got).toMatchObject([{ ok: true, value: { src: "<h2>ก</h2>" } }]);
  });

  it("field: wraps and unwraps fmt, leaves other expressions grey", () => {
    const got: { src: string }[] = [];
    const g = kindTools(withBlock("<div>{{ totals.grand }}</div>", (r) => got.push(r as { src: string })));
    const format = node(g, "format");
    expect(format.value).toBe("plain");
    format.onChange({ target: { value: "money" } });
    expect(got[0].src).toBe("<div>{{ fmt.money(totals.grand) }}</div>");
    const other = kindTools(withBlock("<div>{{ data.a | upper }}</div>", () => undefined));
    expect(node(other, "format").disabled).toBe(true);
  });

  it("has nothing for a kind without tools yet, or no selection", () => {
    expect(kindTools(base)).toBeNull();
    expect(kindTools(withBlock("<hr>", () => undefined))).toBeNull();
  });
});
