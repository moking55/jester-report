import { describe, expect, it } from "vitest";

import { readThemeFile, themeCss, themeDeclarations, themeFile, themeStyle, type ThemeTokens } from "@/lib/theme";

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

describe("themeStyle", () => {
  it("gives the editor preview only checked values", () => {
    const style = themeStyle({ ...SURIYAN, "color.primary": "red;}*{x:y" });
    expect(style["--color-surface"]).toBe("#ffffff");
    expect(style).not.toHaveProperty("--color-primary");
  });
});

describe("theme files", () => {
  it("round-trips an export and keeps only name and tokens on import", () => {
    const text = themeFile("Mine", SURIYAN as ThemeTokens);
    expect(readThemeFile(text)).toEqual({ name: "Mine", tokens: SURIYAN });
    expect(readThemeFile(JSON.stringify({ id: "x", builtIn: true, name: "A", tokens: {} }))).toEqual({
      name: "A",
      tokens: {},
    });
  });

  it("explains files that are not a theme object", () => {
    expect(readThemeFile("{oops")).toEqual({ error: "ไฟล์นี้ไม่ใช่ JSON" });
    expect(readThemeFile("[1]")).toHaveProperty("error");
    expect(readThemeFile("null")).toHaveProperty("error");
  });
});
