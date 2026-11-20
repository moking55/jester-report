"use client";

import { CUSTOM_LIMITS, fitMargins, PAPER_MM, sizeLabel, type PageSize } from "@/lib/paper";

import styles from "./CreateTemplate.module.css";

// The sheet size and layout of a new blank report (SPEC-studio.md v1.8), inside the "สร้างรายงานใหม่" modal: chosen
// before the report exists. The layout is fixed from then on; a roll is always the fixed (flow) layout.

export type NewPage = Record<string, unknown>;

type Choice = "A3" | "A4" | "A5" | "A6" | "B5" | "Letter" | "Legal" | "DL" | "custom" | "roll58" | "roll80";
const SHEETS = Object.keys(PAPER_MM) as Choice[];

export type PageChoice = {
  layout: "flow" | "free";
  choice: Choice;
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
};

export const DEFAULT_PAGE: PageChoice = { layout: "flow", choice: "A4", orientation: "portrait", width: 100, height: 150 };

const isRoll = (c: Choice) => c === "roll58" || c === "roll80";

/** A custom size inside the limits (any other choice is fine). */
export const pageOk = (p: PageChoice) =>
  p.choice !== "custom" ||
  (p.width >= CUSTOM_LIMITS.width[0] && p.width <= CUSTOM_LIMITS.width[1] && p.height >= CUSTOM_LIMITS.height[0] && p.height <= CUSTOM_LIMITS.height[1]);

/** The `page` object of report.json for the choices, or null when the default (A4 portrait, flow) says it all. */
export function pageFor(
  layout: "flow" | "free",
  choice: Choice,
  orientation: "portrait" | "landscape",
  custom: { width: number; height: number },
): NewPage | null {
  if (isRoll(choice)) return { size: "roll", rollWidthMm: choice === "roll58" ? 58 : 80 };
  if (choice === "A4" && orientation === "portrait" && layout === "flow") return null;
  const page: NewPage = { size: choice as PageSize, orientation };
  if (choice === "custom") {
    page.widthMm = custom.width;
    page.heightMm = custom.height;
    if (layout === "flow") {
      const [w, h] = orientation === "landscape" ? [custom.height, custom.width] : [custom.width, custom.height];
      page.marginsMm = fitMargins({ top: 20, bottom: 20, left: 15, right: 15 }, w, h);
    }
  }
  if (layout === "free") page.layout = "free";
  return page;
}

/** Layout cards, sheet size and orientation; the parent keeps the choice. */
export function PageSetup({ value, onChange }: { value: PageChoice; onChange: (next: PageChoice) => void }) {
  const roll = isRoll(value.choice);
  const set = (part: Partial<PageChoice>) => onChange({ ...value, ...part });
  return (
    <>
      <div className={styles.cards} role="radiogroup" aria-label="รูปแบบการจัดวาง">
        <button type="button" role="radio" aria-checked={value.layout === "flow"} className={styles.card} onClick={() => set({ layout: "flow" })}>
          <svg viewBox="0 0 48 36" aria-hidden>
            <rect x="6" y="4" width="36" height="6" rx="1" />
            <rect x="6" y="13" width="36" height="6" rx="1" />
            <rect x="6" y="22" width="36" height="6" rx="1" />
          </svg>
          <b>จัดวางแบบคงที่</b>
          <small>บล็อกเรียงต่อกัน ข้ามหน้าได้ เหมาะกับใบเสนอราคา ใบกำกับภาษี ใบเสร็จ</small>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value.layout === "free"}
          disabled={roll}
          className={styles.card}
          onClick={() => set({ layout: "free" })}
        >
          <svg viewBox="0 0 48 36" aria-hidden>
            <rect x="5" y="5" width="18" height="12" rx="1" />
            <rect x="27" y="9" width="16" height="9" rx="1" />
            <rect x="12" y="22" width="26" height="8" rx="1" />
          </svg>
          <b>จัดวางแบบอิสระ</b>
          <small>{roll ? "ใบเสร็จม้วนใช้แบบอิสระไม่ได้ (ความยาวไม่แน่นอน)" : "วางตามพิกัด mm หน้าเดียว เหมาะกับฟอร์มและแบบพิมพ์สำเร็จ"}</small>
        </button>
      </div>
      <div className={styles.paper}>
        <label className={styles.field}>
          ขนาดกระดาษ
          <select
            value={value.choice}
            onChange={(e) => {
              const next = e.target.value as Choice;
              set(isRoll(next) ? { choice: next, layout: "flow" } : { choice: next });
            }}
          >
            {SHEETS.map((n) => (
              <option key={n} value={n}>
                {sizeLabel(n as PageSize)} ({PAPER_MM[n][0]} × {PAPER_MM[n][1]} mm)
              </option>
            ))}
            <option value="custom">กำหนดเอง (mm)</option>
            <option value="roll58">{sizeLabel("roll", 58)}</option>
            <option value="roll80">{sizeLabel("roll", 80)}</option>
          </select>
        </label>
        {!roll && (
          <div className={styles.segments} role="radiogroup" aria-label="แนวกระดาษ">
            {(["portrait", "landscape"] as const).map((o) => (
              <label key={o} className={styles.segment}>
                <input type="radio" name="orientation" checked={value.orientation === o} onChange={() => set({ orientation: o })} />
                {o === "portrait" ? "แนวตั้ง" : "แนวนอน"}
              </label>
            ))}
          </div>
        )}
      </div>
      {value.choice === "custom" && (
        <div className={styles.pair}>
          <label className={styles.field}>
            กว้าง (mm)
            <input type="number" min={CUSTOM_LIMITS.width[0]} max={CUSTOM_LIMITS.width[1]} value={value.width} onChange={(e) => set({ width: Number(e.target.value) })} />
          </label>
          <label className={styles.field}>
            สูง (mm)
            <input type="number" min={CUSTOM_LIMITS.height[0]} max={CUSTOM_LIMITS.height[1]} value={value.height} onChange={(e) => set({ height: Number(e.target.value) })} />
          </label>
        </div>
      )}
      {!pageOk(value) && <p className={styles.error}>กว้าง 25–1000 mm, สูง 25–2000 mm</p>}
    </>
  );
}
