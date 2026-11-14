// Theme tokens -> CSS custom properties. Values are checked again here (the api already did) and anything
// that fails is dropped, never escaped: what reaches CSS can only be a colour, a number or a name from a
// fixed table, so it cannot close the declaration or the <style> element.
import type { components } from "./types.gen";

export type ThemeTokens = components["schemas"]["ThemeTokens"];
export type Theme = components["schemas"]["Theme"];

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLORS = [
  "background",
  "surface",
  "surfaceAlt",
  "border",
  "text",
  "textMuted",
  "primary",
  "onPrimary",
  "danger",
  "warning",
  "success",
] as const;
const FONTS: Record<string, string> = {
  "TH Sarabun New": '"TH Sarabun New"',
  Sarabun: '"Sarabun"',
  "Noto Sans Thai": '"Noto Sans Thai"',
  "system-ui": "system-ui",
};
const SHADOWS: Record<string, string> = {
  none: "none",
  soft: "0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)",
  strong: "0 4px 14px rgba(16,24,40,.18)",
};
const DENSITY: Record<string, string> = { compact: ".75", comfortable: "1" };

const whole = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;
const pick = (table: Record<string, string>, value: unknown) =>
  typeof value === "string" && Object.hasOwn(table, value) ? table[value] : undefined;

export function themeDeclarations(tokens: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const name of COLORS) {
    const value = tokens[`color.${name}`];
    if (typeof value === "string" && HEX.test(value)) out.push(`--color-${name}:${value}`);
  }
  const font = pick(FONTS, tokens["font.family"]);
  if (font) out.push(`--font-family:${font}`);
  if (whole(tokens["font.size"], 12, 18)) out.push(`--font-size:${tokens["font.size"]}px`);
  if (whole(tokens.radius, 0, 16)) out.push(`--radius:${tokens.radius}px`);
  const shadow = pick(SHADOWS, tokens.shadow);
  if (shadow) out.push(`--shadow:${shadow}`);
  const density = pick(DENSITY, tokens.density);
  if (density) out.push(`--density:${density}`);
  return out;
}

/** `:root{...}` for a <style> element; styles/tokens.css supplies a fallback for anything dropped. */
export function themeCss(tokens: Record<string, unknown> | null | undefined): string {
  return `:root{${themeDeclarations(tokens ?? {}).join(";")}}`;
}
