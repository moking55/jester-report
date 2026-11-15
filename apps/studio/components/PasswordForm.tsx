"use client";

import { useActionState } from "react";

import type { FormState } from "@/lib/actions/auth";
import { changePassword } from "@/lib/actions/settings";

import styles from "./Settings.module.css";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, { error: null });
  return (
    <form action={action} className={styles.form} aria-label="เปลี่ยนรหัสผ่าน">
      <label>
        รหัสผ่านปัจจุบัน
        <input name="currentPassword" type="password" required autoComplete="current-password" />
      </label>
      <label>
        รหัสผ่านใหม่ (12 ตัวขึ้นไป)
        <input name="newPassword" type="password" required minLength={12} maxLength={200} autoComplete="new-password" />
      </label>
      <label>
        ยืนยันรหัสผ่านใหม่
        <input name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" />
      </label>
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
      </button>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {state.notice && <p role="status">{state.notice}</p>}
    </form>
  );
}
