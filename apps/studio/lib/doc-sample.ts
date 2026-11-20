// "แสดงข้อมูลตัวอย่าง" in the Document Designer (SPEC-studio.md "v1.7"): a small evaluator for the expressions and
// conditions that show sample values without running Jinja in the browser — paths, loop.index, fmt.money,
// fmt.number, fmt.thai_date; simple tests with ==, !=, not, and, or. Anything else stays an expression chip.
// Values come from prepareDraft's view model, where every decimal is a string; numbers stay exact (BigInt).

import { joined } from "./code-arg";
import { calc, decText, parseDec, type Dec } from "./doc-calc";
import { ternary, unwrap } from "./doc-var";

export type Scope = Record<string, unknown>;
export type Shown = { ok: true; text: string } | { ok: false };

const MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const PATH = /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*|\[\d+\])*$/;
const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The value at a path (`data.customer.name`, `item.qty`, `rows[0]`); undefined when missing. */
export function lookup(scope: Scope, path: string): unknown {
  if (!PATH.test(path)) return undefined;
  let cur: unknown = scope;
  for (const part of path.match(/[A-Za-z_]\w*|\[\d+\]/g) ?? []) {
    if (cur === null || typeof cur !== "object") return undefined;
    const key = part.startsWith("[") ? Number(part.slice(1, -1)) : part;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** fmt.number: thousands separators, `places` decimals, half up (as data-prep does with Decimal). */
export function formatNumber(value: unknown, places = 0): string | null {
  const text = typeof value === "number" && Number.isInteger(value) ? String(value) : typeof value === "string" ? value.trim() : null;
  const m = text === null ? null : DECIMAL.exec(text);
  if (!m) return null;
  const [, sign, whole, frac = ""] = m;
  // scaled integer with one extra digit for rounding
  const digits = BigInt(whole + frac.padEnd(places + 1, "0").slice(0, places + 1));
  let scaled = digits / 10n;
  if (digits % 10n >= 5n) scaled += 1n;
  const s = scaled.toString().padStart(places + 1, "0");
  const intPart = s.slice(0, s.length - places) || "0";
  const fracPart = places ? s.slice(s.length - places) : "";
  const zero = scaled === 0n;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign && !zero ? "-" : ""}${grouped}${places ? `.${fracPart}` : ""}`;
}

export const formatMoney = (value: unknown, places = 2) => formatNumber(value, places);

/** fmt.thai_date: "12 พฤศจิกายน 2569". */
export function formatThaiDate(value: unknown): string | null {
  const m = typeof value === "string" ? DATE.exec(value) : null;
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${Number(m[3])} ${MONTHS[month - 1]} ${Number(m[1]) + 543}`;
}

const show = (v: unknown): Shown => {
  if (v === null || v === undefined) return { ok: true, text: "" };
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return { ok: true, text: String(v) };
  return { ok: false }; // objects and lists are not shown as text
};

/** The text an expression gives with the sample, or not ok when this evaluator cannot tell. */
export function evaluate(expr: string, scope: Scope): Shown {
  const e = expr.trim();
  if (PATH.test(e)) return unknown(scope, e) ? { ok: false } : show(lookup(scope, e));
  const call = /^fmt\.(money|number|thai_date)\(\s*([^,()]+?)\s*(?:,\s*(\d+)\s*)?\)$/.exec(e);
  if (!call) return { ok: false };
  const [, fn, arg, placesText] = call;
  const value = lookup(scope, arg);
  if (value === null || value === undefined) return { ok: true, text: "" };
  const places = placesText === undefined ? undefined : Number(placesText);
  const text =
    fn === "thai_date" ? formatThaiDate(value) : fn === "money" ? formatMoney(value, places ?? 2) : formatNumber(value, places ?? 0);
  return text === null ? { ok: false } : { ok: true, text };
}

const truthy = (v: unknown) =>
  !(v === undefined || v === null || v === false || v === "" || v === 0 || (Array.isArray(v) && v.length === 0));

function literal(text: string): { ok: true; value: unknown } | { ok: false } {
  const t = text.trim();
  if (/^'[^']*'$|^"[^"]*"$/.test(t)) return { ok: true, value: t.slice(1, -1) };
  if (/^-?\d+(\.\d+)?$/.test(t)) return { ok: true, value: t };
  if (t === "true" || t === "True") return { ok: true, value: true };
  if (t === "false" || t === "False") return { ok: true, value: false };
  if (t === "none" || t === "None") return { ok: true, value: null };
  return { ok: false };
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a) === String(b);

/** Whether a condition holds with the sample: true/false, or undefined when this evaluator cannot tell. */
export function test(cond: string, scope: Scope): boolean | undefined {
  const c = cond.trim();
  const or = c.split(/\s+or\s+/);
  if (or.length > 1) {
    const parts = or.map((p) => test(p, scope));
    return parts.some((p) => p === undefined) ? undefined : parts.some(Boolean);
  }
  const and = c.split(/\s+and\s+/);
  if (and.length > 1) {
    const parts = and.map((p) => test(p, scope));
    return parts.some((p) => p === undefined) ? undefined : parts.every(Boolean);
  }
  if (/^not\s+/.test(c)) {
    const inner = test(c.replace(/^not\s+/, ""), scope);
    return inner === undefined ? undefined : !inner;
  }
  const cmp = /^(.+?)\s*(==|!=)\s*(.+)$/.exec(c);
  if (cmp) {
    const left = PATH.test(cmp[1].trim()) ? lookup(scope, cmp[1].trim()) : undefined;
    const right = literal(cmp[3]);
    if (!PATH.test(cmp[1].trim()) || !right.ok) return undefined;
    return cmp[2] === "==" ? same(left, right.value) : !same(left, right.value);
  }
  return PATH.test(c) && !unknown(scope, c) ? truthy(lookup(scope, c)) : undefined;
}

// ---- variables ({% set %}): computed with the sample, in document order ----

const UNKNOWN = "$unknown"; // names of variables this evaluator could not work out

const unknown = (scope: Scope, path: string) => ((scope[UNKNOWN] as string[] | undefined) ?? []).includes(path.split(/[.[]/)[0]);

/** A value as text the way Jinja prints it, or null when it is not a plain value. */
const printed = (v: unknown): string | null =>
  v === null || v === undefined ? "" : typeof v === "string" || typeof v === "number" ? String(v) : null;

/** What an expression is with the sample (a string, a decimal string, a boolean, a looked-up value), or not ok. */
export function compute(expr: string, scope: Scope): { ok: true; value: unknown } | { ok: false } {
  const e = expr.trim();
  if (!e) return { ok: false };
  const branch = ternary(e);
  if (branch) {
    const t = test(branch[1], scope);
    return t === undefined ? { ok: false } : compute(t ? branch[0] : unwrap(branch[2]), scope);
  }
  const parts = joined(e);
  if (parts.length > 1) {
    let text = "";
    for (const p of parts) {
      const r = compute(unwrap(p), scope);
      const t = r.ok ? printed(r.value) : null;
      if (t === null) return { ok: false };
      text += t;
    }
    return { ok: true, value: text };
  }
  const lit = literal(e);
  if (lit.ok && !/^-?\d/.test(e)) return lit; // a string, true/false/none (a number is arithmetic below)
  if (e.startsWith("(") && unwrap(e) !== e) return compute(unwrap(e), scope);
  if (PATH.test(e)) return unknown(scope, e) ? { ok: false } : { ok: true, value: lookup(scope, e) };
  if (/^fmt\./.test(e)) {
    const shown = evaluate(e, scope);
    return shown.ok ? { ok: true, value: shown.text } : { ok: false };
  }
  const value = (path: string): Dec | null => {
    if (unknown(scope, path)) return null;
    const v = lookup(scope, path);
    return typeof v === "string" ? parseDec(v) : typeof v === "number" && Number.isInteger(v) ? parseDec(String(v)) : null;
  };
  const d = calc(e, value);
  return d ? { ok: true, value: decText(d) } : { ok: false };
}

/** The scope after a `{% set name = value %}` (`inner` is the tag's text), or the same scope when it is not one. */
export function withSet(scope: Scope, inner: string): Scope {
  const m = /^set\s+([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(inner.trim());
  if (!m) return scope;
  const r = compute(m[2], scope);
  const names = ((scope[UNKNOWN] as string[] | undefined) ?? []).filter((n) => n !== m[1]);
  const next: Scope = { ...scope, [UNKNOWN]: r.ok ? names : [...names, m[1]] };
  if (r.ok) next[m[1]] = r.value;
  else delete next[m[1]];
  return next;
}
