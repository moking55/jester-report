"use client";

import { useEffect, useRef, useState } from "react";

import { MARGIN_LIMITS, PX_PER_MM, type Margins, type Paper } from "@/lib/paper";

import styles from "./Designer.module.css";

// Rulers like Word's around the paper (SPEC-studio.md v1.7 รอบแก้ข้อ 6): millimetres along the top and the left,
// the margins shaded, and a marker for each margin to drag. Letting go writes page.marginsMm (one undo step).
// No paragraph indents.

type Side = keyof Margins;
const MIN_CONTENT_MM = 30; // what is left for the content between two margins

type Props = {
  paper: Paper;
  zoom: number;
  readOnly: boolean;
  onMargins: (m: Margins) => void;
  children: React.ReactNode;
};

/** Margins after dragging `side` by `deltaMm` (towards the page's middle is positive), kept within the limits. */
export function dragMargin(paper: Paper, from: Margins, side: Side, deltaMm: number): Margins {
  const span = side === "left" || side === "right" ? paper.widthMm : paper.heightMm;
  const other = from[({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[side]];
  const max = Math.min(MARGIN_LIMITS.max, span - other - MIN_CONTENT_MM);
  const value = Math.round(Math.min(max, Math.max(MARGIN_LIMITS.min, from[side] + deltaMm)));
  return { ...from, [side]: value };
}

/** One page on the vertical ruler: where it sits on the sheet (mm), and the printed page's mm at its top. */
export type RulerPage = { from: number; to: number; origin: number };

/**
 * The paper is one sheet with the pages' content one after another (PaperCanvas draws a "หน้า n" line after every
 * content height); the vertical ruler follows those lines: page 1 starts at the sheet's top, page n at line n-1, where
 * its content starts (the printed page's top margin, which the sheet has no room for). `height`: the sheet's mm.
 */
export function rulerPages(paper: Paper, m: Margins, height: number): RulerPage[] {
  if (paper.roll || paper.layout === "free") return [{ from: 0, to: height, origin: 0 }];
  const content = paper.heightMm - m.top - m.bottom;
  const count = Math.max(1, Math.round((height - m.top - m.bottom) / content)); // the sheet: margins + every page's content
  return Array.from({ length: count }, (_, i) => ({
    from: i === 0 ? 0 : m.top + i * content,
    to: i === count - 1 ? height : m.top + (i + 1) * content,
    origin: i === 0 ? 0 : m.top,
  }));
}

export function Rulers({ paper, zoom, readOnly, onMargins, children }: Props) {
  // the marker being dragged: where the pointer started, the page it is on, and the margins it would give now
  const [live, setLive] = useState<{ side: Side; page: number; x: number; y: number; margins: Margins } | null>(null);
  const m = live?.margins ?? paper.margins;
  const W = paper.widthMm;
  // the sheet is as tall as its content (a roll, or the pages a flow document runs over): the vertical ruler follows it
  const sheet = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMeasured(Math.round(el.offsetHeight / PX_PER_MM)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = paper.roll ? Math.max(measured, 20) : Math.max(measured, paper.heightMm);
  // the pages as the paper is drawn now (a drag reaches the paper when let go)
  const pages = rulerPages(paper, paper.margins, H);
  const last = pages.length - 1;
  const marginsAdjustable = !readOnly && paper.layout === "flow"; // a free layout has no margins

  /** Where a margin marker sits (mm): on the sheet's width, or on page `i` (page 2 on: at its page lines). */
  const markerAt = (side: Side, i: number) => {
    const pg = pages[i];
    if (side === "left") return m.left;
    if (side === "right") return W - m.right;
    if (side === "top") return i === 0 ? m.top : pg.from;
    return i === last ? pg.to - m.bottom : pg.to;
  };

  const marker = (side: Side, i = 0) => {
    const across = side === "left" || side === "right";
    const at = markerAt(side, i);
    const name = { left: "ขอบซ้าย", right: "ขอบขวา", top: "ขอบบน", bottom: "ขอบล่าง" }[side];
    const label = i === 0 || across ? `${name} (mm)` : `${name} หน้า ${i + 1} (mm)`;
    // at a page line, one page's bottom marker sits just above the next page's top marker
    const nudge = !across && i > 0 && side === "top" ? 4 : !across && i < last && side === "bottom" ? -4 : 0;
    const on = live?.side === side && live.page === i;
    return (
      <div
        key={`${side}${i}`}
        role="slider"
        aria-label={label}
        aria-valuenow={m[side]}
        aria-valuemin={MARGIN_LIMITS.min}
        aria-valuemax={MARGIN_LIMITS.max}
        tabIndex={readOnly ? -1 : 0}
        title={`${name} ${m[side]} mm — ลากเพื่อปรับ (ทุกหน้าใช้ขอบเดียวกัน)`}
        className={`${styles.marker} ${across ? styles.markerH : styles.markerV} ${on ? styles.markerOn : ""}`}
        style={across ? { left: `${at}mm` } : { top: `calc(${at}mm + ${nudge}px)` }}
        onPointerDown={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setLive({ side, page: i, x: e.clientX, y: e.clientY, margins: paper.margins });
        }}
        onPointerMove={(e) => {
          if (!on || !live) return;
          const px = across ? e.clientX - live.x : e.clientY - live.y;
          const toward = side === "left" || side === "top" ? 1 : -1;
          setLive({ ...live, margins: dragMargin(paper, paper.margins, side, (toward * px) / (PX_PER_MM * zoom)) });
        }}
        onPointerUp={() => {
          const next = on && live ? live.margins : null;
          setLive(null);
          if (next && next[side] !== paper.margins[side]) onMargins(next);
        }}
        onKeyDown={(e) => {
          if (readOnly) return;
          const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
          if (step === undefined) return;
          e.preventDefault();
          const toward = side === "left" || side === "top" ? 1 : -1;
          const next = dragMargin(paper, paper.margins, side, toward * step);
          if (next[side] !== paper.margins[side]) onMargins(next);
        }}
      />
    );
  };

  const labels = (count: number) => Array.from({ length: Math.floor(count / 10) + 1 }, (_, i) => i);
  return (
    // a grid: the top bar sticks to the top of the scrolling area, the side bar to its left (like Word's)
    <div className={styles.rulers}>
      <div className={styles.rulerCorner} />
      <div className={styles.rulerTop}>
      <div className={`${styles.ruler} ${styles.rulerH}`} style={{ width: `${W}mm` }} aria-label="ไม้บรรทัดแนวนอน (mm)">
        <div className={styles.rulerShade} style={{ left: 0, width: `${m.left}mm` }} />
        <div className={styles.rulerShade} style={{ right: 0, width: `${m.right}mm` }} />
        {labels(W).map((cm) => (
          <span key={cm} className={styles.rulerLabel} style={{ left: `${cm * 10}mm` }}>
            {cm || ""}
          </span>
        ))}
        {marginsAdjustable && (["left", "right"] as const).map((s) => marker(s))}
      </div>
      </div>
      <div className={styles.rulerSide}>
      <div className={styles.rulerVBox} style={{ height: `${H}mm` }} aria-label="ไม้บรรทัดแนวตั้ง (mm)">
        {pages.map((pg, i) => {
          // each page counts from its printed top: from page 2 on it starts at its top margin, where its content starts
          const printed = pg.origin + pg.to - pg.from;
          return (
            <div key={i} className={styles.rulerVPage} style={{ top: `${pg.from}mm`, height: `${pg.to - pg.from}mm` }}>
              <div className={`${styles.ruler} ${styles.rulerV}`} style={{ top: `-${pg.origin}mm`, height: `${printed}mm` }}>
                {i === 0 && <div className={styles.rulerShade} style={{ top: 0, height: `${m.top}mm` }} />}
                {i === last && <div className={styles.rulerShade} style={{ top: `${printed - m.bottom}mm`, height: `${m.bottom}mm` }} />}
                {labels(printed).map((cm) => (
                  <span key={cm} className={styles.rulerLabel} style={{ top: `${cm * 10}mm` }}>
                    {cm || ""}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {marginsAdjustable && pages.flatMap((_, i) => [marker("top", i), marker("bottom", i)])}
      </div>
      </div>
      <div ref={sheet} className={styles.rulerPage} style={{ width: `${W}mm` }}>
        {children}
        {live && (
          <div
            className={styles.marginGuide}
            style={
              live.side === "left" || live.side === "right"
                ? { left: `${markerAt(live.side, 0)}mm`, top: 0, bottom: 0, width: 0 }
                : { top: `${markerAt(live.side, live.page)}mm`, left: 0, right: 0, height: 0 }
            }
          >
            <span>{m[live.side]} mm</span>
          </div>
        )}
      </div>
    </div>
  );
}
