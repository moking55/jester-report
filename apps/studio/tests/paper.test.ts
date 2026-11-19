import { describe, expect, it } from "vitest";

import { dragMargin } from "@/components/designer/Rulers";

import { codeBox, compactLabel, fontFaces, renderSource, scopeReportCss } from "@/lib/doc-render";
import { fitMargins, pageBreaks, pageOf, paperOf, setMargins, setPage } from "@/lib/paper";

describe("paper", () => {
  it("is A4 portrait with the default margins, or as report.json says", () => {
    expect(paperOf(undefined)).toMatchObject({ widthMm: 210, heightMm: 297, contentWidthMm: 180, contentHeightMm: 257 });
    const land = paperOf(JSON.stringify({ page: { orientation: "landscape", marginsMm: { top: 10, bottom: 10, left: 10, right: 10 } } }));
    expect(land).toMatchObject({ widthMm: 297, heightMm: 210, contentWidthMm: 277, contentHeightMm: 190 });
    expect(paperOf("{oops").widthMm).toBe(210);
  });

  it("breaks pages at every content height", () => {
    expect(pageBreaks(100, 257)).toEqual([]);
    expect(pageBreaks(600, 257)).toEqual([257, 514]);
    expect(pageBreaks(514, 257)).toEqual([257]);
  });
});

const mode = { sample: null, asset: (n: string) => `/assets/t1?name=${n}` };

describe("rendering source on the paper", () => {
  it("expressions are chips; with a sample they are values, escaped", () => {
    expect(renderSource("<p>{{ data.name }}</p>", mode)).toBe('<p><span class="jd-chip jd-expr" title="{{ data.name }}">name</span></p>');
    const withSample = { ...mode, sample: { data: { name: "<b>สมชาย</b>" } } };
    expect(renderSource("<p>{{ data.name }}</p>", withSample)).toBe("<p>&lt;b&gt;สมชาย&lt;/b&gt;</p>");
  });

  it("inline conditions: tag chips, or the matching branch with a sample", () => {
    const src = "<p>a{% if data.vip %} VIP{% else %} ทั่วไป{% endif %}</p>";
    expect(renderSource(src, mode)).toContain("{% if data.vip %}");
    expect(renderSource(src, { ...mode, sample: { data: { vip: true } } })).toBe("<p>a VIP</p>");
    expect(renderSource(src, { ...mode, sample: { data: { vip: false } } })).toBe("<p>a ทั่วไป</p>");
  });

  it("points relative image sources at Studio's asset route; comments disappear", () => {
    expect(renderSource('<img src="logo.png" alt="">{# x #}', mode)).toBe('<img src="/assets/t1?name=logo.png" alt="">');
    expect(renderSource('<img src="https://x/y.png">', mode)).toBe('<img src="https://x/y.png">');
  });

  it("report.css body rules apply to the document root; fonts follow report.json", () => {
    expect(scopeReportCss("body { font-size: 14pt }\nbody.x, p { a: b }")).toBe(".jd-doc { font-size: 14pt }\n.jd-doc.x, p { a: b }");
    expect(fontFaces(JSON.stringify({ fonts: { body: ["TH Sarabun New"] } }))).toContain('.jd-doc { font-family: "TH Sarabun New"; }');
  });
});

describe("codeBox", () => {
  const scope = { params: { invoiceNo: "INV-2026-0001" }, data: {}, lists: {}, totals: {} };
  it("a QR code is a square of size_mm (30 by default)", () => {
    expect(codeBox("fmt.qr(fmt.promptpay(data.promptpay, totals.grand), size_mm=28)", scope)).toContain('width="28mm" height="28mm"');
    expect(codeBox("fmt.qr(data.x)", scope)).toContain('width="30mm" height="30mm"');
  });
  it("a Code 128 barcode is as wide as its sample text needs", () => {
    // 13 characters: 0.3 mm x (11 x 13 + 55) modules
    expect(codeBox("fmt.barcode(params.invoiceNo, height_mm=8)", scope)).toContain('width="59.4mm" height="8mm"');
  });
  it("other expressions are left alone", () => {
    expect(codeBox("fmt.money(totals.grand)", scope)).toBeNull();
  });
});

