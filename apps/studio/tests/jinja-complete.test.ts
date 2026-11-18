import { describe, expect, it } from "vitest";

import { reportNames, suggest } from "@/lib/jinja-complete";

const REPORT = JSON.stringify({
  parameters: { quoteId: {}, docDate: {} },
  lists: { items: {} },
  totals: { subtotal: "", grand: "" },
});
const labels = (result: ReturnType<typeof suggest>) => result?.options.map((o) => o.label);

describe("suggest", () => {
  it("offers the fmt helpers after fmt.", () => {
    const result = suggest("<p>{{ fmt.", REPORT);
    expect(labels(result)).toEqual([
      "money",
      "number",
      "thai_date",
      "thai_date_short",
      "baht_text",
      "qr",
      "barcode",
      "promptpay",
    ]);
    expect(result?.back).toBe(0);
    expect(suggest("<p>{{ fmt.mo", REPORT)?.back).toBe(2);
  });

  it("offers the template context at the start of an expression", () => {
    expect(labels(suggest("<p>{{ ", REPORT))).toEqual(["params", "data", "lists", "totals", "meta", "fmt"]);
    expect(suggest("<p>{{ tot", REPORT)?.back).toBe(3);
  });

  it("reads params, lists and totals from report.json", () => {
    expect(labels(suggest("{{ params.", REPORT))).toEqual(["quoteId", "docDate"]);
    expect(labels(suggest("{% for item in lists.", REPORT))).toEqual(["items"]);
    expect(labels(suggest("{{ fmt.money(totals.", REPORT))).toEqual(["subtotal", "grand"]);
  });

  it("offers tag keywords right after {%", () => {
    expect(labels(suggest("{% ", REPORT))).toContain("for");
    expect(labels(suggest("{% e", REPORT))).toContain("endfor");
  });

  it("offers nothing outside a tag or after it closes", () => {
    expect(suggest("<p>fmt.", REPORT)).toBeNull();
    expect(suggest("{{ fmt.money(x) }} fmt.", REPORT)).toBeNull();
    expect(suggest("{{ item.", REPORT)).toBeNull();
  });
});

describe("reportNames", () => {
  it("is empty while report.json does not parse", () => {
    expect(reportNames("{ broken")).toEqual({ params: [], lists: [], totals: [] });
  });
});
