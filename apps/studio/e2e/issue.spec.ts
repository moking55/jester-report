// v1.4 (tasks/v1.4/todo.md T7): a team lead issues a tax invoice from the form, without seeing any code.
// Runs on the same fresh stack after checkpoint-a (it needs the E2E user); makes its own template.
import { expect, test, type Page } from "@playwright/test";

import { login, watchRequests } from "./shared";

const ID = "e2e-tax";
const field = (page: Page, pointer: string) => page.locator(`#f${pointer.replaceAll("/", "-")}`);

test("issue a tax invoice from the form", async ({ page }) => {
  test.skip(!process.env.STUDIO_E2E_API_URL, "STUDIO_E2E_API_URL is not set");
  test.setTimeout(180_000);
  const apiOrigin = new URL(process.env.STUDIO_E2E_API_URL!).origin;
  const urls = watchRequests(page);
  await login(page);

  // a dev creates it from the starter and publishes v1
  const create = page.getByRole("form", { name: "สร้างรายงาน" }); // the catalog also has duplicate dialogs
  await create.getByLabel("id", { exact: true }).fill(ID);
  await create.getByLabel("ชื่อรายงาน").fill("ใบกำกับภาษี E2E");
  await create.getByLabel("เริ่มจาก").selectOption({ label: "ใบกำกับภาษีเต็มรูป" });
  await create.getByRole("button", { name: "สร้างรายงาน" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}$`), { timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).click();
  const publish = page.getByRole("dialog", { name: "Publish" });
  await publish.getByRole("button", { name: "Publish" }).click();
  await expect(publish).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "true"); // published

  // the lead opens it from the catalog: straight into the form, no files, no tabs, an empty form
  await page.goto("/");
  await page.locator(`a[href="/templates/${ID}?mode=issue"]`).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}\\?mode=issue$`), { timeout: 30_000 });
  await expect(page.getByRole("form", { name: "ฟอร์มออกเอกสาร" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ไฟล์" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Problems" })).toHaveCount(0);
  await expect(page.getByLabel("เลขที่ใบกำกับภาษี")).toHaveValue("");
  await expect(page.getByText("version 1")).toBeVisible();

  // a required field left empty is caught before anything is sent
  const issued: string[] = [];
  page.on("request", (r) => r.url().endsWith(`/issue/${ID}`) && issued.push(r.url()));
  await page.getByRole("button", { name: "ออก PDF" }).click();
  await expect(page.locator('[data-pointer="/params/invoiceNo"]').getByText("กรุณากรอกช่องนี้")).toBeVisible();
  expect(issued).toEqual([]);

  // fill every field by hand, with two item rows
  await page.getByLabel("เลขที่ใบกำกับภาษี").fill("INV-2026-0099");
  await field(page, "/params/issueDate").fill("2026-11-18");
  await field(page, "/data/seller/name").fill("บริษัท ผู้ขาย จำกัด");
  await field(page, "/data/seller/address").fill("1 ถนนทดสอบ กรุงเทพฯ");
  await field(page, "/data/seller/taxId").fill("0105500000001");
  await field(page, "/data/seller/branch").fill("00000");
  await field(page, "/data/buyer/name").fill("บริษัท ผู้ซื้อ จำกัด");
  await field(page, "/data/buyer/address").fill("2 ถนนทดสอบ เชียงใหม่");
  await page.getByRole("button", { name: "+ เพิ่มแถว" }).click();
  for (const [i, row] of [
    ["S001", "บริการติดตั้ง", "1", "งาน", "15000.00"],
    ["P001", "กระดาษ A4", "10", "รีม", "125.50"],
  ].entries()) {
    const [code, description, qty, unit, price] = row;
    await field(page, `/data/items/${i}/code`).fill(code);
    await field(page, `/data/items/${i}/description`).fill(description);
    await field(page, `/data/items/${i}/qty`).fill(qty);
    await field(page, `/data/items/${i}/unit`).fill(unit);
    await field(page, `/data/items/${i}/unitPrice`).fill(price);
  }
  await field(page, "/data/vatRate").fill("7");

  // a date the form accepts but the api refuses comes back under its field
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#f-params-issueDate")!;
    input.type = "text"; // the date picker cannot hold an impossible date
  });
  await field(page, "/params/issueDate").fill("2026-02-30");
  await page.getByRole("button", { name: "ออก PDF" }).click();
  await expect(page.locator('[data-pointer="/params/issueDate"] [class*="error"]')).toBeVisible({ timeout: 30_000 });
  await field(page, "/params/issueDate").fill("2026-11-18");

  // the PDF shows next to the form, with a download link
  const response = page.waitForResponse((r) => r.url().endsWith(`/issue/${ID}`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "ออก PDF" }).click();
  const pdf = await response;
  expect(pdf.status(), await pdf.text().catch(() => "")).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  await expect(page.getByTitle("PDF ที่ออก")).toBeVisible();
  await expect(page.getByRole("link", { name: "ดาวน์โหลด" })).toHaveAttribute("download", /\.pdf$/);

  // back to the code view
  await page.getByRole("button", { name: "กลับไปแก้ code" }).click();
  await expect(page.getByRole("navigation", { name: "ไฟล์" })).toBeVisible({ timeout: 30_000 });

  expect(urls.filter((u) => u.startsWith(apiOrigin))).toEqual([]);
});
