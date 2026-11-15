"use client";

import { useActionState } from "react";

import type { FormState } from "@/lib/actions/auth";
import { createTemplate } from "@/lib/actions/templates";

import styles from "./CreateTemplate.module.css";

const STARTERS = [
  ["blank", "ว่าง"],
  ["quotation", "ใบเสนอราคา"],
  ["grouped-table", "ตารางแบ่งกลุ่ม"],
  ["master-detail", "หัว-รายการ (master-detail)"],
];

export function CreateTemplate() {
  const [state, action, pending] = useActionState<FormState, FormData>(createTemplate, { error: null });
  return (
    <form action={action} className={styles.form} aria-label="สร้างรายงาน">
      <label>
        id
        <input name="id" required pattern="[a-z0-9][a-z0-9\-]{1,62}" defaultValue={state.values?.id} placeholder="quotation" />
      </label>
      <label>
        ชื่อรายงาน
        <input name="name" required maxLength={120} defaultValue={state.values?.name} placeholder="ใบเสนอราคา" />
      </label>
      <label>
        เริ่มจาก
        <select name="starter" defaultValue={state.values?.starter ?? "quotation"}>
          {STARTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "กำลังสร้าง…" : "สร้างรายงาน"}
      </button>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
    </form>
  );
}
