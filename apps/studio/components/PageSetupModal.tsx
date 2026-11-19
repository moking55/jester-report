"use client";

import { useEffect, useRef, useState } from "react";

import { CUSTOM_LIMITS, fitMargins, PAPER_MM, sizeLabel, type PageSize } from "@/lib/paper";

import styles from "./PageSetupModal.module.css";

// The "ขนาดกระดาษและรูปแบบ" modal of a new blank report (SPEC-studio.md v1.8): sheet size and layout are chosen
// before the report exists. The layout is fixed from then on; a roll is always the fixed (flow) layout.

export type NewPage = Record<string, unknown>;

type Choice = "A3" | "A4" | "A5" | "A6" | "B5" | "Letter" | "Legal" | "DL" | "custom" | "roll58" | "roll80";
const SHEETS = Object.keys(PAPER_MM) as Choice[];

/** The `page` object of report.json for the choices, or null when the default (A4 portrait, flow) says it all. */
export function pageFor(
  layout: "flow" | "free",
  choice: Choice,
  orientation: "portrait" | "landscape",
  custom: { width: number; height: number },
): NewPage | null {
  if (choice === "roll58" || choice === "roll80") return { size: "roll", rollWidthMm: choice === "roll58" ? 58 : 80 };
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

type Props = { onConfirm: (page: NewPage | null, layout: "flow" | "free") => void; onCancel: () => void };

export function PageSetupModal({ onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [layout, setLayout] = useState<"flow" | "free">("flow");
  const [choice, setChoice] = useState<Choice>("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(150);
  const roll = choice === "roll58" || choice === "roll80";
  const customOk =
    choice !== "custom" ||
    (width >= CUSTOM_LIMITS.width[0] && width <= CUSTOM_LIMITS.width[1] && height >= CUSTOM_LIMITS.height[0] && height <= CUSTOM_LIMITS.height[1]);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="ขนาดกระดาษและรูปแบบ" onCancel={onCancel} onClose={onCancel}>
      <div className={styles.body}>
        <div className={styles.head}>
          <h2>สร้างเอกสารใหม่</h2>
          <button type="button" className={styles.close} aria-label="ปิด" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className={styles.cards} role="radiogroup" aria-label="รูปแบบการจัดวาง">
          <button
            type="button"
            role="radio"
            aria-checked={layout === "flow"}
            className={styles.card}
            onClick={() => setLayout("flow")}
          >
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
            aria-checked={layout === "free"}
            aria-disabled={roll}
            disabled={roll}
            className={styles.card}
            onClick={() => setLayout("free")}
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
        <label className={styles.field}>
          ขนาดกระดาษ
          <select
            value={choice}
            onChange={(e) => {
              const next = e.target.value as Choice;
              setChoice(next);
              if (next === "roll58" || next === "roll80") setLayout("flow");
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
        {choice === "custom" && (
          <div className={styles.row}>
            <label className={styles.field}>
              กว้าง (mm)
              <input type="number" min={CUSTOM_LIMITS.width[0]} max={CUSTOM_LIMITS.width[1]} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            </label>
            <label className={styles.field}>
              สูง (mm)
              <input type="number" min={CUSTOM_LIMITS.height[0]} max={CUSTOM_LIMITS.height[1]} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
            </label>
          </div>
        )}
        {!roll && (
          <div className={styles.row} role="radiogroup" aria-label="แนวกระดาษ">
            {(["portrait", "landscape"] as const).map((o) => (
              <label key={o} className={styles.radio}>
                <input type="radio" name="orientation" checked={orientation === o} onChange={() => setOrientation(o)} />
                {o === "portrait" ? "แนวตั้ง" : "แนวนอน"}
              </label>
            ))}
          </div>
        )}
        {!customOk && <p className={styles.error}>กว้าง 25–1000 mm, สูง 25–2000 mm</p>}
        <p className={styles.note}>รูปแบบการจัดวางเปลี่ยนไม่ได้หลังสร้าง ส่วนขนาดกระดาษเปลี่ยนได้ในหน้าออกแบบ (ยกเว้นเปลี่ยนจากหรือเป็นใบเสร็จม้วน)</p>
        <div className={styles.actions}>
          <button type="button" onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!customOk}
            onClick={() => onConfirm(pageFor(layout, choice, orientation, { width, height }), layout)}
          >
            สร้าง
          </button>
        </div>
      </div>
    </dialog>
  );
}
