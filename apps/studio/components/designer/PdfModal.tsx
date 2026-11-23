"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./Designer.module.css";

/** "Preview pdf" (SPEC-studio v1.7): the saved draft rendered by the engine, in a modal over the designer. */
export function PdfModal({ templateId, params, onClose }: { templateId: string; params: string; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const [blank, setBlank] = useState(false); // v1.14 "ดูแบบฟอร์มเปล่า": render again as the blank form
  useEffect(() => form.current?.requestSubmit(), [blank]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Preview pdf" className={styles.pdfModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalBar}>
          <b>Preview pdf</b>
          <span className={styles.hint}>PDF จริงจาก engine (draft ที่บันทึกแล้ว)</span>
          <span className={styles.spacer} />
          <label className={styles.check}>
            <input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} /> ดูแบบฟอร์มเปล่า
          </label>
          <button type="button" onClick={onClose}>
            ปิด (Esc)
          </button>
        </div>
        <form ref={form} method="post" action={`/preview/${templateId}`} target="jd-pdf" hidden>
          <input name="params" defaultValue={params} />
          <input name="blank" value={blank ? "1" : ""} readOnly />
        </form>
        <iframe name="jd-pdf" title="PDF preview" className={styles.pdfFrame} />
      </div>
    </div>
  );
}
