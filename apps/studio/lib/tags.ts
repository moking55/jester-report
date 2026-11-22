// Tags (SPEC-studio.md v1.11). `normalizeTags` applies the same rules as the api's jester_api.tags.normalize_tags
// (apps/api/tests/tags/cases.json is checked on both sides), so a tag the form accepts is one the api accepts.
import type { CSSProperties } from "react";

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** The nine colours the api accepts (`gray` is the default and means "no colour set"). */
export const TAG_COLORS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** Thai names for the colour picker. */
export const COLOR_NAMES: Record<TagColor, string> = {
  gray: "เทา",
  red: "แดง",
  orange: "ส้ม",
  yellow: "เหลือง",
  green: "เขียว",
  teal: "เขียวน้ำเงิน",
  blue: "น้ำเงิน",
  purple: "ม่วง",
  pink: "ชมพู",
};

/** The base of each colour; the chip mixes it with the theme's own surface and text (TagChip.module.css),
 *  so it reads on any theme. tests/tag-contrast.test.ts checks every colour on every built-in theme. */
export const COLOR_BASE: Record<TagColor, string> = {
  gray: "#64748b",
  red: "#c0392b",
  orange: "#c2570c",
  yellow: "#a16207",
  green: "#15803d",
  teal: "#0f766e",
  blue: "#1d4ed8",
  purple: "#7e22ce",
  pink: "#be185d",
};

/** The mix the chip stylesheet uses; kept here so the contrast test and the CSS cannot drift apart. */
export const CHIP_MIX = { background: 14, text: 55, glassDark: 26 } as const;

export const isTagColor = (value: unknown): value is TagColor =>
  typeof value === "string" && (TAG_COLORS as readonly string[]).includes(value);

/** A colour the api sent, or gray for anything unexpected (an older server, a typo). */
export const colorOf = (value: unknown): TagColor => (isTagColor(value) ? value : "gray");

/** Inline style for a chip: one custom property, read by TagChip.module.css. */
export const chipStyle = (color: unknown): CSSProperties =>
  ({ "--tag-base": COLOR_BASE[colorOf(color)] }) as CSSProperties;

/** Only these tags' colours: what one row's dialog needs (not the whole page's map, once per row). */
export const colorsOf = (tags: readonly string[], colors: Record<string, string>): Record<string, string> =>
  Object.fromEntries(tags.filter((t) => t in colors).map((t) => [t, colors[t]]));

/** Name -> colour for the chips of a page, from GET /v1/tags. */
export function colorMap(uses: { tag: string; color: string }[]): Record<string, TagColor> {
  return Object.fromEntries(uses.map((u) => [u.tag, colorOf(u.color)]));
}

// Python's str \s also matches these two; JavaScript's does not
const SPACES = /[\s\x1c-\x1f\x85]+/gu;
const CONTROL = /\p{Cc}/u;

export type Normalized = { ok: true; tags: string[] } | { ok: false; error: string; tag?: string };

/** One tag as typed: trimmed, spaces collapsed, NFC. */
export function normalizeTag(raw: string): { ok: true; tag: string } | { ok: false; error: string } {
  const tag = raw.normalize("NFC").replace(SPACES, " ").trim();
  const length = [...tag].length;
  if (length < 1 || length > MAX_TAG_LENGTH) return { ok: false, error: `tag ต้องยาว 1–${MAX_TAG_LENGTH} ตัวอักษร` };
  if (tag.includes(",")) return { ok: false, error: "tag ใส่เครื่องหมายจุลภาค (,) ไม่ได้" };
  if (CONTROL.test(tag)) return { ok: false, error: "tag ใส่อักขระควบคุมไม่ได้" };
  return { ok: true, tag };
}

/** The whole set: duplicates merge (the first stays), at most MAX_TAGS. `tag` names the one that broke a rule. */
export function normalizeTags(raw: string[]): Normalized {
  const tags: string[] = [];
  for (const item of raw) {
    const one = normalizeTag(item);
    if (!one.ok) return { ok: false, error: one.error, tag: item };
    if (!tags.includes(one.tag)) tags.push(one.tag);
  }
  if (tags.length > MAX_TAGS) return { ok: false, error: `ใส่ tag ได้ไม่เกิน ${MAX_TAGS} อัน` };
  return { ok: true, tags };
}

/** Adds what was typed to the set; the message says why not. A tag already there is not an error. */
export function addTag(current: string[], typed: string): { ok: true; tags: string[] } | { ok: false; error: string } {
  const one = normalizeTag(typed);
  if (!one.ok) return one;
  if (current.includes(one.tag)) return { ok: true, tags: current };
  if (current.length >= MAX_TAGS) return { ok: false, error: `ใส่ tag ได้ไม่เกิน ${MAX_TAGS} อัน` };
  return { ok: true, tags: [...current, one.tag] };
}

/** The same tags in the same order? */
export const sameTags = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((t, i) => t === b[i]);

/** Does the item carry every tag in `wanted` (exact match, like the api)? */
export const hasAllTags = (tags: readonly string[], wanted: readonly string[]): boolean =>
  wanted.every((t) => tags.includes(t));

/** `?tag=` values from a Next search-params entry (one string, a list, or nothing). */
export function tagsFromQuery(value: string | string[] | undefined): string[] {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return [...new Set(list.map((t) => t.trim()).filter(Boolean))];
}

/** The set plus whatever is still typed in the box (a user who types a tag and presses Save did mean it). */
export function withPending(
  current: string[],
  typed: string,
): { ok: true; tags: string[] } | { ok: false; error: string } {
  return typed.trim() ? addTag(current, typed) : { ok: true, tags: current };
}
