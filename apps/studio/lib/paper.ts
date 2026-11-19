// The Document Designer's paper (SPEC-studio.md "v1.7"): A4 as report.json → page says, in millimetres, and where
// the page breaks fall on a long body. Breaks are an estimate — Chromium's print layout avoids splitting rows and
// repeats table heads — so "Preview pdf" stays the truth.

export type PageSize = "A3" | "A4" | "A5" | "A6" | "B5" | "Letter" | "Legal" | "DL" | "custom" | "roll";

/** The report.json `page` as it is declared (SPEC-report-definition.md v1.8), with the defaults filled in. */
export type PageSpec = {
  size: PageSize;
  orientation: "portrait" | "landscape";
  widthMm?: number; // custom
  heightMm?: number; // custom
  rollWidthMm?: 58 | 80; // roll
  layout: "flow" | "free";
  marginsMm?: { top?: number; bottom?: number; left?: number; right?: number };
};

export type Paper = {
  widthMm: number;
  heightMm: number; // a roll: the base height the api sends (the printed sheet is as tall as its content)
  margins: { top: number; bottom: number; left: number; right: number }; // as printed: none for a free layout
  contentWidthMm: number;
  contentHeightMm: number;
  size: PageSize;
  orientation: "portrait" | "landscape";
  layout: "flow" | "free";
  roll: boolean;
};

/** Portrait width × height in mm; the same table as the api's report_definition/page.py. */
export const PAPER_MM: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  A6: [105, 148],
  B5: [176, 250],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  DL: [110, 220],
};
export const SIZE_NAMES = [...Object.keys(PAPER_MM), "custom", "roll"] as PageSize[];
export const ROLL_BASE_HEIGHT_MM = 1000;
export const CUSTOM_LIMITS = { width: [25, 1000], height: [25, 2000] } as const;
export const MIN_CONTENT_MM = 20;

const DEFAULT_MARGINS = { top: 20, bottom: 20, left: 15, right: 15 }; // report-definition's Margins defaults
const ROLL_MARGINS = { top: 3, bottom: 3, left: 2, right: 2 };

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : fallback;
};
const dim = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

/** The `page` of a report.json text; anything unreadable is A4 portrait, flow. */
export function pageOf(reportJson: string | undefined): PageSpec {
  let page: Record<string, unknown> = {};
  try {
    const r = JSON.parse(reportJson ?? "{}") as { page?: Record<string, unknown> };
    page = r.page && typeof r.page === "object" ? r.page : {};
  } catch {
    page = {};
  }
  const size = SIZE_NAMES.includes(page.size as PageSize) ? (page.size as PageSize) : "A4";
  return {
    size,
    orientation: page.orientation === "landscape" && size !== "roll" ? "landscape" : "portrait",
    widthMm: typeof page.widthMm === "number" ? page.widthMm : undefined,
    heightMm: typeof page.heightMm === "number" ? page.heightMm : undefined,
    rollWidthMm: page.rollWidthMm === 58 ? 58 : page.rollWidthMm === 80 ? 80 : undefined,
    layout: page.layout === "free" && size !== "roll" ? "free" : "flow",
    marginsMm: page.marginsMm && typeof page.marginsMm === "object" ? (page.marginsMm as PageSpec["marginsMm"]) : undefined,
  };
}

/** The paper of a report.json text. */
export function paperOf(reportJson: string | undefined): Paper {
  const page = pageOf(reportJson);
  const roll = page.size === "roll";
  const [w0, h0] = roll
    ? [page.rollWidthMm ?? 80, ROLL_BASE_HEIGHT_MM]
    : page.size === "custom"
      ? [dim(page.widthMm, 100), dim(page.heightMm, 100)]
      : PAPER_MM[page.size];
  const landscape = page.orientation === "landscape";
  const widthMm = landscape ? h0 : w0;
  const heightMm = landscape ? w0 : h0;
  const base = roll && !page.marginsMm ? ROLL_MARGINS : DEFAULT_MARGINS;
  const m = page.marginsMm ?? {};
  const margins =
    page.layout === "free"
      ? { top: 0, bottom: 0, left: 0, right: 0 } // positions count from the sheet's edge
      : { top: num(m.top, base.top), bottom: num(m.bottom, base.bottom), left: num(m.left, base.left), right: num(m.right, base.right) };
  return {
    widthMm,
    heightMm,
    margins,
    contentWidthMm: widthMm - margins.left - margins.right,
    contentHeightMm: heightMm - margins.top - margins.bottom,
    size: page.size,
    orientation: page.orientation,
    layout: page.layout,
    roll,
  };
}

