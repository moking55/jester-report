import { describe, expect, it } from "vitest";

import { readFieldFormat, writeFieldFormat } from "@/lib/field-format";

describe("field format", () => {
  it("reads a plain path and the three fmt calls", () => {
    expect(readFieldFormat("data.customer.name")).toEqual({ format: "plain", path: "data.customer.name", places: null });
    expect(readFieldFormat(" fmt.money(totals.grand) ")).toEqual({ format: "money", path: "totals.grand", places: null });
    expect(readFieldFormat("fmt.number(item.qty, 0)")).toEqual({ format: "number", path: "item.qty", places: "0" });
    expect(readFieldFormat("fmt.thai_date(params.docDate)")).toEqual({ format: "date", path: "params.docDate", places: null });
    expect(readFieldFormat("rows[0].price")).toMatchObject({ format: "plain" });
  });

  it("leaves everything else alone", () => {
    expect(readFieldFormat("data.name | upper")).toBeNull();
    expect(readFieldFormat("data.a + data.b")).toBeNull();
    expect(readFieldFormat("fmt.baht_text(totals.grand)")).toBeNull();
    expect(readFieldFormat("fmt.money(data.a * 2)")).toBeNull();
  });

  it("writes a format, carrying the places between money and number", () => {
    expect(writeFieldFormat("totals.grand", "money")).toBe("fmt.money(totals.grand)");
    expect(writeFieldFormat("item.qty", "number", "0")).toBe("fmt.number(item.qty, 0)");
    expect(writeFieldFormat("item.qty", "money", "0")).toBe("fmt.money(item.qty, 0)");
    expect(writeFieldFormat("params.d", "date", "2")).toBe("fmt.thai_date(params.d)");
    expect(writeFieldFormat("x.y", "plain", "2")).toBe("x.y");
  });
});
