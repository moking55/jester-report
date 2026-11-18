// v1.1 Checkpoint A (tasks/v1.1/todo.md): export/import, import over a draft, duplicate, archive, set password.
// Runs after full-flow on the same fresh stack: it needs e2e-quote with a published v1.
import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { login, watchRequests } from "./shared";

const ID = "e2e-quote";

const menu = (page: Page, id: string) => page.getByLabel(`เมนูของ ${id}`);

async function importZip(page: Page, zip: Buffer, id: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "นำเข้า (.zip)" }).click();
  const dialog = page.getByRole("dialog", { name: "นำเข้ารายงาน" });
  await dialog.getByLabel("ไฟล์ zip ที่ export จาก Jester").setInputFiles({
    name: "report.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(dialog.getByText("รายงานในไฟล์:")).toBeVisible();
  await dialog.getByLabel("id ปลายทาง").fill(id);
  await dialog.getByRole("button", { name: "นำเข้า", exact: true }).click();
  return dialog;
}

test("export, import, duplicate, archive and set a password", async ({ page, request }) => {
  test.skip(!process.env.STUDIO_E2E_API_URL, "STUDIO_E2E_API_URL is not set");
  test.setTimeout(240_000);
  const apiOrigin = new URL(process.env.STUDIO_E2E_API_URL!).origin;
  const urls = watchRequests(page);
  await login(page);

  // 1. export the draft from the catalog menu, import it as a new id: same files
  await menu(page, ID).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export draft (.zip)" }).click();
  const zip = await readFile(await (await download).path());
  expect(zip.subarray(0, 2).toString()).toBe("PK");
  await importZip(page, zip, "e2e-moved");
  await expect(page).toHaveURL(/\/templates\/e2e-moved$/, { timeout: 30_000 });
  const files = page.getByRole("navigation", { name: "ไฟล์" });
  await expect(files.getByRole("button", { name: "template.html", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "report.json", exact: true })).toBeVisible();

  // 2. the same zip over e2e-quote: the dialog asks, then replaces the draft (revision goes up)
  await page.goto(`/templates/${ID}`);
  const before = Number((await page.getByText(/^draft r\d+$/).textContent())!.slice(7));
  const dialog = await importZip(page, zip, ID);
  await expect(dialog.getByText(/มีรายงาน id/)).toBeVisible();
  await dialog.getByRole("button", { name: "ทับ draft ของรายงานเดิม" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}$`), { timeout: 30_000 });
  await expect(page.getByText(`draft r${before + 1}`, { exact: true })).toBeVisible();

  // 3. duplicate from the catalog menu: a new row
  await page.goto("/");
  await menu(page, ID).click();
  await page.getByRole("button", { name: "ทำสำเนา…" }).click();
  const copy = page.getByRole("dialog", { name: `ทำสำเนา ${ID}` });
  await copy.getByLabel("id ใหม่").fill("e2e-copy");
  await copy.getByLabel("ชื่อรายงาน").fill("สำเนา E2E");
  await copy.getByRole("button", { name: "ทำสำเนา", exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/e2e-copy$/, { timeout: 30_000 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "สำเนา E2E" })).toBeVisible();

  // 4. archive: gone from the catalog, shown with the toggle, the API answers 410; unarchive brings it back
  await page.goto("/settings?tab=keys");
  await page.getByLabel("ชื่อ (เช่น ระบบที่จะใช้)").fill("e2e-lifecycle");
  await page.getByRole("button", { name: "สร้าง key" }).click();
  const secret = await page.getByLabel("secret", { exact: true }).inputValue();
  await page.getByRole("button", { name: "ปิด (เก็บแล้ว)" }).click();
  const render = () =>
    request.post(`${apiOrigin}/v1/render`, {
      headers: { Authorization: `Bearer ${secret}` },
      data: { template: { id: ID, version: "published" }, data: {} },
    });

  await page.goto("/");
  await menu(page, ID).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("link", { name: "ใบเสนอราคา E2E" })).toHaveCount(0);
  await page.getByRole("link", { name: "แสดงที่ archive" }).click();
  await expect(page.getByRole("link", { name: "ใบเสนอราคา E2E" })).toBeVisible();
  await expect(page.getByText("archive แล้ว")).toBeVisible();
  const gone = await render();
  expect(gone.status()).toBe(410);
  expect((await gone.json()).code).toBe("TEMPLATE_ARCHIVED");

  await page.getByRole("link", { name: "ใบเสนอราคา E2E" }).click();
  await expect(page.getByText(/ถูก archive แล้ว อ่านได้อย่างเดียว/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "เลิก archive" }).first().click();
  await expect(page.getByText(/ถูก archive แล้ว อ่านได้อย่างเดียว/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeEnabled();
  expect((await render()).status()).toBe(422); // past the archive check: now it is the missing data

  // 6. set a password for a second user; they sign in with it
  await page.goto("/settings?tab=users");
  await page.getByRole("button", { name: "+ เพิ่มผู้ใช้" }).click();
  const add = page.getByRole("dialog", { name: "เพิ่มผู้ใช้" });
  await add.getByLabel("ชื่อผู้ใช้").fill("e2e-bob");
  await add.getByLabel("รหัสผ่าน (12 ตัวขึ้นไป)").fill("bob first password");
  await add.getByLabel("ยืนยันรหัสผ่าน").fill("bob first password");
  await add.getByRole("button", { name: "เพิ่มผู้ใช้" }).click();
  await expect(page.getByRole("cell", { name: "e2e-bob" })).toBeVisible();
  await page.getByRole("row", { name: /e2e-bob/ }).getByRole("button", { name: "ตั้งรหัสผ่าน" }).click();
  const set = page.getByRole("dialog", { name: "ตั้งรหัสผ่านให้ผู้ใช้" });
  await set.getByLabel("รหัสผ่านใหม่ (12 ตัวขึ้นไป)").fill("bob second password");
  await set.getByLabel("ยืนยันรหัสผ่านใหม่").fill("bob second password");
  await set.getByRole("button", { name: "ตั้งรหัสผ่าน" }).click();
  await expect(set.getByRole("status")).toContainText("ตั้งรหัสผ่านใหม่แล้ว");

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill("e2e-bob");
  await page.getByLabel("รหัสผ่าน").fill("bob second password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("heading", { name: "รายงาน" })).toBeVisible();

  // the browser only ever talked to Studio (zips went through /export and /import)
  expect(urls.filter((u) => u.startsWith(apiOrigin))).toEqual([]);
});
