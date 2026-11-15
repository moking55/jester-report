"use client";

import { useActionState, useState, useTransition } from "react";

import type { FormState } from "@/lib/actions/auth";
import { createUser, deleteUser } from "@/lib/actions/settings";
import { when } from "@/lib/format";
import type { components } from "@/lib/types.gen";

import styles from "./Settings.module.css";

type User = components["schemas"]["User"];

export function UsersPanel({ users, me }: { users: User[]; me: string }) {
  const [state, action, adding] = useActionState<FormState, FormData>(createUser, { error: null });
  const [error, setError] = useState<string | null>(null);
  const [deleting, startTransition] = useTransition();

  const remove = (user: User) => {
    if (!window.confirm(`ลบผู้ใช้ ${user.username}? เซสชันของผู้ใช้นี้จะถูกปิดทันที`)) return;
    startTransition(async () => setError(await deleteUser(user.id)));
  };

  return (
    <div className={styles.panel}>
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

      <form action={action} className={styles.form} aria-label="เพิ่มผู้ใช้">
        <h2>เพิ่มผู้ใช้</h2>
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
        <button type="submit" className={styles.primary} disabled={adding}>
          {adding ? "กำลังเพิ่ม…" : "เพิ่มผู้ใช้"}
        </button>
        {state.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}
        {state.notice && <p role="status">{state.notice}</p>}
      </form>
    </div>
  );
}
