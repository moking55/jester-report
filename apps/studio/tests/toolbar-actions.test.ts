import { describe, expect, it } from "vitest";

import type { ToolButton, ToolGroup } from "@/components/designer/Toolbar";
import { readBlocks } from "@/lib/doc-blocks";
import { arrangeTools, kindTools, paragraphTools, textTools, type ToolContext } from "@/components/designer/toolbar-actions";

const calls: Record<string, string | null>[] = [];
const base: ToolContext = { block: null, decls: null, readOnly: false, editor: null, fonts: ["TH Sarabun New"], src: "", apply: () => undefined, duplicate: () => undefined, sheet: null, page: { w: 210, h: 297 }, list: { can: false, kind: null, toggle: () => undefined }, setStyle: (p) => void calls.push(p), remove: () => undefined };
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

  it("image: left / centre / right through auto margins; the pressed one again takes it back", () => {
    type Btn = { id: string; pressed?: boolean; onClick: () => void };
    const out: string[] = [];
    const run = (src: string) => {
      const g = kindTools(withBlock(src, (r) => out.push((r as { value: { src: string } }).value.src)));
      return (id: string) => g!.items.find((i) => i.id === id) as unknown as Btn;
    };
    expect(run('<img src="a.png" style="width: 40mm">')("upload")).toBeUndefined(); // the upload is in the panel
    run('<img src="a.png" style="width: 40mm">')("img-center").onClick();
    expect(out.pop()).toBe('<img src="a.png" style="width: 40mm; display: block; margin-left: auto; margin-right: auto">');
    const centred = run('<img src="a.png" style="display: block; margin-left: auto; margin-right: auto">');
    expect(centred("img-center").pressed).toBe(true);
    centred("img-right").onClick();
    expect(out.pop()).toBe('<img src="a.png" style="display: block; margin-left: auto">');
    centred("img-center").onClick();
    expect(out.pop()).toBe('<img src="a.png" style="">');
  });

  it("has nothing for a kind without tools yet, or no selection", () => {
    expect(kindTools(base)).toBeNull();
    expect(kindTools(withBlock("<hr>", () => undefined))).toBeNull();
  });
});

describe("kind tools of code, condition, variable and free boxes", () => {
  const withBlock = (src: string, apply: (r: unknown) => void, more: Partial<ToolContext> = {}) => ({ ...base, src, block: readBlocks(src).items[0], apply, ...more });
  const btn = (g: ToolGroup | null, id: string) => g?.items.find((i) => i.id === id) as ToolButton;
  const sel = (g: ToolGroup | null, id: string) => (g?.items.find((i) => i.id === id) as unknown as { node: { props: { value: string; onChange: (e: { target: { value: string } }) => void } } }).node.props;

  it("code: changes the kind and keeps the text", () => {
    const got: { src: string }[] = [];
    sel(kindTools(withBlock("<div>{{ fmt.qr(data.url) }}</div>", (r) => got.push(r as { src: string }))), "type").onChange({ target: { value: "barcode" } });
    expect(got[0].src).toBe("<div>{{ fmt.barcode(data.url) }}</div>");
  });

  it("condition and loop: their branches are in the panel, not the toolbar", () => {
    expect(kindTools(withBlock("{% if a %}<p>x</p>{% endif %}", () => undefined))).toBeNull();
    expect(kindTools(withBlock("{% for r in lists.a %}<p>x</p>{% endfor %}", () => undefined))).toBeNull();
  });

  it("variable: a type, and a conditional value", () => {
    const got: { src: string }[] = [];
    const g = kindTools(withBlock('{% set s = "a" %}', (r) => got.push((r as { value: { src: string } }).value)));
    btn(g, "conditional").onClick();
    expect(got[0].src).toBe('{% set s = "a" if true else "a" %}');
    sel(g, "type").onChange({ target: { value: "expr" } });
    expect(got[1].src).toBe('{% set s = "a" %}');
  });

  it("free box: stacking and alignment to the sheet", () => {
    const html = '<div data-jd="page" style="position: relative; width: 210mm; height: 148mm">\n<div data-jd="box" style="position: absolute; left: 10mm; top: 10mm; width: 50mm; height: 20mm"><p>x</p></div>\n</div>';
    const page = readBlocks(html).items[0];
    const box = page.lists[0].list.items[0];
    const got: { value: { src: string } }[] = [];
    const g = arrangeToolsFor(html, page, box, (r) => got.push(r as { value: { src: string } }));
    btn(g, "center").onClick();
    expect(got[0].value.src).toContain("left: 80mm");
    btn(g, "bottom").onClick();
    expect(got[1].value.src).toContain("top: 128mm");
    btn(g, "right").onClick();
    expect(got[2].value.src).toContain("left: 160mm");
  });
});

function arrangeToolsFor(src: string, sheet: ReturnType<typeof readBlocks>["items"][number], block: ReturnType<typeof readBlocks>["items"][number], apply: (r: unknown) => void) {
  return arrangeTools({ ...base, src, block, sheet, apply, page: { w: 210, h: 148 } });
}

describe("table buttons work on the picked cell (v1.10)", () => {
  const run = (src: string, id: string, cell: { row: number; col: number } | null) => {
    let out = "";
    const g = kindTools({ ...base, src, block: readBlocks(src).items[0], cell, apply: (r) => (out = ((r as { value?: { src: string } }).value ?? (r as { src: string })).src) });
    const b = g?.items.find((i) => i.id === id) as ToolButton;
    if (!b.disabled) b.onClick();
    return { out, disabled: b.disabled };
  };
  const G = '<table data-jd="grid"><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';

  it("fixed table: rows and columns around the cell", () => {
    expect(run(G, "colleft", { row: 0, col: 1 }).out).toBe('<table data-jd="grid"><tr><td>a</td><td>&nbsp;</td><td>b</td></tr><tr><td>c</td><td>&nbsp;</td><td>d</td></tr></table>');
    expect(run(G, "rowabove", { row: 0, col: 0 }).out.startsWith('<table data-jd="grid"><tr><td>&nbsp;</td><td>&nbsp;</td></tr>')).toBe(true);
    expect(run(G, "rowbelow", { row: 0, col: 0 }).out).toContain("<tr><td>a</td><td>b</td></tr>\n<tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>c</td>");
    expect(run(G, "merge", { row: 1, col: 0 }).out).toContain('<td colspan="2">c d</td>');
    expect(run(G, "merge", { row: 1, col: 1 }).disabled).toBe(true);
    expect(run(G, "split", { row: 1, col: 1 }).disabled).toBe(true);
    expect(run(G, "left", { row: 0, col: 0 }).disabled).toBe(true);
  });

  it("fixed table with no cell picked works at the end, as in v1.9", () => {
    expect(run(G, "colright", null).out).toBe('<table data-jd="grid"><tr><td>a</td><td>b</td><td>&nbsp;</td></tr><tr><td>c</td><td>d</td><td>&nbsp;</td></tr></table>');
  });

  it("list table: a column left of the picked one", () => {
    const L = "<table>\n<thead><tr><th>A</th><th>B</th></tr></thead>\n<tbody>\n{% for r in lists.x %}<tr><td>{{ r.a }}</td><td>{{ r.b }}</td></tr>{% endfor %}\n</tbody>\n</table>";
    const out = run(L, "addleft", { row: 0, col: 1 }).out;
    expect(out).toMatch(/<th>A<\/th>\s*<th>หัวคอลัมน์<\/th>\s*<th>B<\/th>/);
  });
});
