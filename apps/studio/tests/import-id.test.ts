import { describe, expect, it } from "vitest";

import { idFromFile, nameFromFile } from "@/lib/import-id";

const day = new Date("2026-11-24T10:00:00Z");

describe("id and name from a Word file's name (v1.15)", () => {
  it.each([
    ["Purchase Request Form.docx", "purchase-request-form"],
    ["PO_2026 (v2).DOCX", "po-2026-v2"],
    ["แบบคำขอเบิกพัสดุ.docx", "form-20261124"],
    ["ใบขอ-Leave Form.docx", "leave-form"],
    ["x.docx", "form-20261124"], // one character is not an id
    [`${"a".repeat(80)}.docx`, "a".repeat(62)],
  ])("%s -> %s", (file, id) => expect(idFromFile(file, day)).toBe(id));

  it("the name is the file name without .docx", () => {
    expect(nameFromFile("  แบบคำขอ   เบิกพัสดุ.docx")).toBe("แบบคำขอ เบิกพัสดุ");
    expect(nameFromFile(".docx")).toBe("แบบฟอร์ม");
  });
});
