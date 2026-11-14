// Checkpoint A (tasks/studio/todo.md) on a FRESH stack: setup -> catalog -> switch theme -> logout -> login.
//   STUDIO_E2E_URL      Studio, e.g. http://10.0.1.29:3002
//   STUDIO_E2E_API_URL  the api of the same stack; the browser must never call it
//   STUDIO_E2E_SETUP_TOKEN  from `docker compose logs api`
import { expect, test, type Page } from "@playwright/test";

const USER = "e2e-admin";
const PASSWORD = "e2e correct horse battery";

function watchRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

const themeCss = (page: Page) => page.locator("style#jester-theme").innerHTML();

test("setup, theme, logout, login; the browser only talks to Studio", async ({ page }) => {
  const token = process.env.STUDIO_E2E_SETUP_TOKEN;
  const apiOrigin = new URL(process.env.STUDIO_E2E_API_URL ?? "http://unset.invalid").origin;
  test.skip(!token, "STUDIO_E2E_SETUP_TOKEN is not set");
  const urls = watchRequests(page);

  // first run: every page leads to setup
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel("Setup token").fill(token!);
  await page.getByLabel("ชื่อผู้ใช้").fill(USER);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(PASSWORD);
  await page.getByLabel("ยืนยันรหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "สร้างบัญชีและเริ่มใช้งาน" }).click();
  await expect(page.getByRole("heading", { name: "รายงาน" })).toBeVisible();
  await expect(page.getByText(USER, { exact: true })).toBeVisible();

  // the system default is classic; switching to suriyan changes the tokens and survives a reload
  expect(await themeCss(page)).toContain("--color-primary:#1e90d6");
  await page.getByLabel("Theme").selectOption({ label: "Suriyan" });
  await expect.poll(() => themeCss(page)).toContain("--color-primary:#d9730d");
  await page.reload();
  expect(await themeCss(page)).toContain("--color-primary:#d9730d");
  await expect(page.getByLabel("Theme")).toHaveValue("suriyan");

  // the session cookie is httpOnly: scripts in the page cannot read it
  expect(await page.evaluate(() => document.cookie)).not.toContain("jester_session");

  // logout ends the session; the app pages send you to login
  await page.getByRole("button", { name: "ออกจากระบบ" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  // wrong password: a Thai message, no session
  await page.getByLabel("ชื่อผู้ใช้").fill(USER);
  await page.getByLabel("รหัสผ่าน").fill("not the password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");

  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("heading", { name: "รายงาน" })).toBeVisible();

  // setup is closed now
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login$|\/$/);

  const studioOrigin = new URL(page.url()).origin;
  expect(urls.filter((u) => u.startsWith(apiOrigin))).toEqual([]);
  expect(urls.filter((u) => !u.startsWith(studioOrigin) && !u.startsWith("data:"))).toEqual([]);
});
