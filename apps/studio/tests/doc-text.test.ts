// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allBlocks, readBlocks } from "@/lib/doc-blocks";
import { domUnits, readInlineIf, readInner, setTextTag, textUnits, writeInlineIf, writeInner } from "@/lib/doc-text";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const FIXTURES = join(__dirname, "fixtures/doc");

/** Through a contenteditable and back, with an optional change to the DOM in between. */
function roundTrip(inner: string, change?: (el: HTMLElement) => void): string {
  const { units, html } = readInner(inner);
  const el = document.createElement("div");
  el.innerHTML = html;
  change?.(el);
  return writeInner(units, domUnits(el));
}

const sources = [
  ...readdirSync(STARTERS).map((d) => [`starter ${d}`, readFileSync(join(STARTERS, d, "template.html"), "utf8")]),
  ...readdirSync(FIXTURES).map((f) => [`fixture ${f}`, readFileSync(join(FIXTURES, f), "utf8")]),
];

describe("text blocks round-trip unchanged", () => {
  it.each(sources)("%s", (_, src) => {
    for (const b of allBlocks(readBlocks(src))) {
      if (b.detail.kind !== "text") continue;
      const inner = src.slice(b.detail.inner.start, b.detail.inner.end);
      expect(roundTrip(inner)).toBe(inner);
    }
  });

  it.each([
    "a &amp; b&nbsp;c &lt;x&gt; &#3585;",
    "<b>{{ x }}</b> และ <br /> <span style='color: red' >แดง</span>",
    "\n    เลขที่ {{ params.id }}\n    {# note #}\n  ",
    "ราคา {%- if vat %} รวม VAT {%- else -%} ไม่รวม {% endif -%} บาท",
    "line one\r\nline two",
  ])("%s", (inner) => expect(roundTrip(inner)).toBe(inner));
});

describe("edits write only the changed middle", () => {
  it("typing a character keeps the entities and tags around it", () => {
    const inner = "a&nbsp;b <br /> {{ x }} c&amp;d";
    const out = roundTrip(inner, (el) => {
      const last = el.lastChild!;
      last.nodeValue = last.nodeValue!.replace("c", "cc");
    });
    expect(out).toBe("a&nbsp;b <br /> {{ x }} cc&amp;d");
  });

  it("deleting a chip removes exactly its source", () => {
    const out = roundTrip("เรียน {{ data.name }} ครับ", (el) => el.querySelector(".jd-chip")!.remove());
    expect(out).toBe("เรียน  ครับ");
  });

  it("new text is escaped and a typed U+00A0 is a space", () => {
    const out = roundTrip("x", (el) => (el.firstChild!.nodeValue = "x <y> & z "));
    expect(out).toBe("x &lt;y&gt; &amp; z ");
  });

  it("tags the browser invents are flattened, inline ones kept", () => {
    const out = roundTrip("a", (el) => (el.innerHTML = "a<div>b<b>c</b></div><font>d</font>"));
    expect(out).toBe("ab<b>c</b>d");
  });

  it("an entity counts as its character", () => {
    expect(textUnits("&amp;&#x41;&unknown;").map((u) => u.ch)).toEqual(["&", "A", "&unknown;"]);
  });
});

describe("inline if", () => {
  const raw = "{%- if vat %} รวม {{ x }} {% else -%} ไม่รวม {% endif %}";

  it("reads branches", () => {
    expect(readInlineIf(raw)).toEqual({
      branches: [
        { keyword: "if", test: "vat", body: " รวม {{ x }} " },
        { keyword: "else", test: "", body: " ไม่รวม " },
      ],
    });
  });

  it("writes tests and bodies, keeping whitespace control", () => {
    const out = writeInlineIf(raw, {
      branches: [
        { keyword: "if", test: "params.vat > 0", body: "มี" },
        { keyword: "else", test: "", body: "ไม่มี" },
      ],
    });
    expect(out).toEqual({ ok: true, value: "{%- if params.vat > 0 %}มี{% else -%}ไม่มี{% endif %}" });
  });

  it("refuses a body that breaks the pairing", () => {
    const out = writeInlineIf(raw, { branches: [{ keyword: "if", test: "a", body: "{% if b %}" }, { keyword: "else", test: "", body: "" }] });
    expect(out.ok).toBe(false);
  });
});

describe("setTextTag", () => {
  it("renames open and close", () => {
    const src = '<p style="x">a</p>\n<h1>b</h1>\n';
    const b = readBlocks(src).items[0];
    const out = setTextTag(src, b, "h2");
    expect(out.ok && out.value.src).toBe('<h2 style="x">a</h2>\n<h1>b</h1>\n');
    expect(out.ok && out.value.at).toEqual({ start: 0, end: 20 });
  });
});

describe("page number chips (header / footer)", () => {
  const inner = 'หน้า <span class="pageNumber"></span>/<span class="totalPages"></span> <b>x</b>';

  it("are single chips and round-trip unchanged", () => {
    const { html } = readInner(inner);
    const el = document.createElement("div");
    el.innerHTML = html;
    expect([...el.querySelectorAll(".jd-chip")].map((c) => c.textContent)).toEqual(["เลขหน้า", "จำนวนหน้า"]);
    expect(roundTrip(inner)).toBe(inner);
  });

  it("deleting one removes exactly its element", () => {
    expect(roundTrip(inner, (el) => el.querySelector(".jd-chip")!.remove())).toBe('หน้า /<span class="totalPages"></span> <b>x</b>');
  });
});
