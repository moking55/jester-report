// How a "ค่าช่องข้อมูล" block shows its value (SPEC-studio.md v1.9): as it is, or through fmt.money / fmt.number /
// fmt.thai_date. The toolbar wraps or unwraps the expression; any other expression is not touched.

export type FieldFormat = "plain" | "money" | "number" | "date";

export const FORMAT_NAME: Record<FieldFormat, string> = { plain: "ปกติ", money: "เงิน", number: "ตัวเลข", date: "วันที่ไทย" };
const FN: Record<Exclude<FieldFormat, "plain">, string> = { money: "money", number: "number", date: "thai_date" };

const PATH = String.raw`[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[\d+\])*`;

/** The format an expression is in, and the path it shows; null for anything else (a filter, a calculation, other calls). */
export function readFieldFormat(expr: string): { format: FieldFormat; path: string; places: string | null } | null {
  const e = expr.trim();
  if (new RegExp(`^${PATH}$`).test(e)) return { format: "plain", path: e, places: null };
  const m = new RegExp(String.raw`^fmt\.(money|number|thai_date)\(\s*(${PATH})\s*(?:,\s*(\d+)\s*)?\)$`).exec(e);
  if (!m) return null;
  return { format: m[1] === "thai_date" ? "date" : (m[1] as "money" | "number"), path: m[2], places: m[3] ?? null };
}

/** The expression for `path` shown as `format`. Decimal places carry over between money and number. */
export function writeFieldFormat(path: string, format: FieldFormat, places: string | null = null): string {
  if (format === "plain") return path;
  const extra = places !== null && format !== "date" ? `, ${places}` : "";
  return `fmt.${FN[format]}(${path}${extra})`;
}
