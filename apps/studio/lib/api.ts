import "server-only";

import { headers } from "next/headers";

import { apiJson, apiResponse, clientIpFrom, type ApiConfig, type RequestOptions } from "./api-core";
import { sessionToken } from "./session";

export { ApiProblem, type Problem } from "./api-core";

async function config(withSession: boolean): Promise<ApiConfig> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return {
    baseUrl: process.env.JESTER_API_URL ?? "http://localhost:8000",
    studioKey: process.env.JESTER_STUDIO_KEY ?? "",
    clientIp: clientIpFrom(forwarded, process.env.JESTER_TRUST_PROXY === "1"),
    token: withSession ? await sessionToken() : null,
  };
}

/** JSON call with the signed-in user's session (if any). */
export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  return apiJson<T>(await config(true), path, options);
}

/** JSON call without a session: setup status, login, the default theme. */
export async function publicApi<T>(path: string, options?: RequestOptions): Promise<T> {
  return apiJson<T>(await config(false), path, options);
}

/** Raw response (the PDF preview) with the session. */
export async function apiRaw(path: string, options?: RequestOptions): Promise<Response> {
  return apiResponse(await config(true), path, options);
}
