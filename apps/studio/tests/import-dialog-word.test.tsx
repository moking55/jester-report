// v1.15: a Word file in the import dialog: suggested id and name, never a replace, warnings before the Designer.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { ImportDialog } = await import("@/components/ImportDialog");

const fetchMock = vi.fn();
const created = (warnings: { code: string; message: string }[]) =>
  Response.json({ template: { id: "purchase-request" }, revision: 1, created: true, warnings }, { status: 201 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  push.mockReset();
});

function pick(fileName: string) {
  vi.stubGlobal("fetch", fetchMock);
  HTMLDialogElement.prototype.showModal ??= vi.fn();
  HTMLDialogElement.prototype.close ??= vi.fn();
  render(<ImportDialog word />);
  fireEvent.change(screen.getByLabelText(/แบบฟอร์ม Word \(\.docx\)/), { target: { files: [new File(["PK"], fileName)] } });
}

const submit = () => fireEvent.submit(document.querySelector("form")!);

describe("ImportDialog with a Word file", () => {
  it("suggests the id and name, sends name and no overwrite, then opens the Designer", async () => {
    fetchMock.mockResolvedValueOnce(created([]));
    pick("Purchase Request.docx");
    expect((screen.getByLabelText("id ปลายทาง") as HTMLInputElement).value).toBe("purchase-request");
    expect((screen.getByLabelText("ชื่อรายงาน") as HTMLInputElement).value).toBe("Purchase Request");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/templates/purchase-request/designer"));
    const sent = fetchMock.mock.calls[0][1].body as FormData;
    expect([sent.get("templateId"), sent.get("name"), sent.get("overwrite"), sent.get("unarchive")]).toEqual([
      "purchase-request",
      "Purchase Request",
      null,
      null,
    ]);
  });

  it("lists what could not come over before opening the Designer", async () => {
    fetchMock.mockResolvedValueOnce(created([{ code: "DOCX_TEXTBOX", message: "ย่อหน้าที่ 4: text box ข้ามไป" }]));
    pick("Purchase Request.docx");
    submit();
    const item = await screen.findByText("ย่อหน้าที่ 4: text box ข้ามไป");
    expect(item.closest("dialog")?.getAttribute("aria-label")).toBe("ผลการนำเข้า Word"); // its own dialog on top
    expect(item.closest("dialog")).not.toBe(document.querySelector('dialog[aria-label="นำเข้าแบบฟอร์ม Word"]'));
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("เปิดใน Designer"));
    expect(push).toHaveBeenCalledWith("/templates/purchase-request/designer");
  });

  it("an id that exists says to use a new one; there is no replace for Word", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "CONFLICT", title: "Conflict", status: 409, detail: "exists" }, { status: 409 }),
    );
    pick("Purchase Request.docx");
    submit();
    expect(await screen.findByText(/มีรายงาน id นี้อยู่แล้ว ใช้ id ใหม่/)).toBeTruthy();
    expect(screen.queryByText("ทับ draft ของรายงานเดิม")).toBeNull();
    expect(screen.queryByText("ทับและเลิก archive")).toBeNull();
  });

  it("each button takes its own kind of file and points to the other", async () => {
    pick("report.zip");
    expect(await screen.findByText(/เลือกไฟล์ Word \(\.docx\)/)).toBeTruthy();
    cleanup();
    render(<ImportDialog />);
    fireEvent.change(screen.getByLabelText("ไฟล์ zip ที่ export จาก Jester"), {
      target: { files: [new File(["PK"], "form.docx")] },
    });
    expect(await screen.findByText(/ใช้ปุ่ม "นำเข้า Word \(\.docx\)"/)).toBeTruthy();
  });

  it("a Thai-only file name gets form-<date>", () => {
    pick("แบบคำขอเบิกพัสดุ.docx");
    expect((screen.getByLabelText("id ปลายทาง") as HTMLInputElement).value).toMatch(/^form-\d{8}$/);
    expect((screen.getByLabelText("ชื่อรายงาน") as HTMLInputElement).value).toBe("แบบคำขอเบิกพัสดุ");
  });
});
