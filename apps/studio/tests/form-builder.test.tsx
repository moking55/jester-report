import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const saved: { name: string; text: string; revision: number }[] = [];
vi.mock("@/lib/actions/draft", () => ({
  saveFile: vi.fn(async (_id: string, name: string, text: string, revision: number) => {
    saved.push({ name, text, revision });
    return { ok: true, data: { revision: revision + 1 } };
  }),
  deleteFile: vi.fn(async (_id: string, _name: string, revision: number) => ({ ok: true, data: { revision: revision + 1 } })),
  validateDraft: vi.fn(async () => ({ ok: true, data: { problems: [] } })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { FormBuilder } from "@/components/FormBuilder";

afterEach(() => {
  cleanup();
  saved.length = 0;
});

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const files = (name: string) =>
  readdirSync(join(STARTERS, name)).map((f) => ({ name: f, content: readFileSync(join(STARTERS, name, f), "utf8"), sha256: "" }));

describe("FormBuilder", () => {
  it("adds a field from the palette, edits its label, saves only the changed files in order", async () => {
    render(<FormBuilder templateId="t1" name="ทดสอบ" revision={4} files={files("blank")} archived={false} />);
    expect(screen.getByRole("button", { name: "บันทึก" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "เงิน" }));
    expect(document.querySelector('[data-pointer="/data/field1"]')).toBeTruthy();

    const label = screen.getByLabelText("ป้าย") as HTMLInputElement; // the new field is selected
    fireEvent.blur(label, { target: { value: "ยอดเงิน" } });
    expect(document.querySelector('[data-pointer="/data/field1"]')!.textContent).toContain("ยอดเงิน");

    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.getByText("บันทึกแล้ว 2 ไฟล์")).toBeTruthy());
    expect(saved.map((s) => [s.name, s.revision])).toEqual([
      ["data.schema.json", 4],
      ["form.json", 5],
    ]);
    expect(JSON.parse(saved[0].text).properties.field1).toEqual({ title: "ยอดเงิน", type: "string", format: "decimal" });
    expect(screen.getByText("ไม่มี problem")).toBeTruthy();
  });

  it("shows a refusal in Thai and keeps the field as it was", () => {
    render(<FormBuilder templateId="t1" name="ทดสอบ" revision={1} files={files("blank")} archived={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^หัวเรื่อง/ }));
    const key = screen.getByLabelText("key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "1bad" } });
    expect(screen.getByText(/ต้องขึ้นต้นด้วยตัวอักษรอังกฤษ/)).toBeTruthy();
  });

  it("is read-only when archived: no palette, no save", () => {
    render(<FormBuilder templateId="t1" name="ทดสอบ" revision={1} files={files("quotation")} archived />);
    expect(screen.queryByRole("complementary", { name: "ชนิดช่อง" })).toBeNull();
    expect(screen.getByRole("button", { name: "บันทึก" })).toHaveProperty("disabled", true);
    expect(document.querySelector('[data-pointer="/data/items/qty"]')).toBeTruthy();
  });
});
