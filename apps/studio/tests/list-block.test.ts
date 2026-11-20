import { describe, expect, it } from "vitest";

import { readBlocks } from "@/lib/doc-blocks";
import { addListItem, fromList, removeListItem, toList } from "@/lib/doc-edit";
import { setTextTag } from "@/lib/doc-text";

const first = (src: string) => readBlocks(src).items[0];

describe("list blocks", () => {
  it("reads <ul>/<ol> of inline <li>s as a list", () => {
    const b = first("<ul>\n  <li>หนึ่ง</li>\n  <li>สอง {{ data.x }}</li>\n</ul>");
    expect(b.kind).toBe("list");
    expect(b.detail).toMatchObject({ kind: "list", ordered: false });
    expect(b.detail.kind === "list" && b.detail.items.length).toBe(2);
    expect(first("<ol><li>a</li></ol>").detail).toMatchObject({ ordered: true });
  });

  it("leaves a list with anything else inside as custom code", () => {
    expect(first("<ul><li><div>x</div></li></ul>").kind).toBe("custom");
    expect(first("<ul>{% for i in lists.a %}<li>{{ i }}</li>{% endfor %}</ul>").kind).toBe("custom");
    expect(first("<ul></ul>").kind).toBe("custom");
  });

  it("makes a paragraph a list, one item per line, and back", () => {
    const src = "<p>หนึ่ง<br>สอง<br />สาม</p>";
    const out = toList(src, first(src), false);
    expect(out.ok && out.value.src).toBe("<ul>\n  <li>หนึ่ง</li>\n  <li>สอง</li>\n  <li>สาม</li>\n</ul>");
    if (!out.ok) throw new Error();
    const list = first(out.value.src);
    expect(list.kind).toBe("list");
    const back = fromList(out.value.src, list);
    expect(back.ok && back.value.src).toBe("<p>หนึ่ง<br>สอง<br>สาม</p>");
  });

  it("keeps the style of the paragraph and works on a one-line paragraph", () => {
    const src = '<p style="margin-top: 3mm">เดียว</p>';
    const out = toList(src, first(src), true);
    expect(out.ok && out.value.src).toBe('<ol style="margin-top: 3mm">\n  <li>เดียว</li>\n</ol>');
  });

  it("does not make a heading a list", () => {
    expect(toList("<h2>x</h2>", first("<h2>x</h2>"), false)).toMatchObject({ ok: false });
  });

  it("switches between bullets and numbers", () => {
    const src = "<ul><li>a</li></ul>";
    const out = setTextTag(src, first(src), "ol");
    expect(out.ok && out.value.src).toBe("<ol><li>a</li></ol>");
  });

  it("adds an item after one, or first, and removes one", () => {
    const src = "<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>";
    const after = addListItem(src, first(src), 0);
    expect(after.ok && after.value.src).toBe("<ul>\n  <li>a</li>\n  <li></li>\n  <li>b</li>\n</ul>");
    const firstOne = addListItem(src, first(src), -1);
    expect(firstOne.ok && firstOne.value.src).toBe("<ul>\n  <li></li>\n  <li>a</li>\n  <li>b</li>\n</ul>");
    const gone = removeListItem(src, first(src), 0);
    expect(gone.ok && gone.value.src).toBe("<ul>\n  <li>b</li>\n</ul>");
    const goneLast = removeListItem(src, first(src), 1);
    expect(goneLast.ok && goneLast.value.src).toBe("<ul>\n  <li>a</li>\n</ul>");
    expect(removeListItem("<ul><li>a</li></ul>", first("<ul><li>a</li></ul>"), 0)).toMatchObject({ ok: false });
  });
});
