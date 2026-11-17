"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { FormState } from "@/lib/actions/auth";
import { createUser, deleteUser } from "@/lib/actions/settings";
import { when } from "@/lib/format";
import type { components } from "@/lib/types.gen";

import dialogStyles from "./RenderDialog.module.css";
import styles from "./Settings.module.css";

type User = components["schemas"]["User"];

export function UsersPanel({ users, me }: { users: User[]; me: string }) {
  const [state, action, adding] = useActionState<FormState, FormData>(createUser, { error: null });
  const [error, setError] = useState<string | null>(null);
  const [deleting, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.notice) dialog.current?.close(); // added: the new row is already in the table
  }, [state]);

  const remove = (user: User) => {
    if (!window.confirm(`ลบผู้ใช้ ${user.username}? เซสชันของผู้ใช้นี้จะถูกปิดทันที`)) return;
    startTransition(async () => setError(await deleteUser(user.id)));
  };

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={() => dialog.current?.showModal()}>
            + เพิ่มผู้ใช้
          </button>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ชื่อผู้ใช้</th>
              <th>สร้างเมื่อ</th>
              <th>เข้าระบบล่าสุด</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.username} {user.id === me && <small className={styles.muted}>(คุณ)</small>}
                </td>
                <td>{when(user.createdAt)}</td>
                <td>{when(user.lastLoginAt)}</td>
                <td>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={deleting || user.id === me}
                    title={user.id === me ? "ลบบัญชีของตัวเองไม่ได้" : undefined}
                    onClick={() => remove(user)}
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {state.notice && <p role="status">{state.notice}</p>}
      </div>

      {/* outside .panel, whose button and input rules would override the dialog's */}
      <dialog ref={dialog} className={dialogStyles.dialog} aria-label="เพิ่มผู้ใช้">
        <form action={action} className={dialogStyles.form}>
          <div className={dialogStyles.head}>
            <h2>เพิ่มผู้ใช้</h2>
            <button type="button" className={dialogStyles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
              ×
            </button>
          </div>
          <label>
            ชื่อผู้ใช้
            <input name="username" required pattern="[a-zA-Z0-9._\-]{3,40}" defaultValue={state.values?.username} autoComplete="off" />
          </label>
          <label>
            รหัสผ่าน (12 ตัวขึ้นไป)
            <input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" />
          </label>
          <label>
            ยืนยันรหัสผ่าน
            <input name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" />
          </label>
          <div className={dialogStyles.buttons}>
            <button type="submit" className={dialogStyles.primary} disabled={adding}>
              {adding ? "กำลังเพิ่ม…" : "เพิ่มผู้ใช้"}
            </button>
          </div>
          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}
        </form>
      </dialog>
    </>
  );
}
