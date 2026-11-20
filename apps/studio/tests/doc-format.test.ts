// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { clear, covers, stateAt, toggle } from "@/lib/doc-format";
import { domUnits, readInner, writeInner } from "@/lib/doc-text";

/** A contenteditable for `inner`, the edit, and the source it gives back. */
function edit(inner: string, change: (root: HTMLElement) => void): string {
  const start = readInner(inner);
  const root = document.createElement("div");
  root.innerHTML = start.html;
  document.body.append(root);
  change(root);
  const out = writeInner(start.units, domUnits(root));
  root.remove();
  return out;
}

/** A range over exactly `text` inside one text node, or from `from` to the end of `to` across nodes. */
function pick(root: HTMLElement, from: string, to = from): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let startSet = false;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const a = n.data.indexOf(from);
    if (!startSet && a >= 0) {
      range.setStart(n, a);
      startSet = true;
    }
    const b = n.data.indexOf(to);
    if (startSet && b >= 0 && (to !== from || a >= 0)) {
      range.setEnd(n, b + to.length);
      return range;
    }
  }
  throw new Error(`no ${from}..${to}`);
}

describe("doc-format: bold, italic, underline and colour over a selection", () => {
  const src = "เรียน คุณสมชาย ครับ";

  it("wraps the selected part only, and takes it off again", () => {
    expect(edit(src, (r) => void toggle(r, pick(r, "คุณสมชาย"), "bold"))).toBe("เรียน <strong>คุณสมชาย</strong> ครับ");
    expect(
      edit(src, (r) => {
        const range = toggle(r, pick(r, "คุณสมชาย"), "bold")!;
        toggle(r, range, "bold");
      }),
    ).toBe(src);
  });

  it("works on a part of a word and for italic, underline", () => {
    expect(edit("abcdef", (r) => void toggle(r, pick(r, "cd"), "italic"))).toBe("ab<em>cd</em>ef");
    expect(edit("abcdef", (r) => void toggle(r, pick(r, "b", "e"), "underline"))).toBe("a<u>bcde</u>f");
  });

  it("keeps a chip whole, inside the format", () => {
    expect(edit("A {{ data.x }} B", (r) => void toggle(r, pick(r, "A ", " B"), "bold"))).toBe("<strong>A {{ data.x }} B</strong>");
    expect(
      edit("เรียน {{ data.name }} ครับ", (r) => {
        const range = document.createRange();
        range.setStartBefore(r.querySelector(".jd-chip")!);
        range.setEndAfter(r.querySelector(".jd-chip")!);
        toggle(r, range, "bold");
      }),
    ).toBe("เรียน <strong>{{ data.name }}</strong> ครับ");
  });

  it("makes one element of neighbours, and extends over a part that is bold already", () => {
    expect(
      edit("abcdef", (r) => {
        toggle(r, pick(r, "ab"), "bold");
        toggle(r, pick(r, "cd"), "bold");
      }),
    ).toBe("<strong>abcd</strong>ef");
    expect(
      edit("a<strong>bc</strong>def", (r) => void toggle(r, pick(r, "a", "d"), "bold")),
    ).toBe("<strong>abcd</strong>ef");
  });

  it("takes a format off the middle of a formatted run, keeping the rest and the formats inside it", () => {
    expect(edit("<strong>abc</strong>", (r) => void toggle(r, pick(r, "b"), "bold"))).toBe("<strong>a</strong>b<strong>c</strong>");
    expect(edit("<strong><em>abc</em></strong>", (r) => void toggle(r, pick(r, "b"), "bold"))).toBe("<strong><em>a</em></strong><em>b</em><strong><em>c</em></strong>");
  });

  it("sets, replaces and clears a colour", () => {
    expect(edit("abc", (r) => void toggle(r, pick(r, "b"), "color", "#b3261e"))).toBe('a<span style="color: #b3261e">b</span>c');
    expect(
      edit("abc", (r) => {
        const range = toggle(r, pick(r, "b"), "color", "#b3261e")!;
        toggle(r, range, "color", "#1f4fa3");
      }),
    ).toBe('a<span style="color: #1f4fa3">b</span>c');
    expect(
      edit("abc", (r) => {
        const range = toggle(r, pick(r, "b"), "color", "#b3261e")!;
        toggle(r, range, "color", null);
      }),
    ).toBe("abc");
  });

  it("clears every format of the selection", () => {
    expect(edit("<strong>a</strong><em>b</em><u>c</u>", (r) => void clear(r, pick(r, "a", "c")))).toBe("abc");
    expect(edit("<small>a</small><strong>b</strong>", (r) => void clear(r, pick(r, "a", "b")))).toBe("<small>a</small>b"); // only our four
  });

  it("untouched source keeps its bytes", () => {
    const original = 'x &amp; <b class="k">y</b> <br />z {{ data.a }}';
    expect(edit(original, () => undefined)).toBe(original);
  });

  it("reports what is on at the caret and over a selection", () => {
    edit("a<strong>bc</strong>d", (r) => {
      const caret = document.createRange();
      const bc = r.querySelector("strong")!.firstChild!;
      caret.setStart(bc, 1);
      caret.collapse(true);
      expect(stateAt(r, caret)).toMatchObject({ bold: true, italic: false });
      expect(stateAt(r, pick(r, "bc"))).toMatchObject({ bold: true });
      expect(stateAt(r, pick(r, "a", "d"))).toMatchObject({ bold: false });
      expect(covers(r, pick(r, "bc"), "bold")).toBe(true);
    });
  });
});
