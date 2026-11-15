import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { diagnosticsFor, offsetOf } from "@/lib/diagnostics";

const doc = Text.of(["<p>", "  {{ x }}", "</p>"]);

describe("problem positions", () => {
  it("finds the line and column", () => {
    expect(offsetOf(doc, 2, 3)).toBe(4 + 2);
  });

  it("clamps lines and columns that no longer exist", () => {
    expect(offsetOf(doc, 99)).toBe(doc.line(3).from);
    expect(offsetOf(doc, 1, 99)).toBe(3);
    expect(offsetOf(doc, 0)).toBe(0);
  });

  it("marks the whole line without a column, only this file's problems", () => {
    const problems = [
      { severity: "error" as const, code: "EXPRESSION_INVALID", message: "bad", file: "template.html", line: 2 },
      { severity: "warning" as const, code: "W", message: "m", file: "report.css", line: 1 },
      { severity: "error" as const, code: "PARAM_REQUIRED", message: "m", pointer: "/params/x" },
    ];
    const [d, ...rest] = diagnosticsFor(doc, "template.html", problems);
    expect(rest).toEqual([]);
    expect([d.from, d.to, d.severity, d.message]).toEqual([4, 13, "error", "EXPRESSION_INVALID: bad"]);
  });
});
