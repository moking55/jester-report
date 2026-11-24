// v1.15 (tasks/v1.15/todo.md T9): a Word form imported from the catalog opens in the Designer and previews.
// Uses the api's generated fixture (form.docx); makes its own report (E2E_DOCX_SUFFIX reruns on a used stack).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { login, pdfInfo, thai } from "./shared";

test.use({ viewport: { width: 1600, height: 900 } });

const ID = `e2e-word${process.env.E2E_DOCX_SUFFIX ?? ""}`;
const FORM = join(process.cwd(), "../api/tests/template_store/fixtures/docx/form.docx"); // Playwright runs from apps/studio

test("import a Word form, land in the Designer, preview one page", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto("/");
  await page.getByRole("button", { name: "นำเข้า Word (.docx)" }).click();
  const dialog = page.getByRole("dialog", { name: "นำเข้าแบบฟอร์ม Word" });
  await dialog.getByLabel(/แบบฟอร์ม Word/).setInputFiles({
    name: "แบบคำขอเบิกพัสดุ.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await readFile(FORM),
  });
  await expect(dialog.getByLabel("ชื่อรายงาน")).toHaveValue("แบบคำขอเบิกพัสดุ");
  await expect(dialog.getByLabel("id ปลายทาง")).toHaveValue(/^form-\d{8}$/); // a Thai-only file name
  await dialog.getByLabel("id ปลายทาง").fill(ID);
  await dialog.getByRole("button", { name: "นำเข้า", exact: true }).click();

  // no warnings for this form: straight into the Designer, with the converted blocks on the paper
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}/designer$`), { timeout: 30_000 });
  const paper = page.locator("[data-paper]");
  await expect(paper).toBeVisible();
  const paperText = await paper.evaluate((el) => el.shadowRoot?.textContent ?? el.textContent ?? "");
  expect(paperText).toContain("แบบคำขอเบิกพัสดุ");
  expect(paperText).toContain("หมายเหตุ");

  const preview = await page.request.post(`/preview/${ID}`, { multipart: { params: "{}" } });
  expect(preview.status(), await preview.text().catch(() => "")).toBe(200);
  const pages = pdfInfo(Buffer.from(await preview.body()));
  if (pages) {
    expect(pages).toHaveLength(1);
    expect(thai(pages[0].text)).toContain(thai("ผู้อนุมัติ"));
  }

  // the same id again: a Word file never replaces a report
  await page.goto("/");
  await page.getByRole("button", { name: "นำเข้า Word (.docx)" }).click();
  await dialog.getByLabel(/แบบฟอร์ม Word/).setInputFiles({
    name: "form.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await readFile(FORM),
  });
  await dialog.getByLabel("id ปลายทาง").fill(ID);
  await dialog.getByRole("button", { name: "นำเข้า", exact: true }).click();
  await expect(dialog.getByText(/มีรายงาน id นี้อยู่แล้ว ใช้ id ใหม่/)).toBeVisible();
});
