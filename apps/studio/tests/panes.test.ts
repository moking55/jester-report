import { describe, expect, it } from "vitest";

import { clampSizes, DEFAULT_SIZES, readSizes } from "@/lib/panes";

describe("clampSizes", () => {
  const area = { width: 1400, height: 800 };

  it("keeps sizes inside the minimums and leaves room for the editor", () => {
    expect(clampSizes({ files: 20, preview: 50, bottom: 10 }, area)).toEqual({ files: 140, preview: 260, bottom: 100 });
    const big = clampSizes({ files: 2000, preview: 2000, bottom: 2000 }, area);
    expect(big.files).toBeLessThanOrEqual(area.width / 3);
    expect(area.width - big.files - big.preview).toBeGreaterThanOrEqual(280);
    expect(area.height - big.bottom).toBeGreaterThanOrEqual(140);
  });

  it("leaves sizes that fit alone", () => {
    expect(clampSizes(DEFAULT_SIZES, area)).toEqual(DEFAULT_SIZES);
  });
});

describe("readSizes", () => {
  it("falls back to the defaults for missing or broken storage", () => {
    expect(readSizes(null)).toEqual(DEFAULT_SIZES);
    expect(readSizes("{oops")).toEqual(DEFAULT_SIZES);
    expect(readSizes('{"files":300,"preview":"x"}')).toEqual({ ...DEFAULT_SIZES, files: 300 });
  });
});
