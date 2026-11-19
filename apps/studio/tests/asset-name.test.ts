import { describe, expect, it } from "vitest";

import { ASSET_NAME, isImageName, safeAssetName } from "@/lib/asset-name";

describe("safeAssetName", () => {
  it.each([
    ["logo.png", "logo.png"],
    ["logo บริษัท 2.PNG", "logo-2.png"],
    ["โลโก้.png", "image.png"],
    ["my photo (final).JPEG", "my-photo-final.jpeg"],
    ["  .hidden.gif", "hidden.gif"],
    ["Café menu.webp", "Cafe-menu.webp"],
    ["ฟอนต์ ไทย.TTF", "font.ttf"],
    ["a b.gif", "a-b.gif"],
  ])("%s → %s", (name, safe) => {
    const out = safeAssetName(name, []);
    expect(out).toBe(safe);
    expect(ASSET_NAME.test(out!)).toBe(true);
  });

  it("never takes a name already there", () => {
    expect(safeAssetName("logo.png", ["logo.png"])).toBe("logo-2.png");
    expect(safeAssetName("Logo.PNG", ["logo.png", "Logo-2.png"])).toBe("Logo-3.png");
  });

  it("keeps a long name within the api's 100 characters", () => {
    const out = safeAssetName(`${"ก".repeat(5)}${"a".repeat(150)}.png`, [`${"a".repeat(100)}.png`])!;
    expect(ASSET_NAME.test(out)).toBe(true);
    expect(out.endsWith("-2.png")).toBe(true);
  });

  it("refuses types the api does not take", () => {
    expect(safeAssetName("doc.pdf", [])).toBeNull();
    expect(safeAssetName("noext", [])).toBeNull();
    expect(isImageName("x.GIF")).toBe(true);
  });
});
