import { describe, expect, it } from "vitest";

import { readCode, writeCode } from "@/lib/code-block";

describe("code block expression", () => {
  it("reads the three kinds", () => {
    expect(readCode("fmt.qr(data.url)")).toEqual({ type: "qr", text: "{{ data.url }}", amount: "", more: "" });
    expect(readCode('fmt.barcode("ABC-" ~ (data.no), height_mm=10)')).toEqual({ type: "barcode", text: "ABC-{{ data.no }}", amount: "", more: ", height_mm=10" });
    expect(readCode("fmt.qr(fmt.promptpay(params.phone, totals.grand), size_mm=28)")).toEqual({
      type: "promptpay",
      text: "{{ params.phone }}",
      amount: "{{ totals.grand }}",
      more: ", size_mm=28",
    });
    expect(readCode("data.x")).toBeNull();
    expect(readCode("fmt.money(x)")).toBeNull();
  });

  it("writes plain text as a string and keeps the rest", () => {
    expect(writeCode({ type: "qr", text: "hello", amount: "", more: "" })).toBe('fmt.qr("hello")');
    expect(writeCode({ type: "promptpay", text: "0812345678", amount: "150.5", more: ", size_mm=28" })).toBe('fmt.qr(fmt.promptpay("0812345678", 150.5), size_mm=28)');
    expect(writeCode({ type: "barcode", text: "A{{ x }}", amount: "", more: "" })).toBe('fmt.barcode("A" ~ (x))');
  });

  it("round-trips what it wrote", () => {
    for (const e of ['fmt.qr("hello")', "fmt.qr(data.url, size_mm=40)", "fmt.qr(fmt.promptpay(params.phone, totals.grand))", "fmt.qr(fmt.promptpay(params.phone, totals.grand), size_mm=28)"]) {
      const c = readCode(e)!;
      expect(writeCode(c)).toBe(e);
    }
  });

  it("changing the kind keeps the text", () => {
    const c = readCode("fmt.qr(data.url)")!;
    expect(writeCode({ ...c, type: "barcode" })).toBe("fmt.barcode(data.url)");
  });
});
