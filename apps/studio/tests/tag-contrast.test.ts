import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CHIP_MIX, COLOR_BASE, TAG_COLORS } from "@/lib/tags";

// The built-in themes live in the api; their colours are read from the source so a new or changed theme is checked too.
const BUILTIN = readFileSync("../api/src/jester_api/themes/builtin.py", "utf-8");
const THEMES = [...BUILTIN.matchAll(/"(\w+)": \{\s*"name": "[^"]+",\s*"tokens": \{([\s\S]*?)\}/g)].map(([, key, body]) => ({
  key,
  tokens: Object.fromEntries([...body.matchAll(/"color\.(\w+)": "(#[0-9a-fA-F]{6})"/g)].map((m) => [m[1], m[2]])) as Record<string, string>,
}));
const CSS = readFileSync("components/TagChip.module.css", "utf-8");

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
/** color-mix(in srgb, a p%, b): the channels are mixed as written (gamma-encoded), like the browser does. */
const mix = (a: string | Rgb, percent: number, b: string | Rgb): Rgb => {
  const [x, y] = [typeof a === "string" ? rgb(a) : a, typeof b === "string" ? rgb(b) : b];
  return x.map((c, i) => c * (percent / 100) + y[i] * (1 - percent / 100)) as Rgb;
};
const luminance = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("built-in themes are found", () => {
  it("all three, each with its surface and text colours", () => {
    expect(THEMES.map((t) => t.key)).toEqual(["mahasamut", "classic", "suriyan"]);
    for (const t of THEMES) expect(Object.keys(t.tokens)).toEqual(expect.arrayContaining(["surface", "text"]));
  });
});

describe("tag chips are readable (WCAG AA, 4.5:1)", () => {
  for (const theme of THEMES) {
    for (const color of TAG_COLORS) {
      it(`${color} on ${theme.key}`, () => {
        const { surface, text } = theme.tokens;
        const background = mix(COLOR_BASE[color], CHIP_MIX.background, surface);
        const label = mix(COLOR_BASE[color], CHIP_MIX.text, text);
        expect(contrast(label, background)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("classic's glass chip: the darkest and the lightest part of the gradient", () => {
    const classic = THEMES.find((t) => t.key === "classic")!;
    for (const color of TAG_COLORS) {
      const label = mix(COLOR_BASE[color], CHIP_MIX.text, classic.tokens.text);
      const darkest = mix(COLOR_BASE[color], CHIP_MIX.glassDark, classic.tokens.surface);
      const lightest = mix(COLOR_BASE[color], 6, "#ffffff");
      expect(contrast(label, darkest), `${color} darkest`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(label, lightest), `${color} lightest`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the stylesheet uses the numbers the test checks", () => {
  it("flat chip", () => {
    expect(CSS).toContain(`background: color-mix(in srgb, var(--tag-base) ${CHIP_MIX.background}%, var(--color-surface));`);
    expect(CSS).toContain(`color: color-mix(in srgb, var(--tag-base) ${CHIP_MIX.text}%, var(--color-text));`);
  });
  it("classic's glass chip", () => {
    expect(CSS).toContain(`color-mix(in srgb, var(--tag-base) ${CHIP_MIX.glassDark}%, var(--color-surface))`);
    expect(CSS).toContain("color-mix(in srgb, var(--tag-base) 6%, #ffffff)");
  });
});
