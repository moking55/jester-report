"use server";

import { refresh } from "next/cache";

import { api } from "@/lib/api";
import type { Problem } from "@/lib/api-core";
import { problemMessage } from "@/lib/messages";
import { attempt } from "@/lib/result";
import type { Theme } from "@/lib/theme";
import type { ValidationProblem } from "@/lib/workspace";

const THEME_ID = /^[a-z0-9-]{1,64}$/;

export type ThemeResult = { ok: true; theme: Theme } | { ok: false; error: string; problems: ValidationProblem[] };

function failure(problem: Problem): ThemeResult {
  const error =
    problem.status === 409
      ? `บันทึกไม่ได้: ชื่อนี้ถูกใช้แล้ว, เป็น theme ในตัว หรือมีครบ 50 theme แล้ว (${problem.detail ?? ""})`
      : problem.code === "INPUT_INVALID"
        ? "theme นี้มีค่าที่ไม่ผ่านการตรวจ"
        : problemMessage(problem);
  return { ok: false, error, problems: problem.problems ?? [] };
}

/** Create (id null; also JSON import) or replace a theme. `tokens` goes to the api as is: the api checks
 *  every value, and its problems point at /name or /tokens/<key> for the editor to show. */
export async function saveTheme(id: string | null, name: unknown, tokens: unknown): Promise<ThemeResult> {
  if (id !== null && !THEME_ID.test(id)) return { ok: false, error: "id ของ theme ไม่ถูกต้อง", problems: [] };
  const result = await attempt(() =>
    api<Theme>(id === null ? "/v1/themes" : `/v1/themes/${id}`, {
      method: id === null ? "POST" : "PUT",
      body: { name, tokens },
    }),
  );
  if (!result.ok) return failure(result.problem);
  refresh(); // the theme list, and the page's own <style> when this theme is in use
  return { ok: true, theme: result.data };
}

export async function deleteTheme(id: string): Promise<string | null> {
  if (!THEME_ID.test(id)) return "id ของ theme ไม่ถูกต้อง";
  const result = await attempt(() => api(`/v1/themes/${id}`, { method: "DELETE" }));
  if (!result.ok) return result.problem.status === 409 ? "theme ในตัวลบไม่ได้" : problemMessage(result.problem);
  refresh();
  return null;
}

export async function setDefaultTheme(id: string): Promise<string | null> {
  if (!THEME_ID.test(id)) return "id ของ theme ไม่ถูกต้อง";
  const result = await attempt(() => api("/v1/themes/default", { method: "PUT", body: { themeId: id } }));
  if (!result.ok) return problemMessage(result.problem);
  refresh();
  return null;
}
