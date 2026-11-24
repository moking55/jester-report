// v1.11 (tasks/v1.11/todo.md T12): tag a report with colours, filter the catalog by them, issue a document that starts with
// the report's tags, change the document's tags, filter the documents page; tagging changes nothing about the report;
// duplicate and export/import carry tags. Own template and tag names, so it does not disturb the other specs.
import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { createReport, login, pdfInfo, previewPdf } from "./shared";

const ID = "e2e-tags";
const NAME = "แท็ก E2E";
const VIP = "e2e-vip";
const RED = "#c0392b"; // COLOR_BASE.red in lib/tags.ts

const reportRow = (page: Page, id: string) =>
  page.getByRole("row").filter({ has: page.locator(`a[href="/templates/${id}"]`) });

async function editReportTags(page: Page, id: string, name: string, edit: (dialog: Locator) => Promise<void>) {
  await page.goto("/");
  await page.getByLabel(`เมนูของ ${id}`, { exact: true }).click();
  await reportRow(page, id).getByRole("button", { name: "แก้ tag…" }).click();
  const dialog = page.getByRole("dialog", { name: `แก้ tag ของ ${name}` });
  await edit(dialog);
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
}

const add = async (dialog: Locator, tag: string) => {
  const box = dialog.getByRole("combobox", { name: "tag" });
  await box.fill(tag);
  await box.press("Enter");
};

const baseOf = (chip: Locator) => chip.evaluate((el) => (el.parentElement as HTMLElement).style.getPropertyValue("--tag-base"));

