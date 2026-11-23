import "server-only";

import { redirect } from "next/navigation";

import { ApiProblem } from "./api";
import { clearSession } from "./session";
import { isTemplateId } from "./template-id";
import type { Result } from "./workspace";

/** For Server Actions: api errors come back as values (never thrown to the client); 401 ends the session. */
export async function attempt<T>(call: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await call() };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.status === 401) {
      await clearSession();
      redirect("/login");
    }
    return { ok: false, problem: error.problem };
  }
}

const FILE_NAME = /^(?!index\.html$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(html|json|css)$/;

/** Route Handlers that change data: Server Actions check the origin themselves, handlers do not. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin form posts without Origin are older browsers; SameSite=Lax still applies
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export { isTemplateId };

/** Path segments from the browser, checked against the contract before they go into a URL. */
export function draftPath(templateId: string, fileName?: string): string {
  if (!isTemplateId(templateId)) throw new Error("invalid template id");
  if (fileName !== undefined && !FILE_NAME.test(fileName)) throw new Error("invalid file name");
  return `/v1/templates/${templateId}/draft${fileName === undefined ? "" : `/files/${fileName}`}`;
}
