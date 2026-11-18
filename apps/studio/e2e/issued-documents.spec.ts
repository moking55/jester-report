// v1.5 (tasks/v1.5/todo.md T10): a lead finds a document issued earlier, by its number, and downloads the same PDF;
// a document another system issued with an API key shows up too; a draft preview does not.
// Runs on the same fresh stack after checkpoint-a (it needs the E2E user) and after full-flow (which wants an
// empty catalog), so the file name sorts after both; makes its own template.
import { expect, test } from "@playwright/test";

import { login, watchRequests } from "./shared";

const ID = "e2e-docs";

test("find an issued document and download it again", async ({ page, request }) => {
  test.skip(!process.env.STUDIO_E2E_API_URL, "STUDIO_E2E_API_URL is not set");
  test.setTimeout(180_000);
  const apiOrigin = new URL(process.env.STUDIO_E2E_API_URL!).origin;
  const urls = watchRequests(page);
  await login(page);
  const number = `Q-E2E-${Date.now().toString(36).toUpperCase()}`;

  // a quotation, published as v1
  const create = page.getByRole("form", { name: "สร้างรายงาน" });
  await create.getByLabel("id", { exact: true }).fill(ID);
  await create.getByLabel("ชื่อรายงาน").fill("เอกสาร E2E");
  await create.getByLabel("เริ่มจาก").selectOption({ label: "ใบเสนอราคา" });
  await create.getByRole("button", { name: "สร้างรายงาน" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}$`), { timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).click();
  const publish = page.getByRole("dialog", { name: "Publish" });
  await publish.getByRole("button", { name: "Publish" }).click();
  await expect(publish).toHaveCount(0);

  // issued from the form: the page says it was kept
  await page.goto(`/templates/${ID}?mode=issue`);
  await page.getByRole("button", { name: "ใช้ข้อมูลตัวอย่าง" }).click();
  await page.getByLabel("เลขที่ใบเสนอราคา").fill(number);
  await page.locator("#f-params-docDate").fill("2026-11-19");
  const response = page.waitForResponse((r) => r.url().endsWith(`/issue/${ID}`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "ออก PDF" }).click();
  const issued = await response;
  expect(issued.status(), await issued.text().catch(() => "")).toBe(200);
  const issuedPdf = await issued.body();
  const runId = issued.headers()["jester-run-id"];
  expect(runId).toMatch(/^[0-9a-f]{22}$/);
  await expect(page.getByRole("status").getByText("เก็บแล้ว")).toBeVisible();

  // a draft preview is not a document
  await page.getByRole("button", { name: "กลับไปแก้ code" }).click();
  await expect(page.getByRole("navigation", { name: "ไฟล์" })).toBeVisible({ timeout: 30_000 });

  // another system issues one with an API key
  await page.goto("/settings?tab=keys");
  await page.getByLabel("ชื่อ (เช่น ระบบที่จะใช้)").fill("e2e-billing");
  await page.getByRole("button", { name: "สร้าง key" }).click();
  const secret = await page.getByLabel("secret", { exact: true }).inputValue();
  await page.getByRole("button", { name: "ปิด (เก็บแล้ว)" }).click();
  const byKey = await request.post(`${apiOrigin}/v1/render`, {
    headers: { Authorization: `Bearer ${secret}` },
    data: {
      template: { id: ID, version: "published" },
      params: { quoteId: `${number}-API`, docDate: "2026-11-19" },
      data: {
        company: { name: "บริษัท ผู้ขาย จำกัด" },
        customer: { name: "ลูกค้าจากระบบบิล" },
        discount: "0",
        items: [{ id: "A", description: "บริการ", qty: 1, unitPrice: "100.00" }],
      },
    },
  });
  expect(byKey.status(), await byKey.text()).toBe(200);

  // the catalog leads to this template's documents; search by the number finds the form's document only
  await page.goto("/");
  await page.locator(`a[href="/documents?template=${ID}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/documents\\?template=${ID}$`));
  await expect(page.getByRole("heading", { name: "เอกสารที่ออก" })).toBeVisible();
  await expect(page.getByText("API: e2e-billing")).toBeVisible();
  await expect(page.getByText("ลูกค้าจากระบบบิล")).toHaveCount(0); // data stays in the PDF, only params show
  await expect(page.getByRole("link", { name: "ดาวน์โหลด" })).toHaveCount(2); // no row for the draft preview

  await page.getByRole("searchbox", { name: "ค้นหา" }).fill(number);
  await page.getByRole("button", { name: "ค้นหา" }).click();
  const rows = page.getByRole("link", { name: "ดาวน์โหลด" });
  await expect(rows).toHaveCount(2); // the form's and the API's (its number starts with the same text)
  await page.getByRole("searchbox", { name: "ค้นหา" }).fill("ลูกค้าจากระบบบิล"); // a value in data
  await page.getByRole("button", { name: "ค้นหา" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("API: e2e-billing")).toBeVisible();

  await page.getByRole("searchbox", { name: "ค้นหา" }).fill(`${number}`);
  await page.getByRole("button", { name: "ค้นหา" }).click();
  const href = `/documents/${runId}`;
  await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1); // the form's document is in the list
  const downloaded = await page.request.get(href);
  expect(downloaded.status()).toBe(200);
  expect(downloaded.headers()["content-type"]).toContain("application/pdf");
  expect(Buffer.compare(await downloaded.body(), issuedPdf)).toBe(0); // the same bytes, not a new render

  await page.getByRole("searchbox", { name: "ค้นหา" }).fill("ไม่มีเอกสารแบบนี้แน่นอน");
  await page.getByRole("button", { name: "ค้นหา" }).click();
  await expect(page.getByText("ไม่พบเอกสารที่ตรงกับ")).toBeVisible();

  // history links the stored PDF; the preview run has no link
  await page.goto(`/history?template=${ID}`);
  await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1);

  expect(urls.filter((u) => u.startsWith(apiOrigin))).toEqual([]);
});
