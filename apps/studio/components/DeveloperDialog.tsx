"use client";

import { useEffect, useRef, useState } from "react";

import { curlExample } from "@/lib/render";

import styles from "./RenderDialog.module.css";

/** "สำหรับนักพัฒนา" in the issue mode: the same request another system sends, from the form as it is now. */
export function DeveloperDialog({ body, onClose }: { body: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const curl = curlExample(body);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
    } catch {
      setCopied(false); // plain http has no clipboard API: the text can still be selected by hand
    }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-label="สำหรับนักพัฒนา">
      <div className={styles.form}>
        <div className={styles.head}>
          <h2>เรียกจากระบบอื่น</h2>
          <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
            ×
          </button>
        </div>
        <p className={styles.hint}>
          คำขอเดียวกับที่ฟอร์มนี้จะส่งตอนนี้ (version ที่ publish) ระบบอื่นเรียก <code>POST /v1/render</code> ด้วย API key
        </p>
        <pre className={styles.curl} aria-label="ตัวอย่าง curl">
          {curl}
        </pre>
        <p className={styles.hint}>
          ตั้ง <code>JESTER_API</code> เป็น URL ของ api แล้วแทน <code>jrk_…</code> ด้วย API key จากหน้าตั้งค่า
        </p>
        <div className={styles.buttons}>
          <button type="button" onClick={copy}>
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
          <button type="button" className={styles.primary} onClick={() => dialog.current?.close()}>
            ปิด
          </button>
        </div>
      </div>
    </dialog>
  );
}
