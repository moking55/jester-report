import { describe, expect, it } from "vitest";

import { themeCss, themeDeclarations } from "@/lib/theme";

const SURIYAN = {
  "color.background": "#f5f6f8",
  "color.surface": "#ffffff",
  "color.surfaceAlt": "#f1f3f6",
  "color.border": "#e3e7ed",
  "color.text": "#18212d",
  "color.textMuted": "#5d6878",
  "color.primary": "#d9730d",
  "color.onPrimary": "#ffffff",
  "color.danger": "#d0342c",
  "color.warning": "#b7791f",
  "color.success": "#1f8a4c",
  "font.family": "Noto Sans Thai",
  "font.size": 14,
  radius: 8,
  shadow: "soft",
  density: "comfortable",
};

describe("themeCss", () => {
  it("turns every token into one custom property", () => {
    const css = themeCss(SURIYAN);
    expect(themeDeclarations(SURIYAN)).toHaveLength(16);
    expect(css).toContain("--color-primary:#d9730d");
    expect(css).toContain('--font-family:"Noto Sans Thai"');
    expect(css).toContain("--font-size:14px");
    expect(css).toContain("--density:1");
  });

  it("drops values that could escape the declaration or the <style> element", () => {
    const css = themeCss({
      ...SURIYAN,
      "color.primary": "red;}body{display:none",
      "color.text": "</style><script>alert(1)</script>",
      "font.family": 'Sarabun";}*{color:red',
      "font.size": "14px;}",
      radius: 4.5,
      shadow: "0 0 0 red",
      density: "toString", // inherited Object property names are not table entries
      "color.evil": "#000000",
    });
    expect(css).not.toMatch(/red|<|script|display|evil|toString|undefined/);
    expect(css.match(/[{}]/g)).toEqual(["{", "}"]);
    expect(themeDeclarations({})).toEqual([]);
    expect(themeCss(null)).toBe(":root{}");
  });
});
