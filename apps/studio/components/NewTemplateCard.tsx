"use client";

import { useState } from "react";

import styles from "@/app/(app)/catalog.module.css";

import { CreateTemplate } from "./CreateTemplate";

/** The dashed "+" card at the end of the catalog; it opens the create form in place. */
export function NewTemplateCard({ empty }: { empty: boolean }) {
  const [open, setOpen] = useState(empty); // nothing to look at yet: show the form straight away
  if (open)
    return (
      <div className={styles.newOpen}>
        <CreateTemplate />
        {!empty && (
          <button type="button" className={styles.cancel} onClick={() => setOpen(false)}>
            ยกเลิก
          </button>
        )}
      </div>
    );
  return (
    <button type="button" className={styles.newCard} onClick={() => setOpen(true)}>
      + รายงานใหม่จาก starter
      <small>ใบเสนอราคา · ตารางแบ่งกลุ่ม · หัว-รายการ · ว่าง</small>
    </button>
  );
}
