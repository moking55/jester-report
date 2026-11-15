// The HTTP part of the API client, without Next.js imports so Vitest can run it. App code uses lib/api.ts.
import type { components } from "./types.gen";

export type Problem = components["schemas"]["Problem"];

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblem";
  }
}

export type ApiConfig = {
  baseUrl: string;
  studioKey: string;
  clientIp: string | null;
  token: string | null;
  fetch?: typeof fetch;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown; // sent as JSON
  json?: string; // JSON text sent as is (render data: re-encoding would turn exact decimals into floats)
  text?: string; // sent as text/plain (draft files: JSON-encoding would save report.json as a string)
  form?: FormData; // sent as multipart/form-data (asset uploads); fetch writes the boundary
  ifMatch?: number; // draft revision
};

function problemFor(status: number, detail: string): Problem {
  const code = status === 401 ? "UNAUTHORIZED" : status === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR";
  return { type: "about:blank", title: code, status, code, detail, retryable: status === 503 };
}

/** One call to the api; a non-2xx answer becomes ApiProblem, so callers only see success values. */
export async function apiResponse(config: ApiConfig, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json, application/problem+json, application/pdf",
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (config.studioKey) headers["X-Jester-Studio-Key"] = config.studioKey;
  if (config.clientIp) headers["X-Jester-Client-IP"] = config.clientIp;
  if (options.ifMatch !== undefined) headers["If-Match"] = `"${options.ifMatch}"`;
  let body: string | FormData | undefined;
  if (options.form !== undefined) {
    body = options.form;
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = options.json;
  } else if (options.text !== undefined) {
    headers["Content-Type"] = "text/plain; charset=utf-8";
    body = options.text;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await (config.fetch ?? fetch)(new URL(path, config.baseUrl), {
      method: options.method ?? "GET",
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    throw new ApiProblem(503, problemFor(503, "the Jester API cannot be reached"));
  }
  if (response.ok) return response;
  let problem: Problem;
  try {
    const body = (await response.json()) as Partial<Problem> | null;
    problem = typeof body?.code === "string" ? (body as Problem) : problemFor(response.status, response.statusText);
  } catch {
    problem = problemFor(response.status, response.statusText);
  }
  throw new ApiProblem(response.status, problem);
}

export async function apiJson<T>(config: ApiConfig, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiResponse(config, path, options);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const IP = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * The browser's IP for the api's login rate limit. Trusted only behind a proxy that appends the real
 * client to X-Forwarded-For (JESTER_TRUST_PROXY=1): the right-most entry is the one that proxy wrote.
 * Without a proxy nothing is sent and the api counts Studio's own address.
 */
export function clientIpFrom(forwardedFor: string | null, trustProxy: boolean): string | null {
  if (!trustProxy || !forwardedFor) return null;
  const last = forwardedFor.split(",").at(-1)?.trim() ?? "";
  return IP.test(last) ? last : null;
}
