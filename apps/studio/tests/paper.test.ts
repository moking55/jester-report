import { describe, expect, it } from "vitest";

import { codeBox, fontFaces, renderSource, scopeReportCss } from "@/lib/doc-render";
import { pageBreaks, paperOf } from "@/lib/paper";

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
    expect(renderSource("<p>{{ data.name }}</p>", mode)).toBe('<p><span class="jd-chip jd-expr">{{ data.name }}</span></p>');
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
