// v1.14: Studio's route handlers pass the blank form on to the api (/preview: "ดูแบบฟอร์มเปล่า", /issue: the checkbox)
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/api-core";

const apiRaw = vi.fn();
vi.mock("@/lib/api", () => ({ apiRaw: (...args: unknown[]) => apiRaw(...args), ApiProblem }));

const { POST: preview } = await import("@/app/preview/[id]/route");
const { POST: issue } = await import("@/app/issue/[id]/route");
const ctx = { params: Promise.resolve({ id: "quote" }) };

const form = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://studio/preview/quote", { method: "POST", body });
};
const issueBody = '{"template":{"id":"quote","version":"published"},"params":{},"data":{}}';

beforeEach(() => {
  apiRaw.mockReset();
  apiRaw.mockResolvedValue(new Response("%PDF", { headers: { "Content-Type": "application/pdf" } }));
});

describe("preview of the draft", () => {
  it("ดูแบบฟอร์มเปล่า: allowEmpty and empty data", async () => {
    await preview(form({ params: "", blank: "1" }), ctx);
    expect(apiRaw).toHaveBeenCalledWith("/v1/templates/quote/draft/preview?allowEmpty=true", {
      method: "POST",
      body: { params: {}, data: {} },
    });
  });

  it("unticked: the sample file, as before", async () => {
    await preview(form({ params: "" }), ctx);
    expect(apiRaw).toHaveBeenCalledWith("/v1/templates/quote/draft/preview", { method: "POST", body: { params: {} } });
  });
});

describe("issue", () => {
  it("?allowEmpty=true goes on to /v1/render", async () => {
    await issue(new Request("http://studio/issue/quote?allowEmpty=true", { method: "POST", body: issueBody }), ctx);
    expect(apiRaw).toHaveBeenCalledWith("/v1/render?allowEmpty=true", { method: "POST", json: issueBody });
  });

  it("anything but exactly true is a normal render", async () => {
    await issue(new Request("http://studio/issue/quote?allowEmpty=yes", { method: "POST", body: issueBody }), ctx);
    expect(apiRaw).toHaveBeenCalledWith("/v1/render", { method: "POST", json: issueBody });
  });
});
