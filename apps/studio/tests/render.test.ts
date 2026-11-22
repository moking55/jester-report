import { describe, expect, it } from "vitest";

import { curlExample, fetchExample, pythonExample } from "@/lib/render";

// valid JSON with a quote, a backslash, ${…}, an escaped quote, a newline escape, Thai and a long decimal
const TRICKY = '{"data":{"name":"O\'Brien \\\\ ${x} \\"q\\"","note":"บรรทัด\\nสอง","amount":12345678901234567.89}}';

/** The string literal in a JS/Python example, read back as JSON (both languages accept a JSON string here). */
function literal(code: string): string {
  const line = code.split("\n").find((l) => l.startsWith("const body = ") || l.startsWith("body = "))!;
  return JSON.parse(line.slice(line.indexOf("=") + 1).trim().replace(/;$/, ""));
}

describe("curl example", () => {
  it("reads the key from the environment and survives single quotes in the data", () => {
    const curl = curlExample(`{"data":{"name":"O'Brien"}}`);
    expect(curl).toContain('Authorization: Bearer $JESTER_API_KEY');
    expect(curl).toContain(`O'\\''Brien`);
    expect(curl).not.toMatch(/jrk_[A-Za-z0-9]/);
  });
  it("shows the status line and headers, with flags old curl knows", () => {
    const curl = curlExample("{}");
    expect(curl).toContain("-D -");
    expect(curl).not.toContain("--fail-with-body"); // curl 7.76+ only
  });
});

describe("fetch and Python examples", () => {
  it("send the body text exactly, digits and all", () => {
    expect(literal(fetchExample(TRICKY))).toBe(TRICKY);
    expect(literal(pythonExample(TRICKY))).toBe(TRICKY);
  });
  it("read the key from the environment and the run id header", () => {
    for (const code of [fetchExample("{}"), pythonExample("{}")]) {
      expect(code).toContain("JESTER_API_KEY");
      expect(code).toContain("Jester-Run-Id");
      expect(code).not.toMatch(/jrk_[A-Za-z0-9]/);
    }
  });
});

it("the tricky body is valid JSON (the test would prove nothing otherwise)", () => {
  expect(JSON.parse(TRICKY).data.note).toBe("บรรทัด\nสอง");
});
