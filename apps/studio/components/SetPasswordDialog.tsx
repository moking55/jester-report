"use client";

import { useActionState, useEffect, useRef } from "react";

import type { FormState } from "@/lib/actions/auth";
import { setUserPassword } from "@/lib/actions/settings";

import styles from "./RenderDialog.module.css";

type Target = { id: string; username: string };

/** Sets another user's password (they forgot it). Open while `user` is set; render it outside `.panel`. */
export function SetPasswordDialog({ user, onClose }: { user: Target | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(setUserPassword, { error: null });

  useEffect(() => {
    if (user) dialog.current?.showModal();
  }, [user]);
  useEffect(() => {
    if (state.notice) form.current?.reset(); // never leave the new password in the fields
  }, [state]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="ตั้งรหัสผ่านให้ผู้ใช้" onClose={onClose}>
      {user && (
        <form ref={form} action={action} className={styles.form}>
          <div className={styles.head}>
            <h2>ตั้งรหัสผ่านให้ {user.username}</h2>
            <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
              ×
            </button>
          </div>
          <p>ใช้เมื่อผู้ใช้ลืมรหัสผ่าน เซสชันที่เปิดอยู่ของ {user.username} จะถูกปิดทันที</p>
          <input type="hidden" name="userId" value={user.id} />
          <label>
            รหัสผ่านใหม่ (12 ตัวขึ้นไป)
            <input name="newPassword" type="password" required minLength={12} maxLength={200} autoComplete="new-password" />
          </label>
          <label>
            ยืนยันรหัสผ่านใหม่
            <input name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary} disabled={pending}>
              {pending ? "กำลังตั้ง…" : "ตั้งรหัสผ่าน"}
            </button>
          </div>
          {state.error && <p role="alert">{state.error}</p>}
          {state.notice && <p role="status">{state.notice}</p>}
        </form>
      )}
    </dialog>
  );
}
