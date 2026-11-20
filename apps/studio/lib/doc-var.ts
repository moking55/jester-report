// A {% set %} as the panel shows it (SPEC-studio.md v1.9): a name, a type and one value, or "if … then … otherwise" rows.
// Underneath it stays one Jinja tag: `{% set x = A if c1 else (B if c2 else C) %}`. What the panel cannot read back
// opens as an expression and is only rewritten when the user edits it.

import { argToText, joined, textToArg } from "./code-arg";

export type VarType = "text" | "number" | "bool" | "expr";
export type VarRow = { test: string; value: string };
/** `value`s are in the type's editing form: text is the panel's text ({{ }} for values), the others an expression. */
export type Var = { name: string; type: VarType; rows: VarRow[]; otherwise: string };

export const TYPE_NAME: Record<VarType, string> = { text: "ข้อความ", number: "ตัวเลข", bool: "จริง/เท็จ", expr: "นิพจน์" };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Index of the first top-level (outside quotes and brackets) ` word ` in `expr`, or -1. */
export function topLevel(expr: string, word: string, from = 0): number {
  let depth = 0;
  let quote = "";
  for (let i = from; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && /\s/.test(c) && expr.startsWith(word, i + 1) && /\s/.test(expr[i + 1 + word.length] ?? "")) return i;
  }
  return -1;
}

/** `(x)` as x, only when the parentheses are one pair around everything. */
export function unwrap(expr: string): string {
  const e = expr.trim();
  if (!e.startsWith("(") || !e.endsWith(")")) return e;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0 && i < e.length - 1) return e;
  }
  return e.slice(1, -1).trim();
}

/** `A if c else B` as [A, c, B], or null. */
export function ternary(expr: string): [string, string, string] | null {
  const e = expr.trim();
  const at = topLevel(e, "if");
  if (at < 0) return null;
  const rest = e.slice(at + 3);
  const el = topLevel(rest, "else");
  if (el < 0) return null;
  return [e.slice(0, at).trim(), rest.slice(0, el).trim(), rest.slice(el + 6).trim()];
}

/** The branches of a chain of ternaries: [rows, final value], or null when `expr` is not one. */
function chain(expr: string): [VarRow[], string] | null {
  const first = ternary(expr);
  if (!first) return null;
  const rows: VarRow[] = [{ test: first[1], value: first[0] }];
  let rest = first[2];
  for (;;) {
    const next = ternary(unwrap(rest));
    if (!next) break;
    rows.push({ test: next[1], value: next[0] });
    rest = next[2];
  }
  return [rows, unwrap(rest)];
}

const LOGIC = /(^|[^\w.])(not|and|or)([^\w.]|$)|==|!=|<=|>=|[<>]|^(true|false)$/i;
const NUMERIC = /^[-+*/().\w\s|,]+$/;
const ARITH = /(^|[^\w.])\d|[+*/]|\s-\s|\|\s*round/;
const isLiteral = (piece: string) => /^(["'])(?:[^\\]|\\.)*?\1$/.test(piece.trim());

function typeOf(values: string[]): VarType {
  if (values.every((v) => joined(v).some(isLiteral))) return "text";
  if (values.every((v) => v.trim() && LOGIC.test(v))) return "bool";
  if (values.every((v) => NUMERIC.test(v) && ARITH.test(v))) return "number";
  return "expr";
}

/** The panel's view of a `set …` tag's inner text, or null when it is not `set name = value`. */
export function readVar(inner: string): Var | null {
  const m = /^set\s+([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(inner.trim());
  if (!m) return null;
  const [, name, value] = m;
  const parsed = chain(value);
  const rows = parsed?.[0] ?? [];
  const otherwise = parsed ? parsed[1] : value.trim();
  const type = typeOf([...rows.map((r) => r.value), otherwise]);
  const show = (v: string) => (type === "text" ? argToText(v) : v.trim());
  return { name, type, rows: rows.map((r) => ({ test: r.test, value: show(r.value) })), otherwise: show(otherwise) };
}

const BAD = /\{%|%\}|\{\{|\}\}/;

/** One value as Jinja, or an error saying what is wrong with it. */
function valueOf(type: VarType, value: string, what: string): Result<string> {
  const v = value.trim();
  if (type === "text") return { ok: true, value: textToArg(value) };
  if (!v) return { ok: false, error: `${what}: ใส่ค่า` };
  if (BAD.test(v)) return { ok: false, error: `${what}: ใส่เฉพาะนิพจน์ ไม่ต้องมี {{ }} หรือ {% %}` };
  if (type === "number" && /(^|[^\w.])\d+\.\d/.test(v)) return { ok: false, error: `${what}: เลขทศนิยมในนิพจน์ใช้ไม่ได้ (ข้อมูลเป็น Decimal) เขียนเป็น data.x * 7 / 100 แทน 0.07` };
  if (type === "number" && !(NUMERIC.test(v) && !/["']/.test(v))) return { ok: false, error: `${what}: ตัวเลขใช้ได้เฉพาะตัวเลข ชื่อ + - * / ( ) และ | round(n)` };
  return { ok: true, value: topLevel(v, "if") >= 0 ? `(${v})` : v };
}

/** The text after `set ` for a variable: `name = value`, or an error. */
export function writeVar(v: Var): Result<string> {
  if (!/^[A-Za-z_]\w*$/.test(v.name.trim())) return { ok: false, error: "ชื่อตัวแปรต้องเป็นตัวอักษรอังกฤษ/ตัวเลข/_" };
  const parts: { test?: string; value: string }[] = [];
  for (const [i, r] of v.rows.entries()) {
    const test = r.test.trim();
    if (!test) return { ok: false, error: `เงื่อนไขข้อ ${i + 1}: ใส่เงื่อนไข` };
    if (BAD.test(test)) return { ok: false, error: `เงื่อนไขข้อ ${i + 1}: ใส่เฉพาะนิพจน์ ไม่ต้องมี {{ }} หรือ {% %}` };
    const value = valueOf(v.type, r.value, `ข้อ ${i + 1}`);
    if (!value.ok) return value;
    parts.push({ test, value: value.value });
  }
  const last = valueOf(v.type, v.otherwise, v.rows.length ? "ไม่เช่นนั้น" : "ค่า");
  if (!last.ok) return last;
  let out = last.value;
  for (let i = parts.length - 1; i >= 0; i--) {
    const nested = out === last.value && i === parts.length - 1 ? out : `(${out})`;
    out = `${parts[i].value} if ${parts[i].test} else ${nested}`;
  }
  return { ok: true, value: `${v.name.trim()} = ${out}` };
}

/** A short line for the list beside the paper. */
export function varSummary(v: Var): string {
  return v.rows.length ? `ตามเงื่อนไข ${v.rows.length} ข้อ` : v.otherwise;
}

/** The value of a type in another type's form (text is the panel's text, the others Jinja). */
export function convertValue(value: string, from: VarType, to: VarType): string {
  if (from === to || (from !== "text" && to !== "text")) return value;
  return to === "text" ? argToText(value) : textToArg(value);
}
