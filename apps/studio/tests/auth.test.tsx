import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "@/components/AuthForm";
import { problemMessage } from "@/lib/messages";

afterEach(cleanup);

describe("problemMessage", () => {
  const problem = (code: string, extra = {}) => ({ type: "x", title: "t", status: 400, code, ...extra }) as never;

  it("speaks Thai for what the user can fix", () => {
    expect(problemMessage(problem("UNAUTHORIZED"))).toBe("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    expect(problemMessage(problem("RATE_LIMITED"))).toContain("รอสักครู่");
    expect(problemMessage(problem("SETUP_TOKEN_INVALID"))).toContain("setup token");
  });

  it("names the field of an INPUT_INVALID and falls back to the api detail", () => {
    const invalid = problem("INPUT_INVALID", { problems: [{ severity: "error", code: "INPUT_INVALID", message: "m", pointer: "/password" }] });
    expect(problemMessage(invalid)).toContain("12–200");
    expect(problemMessage(problem("CONFLICT", { detail: "already there" }))).toBe("already there");
  });
});

describe("AuthForm", () => {
  it("submits the fields and shows the action's error", async () => {
    const action = vi.fn(async (_state: unknown, form: FormData) => ({
      error: form.get("username") === "alice" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : null,
      values: { username: String(form.get("username")) },
    }));
    render(
      <AuthForm
        action={action}
        submit="เข้าสู่ระบบ"
        fields={[
          { name: "username", label: "ชื่อผู้ใช้" },
          { name: "password", label: "รหัสผ่าน", type: "password" },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("ชื่อผู้ใช้"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
    expect((await screen.findByRole("alert")).textContent).toBe("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("รหัสผ่าน").getAttribute("type")).toBe("password");
    // the username survives React's form reset; the password does not come back
    await waitFor(() => expect((screen.getByLabelText("ชื่อผู้ใช้") as HTMLInputElement).value).toBe("alice"));
    expect((screen.getByLabelText("รหัสผ่าน") as HTMLInputElement).value).toBe("");
  });
});
