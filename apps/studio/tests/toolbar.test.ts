import { describe, expect, it } from "vitest";

import { fitGroups } from "@/lib/toolbar";

describe("fitGroups", () => {
  it("shows every group when they fit", () => {
    expect(fitGroups([100, 100, 100], 8, 316, 30)).toBe(3);
    expect(fitGroups([], 8, 0, 30)).toBe(0);
  });

  it("folds the last groups into the more button, leaving room for it", () => {
    expect(fitGroups([100, 100, 100], 8, 300, 30)).toBe(2); // 100+8+100 = 208, +8+30 = 246 fits; three = 316 does not
    expect(fitGroups([100, 100, 100], 8, 240, 30)).toBe(1); // two groups + more = 246 > 240
    expect(fitGroups([100, 100, 100], 8, 50, 30)).toBe(0);
  });
});
