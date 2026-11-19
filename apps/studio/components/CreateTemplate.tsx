"use client";

import { useActionState, useRef, useState } from "react";

import type { FormState } from "@/lib/actions/auth";
import { createTemplate } from "@/lib/actions/templates";

import styles from "./CreateTemplate.module.css";
import { PageSetupModal, type NewPage } from "./PageSetupModal";

const STARTERS = [
  ["blank", "ว่าง"],
  ["quotation", "ใบเสนอราคา"],
  ["grouped-table", "ตารางแบ่งกลุ่ม"],
  ["master-detail", "หัว-รายการ (master-detail)"],
  ["tax-invoice", "ใบกำกับภาษีเต็มรูป"],
];

export function CreateTemplate() {
  const [state, action, pending] = useActionState<FormState, FormData>(createTemplate, { error: null });
  const form = useRef<HTMLFormElement>(null);
  const [asking, setAsking] = useState(false); // the sheet size and layout modal of a blank report
  const [page, setPage] = useState<NewPage | null>(null);
  const chosen = useRef(false);
  return (
    <form
      ref={form}
      action={action}
      className={styles.form}
      aria-label="สร้างรายงาน"
      onSubmit={(e) => {
        // a blank report asks for its sheet size and layout first (SPEC-studio.md v1.8)
        const starter = new FormData(e.currentTarget).get("starter");
        if (starter === "blank" && !chosen.current) {
          e.preventDefault();
          setAsking(true);
        }
        chosen.current = false;
      }}
    >
      {page && <input type="hidden" name="page" value={JSON.stringify(page)} />}
      {asking && (
        <PageSetupModal
          onCancel={() => setAsking(false)}
          onConfirm={(chosenPage) => {
            setPage(chosenPage);
            setAsking(false);
            chosen.current = true;
            setTimeout(() => form.current?.requestSubmit(), 0); // after the hidden field is in the form
          }}
        />
      )}
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
