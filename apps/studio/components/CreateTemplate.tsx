"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { FormState } from "@/lib/actions/auth";
import { createTemplate } from "@/lib/actions/templates";

import styles from "./CreateTemplate.module.css";
import { DEFAULT_PAGE, PageSetup, pageFor, pageOk } from "./PageSetup";

const STARTERS = [
  ["blank", "ว่าง"],
  ["quotation", "ใบเสนอราคา"],
  ["grouped-table", "ตารางแบ่งกลุ่ม"],
  ["master-detail", "หัว-รายการ (master-detail)"],
  ["tax-invoice", "ใบกำกับภาษีเต็มรูป"],
];

/** "+ สร้างรายงาน": opens the modal with the name, id, starter and, for a blank report, the sheet and layout. */
export function CreateTemplate({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        + สร้างรายงาน
      </button>
      {open && <CreateDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTemplate, { error: null });
  const dialog = useRef<HTMLDialogElement>(null);
  const [starter, setStarter] = useState("blank");
  const [page, setPage] = useState(DEFAULT_PAGE);
  const blank = starter === "blank";
  const chosen = blank ? pageFor(page.layout, page.choice, page.orientation, page) : null;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="สร้างรายงานใหม่" onCancel={onClose} onClose={onClose}>
      <form action={action} className={styles.body} aria-label="สร้างรายงาน">
        <div className={styles.head}>
          <h2>สร้างรายงานใหม่</h2>
          <button type="button" className={styles.close} aria-label="ปิด" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.pair}>
          <label className={styles.field}>
            ชื่อรายงาน
            <input name="name" required maxLength={120} defaultValue={state.values?.name} placeholder="ใบเสนอราคา" autoFocus />
          </label>
          <label className={styles.field}>
            id
            <input name="id" aria-label="id" required pattern="[a-z0-9][a-z0-9\-]{1,62}" defaultValue={state.values?.id} placeholder="quotation" aria-describedby="new-id-hint" />
            <small id="new-id-hint">a-z 0-9 และ - ใช้เรียกผ่าน API เปลี่ยนไม่ได้</small>
          </label>
        </div>
        <label className={styles.field}>
          เริ่มจาก
          <select name="starter" value={starter} onChange={(e) => setStarter(e.target.value)}>
            {STARTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {blank ? (
          <>
            <PageSetup value={page} onChange={setPage} />
            {chosen && <input type="hidden" name="page" value={JSON.stringify(chosen)} />}
            <p className={styles.note}>รูปแบบการจัดวางเปลี่ยนไม่ได้หลังสร้าง ส่วนขนาดกระดาษเปลี่ยนได้ในหน้าออกแบบ (ยกเว้นเปลี่ยนจากหรือเป็นใบเสร็จม้วน)</p>
          </>
        ) : (
          <p className={styles.note}>ขนาดกระดาษและรูปแบบมาจาก starter เปลี่ยนขนาดกระดาษได้ในหน้าออกแบบ</p>
        )}
        {state.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className={styles.primary} disabled={pending || (blank && !pageOk(page))}>
            {pending ? "กำลังสร้าง…" : "สร้าง"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
