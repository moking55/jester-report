import { describe, expect, it } from "vitest";

import { calc, decText, parseDec } from "@/lib/doc-calc";
import { compute, evaluate, withSet } from "@/lib/doc-sample";

const vars: Record<string, string> = { "data.subtotal": "1000.00", "data.qty": "3", "data.price": "19.90" };
const run = (src: string) => {
  const d = calc(src, (p) => (vars[p] ? parseDec(vars[p]) : null));
  return d ? decText(d) : null;
};

// expected values are what Python's Decimal prints
describe("doc-calc: decimal arithmetic like data-prep's Decimal", () => {
  it("adds, subtracts and multiplies exactly, keeping the exponent", () => {
    expect(run("data.subtotal * 7")).toBe("7000.00");
    expect(run("data.price * data.qty")).toBe("59.70");
    expect(run("data.subtotal + data.price")).toBe("1019.90");
    expect(run("data.subtotal - 1")).toBe("999.00");
    expect(run("-data.qty + 5")).toBe("2");
    expect(run("(1 + 2) * 4")).toBe("12");
  });

  it("divides exactly when it can, else to 28 digits", () => {
    expect(run("data.subtotal * 7 / 100")).toBe("70.00");
    expect(run("100 / 8")).toBe("12.5");
    expect(run("1 / 3")).toBe("0.3333333333333333333333333333");
    expect(run("2 / 3")).toBe("0.6666666666666666666666666667");
    expect(run("1 / 0")).toBeNull();
  });

  it("rounds half to even and sets the exponent", () => {
    expect(run("(data.subtotal * 7 / 100) | round(1)")).toBe("70.0");
    expect(run("data.price | round(1)")).toBe("19.9");
    expect(run("2.5 | round")).toBeNull(); // a float literal
    expect(run("data.qty | round(2)")).toBe("3.00");
    expect(run("(1 / 3) | round(2)")).toBe("0.33");
    expect(run("(5 / 2) | round")).toBe("2"); // half to even, as Python's round
    expect(run("(7 / 2) | round")).toBe("4");
  });

  it("refuses what Jinja would not do with Decimal", () => {
    expect(run("data.subtotal * 0.07")).toBeNull(); // float literal
    expect(run("data.nothing * 2")).toBeNull();
    expect(run("data.qty | upper")).toBeNull();
    expect(run("data.qty +")).toBeNull();
  });
});

describe("variables with the sample", () => {
  const scope = { data: { subtotal: "1000.00", paid: true, late: false, name: "สมชาย" }, params: { no: "Q-1" } };

  it("computes text, numbers and conditions", () => {
    const val = (e: string) => {
      const r = compute(e, scope);
      return r.ok ? r.value : "(not ok)";
    };
    expect(val('"ชำระแล้ว"')).toBe("ชำระแล้ว");
    expect(val('"INV-" ~ (params.no) ~ "-A"')).toBe("INV-Q-1-A");
    expect(val("data.subtotal * 7 / 100")).toBe("70.00");
    expect(val('"ชำระแล้ว" if data.paid else "ค้างชำระ"')).toBe("ชำระแล้ว");
    expect(val('"ชำระแล้ว" if data.late else ("เกินกำหนด" if data.paid else "ค้างชำระ")')).toBe("เกินกำหนด");
    expect(val("data.name")).toBe("สมชาย");
    expect(val("fmt.money(data.subtotal)")).toBe("1,000.00");
    expect(val("data.mystery.deep")).toBeUndefined(); // looked up: missing is empty, as Jinja's chip shows
    expect(val('"x" if data.unknownTest > 1 else "y"')).toBe("(not ok)");
  });

  it("a set adds its name to what follows, and one that cannot be worked out stays a chip", () => {
    let s = withSet(scope, "set vat = data.subtotal * 7 / 100");
    expect(evaluate("vat", s)).toEqual({ ok: true, text: "70.00" });
    s = withSet(s, 'set label = "VAT " ~ (vat)');
    expect(evaluate("label", s)).toEqual({ ok: true, text: "VAT 70.00" });
    s = withSet(s, "set odd = data.subtotal * 0.07");
    expect(evaluate("odd", s)).toEqual({ ok: false });
    s = withSet(s, "set odd = 1");
    expect(evaluate("odd", s)).toEqual({ ok: true, text: "1" });
    expect(withSet(scope, "include 'x'")).toBe(scope);
  });
});
