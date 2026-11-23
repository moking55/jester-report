// v1.14 (tasks/v1.14/todo.md T9): a blank form for handwriting, from the issue form and from the Designer's preview.
// SPEC-studio v1.14 Success Criteria 1, 2 and 4. Makes its own report (id below; E2E_BLANK_SUFFIX reruns on a stack that has it).
import { expect, test, type Page } from "@playwright/test";

import { createReport, login, pdfInfo, thai } from "./shared";

test.use({ viewport: { width: 1600, height: 900 } });

const ID = `e2e-blank${process.env.E2E_BLANK_SUFFIX ?? ""}`;
const field = (page: Page, pointer: string) => page.locator(`#f${pointer.replaceAll("/", "-")}`);

async function issuePdf(page: Page): Promise<Buffer> {
  const response = page.waitForResponse((r) => r.url().includes(`/issue/${ID}`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "ออก PDF" }).click();
  const pdf = await response;
  expect(pdf.url()).toContain("allowEmpty=true");
  expect(pdf.status(), await pdf.text().catch(() => "")).toBe(200);
  // the body of a response the page already read can come back empty: read the blob the page holds instead
  const href = await page.getByRole("link", { name: /ดาวน์โหลด/ }).first().getAttribute("href");
  return Buffer.from(await page.evaluate(async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())], href));
}

test("a blank form: issued with nothing filled, partly filled, and previewed from the Designer", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);

  // a report from the quotation starter (which ships with 10 blank rows), published
  await createReport(page, ID, "ใบเสนอราคา ฟอร์มเปล่า", "ใบเสนอราคา");
  await page.getByRole("button", { name: "Publish" }).click();
  const publish = page.getByRole("dialog", { name: "Publish" });
  await publish.getByRole("button", { name: "Publish" }).click();
  await expect(publish).toHaveCount(0);

  // 1. nothing filled: the required fields are not asked for, the PDF has no 0.00
  await page.goto(`/templates/${ID}?mode=issue`);
  const form = page.getByRole("form", { name: "ฟอร์มออกเอกสาร" });
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.getByLabel("ฟอร์มเปล่า (สำหรับเขียนมือ)").check();
  await expect(page.getByLabel("ชื่อไฟล์ (เว้นว่างได้)")).toHaveAttribute("placeholder", `${ID}-blank-v1.pdf`);
  const empty = await issuePdf(page);
  await expect(form.getByText("กรุณากรอกช่องนี้")).toHaveCount(0);
  const pages = pdfInfo(empty);
  if (pages) {
    expect(pages).toHaveLength(1);
    expect(pages[0].text).not.toContain("0.00");
    expect(pages[0].text).not.toContain("None");
    expect(thai(pages[0].text)).toContain(thai("ยอดสุทธิ")); // the labels are all there
  }

  // 2. a customer and two rows filled: those print, the rest stays blank
  await field(page, "/data/customer/name").fill("แผนกพัสดุ");
  await page.getByRole("button", { name: "+ เพิ่มแถว" }).click();
  await page.getByRole("button", { name: "+ เพิ่มแถว" }).click();
  await field(page, "/data/items/0/description").fill("ปากกาลูกลื่น");
  await field(page, "/data/items/1/description").fill("กระดาษ A4");
  const partly = pdfInfo(await issuePdf(page));
  if (partly) {
    expect(thai(partly[0].text)).toContain(thai("แผนกพัสดุ"));
    expect(thai(partly[0].text)).toContain(thai("ปากกาลูกลื่น"));
    expect(partly[0].text).not.toContain("0.00");
  }

  // the developer dialog shows the same call
  await page.getByRole("button", { name: "สำหรับนักพัฒนา" }).click();
  await expect(page.getByLabel("ตัวอย่าง curl")).toContainText("/v1/render?allowEmpty=true");
  await page.keyboard.press("Escape");

  // 4. in the Designer: 15 blank rows, saved, and the blank form previewed without publishing
  await page.goto(`/templates/${ID}/designer`);
  await page.locator("[data-paper] table th", { hasText: "รายการ" }).first().click();
  const rows = page.getByLabel("บรรทัดเปล่าในฟอร์มเปล่า (0–100)");
  await expect(rows).toHaveValue("10");
  await rows.fill("15");
  await rows.press("Enter");
  await page.keyboard.press("Control+s");
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible({ timeout: 30_000 });
  const preview = await page.request.post(`/preview/${ID}`, { multipart: { params: "{}", blank: "1" } });
  expect(preview.status(), await preview.text().catch(() => "")).toBe(200);
  const previewed = pdfInfo(Buffer.from(await preview.body()));
  if (previewed) expect(previewed[0].text).not.toContain("0.00");
  await page.reload();
  await page.locator("[data-paper] table th", { hasText: "รายการ" }).first().click();
  await expect(page.getByLabel("บรรทัดเปล่าในฟอร์มเปล่า (0–100)")).toHaveValue("15");
});
