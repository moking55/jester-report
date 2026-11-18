// Shared by the specs. They run in file order on one fresh stack (workers: 1): checkpoint-a does the setup.
import { expect, type Page } from "@playwright/test";

export const USER = "e2e-admin";
export const PASSWORD = "e2e correct horse battery";

export function watchRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

export const themeCss = (page: Page) => page.locator("style#jester-theme").innerHTML();

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill(USER);
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  // scrypt on a busy test VM can take several seconds
  await expect(page.getByRole("heading", { name: "รายงาน" })).toBeVisible({ timeout: 30_000 });
}
