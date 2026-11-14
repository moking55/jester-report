"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api, ApiProblem, publicApi } from "@/lib/api";
import { problemMessage } from "@/lib/messages";
import { clearSession, saveSession, THEME_COOKIE } from "@/lib/session";
import type { components } from "@/lib/types.gen";

type Session = components["schemas"]["Session"];
export type FormState = { error: string | null };

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

async function startSession(path: string, body: Record<string, string>): Promise<FormState> {
  try {
    const session = await publicApi<Session>(path, { method: "POST", body });
    await saveSession(session.token);
  } catch (error) {
    if (error instanceof ApiProblem) return { error: problemMessage(error.problem) };
    throw error;
  }
  redirect("/"); // outside try: redirect works by throwing
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  return startSession("/v1/auth/login", { username: text(form, "username"), password: text(form, "password") });
}

export async function completeSetup(_: FormState, form: FormData): Promise<FormState> {
  if (text(form, "password") !== text(form, "confirm")) return { error: "รหัสผ่านสองช่องไม่ตรงกัน" };
  return startSession("/v1/setup", {
    setupToken: text(form, "setupToken").trim(),
    username: text(form, "username").trim(),
    password: text(form, "password"),
  });
}

export async function logout(): Promise<void> {
  try {
    await api("/v1/auth/logout", { method: "POST" });
  } catch {
    // already expired or api down: the cookie goes either way
  }
  await clearSession();
  redirect("/login");
}

const THEME_ID = /^[a-z0-9-]{1,64}$/;

/** The user's own theme, remembered in a cookie (SPEC-studio.md assumption 8). */
export async function chooseTheme(themeId: string): Promise<void> {
  if (!THEME_ID.test(themeId)) return;
  (await cookies()).set(THEME_COOKIE, themeId, {
    httpOnly: true,
    secure: process.env.JESTER_COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  refresh(); // re-renders the current page, so the root layout writes the new <style>
}
