import { describe, expect, it } from "vitest";

import { isRunId, issuer, paramsLine } from "@/lib/documents";

describe("documents helpers", () => {
  it("accepts run ids only", () => {
    expect(isRunId("0193a1b2c3d4aaaaaaaaaa")).toBe(true);
    for (const bad of ["", "../v1/users", "0193A1B2C3D4AAAAAAAAAA", "0193a1b2c3d4aaaaaaaaaa0"]) {
      expect(isRunId(bad)).toBe(false);
    }
  });

  it("names API keys as API: <key name> and people by username", () => {
    expect(issuer({ type: "api-key", id: "k1", name: "api-key:erp" })).toBe("API: erp");
    expect(issuer({ type: "user", id: "u1", name: "alice" })).toBe("alice");
    expect(issuer({ type: "user", id: "u1" })).toBe("u1");
  });

  it("puts params on one line, decimals as their text", () => {
    expect(paramsLine({ quoteId: "Q-1", copies: 2, rate: "7.00" })).toBe("quoteId: Q-1 · copies: 2 · rate: 7.00");
    expect(paramsLine({})).toBe("");
  });
});
