import { describe, expect, it } from "vitest";

import { keyOptions } from "@/lib/keys";

const TODAY = "2026-11-18";
const none = { expires: "", templates: [], limit: "" };

describe("keyOptions", () => {
  it("sends nothing extra when nothing is set (templates: undefined, not [])", () => {
    expect(keyOptions(none, TODAY)).toEqual({ ok: true, options: {} });
  });

  it("turns a date into the end of that day in Thailand", () => {
    expect(keyOptions({ ...none, expires: "2026-12-31" }, TODAY)).toEqual({
      ok: true,
      options: { expiresAt: "2026-12-31T23:59:59+07:00" },
    });
    expect(keyOptions({ ...none, expires: "2031-11-18" }, TODAY).ok).toBe(true);
  });

  it.each(["2026-11-18", "2026-01-01", "2031-11-19", "31/12/2026"])("refuses the date %s", (expires) => {
    expect(keyOptions({ ...none, expires }, TODAY).ok).toBe(false);
  });

  it("keeps chosen templates once each", () => {
    expect(keyOptions({ ...none, templates: ["quote", "invoice", "quote"] }, TODAY)).toEqual({
      ok: true,
      options: { templates: ["quote", "invoice"] },
    });
  });

  it.each(["0", "10001", "2.5", "abc"])("refuses the limit %s", (limit) => {
    expect(keyOptions({ ...none, limit }, TODAY).ok).toBe(false);
  });

  it("takes a limit from 1 to 10000", () => {
    expect(keyOptions({ ...none, limit: "60" }, TODAY)).toEqual({ ok: true, options: { rateLimitPerMinute: 60 } });
  });
});
