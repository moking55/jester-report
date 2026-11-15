import { describe, expect, it } from "vitest";

import { problemMessage } from "@/lib/messages";
import { sameOrigin } from "@/lib/result";

const post = (headers: Record<string, string>) =>
  new Request("http://studio:3000/preview/q", { method: "POST", headers });

describe("sameOrigin (Route Handlers that change data)", () => {
  it("accepts Studio's own pages", () => {
    expect(sameOrigin(post({ host: "studio.example.com", origin: "https://studio.example.com" }))).toBe(true);
  });

  it("refuses another site and a broken Origin", () => {
    expect(sameOrigin(post({ host: "studio.example.com", origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(post({ host: "studio.example.com", origin: "null" }))).toBe(false);
  });

  it("behind a proxy compares with the host the browser used", () => {
    const headers = { host: "studio:3000", "x-forwarded-host": "studio.example.com" };
    expect(sameOrigin(post({ ...headers, origin: "https://studio.example.com" }))).toBe(true);
    expect(sameOrigin(post({ ...headers, origin: "http://studio:3000" }))).toBe(false);
  });

  it("lets a request without Origin through (SameSite=Lax still keeps the cookie off cross-site posts)", () => {
    expect(sameOrigin(post({ host: "studio.example.com" }))).toBe(true);
  });
});

describe("size messages", () => {
  it("carry the api's own limit instead of a fixed number", () => {
    const problem = { type: "x", title: "t", status: 413, code: "PAYLOAD_TOO_LARGE", detail: "an asset is at most 5 MB" };
    expect(problemMessage(problem as never)).toContain("5 MB");
  });
});
