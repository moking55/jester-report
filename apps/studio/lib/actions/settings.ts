"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { api, ApiProblem } from "@/lib/api";
import { requireUser } from "@/lib/current";
import { problemMessage } from "@/lib/messages";
import type { KeyOptions } from "@/lib/keys";
import { attempt } from "@/lib/result";
import { clearSession } from "@/lib/session";
import type { FormState } from "./auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_NAME = { name: "ชื่อ key ต้องยาว 1–80 ตัวอักษร" };
const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function createUser(_: FormState, form: FormData): Promise<FormState> {
  const username = text(form, "username").trim();
  const password = text(form, "password");
  if (password !== text(form, "confirm")) return { error: "รหัสผ่านสองช่องไม่ตรงกัน", values: { username } };
  const result = await attempt(() => api("/v1/users", { method: "POST", body: { username, password } }));
  if (!result.ok) {
    const taken = result.problem.status === 409 ? `มีผู้ใช้ชื่อ "${username}" อยู่แล้ว` : null;
    return { error: taken ?? problemMessage(result.problem), values: { username } };
  }
  refresh();
  return { error: null, notice: `เพิ่มผู้ใช้ ${username} แล้ว` };
}

/** Error message, or null when deleted. Deleting yourself would end this session mid-request, so it is refused. */
export async function deleteUser(id: string): Promise<string | null> {
  if (!UUID.test(id)) return "id ผู้ใช้ไม่ถูกต้อง";
  if ((await requireUser()).id === id) return "ลบบัญชีของตัวเองไม่ได้ ให้ผู้ใช้คนอื่นลบให้";
  const result = await attempt(() => api(`/v1/users/${id}`, { method: "DELETE" }));
  if (!result.ok) return result.problem.status === 409 ? "ลบผู้ใช้คนสุดท้ายไม่ได้" : problemMessage(result.problem);
  refresh();
  return null;
}

/** Someone else's password (they forgot it); their sessions end. Your own goes through changePassword. */
export async function setUserPassword(_: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "userId");
  const newPassword = text(form, "newPassword");
  if (!UUID.test(id)) return { error: "id ผู้ใช้ไม่ถูกต้อง" };
  if (newPassword !== text(form, "confirm")) return { error: "รหัสผ่านสองช่องไม่ตรงกัน" };
  const result = await attempt(() => api(`/v1/users/${id}/password`, { method: "PUT", body: { newPassword } }));
  if (!result.ok) return { error: problemMessage(result.problem) };
  return { error: null, notice: "ตั้งรหัสผ่านใหม่แล้ว เซสชันเดิมของผู้ใช้นี้ถูกปิด" };
}

export type NewKey = { ok: true; id: string; name: string; secret: string } | { ok: false; error: string };

/** The secret goes back to the one component that shows it; it is never stored, logged or put in a URL. */
export async function createApiKey(name: string, options: KeyOptions = {}): Promise<NewKey> {
  const body = { name: name.trim(), ...options };
  const result = await attempt(() =>
    api<{ id: string; name: string; secret: string }>("/v1/api-keys", { method: "POST", body }),
  );
  if (!result.ok) return { ok: false, error: problemMessage(result.problem, KEY_NAME) };
  refresh();
  return { ok: true, id: result.data.id, name: result.data.name, secret: result.data.secret };
}

export async function revokeApiKey(id: string): Promise<string | null> {
  if (!UUID.test(id)) return "id ของ key ไม่ถูกต้อง";
  const result = await attempt(() => api(`/v1/api-keys/${id}`, { method: "DELETE" }));
  if (!result.ok) return problemMessage(result.problem);
  refresh();
  return null;
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const newPassword = text(form, "newPassword");
  if (newPassword !== text(form, "confirm")) return { error: "รหัสผ่านใหม่สองช่องไม่ตรงกัน" };
  try {
    await api("/v1/auth/password", {
      method: "PUT",
      body: { currentPassword: text(form, "currentPassword"), newPassword },
    });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.status !== 401) return { error: problemMessage(error.problem) };
    // 401 is both "wrong current password" and "session ended"; only the second one signs out
    const signedIn = await api("/v1/auth/me").then(
      () => true,
      () => false,
    );
    if (signedIn) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
    await clearSession();
    redirect("/login");
  }
  return { error: null, notice: "เปลี่ยนรหัสผ่านแล้ว เซสชันอื่นของบัญชีนี้ถูกออกจากระบบ" };
}
