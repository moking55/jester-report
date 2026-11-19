// form.json (SPEC-studio.md "v1.6"): how each field of the issue form looks — input widget and width.
// JSON Schema has no place for these, so they live beside it, keyed by the field's JSON pointer.
// Read leniently: a broken or stale form.json never stops the form from opening.

export const FORM_FILE = "form.json";

export type Widget = "textarea" | "radio" | "money";
export type Width = "full" | "half" | "third";
export type FieldLayout = { widget?: Widget; width?: Width };
export type Layout = Record<string, FieldLayout>; // "/params/note", "/data/customer/address", "/data/items/qty"

const WIDGETS: readonly string[] = ["textarea", "radio", "money"];
const WIDTHS: readonly string[] = ["full", "half", "third"];
const POINTER = /^\/(params|data)(\/[^/]+)*$/;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** The layout in a form.json text (none → empty), with Thai warnings for every part that was skipped. */
export function readLayout(text: string | undefined): { fields: Layout; warnings: string[] } {
  if (text === undefined) return { fields: {}, warnings: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { fields: {}, warnings: [`${FORM_FILE} ไม่ใช่ JSON ที่ถูกต้อง จึงไม่ถูกใช้`] };
  }
  if (!isObject(raw) || raw.formVersion !== 1) {
    return { fields: {}, warnings: [`${FORM_FILE} ต้องมี "formVersion": 1 จึงไม่ถูกใช้`] };
  }
  const fields: Layout = {};
  const warnings: string[] = [];
  for (const [pointer, value] of Object.entries(isObject(raw.fields) ? raw.fields : {})) {
    if (!POINTER.test(pointer) || !isObject(value)) {
      warnings.push(`ข้าม "${pointer}" ใน ${FORM_FILE}: ไม่ใช่ช่องของฟอร์ม`);
      continue;
    }
    const entry: FieldLayout = {};
    if (typeof value.widget === "string" && WIDGETS.includes(value.widget)) entry.widget = value.widget as Widget;
    else if (value.widget !== undefined) warnings.push(`ข้าม widget ของ "${pointer}": ไม่รู้จัก`);
    if (typeof value.width === "string" && WIDTHS.includes(value.width)) entry.width = value.width as Width;
    else if (value.width !== undefined) warnings.push(`ข้าม width ของ "${pointer}": ไม่รู้จัก`);
    if (entry.widget || entry.width) fields[pointer] = entry;
  }
  return { fields, warnings };
}

/** Pointers in `fields` that are not fields any more, for the builder's warning. */
export function staleLayout(fields: Layout, known: Iterable<string>): string[] {
  const set = new Set(known);
  return Object.keys(fields).filter((p) => !set.has(p));
}

/**
 * form.json text for a layout, in the order of `known` (the form's own order). Pointers that are no field any
 * more and default values (`width: "full"`) are dropped; nothing left → null (the file should not exist).
 */
export function writeLayout(fields: Layout, known: Iterable<string>): string | null {
  const out: Record<string, FieldLayout> = {};
  for (const pointer of known) {
    const f = fields[pointer];
    if (!f) continue;
    const entry: FieldLayout = {};
    if (f.widget) entry.widget = f.widget;
    if (f.width && f.width !== "full") entry.width = f.width;
    if (entry.widget || entry.width) out[pointer] = entry;
  }
  if (Object.keys(out).length === 0) return null;
  return `${JSON.stringify({ formVersion: 1, fields: out }, null, 2)}\n`;
}
