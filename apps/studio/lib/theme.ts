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

/** [custom property, value] for every token that passes its rule; anything else is left out. */
export function themeDeclarations(tokens: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const name of COLORS) {
    const value = tokens[`color.${name}`];
    if (typeof value === "string" && HEX.test(value)) out.push([`--color-${name}`, value]);
  }
  const font = pick(FONTS, tokens["font.family"]);
  if (font) out.push(["--font-family", font]);
  if (whole(tokens["font.size"], 12, 18)) out.push(["--font-size", `${tokens["font.size"]}px`]);
  if (whole(tokens.radius, 0, 16)) out.push(["--radius", `${tokens.radius}px`]);
  const shadow = pick(SHADOWS, tokens.shadow);
  if (shadow) out.push(["--shadow", shadow]);
  const density = pick(DENSITY, tokens.density);
  if (density) out.push(["--density", density]);
  return out;
}

/** `:root{...}` for a <style> element; styles/tokens.css supplies a fallback for anything dropped. */
export function themeCss(tokens: Record<string, unknown> | null | undefined): string {
  return `:root{${themeDeclarations(tokens ?? {})
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;
}

/** The same checked values as a React `style`, for the theme editor's live preview of unsaved tokens. */
export function themeStyle(tokens: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(themeDeclarations(tokens));
}

/** The export file: exactly what POST /v1/themes takes, so the same file imports again on any server. */
export const themeFile = (name: string, tokens: ThemeTokens) => JSON.stringify({ name, tokens }, null, 2);

/** Reads an import file. Only `name` and `tokens` are kept (the api refuses other fields);
 *  their values are left for the api to check, so its problems can point at the bad token. */
export function readThemeFile(text: string): { name: unknown; tokens: unknown } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "ไฟล์นี้ไม่ใช่ JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: 'ไฟล์ theme ต้องเป็น object ที่มี "name" และ "tokens"' };
  }
  const { name, tokens } = parsed as Record<string, unknown>;
  return { name, tokens };
}
