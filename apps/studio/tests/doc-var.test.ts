import { describe, expect, it } from "vitest";

import { readVar, varSummary, writeVar, type Var } from "@/lib/doc-var";

const text = (inner: string) => readVar(`set ${inner}`);

describe("doc-var: a {% set %} as a typed variable", () => {
  it("reads a plain value and its type", () => {
    expect(text('s = "ชำระแล้ว"')).toEqual({ name: "s", type: "text", rows: [], otherwise: "ชำระแล้ว" });
    expect(text('s = "INV-" ~ (data.no)')).toMatchObject({ type: "text", otherwise: "INV-{{ data.no }}" });
    expect(text("vat = data.subtotal * 0.07")).toMatchObject({ type: "number", otherwise: "data.subtotal * 0.07" });
    expect(text("n = 1")).toMatchObject({ type: "number" });
    expect(text("paid = data.total > 0 and not data.void")).toMatchObject({ type: "bool" });
    expect(text("t = true")).toMatchObject({ type: "bool" });
    expect(text("who = data.customer.name")).toMatchObject({ type: "expr" });
    expect(readVar("include 'x'")).toBeNull();
    expect(readVar("set 9x = 1")).toBeNull();
  });

  it("reads conditional values as rows with an otherwise", () => {
    const v = text('s = "ชำระแล้ว" if data.paid else ("เกินกำหนด" if data.late else "ค้างชำระ")');
    expect(v).toEqual({
      name: "s",
      type: "text",
      rows: [
        { test: "data.paid", value: "ชำระแล้ว" },
        { test: "data.late", value: "เกินกำหนด" },
      ],
      otherwise: "ค้างชำระ",
    });
    // an unparenthesised chain reads the same
    expect(text('s = "a" if x else "b" if y else "c"')?.rows).toHaveLength(2);
  });

  it("a conditional with no else is an expression", () => {
    expect(text("s = data.x if data.y")).toMatchObject({ type: "expr", rows: [], otherwise: "data.x if data.y" });
  });

  it("writes it back the way it reads", () => {
    for (const src of [
      'a = "ชำระแล้ว" if data.paid else ("เกินกำหนด" if data.late else "ค้างชำระ")',
      "vat = data.subtotal * 0.07",
      'a = "hello"',
      'a = "INV-" ~ (data.no) ~ "-A"',
      "paid = data.total > 0 if data.x else false",
      "x = data.a",
    ]) {
      const v = text(src) as Var;
      expect(writeVar(v)).toEqual({ ok: true, value: src });
    }
  });

  it("writes plain text as a string and keeps {{ }} as values", () => {
    expect(writeVar({ name: "x", type: "text", rows: [], otherwise: "ราคา {{ data.p }} บาท" })).toEqual({ ok: true, value: 'x = "ราคา " ~ (data.p) ~ " บาท"' });
    expect(writeVar({ name: "x", type: "text", rows: [{ test: "a", value: "1" }], otherwise: "2" })).toEqual({ ok: true, value: 'x = "1" if a else "2"' });
  });

  it("refuses what would break the template", () => {
    const base: Var = { name: "x", type: "number", rows: [], otherwise: "1" };
    expect(writeVar({ ...base, name: "1x" })).toMatchObject({ ok: false });
    expect(writeVar({ ...base, otherwise: "" })).toMatchObject({ ok: false });
    expect(writeVar({ ...base, otherwise: "abc + 'x'" })).toMatchObject({ ok: false });
    expect(writeVar({ ...base, otherwise: "1 %} x {%" })).toMatchObject({ ok: false });
    expect(writeVar({ ...base, rows: [{ test: "", value: "2" }] })).toMatchObject({ ok: false });
    expect(writeVar({ ...base, type: "bool", otherwise: "{{ x }}" })).toMatchObject({ ok: false });
  });

  it("summarises for the list beside the paper", () => {
    expect(varSummary(text('s = "a" if x else "b"') as Var)).toBe("ตามเงื่อนไข 1 ข้อ");
    expect(varSummary(text("n = 7") as Var)).toBe("7");
  });
});
