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

describe("FormBuilder preview and confirms (T9)", () => {
  it("previews the real issue form from unsaved edits; it checks and never sends", () => {
    render(<FormBuilder templateId="t1" name="ทดสอบ" revision={1} files={files("blank")} archived={false} />);
    fireEvent.click(screen.getByRole("button", { name: "ข้อความหลายบรรทัด" }));
    fireEvent.click(screen.getByRole("tab", { name: "ตัวอย่างฟอร์ม" }));
    const form = screen.getByRole("form", { name: "ฟอร์มออกเอกสาร" });
    expect(form.textContent).toContain("ตัวอย่างจากที่ยังไม่บันทึก");
    expect(form.querySelector('[data-pointer="/data/field1"] textarea')).toBeTruthy(); // widget from the unsaved form.json
    expect(screen.queryByRole("button", { name: "ออก PDF" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ตรวจฟอร์ม" }));
    expect(saved).toEqual([]);
  });

  it("asks before renaming a field a template uses, and does nothing when the answer is no", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FormBuilder templateId="t1" name="ทดสอบ" revision={1} files={files("quotation")} archived={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^ลูกค้า/ }));
    const key = screen.getByLabelText("key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "client" } });
    fireEvent.blur(key);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("template.html"));
    expect(document.querySelector('[data-pointer="/data/customer"]')).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("key"), { target: { value: "client" } });
    fireEvent.blur(screen.getByLabelText("key"));
    expect(document.querySelector('[data-pointer="/data/client"]')).toBeTruthy();
    confirm.mockRestore();
  });

  it("names the list when removing a table report.json uses", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FormBuilder templateId="t1" name="ทดสอบ" revision={1} files={files("quotation")} archived={false} />);
    fireEvent.click(screen.getByRole("button", { name: "ลบ รายการ" }));
    expect(screen.getByRole("alert").textContent).toContain("lists.items");
    expect(document.querySelector('[data-pointer="/data/items"]')).toBeTruthy();
    confirm.mockRestore();
  });
});
