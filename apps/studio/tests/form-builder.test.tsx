import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormBuilder, FormPreview } from "@/components/FormBuilder";

afterEach(cleanup);

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const files = (name: string): Record<string, string> =>
  Object.fromEntries(readdirSync(join(STARTERS, name)).map((f) => [f, readFileSync(join(STARTERS, name, f), "utf8")]));

describe("FormBuilder in the code view", () => {
  it("hands every edit to the editor as file texts: schema and form.json", () => {
    const onChange = vi.fn();
    render(<FormBuilder files={files("blank")} readOnly={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "เงิน" }));
    expect(document.querySelector('[data-pointer="/data/field1"]')).toBeTruthy();
    let last = onChange.mock.lastCall![0] as Record<string, string | null>;
    expect(JSON.parse(last["data.schema.json"]!).properties.field1).toEqual({ title: "เงิน", type: "string", format: "decimal" });
    expect(JSON.parse(last["form.json"]!).fields).toEqual({ "/data/field1": { widget: "money" } });

    const label = screen.getByLabelText("ป้าย") as HTMLInputElement; // the new field is selected
    fireEvent.blur(label, { target: { value: "ยอดเงิน" } });
    last = onChange.mock.lastCall![0];
    expect(JSON.parse(last["data.schema.json"]!).properties.field1.title).toBe("ยอดเงิน");
    expect(document.querySelector('[data-pointer="/data/field1"]')!.textContent).toContain("ยอดเงิน");
  });

  it("shows a refusal in Thai and changes nothing", () => {
    const onChange = vi.fn();
    render(<FormBuilder files={files("blank")} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^หัวเรื่อง/ }));
    fireEvent.change(screen.getByLabelText("key"), { target: { value: "1bad" } });
    expect(screen.getByText(/ต้องขึ้นต้นด้วยตัวอักษรอังกฤษ/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is read-only when archived: no palette", () => {
    render(<FormBuilder files={files("quotation")} readOnly onChange={vi.fn()} />);
    expect(screen.queryByRole("complementary", { name: "ชนิดช่อง" })).toBeNull();
    expect(document.querySelector('[data-pointer="/data/items/qty"]')).toBeTruthy();
  });

  it("asks before renaming a field a template uses, and does nothing when the answer is no", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = vi.fn();
    render(<FormBuilder files={files("quotation")} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^ลูกค้า/ }));
    fireEvent.change(screen.getByLabelText("key"), { target: { value: "client" } });
    fireEvent.blur(screen.getByLabelText("key"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("template.html"));
    expect(onChange).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("key"), { target: { value: "client" } });
    fireEvent.blur(screen.getByLabelText("key"));
    expect(document.querySelector('[data-pointer="/data/client"]')).toBeTruthy();
    confirm.mockRestore();
  });

  it("names the list when removing a table report.json uses", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FormBuilder files={files("quotation")} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ลบ รายการ" }));
    expect(screen.getByRole("alert").textContent).toContain("lists.items");
    expect(document.querySelector('[data-pointer="/data/items"]')).toBeTruthy();
    confirm.mockRestore();
  });
});

describe("Form Preview", () => {
  it("is the real issue form from unsaved files; it checks and never sends", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const draft = files("blank");
    draft["form.json"] = JSON.stringify({ formVersion: 1, fields: { "/data/title": { widget: "textarea" } } });
    render(<FormPreview files={draft} templateId="t1" />);
    const form = screen.getByRole("form", { name: "ฟอร์มออกเอกสาร" });
    expect(form.textContent).toContain("ตัวอย่างจากที่ยังไม่บันทึก");
    expect(form.querySelector('[data-pointer="/data/title"] textarea')).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ออก PDF" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ตรวจฟอร์ม" }));
    expect(screen.getByText("กรุณากรอกช่องนี้")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("says so when the files are not valid JSON", () => {
    render(<FormPreview files={{ ...files("blank"), "data.schema.json": "{" }} templateId="t1" />);
    expect(document.body.textContent).toContain("แสดงตัวอย่างฟอร์มไม่ได้");
  });
});
