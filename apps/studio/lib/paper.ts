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
