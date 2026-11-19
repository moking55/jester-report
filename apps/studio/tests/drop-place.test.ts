import { describe, expect, it } from "vitest";

import { placeAt, type Layout } from "@/components/BuilderCanvas";

const box = (top: number, bottom: number, left = 0, right = 600) => ({ top, bottom, left, right });

/** c:data holds three full-width cards; the middle one is a group with two half-width cards side by side. */
const layout: Layout = {
  containers: [
    { id: "c:data", box: box(0, 200) },
    { id: "c:data/group", box: box(70, 110, 10, 590) },
  ],
  children: new Map([
    ["c:data", [box(0, 40), box(50, 120), box(130, 170)]],
    ["c:data/group", [box(75, 105, 10, 295), box(75, 105, 305, 590)]],
  ]),
};

describe("where a drop lands", () => {
  it("goes before or after a full-width card by its top and bottom halves", () => {
    expect(placeAt(layout, 300, 5)).toEqual({ container: "c:data", index: 0 });
    expect(placeAt(layout, 300, 30)).toEqual({ container: "c:data", index: 1 });
    expect(placeAt(layout, 300, 140)).toEqual({ container: "c:data", index: 2 });
    expect(placeAt(layout, 300, 195)).toEqual({ container: "c:data", index: 3 });
  });

  it("takes the innermost list under the pointer, and left/right halves for cards side by side", () => {
    expect(placeAt(layout, 50, 90)).toEqual({ container: "c:data/group", index: 0 });
    expect(placeAt(layout, 250, 90)).toEqual({ container: "c:data/group", index: 1 });
    expect(placeAt(layout, 550, 90)).toEqual({ container: "c:data/group", index: 2 });
  });

  it("is nowhere outside every list", () => {
    expect(placeAt(layout, 900, 90)).toBeNull();
  });
});
