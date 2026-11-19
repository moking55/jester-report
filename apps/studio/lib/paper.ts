// The Document Designer's paper (SPEC-studio.md "v1.7"): A4 as report.json → page says, in millimetres, and where
// the page breaks fall on a long body. Breaks are an estimate — Chromium's print layout avoids splitting rows and
// repeats table heads — so "Preview pdf" stays the truth.

export type Paper = {
  widthMm: number;
  heightMm: number;
  margins: { top: number; bottom: number; left: number; right: number };
  contentWidthMm: number;
  contentHeightMm: number;
};

const A4 = { short: 210, long: 297 };
const DEFAULT_MARGINS = { top: 20, bottom: 20, left: 15, right: 15 }; // report-definition's Margins defaults

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : fallback;
};

/** The paper of a report.json text; anything unreadable falls back to A4 portrait with default margins. */
export function paperOf(reportJson: string | undefined): Paper {
  let page: Record<string, unknown> = {};
  try {
    const r = JSON.parse(reportJson ?? "{}") as { page?: Record<string, unknown> };
    page = r.page && typeof r.page === "object" ? r.page : {};
  } catch {
    page = {};
  }
  const landscape = page.orientation === "landscape";
  const m = (page.marginsMm && typeof page.marginsMm === "object" ? page.marginsMm : {}) as Record<string, unknown>;
  const margins = {
    top: num(m.top, DEFAULT_MARGINS.top),
    bottom: num(m.bottom, DEFAULT_MARGINS.bottom),
    left: num(m.left, DEFAULT_MARGINS.left),
    right: num(m.right, DEFAULT_MARGINS.right),
  };
  const widthMm = landscape ? A4.long : A4.short;
  const heightMm = landscape ? A4.short : A4.long;
  return {
    widthMm,
    heightMm,
    margins,
    contentWidthMm: widthMm - margins.left - margins.right,
    contentHeightMm: heightMm - margins.top - margins.bottom,
  };
}

/** Offsets (in the body's own units) where pages 2, 3, … begin for a body `bodyHeight` tall. */
export function pageBreaks(bodyHeight: number, pageHeight: number): number[] {
  if (pageHeight <= 0) return [];
  const out: number[] = [];
  for (let at = pageHeight; at < bodyHeight - 0.5; at += pageHeight) out.push(at);
  return out;
}

/** Pixels per millimetre at CSS's 96 dpi. */
export const PX_PER_MM = 96 / 25.4;

export type Margins = Paper["margins"];
export const MARGIN_LIMITS = { min: 5, max: 50 }; // the ruler's floor (SPEC v1.7 รอบแก้ข้อ 6); report-definition's ceiling

/**
 * report.json with page.marginsMm set to `m`, editing only those numbers in the text (the rest stays as written);
 * marginsMm (and page) are added when missing. null when report.json is not a JSON object.
 */
export function setMargins(reportJson: string, m: Margins): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reportJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const sides = ["top", "bottom", "left", "right"] as const;
  const value = (n: number) => String(+n.toFixed(1));
  const objectAfter = (text: string, key: RegExp) => {
    const k = key.exec(text);
    if (!k) return null;
    const open = text.indexOf("{", k.index + k[0].length);
    if (open < 0 || text.slice(k.index + k[0].length, open).trim() !== "") return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) return { open, close: i };
    }
    return null;
  };
  const lineIndent = (text: string, at: number) => /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", at - 1) + 1))![0];
  let out = reportJson;
  const box = objectAfter(out, /"marginsMm"\s*:/);
  if (box) {
    let body = out.slice(box.open + 1, box.close);
    for (const side of sides) {
      const re = new RegExp(`("${side}"\\s*:\\s*)(-?[\\d.eE+-]+)`);
      if (re.test(body)) body = body.replace(re, (_, head: string) => `${head}${value(m[side])}`);
      else body = `${body.trimEnd()}${body.trim() ? "," : ""} "${side}": ${value(m[side])}${/\n\s*$/.test(body) ? body.slice(body.trimEnd().length) : " "}`;
    }
    out = `${out.slice(0, box.open + 1)}${body}${out.slice(box.close)}`;
  } else {
    const margins = `"marginsMm": { ${sides.map((k) => `"${k}": ${value(m[k])}`).join(", ")} }`;
    const page = objectAfter(out, /"page"\s*:/);
    if (page) {
      const inner = out.slice(page.open + 1, page.close);
      const indent = `${lineIndent(out, page.open)}  `;
      out = `${out.slice(0, page.open + 1)}\n${indent}${margins}${inner.trim() ? "," : ""}${inner.trim() ? inner : `\n${lineIndent(out, page.open)}`}${out.slice(page.close)}`;
    } else {
      const root = out.indexOf("{");
      const rest = out.slice(root + 1);
      out = `${out.slice(0, root + 1)}\n  "page": { ${margins} }${rest.trim().startsWith("}") ? "\n" : ","}${rest}`;
    }
  }
  try {
    const check = JSON.parse(out) as { page?: { marginsMm?: Record<string, number> } };
    return sides.every((k) => check.page?.marginsMm?.[k] === Number(value(m[k]))) ? out : null;
  } catch {
    return null;
  }
}
