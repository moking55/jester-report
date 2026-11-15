import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

import { api, ApiProblem, publicApi } from "./api";
import { sessionToken, THEME_COOKIE } from "./session";
import type { Theme } from "./theme";
import type { components } from "./types.gen";

type User = components["schemas"]["User"];

export async function setupRequired(): Promise<boolean> {
  try {
    return (await publicApi<{ setupRequired: boolean }>("/v1/setup")).setupRequired;
  } catch {
    return false; // api down: the login page shows the error when the user tries
  }
}

/** The signed-in user, or a redirect to setup/login. 401 means the session ended. */
export async function requireUser(): Promise<User> {
  let user: User | null = null;
  if (await sessionToken()) {
    try {
      user = await api<User>("/v1/auth/me");
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.status !== 401) throw error;
    }
  }
  if (user) return user;
  redirect((await setupRequired()) ? "/setup" : "/login");
}

/** The theme the user picked (needs a session to look it up), else the system default.
 *  cache(): both the root and the (app) layout ask for it; one api round per request. */
export const activeTheme = cache(async (): Promise<{ theme: Theme | null; themes: Theme[] }> => {
  const chosen = (await cookies()).get(THEME_COOKIE)?.value;
  let themes: Theme[] = [];
  if (await sessionToken()) {
    try {
      themes = await api<Theme[]>("/v1/themes");
    } catch {
      // expired session or api down: fall through to the public default
    }
  }
  const picked = themes.find((t) => t.id === chosen);
  if (picked) return { theme: picked, themes };
  try {
    return { theme: await publicApi<Theme>("/v1/themes/default"), themes };
  } catch {
    return { theme: null, themes }; // styles/tokens.css fallback
  }
});
