"use client";

import { Fragment, useEffect, useRef, useState } from "react";

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

export function Rulers({ paper, zoom, readOnly, onMargins, children }: Props) {
  // the marker being dragged: where the pointer started, and the margins it would give now
  const [live, setLive] = useState<{ side: Side; x: number; y: number; margins: Margins } | null>(null);
  const m = live?.margins ?? paper.margins;
  const W = paper.widthMm;
  // the sheet is as tall as its content (a roll, or the pages a flow document runs over): the vertical ruler follows it
  const page = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMeasured(Math.round(el.offsetHeight / PX_PER_MM)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = paper.roll ? Math.max(measured, 20) : Math.max(measured, paper.heightMm);
  const pageH = paper.roll ? H : paper.heightMm; // one page: the margins repeat on each
  const pages = paper.roll ? 1 : Math.max(1, Math.round(H / pageH));
  const marginsAdjustable = !readOnly && paper.layout === "flow"; // a free layout has no margins

  const marker = (side: Side) => {
    const across = side === "left" || side === "right";
    const at = side === "left" ? m.left : side === "right" ? W - m.right : side === "top" ? m.top : pageH - m.bottom;
    const name = { left: "ขอบซ้าย", right: "ขอบขวา", top: "ขอบบน", bottom: "ขอบล่าง" }[side];
    return (
      <div
        key={side}
        role="slider"
        aria-label={`${name} (mm)`}
        aria-valuenow={m[side]}
        aria-valuemin={MARGIN_LIMITS.min}
        aria-valuemax={MARGIN_LIMITS.max}
        tabIndex={readOnly ? -1 : 0}
        title={`${name} ${m[side]} mm — ลากเพื่อปรับ`}
        className={`${styles.marker} ${across ? styles.markerH : styles.markerV} ${live?.side === side ? styles.markerOn : ""}`}
        style={across ? { left: `${at}mm` } : { top: `${at}mm` }}
        onPointerDown={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setLive({ side, x: e.clientX, y: e.clientY, margins: paper.margins });
        }}
        onPointerMove={(e) => {
          if (live?.side !== side) return;
          const px = across ? e.clientX - live.x : e.clientY - live.y;
          const toward = side === "left" || side === "top" ? 1 : -1;
          setLive({ ...live, margins: dragMargin(paper, paper.margins, side, (toward * px) / (PX_PER_MM * zoom)) });
        }}
        onPointerUp={() => {
          const next = live?.side === side ? live.margins : null;
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
        {marginsAdjustable && (["left", "right"] as const).map(marker)}
      </div>
      </div>
      <div className={styles.rulerSide}>
      <div className={`${styles.ruler} ${styles.rulerV}`} style={{ height: `${H}mm` }} aria-label="ไม้บรรทัดแนวตั้ง (mm)">
        {Array.from({ length: pages }, (_, i) => (
          <Fragment key={i}>
            <div className={styles.rulerShade} style={{ top: `${i * pageH}mm`, height: `${m.top}mm` }} />
            <div className={styles.rulerShade} style={{ top: `${(i + 1) * pageH - m.bottom}mm`, height: `${m.bottom}mm` }} />
          </Fragment>
        ))}
        {labels(H).map((cm) => (
          <span key={cm} className={styles.rulerLabel} style={{ top: `${cm * 10}mm` }}>
            {cm || ""}
          </span>
        ))}
        {marginsAdjustable && (["top", "bottom"] as const).map(marker)}
      </div>
      </div>
      <div ref={page} className={styles.rulerPage} style={{ width: `${W}mm` }}>
        {children}
        {live && (
          <div
            className={styles.marginGuide}
            style={
              live.side === "left" || live.side === "right"
                ? { left: `${live.side === "left" ? m.left : W - m.right}mm`, top: 0, bottom: 0, width: 0 }
                : { top: `${live.side === "top" ? m.top : pageH - m.bottom}mm`, left: 0, right: 0, height: 0 }
            }
          >
            <span>{m[live.side]} mm</span>
          </div>
        )}
      </div>
    </div>
  );
}
