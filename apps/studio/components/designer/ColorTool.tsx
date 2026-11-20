"use client";

import { Baseline } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import styles from "./Designer.module.css";

// The colour button of the toolbar: a swatch list under it. The colours are the ones the style panel offers.

export const TEXT_COLORS = ["#000000", "#333333", "#666666", "#1f4fa3", "#0b7a3e", "#b3261e", "#8a5300", "#5b2a86"];

type Props = { label: string; value: string | null; disabled?: boolean; onPick: (color: string | null) => void };

export function ColorTool({ label, value, disabled, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={box} className={styles.toolMore}>
      <button
        type="button"
        className={styles.toolButton}
        aria-label={label}
        aria-expanded={open}
        title={label}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <Baseline size={16} strokeWidth={1.75} aria-hidden />
        <span className={styles.colorBar} style={{ background: value ?? "transparent" }} aria-hidden />
      </button>
      {open && (
        <div className={styles.toolPopover} role="listbox" aria-label={label}>
          <div className={styles.swatches}>
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={value === c}
                aria-label={c}
                className={`${styles.swatch} ${value === c ? styles.toolOn : ""}`}
                style={{ background: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.swatchClear}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
          >
            ตามเอกสาร
          </button>
        </div>
      )}
    </span>
  );
}
