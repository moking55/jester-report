// @vitest-environment node
// v1.14.1: /import passes "replace the archived report" on to the api only after the user confirmed.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/api-core";

const api = vi.fn();
const apiRaw = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiRaw: (...args: unknown[]) => apiRaw(...args),
  ApiProblem,
}));

const { POST: importRoute } = await import("@/app/import/route");

const upload = (fields: Record<string, string>) => {
  const body = new FormData();
  body.set("file", new File(["PK"], "quote.zip"));
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://studio/import", { method: "POST", body });
};

describe("/import route", () => {
  beforeEach(() => {
    api.mockReset();
    apiRaw.mockReset();
    api.mockResolvedValue({ draftRevision: 7 });
    apiRaw.mockResolvedValue(Response.json({ template: { id: "quote" } }));
  });

  it("unarchive=1 with overwrite sends unarchive=true and the current revision", async () => {
    await importRoute(upload({ templateId: "quote", overwrite: "1", unarchive: "1" }));
    const [path, options] = apiRaw.mock.calls[0];
    expect(path).toBe("/v1/templates/import");
    expect(options.ifMatch).toBe(7);
    expect(options.form.get("unarchive")).toBe("true");
  });

  it("an import that was not confirmed does not unarchive", async () => {
    await importRoute(upload({ templateId: "quote", overwrite: "1" }));
    expect(apiRaw.mock.calls[0][1].form.get("unarchive")).toBeNull();
  });

  it("unarchive without overwrite is refused before anything is sent", async () => {
    const response = await importRoute(upload({ templateId: "quote", unarchive: "1" }));
    expect(response.status).toBe(422);
    expect(apiRaw).not.toHaveBeenCalled();
  });
});
