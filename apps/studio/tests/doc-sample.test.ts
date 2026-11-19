import { describe, expect, it } from "vitest";

import { evaluate, formatMoney, formatNumber, formatThaiDate, lookup, test } from "@/lib/doc-sample";

// the same values as apps/api/tests/data_prep/test_formatters.py
describe("formatters match data-prep", () => {
  it.each([
    [3210, 2, "3,210.00"],
    ["1.005", 2, "1.01"],
    ["-100.7", 2, "-100.70"],
    ["-0.001", 2, "0.00"],
    ["1250.5", 2, "1,250.50"],
    ["1234567.891", 2, "1,234,567.89"],
    ["1" + "0".repeat(29) + ".005", 2, "100,000,000,000,000,000,000,000,000,000.01"],
  ])("money(%s, %s) = %s", (value, places, text) => {
    expect(formatMoney(value, places)).toBe(text);
  });

  it("number and thai_date", () => {
    expect(formatNumber("1234.5", 1)).toBe("1,234.5");
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatThaiDate("2026-11-12")).toBe("12 พฤศจิกายน 2569");
    expect(formatThaiDate("2026-01-05")).toBe("5 มกราคม 2569");
    expect(formatThaiDate("12/11/2026")).toBeNull();
    expect(formatMoney(1.5)).toBeNull(); // floats are refused, like data-prep
  });
});

const scope = {
  params: { quoteId: "Q-1", docDate: "2026-11-19" },
  data: { customer: { name: "บริษัท สมชาย จำกัด" }, note: "", vip: true, tier: "gold" },
  totals: { grand: "1605.00" },
  item: { qty: 2, unitPrice: "750.5" },
  loop: { index: 3 },
};

describe("expressions", () => {
  it("shows paths and the three formatters; anything else is not ok", () => {
    expect(evaluate("data.customer.name", scope)).toEqual({ ok: true, text: "บริษัท สมชาย จำกัด" });
    expect(evaluate("loop.index", scope)).toEqual({ ok: true, text: "3" });
    expect(evaluate("fmt.money(totals.grand)", scope)).toEqual({ ok: true, text: "1,605.00" });
    expect(evaluate("fmt.money(item.unitPrice, 1)", scope)).toEqual({ ok: true, text: "750.5" });
    expect(evaluate("fmt.thai_date(params.docDate)", scope)).toEqual({ ok: true, text: "19 พฤศจิกายน 2569" });
    expect(evaluate("data.missing.deep", scope)).toEqual({ ok: true, text: "" });
    for (const e of ["fmt.baht_text(totals.grand)", "item.qty * 2", "data.customer", 'x | upper']) {
      expect(evaluate(e, scope)).toEqual({ ok: false });
    }
    expect(lookup(scope, "item.qty")).toBe(2);
  });
});

describe("conditions", () => {
  it("evaluates paths, ==, !=, not, and, or; unknown forms are undefined", () => {
    expect(test("data.vip", scope)).toBe(true);
    expect(test("data.note", scope)).toBe(false);
    expect(test("not data.note", scope)).toBe(true);
    expect(test("data.tier == 'gold'", scope)).toBe(true);
    expect(test('data.tier != "gold"', scope)).toBe(false);
    expect(test("data.vip and data.note", scope)).toBe(false);
    expect(test("data.note or data.vip", scope)).toBe(true);
    expect(test("item.qty == 2", scope)).toBe(true);
    expect(test("item.qty > 1", scope)).toBeUndefined();
    expect(test("data.tags | length", scope)).toBeUndefined();
  });
});