/** The label of a size in the UI. */
export const sizeLabel = (size: PageSize, rollWidthMm?: number) =>
  size === "custom" ? "กำหนดเอง" : size === "roll" ? `ใบเสร็จม้วน ${rollWidthMm ?? 80} mm` : size;

/** Margins no wider than leave MIN_CONTENT_MM for the content on a sheet `widthMm` × `heightMm` (a roll: width only). */
export function fitMargins(m: Paper["margins"], widthMm: number, heightMm: number | null): Paper["margins"] {
  const room = (span: number, a: number, b: number): [number, number] => {
    const over = a + b - (span - MIN_CONTENT_MM);
    if (over <= 0) return [a, b];
    const total = a + b || 1;
    return [Math.max(0, Math.floor(a - (over * a) / total)), Math.max(0, Math.floor(b - (over * b) / total))];
  };
  const [left, right] = room(widthMm, m.left, m.right);
  const [top, bottom] = heightMm === null ? [m.top, m.bottom] : room(heightMm, m.top, m.bottom);
  return { top, bottom, left, right };
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

/**
 * report.json with `page` replaced by `page` (only that object's text changes; the rest stays as written).
 * null when report.json is not a JSON object.
 */
export function setPage(reportJson: string, page: PageSpec): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reportJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const clean: Record<string, unknown> = { size: page.size };
  if (page.size !== "roll") clean.orientation = page.orientation;
  if (page.size === "custom") Object.assign(clean, { widthMm: page.widthMm, heightMm: page.heightMm });
  if (page.size === "roll") clean.rollWidthMm = page.rollWidthMm ?? 80;
  if (page.layout === "free") clean.layout = "free";
  if (page.marginsMm) clean.marginsMm = page.marginsMm;
  const key = /"page"\s*:\s*\{/.exec(reportJson);
  const lead = (at: number) => /^[ \t]*/.exec(reportJson.slice(reportJson.lastIndexOf("\n", at - 1) + 1))![0];
  if (!key) {
    const root = reportJson.indexOf("{");
    const rest = reportJson.slice(root + 1);
    const text = JSON.stringify(clean, null, 2).replace(/\n/g, "\n  ");
    return `${reportJson.slice(0, root + 1)}\n  "page": ${text}${rest.trim().startsWith("}") ? "\n" : ","}${rest}`;
  }
  const open = key.index + key[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < reportJson.length; i++) {
    if (reportJson[i] === "{") depth++;
    else if (reportJson[i] === "}" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return null;
  const text = JSON.stringify(clean, null, 2).replace(/\n/g, `\n${lead(open)}`);
  return `${reportJson.slice(0, open)}${text}${reportJson.slice(close + 1)}`;
}

/**
 * report.json with `change` applied to `page` (the toolbar's size and orientation): custom starts from the
 * current sheet's size, and margins that would leave less than MIN_CONTENT_MM are made smaller. A roll stays a
 * roll and a sheet stays a sheet (SPEC-studio.md v1.8). null when report.json cannot be edited that way.
 */
export function changePage(reportJson: string, change: Partial<PageSpec>): string | null {
  const before = paperOf(reportJson);
  const cur = pageOf(reportJson);
  if ((change.size === "roll") !== (cur.size === "roll") && change.size !== undefined) return null;
  const next: PageSpec = { ...cur, ...change };
  if (next.size === "custom" && next.widthMm === undefined) {
    const [w, h] = before.orientation === "landscape" ? [before.heightMm, before.widthMm] : [before.widthMm, before.heightMm];
    Object.assign(next, { widthMm: w, heightMm: h });
  }
  const after = paperOf(setPage(reportJson, next) ?? undefined);
  const fitted = fitMargins(after.margins, after.widthMm, next.size === "roll" ? null : after.heightMm);
  const same = (["top", "bottom", "left", "right"] as const).every((k) => fitted[k] === after.margins[k]);
  if (!same && next.layout === "flow") next.marginsMm = fitted;
  return setPage(reportJson, next);
}
