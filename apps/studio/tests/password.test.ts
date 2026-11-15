import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/api-core";

const api = vi.fn();
const clearSession = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...args: unknown[]) => api(...args), ApiProblem }));
vi.mock("@/lib/session", () => ({ clearSession: () => clearSession() }));
vi.mock("@/lib/current", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

const { changePassword } = await import("@/lib/actions/settings");

const unauthorized = new ApiProblem(401, {
  type: "about:blank",
  title: "Unauthorized",
  status: 401,
  code: "UNAUTHORIZED",
  retryable: false,
});

function form(current: string, next: string, confirm = next) {
  const data = new FormData();
  data.set("currentPassword", current);
  data.set("newPassword", next);
  data.set("confirm", confirm);
  return data;
}

describe("changePassword", () => {
  beforeEach(() => {
    api.mockReset();
    clearSession.mockReset();
  });

  it("keeps the user signed in when only the current password was wrong", async () => {
    api.mockImplementation(async (path: string) => {
      if (path === "/v1/auth/password") throw unauthorized;
      return { id: "u1" }; // /v1/auth/me still answers: the session is fine
    });
    const state = await changePassword({ error: null }, form("wrong", "a-new-password-1"));
    expect(state.error).toBe("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("signs out when the session itself has ended", async () => {
    api.mockRejectedValue(unauthorized); // the password call and /v1/auth/me both get 401
    await expect(changePassword({ error: null }, form("any", "a-new-password-1"))).rejects.toThrow(
      "redirect /login",
    );
    expect(clearSession).toHaveBeenCalledOnce();
  });

  it("never calls the api when the two new passwords differ", async () => {
    const state = await changePassword({ error: null }, form("current", "a-new-password-1", "a-new-password-2"));
    expect(state.error).toBe("รหัสผ่านใหม่สองช่องไม่ตรงกัน");
    expect(api).not.toHaveBeenCalled();
  });
});
