import { describe, expect, it, vi } from "vitest";

import { apiJson, ApiProblem, clientIpFrom, type ApiConfig } from "@/lib/api-core";

function config(fetch: typeof globalThis.fetch, token: string | null = "jrs_abc"): ApiConfig {
  return { baseUrl: "http://api:8000", studioKey: "studio-secret", clientIp: "203.0.113.9", token, fetch };
}

describe("api client", () => {
  it("sends the session, the studio key, the browser IP and If-Match", async () => {
    const fetch = vi.fn(async () => Response.json({ revision: 3 }));
    const result = await apiJson(config(fetch), "/v1/templates/q/draft", {
      method: "PUT",
      body: { a: 1 },
      ifMatch: 2,
    });
    expect(result).toEqual({ revision: 3 });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://api:8000/v1/templates/q/draft");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer jrs_abc",
      "X-Jester-Studio-Key": "studio-secret",
      "X-Jester-Client-IP": "203.0.113.9",
      "If-Match": '"2"',
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"a":1}');
  });

  it("sends no Authorization without a session", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    await apiJson(config(fetch, null), "/v1/themes/default");
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("turns problem+json into ApiProblem", async () => {
    const problem = { type: "x", title: "Unauthorized", status: 401, code: "UNAUTHORIZED", detail: "expired" };
    const fetch = vi.fn(async () =>
      Response.json(problem, { status: 401, headers: { "Content-Type": "application/problem+json" } }),
    );
    const error = await apiJson(config(fetch), "/v1/auth/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiProblem);
    expect((error as ApiProblem).status).toBe(401);
    expect((error as ApiProblem).problem.code).toBe("UNAUTHORIZED");
  });

  it("gives a problem for non-JSON errors and unreachable servers", async () => {
    const html = vi.fn(async () => new Response("<h1>Bad gateway</h1>", { status: 502 }));
    expect(((await apiJson(config(html), "/x").catch((e) => e)) as ApiProblem).problem.code).toBe("INTERNAL_ERROR");
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const error = (await apiJson(config(down), "/x").catch((e) => e)) as ApiProblem;
    expect(error.status).toBe(503);
    expect(error.problem.retryable).toBe(true);
  });

  it("returns undefined for 204", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await apiJson(config(fetch), "/v1/themes/x", { method: "DELETE" })).toBeUndefined();
  });
});

describe("clientIpFrom", () => {
  it("trusts only the right-most X-Forwarded-For entry, and only behind a proxy", () => {
    expect(clientIpFrom("1.1.1.1, 203.0.113.9", true)).toBe("203.0.113.9");
    expect(clientIpFrom("203.0.113.9", false)).toBeNull();
    expect(clientIpFrom("2001:db8::1", true)).toBe("2001:db8::1");
    expect(clientIpFrom("evil\r\nX: y", true)).toBeNull();
    expect(clientIpFrom(null, true)).toBeNull();
  });
});
