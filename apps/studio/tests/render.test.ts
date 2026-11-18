import { describe, expect, it } from "vitest";

import { curlExample } from "@/lib/render";

describe("curl example", () => {
  it("uses a placeholder key and survives single quotes in the data", () => {
    const curl = curlExample(`{"data":{"name":"O'Brien"}}`);
    expect(curl).toContain("Bearer jrk_…");
    expect(curl).toContain(`O'\\''Brien`);
    expect(curl).not.toMatch(/jrk_[A-Za-z0-9]/);
  });
});