describe("compactLabel", () => {
  it.each([
    ["item.id", "id"],
    ["data.customer.name", "customer.name"],
    ["fmt.money(item.unitPrice)", "money(unitPrice)"],
    ["fmt.thai_date(params.docDate)", "thai_date(docDate)"],
    ["if data.seller.phone", "if seller.phone"],
    ["loop.index", "index"],
  ])("%s → %s", (expr, label) => expect(compactLabel(expr)).toBe(label));
});

describe("setMargins", () => {
  const M = { top: 25, bottom: 18.5, left: 12, right: 12 };
  it("adds page.marginsMm when the report has no page, keeping the rest as written", () => {
    const src = '{\n  "schemaVersion": 1,\n  "name": "x"\n}\n';
    const out = setMargins(src, M)!;
    expect(out).toContain('"name": "x"');
    expect(JSON.parse(out).page.marginsMm).toEqual(M);
    expect(paperOf(out).margins).toEqual(M);
  });
  it("adds marginsMm into an existing page", () => {
    const out = setMargins('{"page": {"orientation": "landscape"}}', M)!;
    expect(JSON.parse(out).page).toEqual({ orientation: "landscape", marginsMm: M });
  });
  it("changes only the numbers of an existing marginsMm, and adds a missing side", () => {
    const src = '{\n  "page": {\n    "marginsMm": { "top": 20, "left": 15, "right": 15 }\n  },\n  "x": 1\n}\n';
    const out = setMargins(src, M)!;
    expect(out).toBe('{\n  "page": {\n    "marginsMm": { "top": 25, "left": 12, "right": 12, "bottom": 18.5 }\n  },\n  "x": 1\n}\n');
  });
  it("refuses a report.json that is not an object", () => {
    expect(setMargins("[1]", M)).toBeNull();
    expect(setMargins("{oops", M)).toBeNull();
  });
});

describe("dragMargin", () => {
  const paper = paperOf("{}"); // A4 portrait, 20/20/15/15
  it("moves a margin by whole millimetres within 5–50 mm", () => {
    expect(dragMargin(paper, paper.margins, "left", 7.4).left).toBe(22);
    expect(dragMargin(paper, paper.margins, "top", -40).top).toBe(5);
    expect(dragMargin(paper, paper.margins, "bottom", 100).bottom).toBe(50);
  });
});

describe("sizes (v1.8)", () => {
  const paper = (page: object) => paperOf(JSON.stringify({ page }));

  it.each([
    [{ size: "A5", orientation: "landscape" }, 210, 148],
    [{ size: "Letter" }, 215.9, 279.4],
    [{ size: "B5" }, 176, 250],
    [{ size: "custom", widthMm: 100, heightMm: 50, orientation: "landscape", marginsMm: { top: 5, bottom: 5, left: 5, right: 5 } }, 50, 100],
    [{ size: "roll", rollWidthMm: 58 }, 58, 1000],
  ])("%j is %d x %d mm", (page, w, h) => {
    expect(paper(page)).toMatchObject({ widthMm: w, heightMm: h });
  });

  it("a roll has narrow margins unless the report says; a free layout has none", () => {
    expect(paper({ size: "roll", rollWidthMm: 80 })).toMatchObject({ roll: true, margins: { top: 3, bottom: 3, left: 2, right: 2 }, contentWidthMm: 76 });
    expect(paper({ size: "A5", layout: "free", marginsMm: { top: 20 } })).toMatchObject({ layout: "free", margins: { top: 0, left: 0 }, contentWidthMm: 148 });
    expect(pageOf(JSON.stringify({ page: { size: "roll", layout: "free", orientation: "landscape" } }))).toMatchObject({ layout: "flow", orientation: "portrait" });
  });

  it("margins are made smaller to leave 20 mm for the content", () => {
    expect(fitMargins({ top: 20, bottom: 20, left: 15, right: 15 }, 100, 50)).toEqual({ top: 15, bottom: 15, left: 15, right: 15 });
    expect(fitMargins({ top: 20, bottom: 20, left: 15, right: 15 }, 210, 297)).toEqual({ top: 20, bottom: 20, left: 15, right: 15 });
    expect(fitMargins({ top: 3, bottom: 3, left: 2, right: 2 }, 58, null)).toEqual({ top: 3, bottom: 3, left: 2, right: 2 });
  });
});