test("tag a report and its documents, colour them, filter by them", async ({ page }) => {
  test.skip(!process.env.STUDIO_E2E_API_URL, "STUDIO_E2E_API_URL is not set");
  test.setTimeout(300_000);
  await login(page);

  // a quotation, published as v1; its preview PDF now, to compare with after tagging
  await createReport(page, ID, NAME, "ใบเสนอราคา");
  await page.getByRole("button", { name: "Publish" }).click();
  const publish = page.getByRole("dialog", { name: "Publish" });
  await publish.getByRole("button", { name: "Publish" }).click();
  await expect(publish).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "true");
  const params = JSON.stringify({ quoteId: "Q-TAG", docDate: "2026-11-19" });
  const before = pdfInfo(await previewPdf(page, ID, params));

  // 1. tag it from the catalog menu: two tags, one coloured red (the colour belongs to the tag name)
  await editReportTags(page, ID, NAME, async (dialog) => {
    await add(dialog, VIP);
    await add(dialog, "ลูกค้า-ก");
    await dialog.getByRole("button", { name: `สีของ ${VIP}` }).click();
    await dialog.getByRole("radio", { name: "แดง" }).check();
  });
  const row = reportRow(page, ID);
  await expect(row.getByText(VIP, { exact: true })).toBeVisible();
  await expect(row.getByText("ลูกค้า-ก", { exact: true })).toBeVisible();
  await expect.poll(() => baseOf(row.getByText(VIP, { exact: true }))).toBe(RED);
  await expect.poll(() => baseOf(row.getByText("ลูกค้า-ก", { exact: true }))).not.toBe(RED); // still gray
  await page.reload();
  await expect(reportRow(page, ID).getByText(VIP, { exact: true })).toBeVisible(); // after a reload too

  // tags are not part of the report: not "แก้หลัง publish", and the PDF is the same
  await expect(reportRow(page, ID)).not.toContainText("แก้หลัง publish");
  const after = pdfInfo(await previewPdf(page, ID, params));
  if (before && after) expect(after.map((p) => p.text)).toEqual(before.map((p) => p.text));

  // 2. the catalog filter: choosing a tag narrows to the reports that have it
  const filter = page.getByRole("group", { name: /กรองด้วย tag/ });
  await filter.getByRole("button", { name: VIP, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`tag=${VIP}`));
  await expect(page.getByRole("row")).toHaveCount(2); // the header and e2e-tags
  await expect(reportRow(page, ID)).toBeVisible();
  await page.getByRole("button", { name: "ล้าง tag" }).click();
  await expect(page).not.toHaveURL(/tag=/);
  await page.getByRole("searchbox", { name: "ค้นหาชื่อหรือ id" }).fill("ลูกค้า-ก"); // the search box finds tags too
  await expect(reportRow(page, ID)).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(2);

  // 3. issue a document: the form starts with the report's tags; change them before issuing
  await page.goto(`/templates/${ID}?mode=issue`);
  await expect(page.getByRole("form", { name: "ฟอร์มออกเอกสาร" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `ลบ tag ${VIP}` })).toBeVisible();
  await page.getByRole("button", { name: "ลบ tag ลูกค้า-ก" }).click();
  const docTag = page.getByRole("combobox", { name: "tag ของเอกสาร" });
  await docTag.fill("ไตรมาส 4");
  await docTag.press("Enter");
  await page.getByLabel("เลขที่ใบเสนอราคา").fill("Q-TAG");
  if ((await page.locator("#f-data-items-0-id").count()) === 0) await page.getByRole("button", { name: "+ เพิ่มแถว" }).click();
  for (const [pointer, value] of [
    ["/params/docDate", "2026-11-19"],
    ["/data/company/name", "บริษัท ผู้ขาย จำกัด"],
    ["/data/customer/name", "บริษัท สมชาย จำกัด"],
    ["/data/discount", "0"],
    ["/data/items/0/id", "A"],
    ["/data/items/0/description", "บริการติดตั้ง"],
    ["/data/items/0/qty", "1"],
    ["/data/items/0/unitPrice", "1500.00"],
  ]) {
    await page.locator(`#f${pointer.replaceAll("/", "-")}`).fill(value);
  }
  const issued = page.waitForResponse((r) => r.url().endsWith(`/issue/${ID}`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "ออก PDF" }).click();
  expect((await issued).status()).toBe(200);
  await expect(page.getByRole("status").getByText("เก็บแล้ว")).toBeVisible();

  // 4. the documents page: the document carries the tags as issued; the red follows the tag name
  await page.goto(`/documents?template=${ID}`);
  const doc = page.locator("div").filter({ has: page.getByRole("link", { name: "ดาวน์โหลด" }) }).last();
  await expect(doc.getByText(VIP, { exact: true })).toBeVisible();
  await expect(doc.getByText("ไตรมาส 4", { exact: true })).toBeVisible();
  await expect(doc.getByText("ลูกค้า-ก", { exact: true })).toHaveCount(0);
  await expect.poll(() => baseOf(doc.getByText(VIP, { exact: true }))).toBe(RED);

  // 5. change the document's tags from its row
  await doc.getByRole("button", { name: "แก้ tag" }).click();
  const dialog = page.getByRole("dialog", { name: /แก้ tag ของ/ });
  await dialog.getByRole("button", { name: "ลบ tag ไตรมาส 4" }).click();
  await add(dialog, "อนุมัติแล้ว");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(doc.getByText("อนุมัติแล้ว", { exact: true })).toBeVisible();
  await expect(doc.getByText("ไตรมาส 4", { exact: true })).toHaveCount(0);

  // editing the report's tags later does not reach the document already issued
  await editReportTags(page, ID, NAME, (d) => add(d, "ใหม่"));
  await page.goto(`/documents?template=${ID}`);
  const again = page.locator("div").filter({ has: page.getByRole("link", { name: "ดาวน์โหลด" }) }).last();
  await expect(again.getByText("อนุมัติแล้ว", { exact: true })).toBeVisible();
  await expect(again.getByText("ใหม่", { exact: true })).toHaveCount(0);

  // 6. the documents filter: checkboxes in the search form, every chosen tag must be there
  await page.getByRole("checkbox", { name: "อนุมัติแล้ว" }).check();
  await page.getByRole("button", { name: "ค้นหา" }).click();
  await expect(page).toHaveURL(/tag=/);
  await expect(page.getByRole("link", { name: "ดาวน์โหลด" })).toHaveCount(1);
  await page.getByRole("checkbox", { name: VIP }).check();
  await page.getByRole("button", { name: "ค้นหา" }).click();
  await expect(page.getByRole("link", { name: "ดาวน์โหลด" })).toHaveCount(1); // has both
  await page.goto(`/documents?template=${ID}&tag=${encodeURIComponent("ไตรมาส 4")}`);
  await expect(page.getByText("ไม่พบเอกสารที่ตรงกับ tag ไตรมาส 4")).toBeVisible(); // no longer has it

  // 7. duplicate and export/import take the tags along
  await page.goto("/");
  await page.getByLabel(`เมนูของ ${ID}`, { exact: true }).click();
  await reportRow(page, ID).getByRole("button", { name: "ทำสำเนา…" }).click();
  const copyDialog = page.getByRole("dialog", { name: `ทำสำเนา ${ID}` });
  await copyDialog.getByLabel("id ใหม่").fill("e2e-tags-copy");
  await copyDialog.getByLabel("ชื่อรายงาน").fill("สำเนา แท็ก E2E");
  await copyDialog.getByRole("button", { name: "ทำสำเนา", exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/e2e-tags-copy$/, { timeout: 30_000 });
  await page.goto("/");
  await expect(reportRow(page, "e2e-tags-copy").getByText(VIP, { exact: true })).toBeVisible();

  await page.getByLabel(`เมนูของ ${ID}`, { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export draft (.zip)" }).first().click();
  const zip = await readFile(await (await download).path());
  await page.goto("/");
  await page.getByRole("button", { name: "นำเข้า (.zip)" }).click();
  const importDialog = page.getByRole("dialog", { name: "นำเข้ารายงาน" });
  await importDialog.getByLabel("ไฟล์ zip ที่ export จาก Jester").setInputFiles({ name: "report.zip", mimeType: "application/zip", buffer: zip });
  await expect(importDialog.getByText("รายงานในไฟล์:")).toBeVisible();
  await importDialog.getByLabel("id ปลายทาง").fill("e2e-tags-in");
  await importDialog.getByRole("button", { name: "นำเข้า", exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/e2e-tags-in$/, { timeout: 30_000 });
  await page.goto("/");
  await expect(reportRow(page, "e2e-tags-in").getByText(VIP, { exact: true })).toBeVisible();
  await expect(reportRow(page, "e2e-tags-in").getByText("ใหม่", { exact: true })).toBeVisible();
});
