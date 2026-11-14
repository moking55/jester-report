import "server-only";

import { cookies } from "next/headers";

export const SESSION_COOKIE = "jester_session";
export const THEME_COOKIE = "jester_theme";
const WEEK = 7 * 24 * 60 * 60; // the api's absolute session cap; the api decides when it really ends

// Secure by default (SPEC-studio.md). JESTER_COOKIE_SECURE=false only for plain-http test setups.
const secure = () => process.env.JESTER_COOKIE_SECURE !== "false";

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Server Actions and Route Handlers only: Next.js cannot set cookies while rendering a page. */
export async function saveSession(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: WEEK,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
