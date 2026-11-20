import { describe, expect, it } from "vitest";

import { argToText, splitArgs, textToArg } from "@/lib/code-arg";

describe("code-arg: the text of a QR code or barcode", () => {
  it("plain text is a string literal, {{ x }} an expression, a mix is joined with ~", () => {
    expect(textToArg("hello")).toBe('"hello"');
    expect(textToArg("สวัสดี")).toBe('"สวัสดี"');
    expect(textToArg("{{ data.url }}")).toBe("data.url");
    expect(textToArg("INV-{{ data.no }}-A")).toBe('"INV-" ~ (data.no) ~ "-A"');
    expect(textToArg("")).toBe('""');
    expect(textToArg('say "hi"')).toBe(JSON.stringify('say "hi"'));
  });

  it("a number stays a number only where an amount is meant", () => {
    expect(textToArg("150.5", true)).toBe("150.5");
    expect(textToArg("0812345678")).toBe('"0812345678"');
    expect(textToArg("{{ totals.grand }}", true)).toBe("totals.grand");
  });

  it("reads an argument back to the text it came from", () => {
    for (const text of ["hello", "{{ data.url }}", "INV-{{ data.no }}-A", "", "a {{ x | upper }} b"]) expect(argToText(textToArg(text))).toBe(text);
    expect(argToText("150.5", true)).toBe("150.5");
    expect(argToText("data.customer.name")).toBe("{{ data.customer.name }}");
    expect(argToText("'single'")).toBe("single");
    expect(argToText('"a" ~ (b + 1)')).toBe("a{{ b + 1 }}");
    expect(argToText("fmt.money(x) ~ \"฿\"")).toBe("{{ fmt.money(x) }}฿");
  });

  it("splits arguments at top-level commas only", () => {
    expect(splitArgs('"a, b", size_mm=40')).toEqual(['"a, b"', " size_mm=40"]);
    expect(splitArgs("fmt.promptpay(a, b), 3")).toEqual(["fmt.promptpay(a, b)", " 3"]);
    expect(splitArgs("x")).toEqual(["x"]);
  });
});
