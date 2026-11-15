import { describe, expect, it } from "vitest";

import { problemMessage } from "@/lib/messages";

const invalid = (pointer: string) => ({
  type: "about:blank",
  title: "Input invalid",
  status: 422,
  code: "INPUT_INVALID" as const,
  retryable: false,
  problems: [{ severity: "error" as const, code: "string_too_long", message: "too long", pointer }],
});

describe("problemMessage", () => {
  it("uses the form's own hint over the shared one for the same field name", () => {
    expect(problemMessage(invalid("/name"))).toContain("1–120");
    expect(problemMessage(invalid("/name"), { name: "ชื่อ key ต้องยาว 1–80 ตัวอักษร" })).toContain("1–80");
  });

  it("knows the new-password field", () => {
    expect(problemMessage(invalid("/newPassword"))).toContain("12–200");
  });
});
