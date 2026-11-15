import { describe, expect, it } from "vitest";

import { defaultParams, parseParams } from "@/lib/params";

describe("default params", () => {
  it("fills every required parameter with a value of its type", () => {
    const report = JSON.stringify({
      parameters: {
        quoteId: { type: "string", required: true },
        docDate: { type: "date", required: true },
        locale: { type: "enum", values: ["th-TH"], default: "th-TH" },
        kind: { type: "enum", values: ["a", "b"], required: true },
        rate: { type: "decimal", required: true },
      },
    });
    expect(JSON.parse(defaultParams(report, "2026-11-15"))).toEqual({
      quoteId: "SAMPLE",
      docDate: "2026-11-15",
      kind: "a",
      rate: "1",
    });
  });

  it("starts empty when report.json is broken or missing", () => {
    expect(defaultParams("{ nope", "2026-11-15")).toBe("{}");
    expect(defaultParams(undefined, "2026-11-15")).toBe("{}");
  });

  it("accepts only a JSON object", () => {
    expect(parseParams(' {"a": 1} ')).toEqual({ params: { a: 1 } });
    expect(parseParams("")).toEqual({ params: {} });
    expect(parseParams("[1]")).toHaveProperty("error");
    expect(parseParams("{bad")).toHaveProperty("error");
  });
});
