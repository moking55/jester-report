import { describe, expect, it } from "vitest";

import { curlExample, renderBody } from "@/lib/render";

const form = { templateId: "quotation", version: "published", params: '{"quoteId":"Q-1"}', data: "{}", filename: "" };

describe("render request", () => {
  it("keeps the user's numbers exactly as typed", () => {
    const result = renderBody({ ...form, data: '{"amount": 12345678901234567.89}' });
    expect("body" in result && result.body).toContain("12345678901234567.89");
  });

  it("builds the contract's shape", () => {
    const result = renderBody({ ...form, version: "3", filename: 'Q-1 "a".pdf' });
    expect(JSON.parse((result as { body: string }).body)).toEqual({
      template: { id: "quotation", version: 3 },
      params: { quoteId: "Q-1" },
      data: {},
      filename: 'Q-1 "a".pdf',
    });
  });

  it("refuses broken JSON and odd versions", () => {
    expect(renderBody({ ...form, data: "{nope" })).toHaveProperty("error");
    expect(renderBody({ ...form, params: "[1]" })).toHaveProperty("error");
    expect(renderBody({ ...form, version: "1,2" })).toHaveProperty("error");
  });
});

describe("curl example", () => {
  it("uses a placeholder key and survives single quotes in the data", () => {
    const curl = curlExample(`{"data":{"name":"O'Brien"}}`);
    expect(curl).toContain("Bearer jrk_…");
    expect(curl).toContain(`O'\\''Brien`);
    expect(curl).not.toMatch(/jrk_[A-Za-z0-9]/);
  });
});
