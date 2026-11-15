// Checkpoint B (tasks/studio/todo.md T7), after checkpoint-a on the same FRESH stack. Same env vars:
//   STUDIO_E2E_URL, STUDIO_E2E_API_URL (render with an API key goes there, from the test, not the browser)
import { expect, test, type Page } from "@playwright/test";

import { login, themeCss, watchRequests } from "./shared";

const ID = "e2e-quote";

/** CodeMirror's view, to put a file back exactly; typing is done with the keyboard like a person would. */
const setEditorText = (page: Page, text: string) =>
  page.evaluate((value) => {
    const content = document.querySelector(".cm-content") as unknown as {
      cmTile: { view: { state: { doc: { length: number } }; dispatch: (tr: object) => void } };
    };
    const view = content.cmTile.view;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, text);
const editorText = (page: Page) => page.locator(".cm-content").innerText();

async function openFile(page: Page, name: string) {
  await page.getByRole("navigation", { name: "ไฟล์" }).getByRole("button", { name, exact: true }).click();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "บันทึก (Ctrl+S)" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible();
}

test("report from starter to API render, history, two tabs and themes", async ({ page, context, request }) => {
  test.skip(!process.env.STUDIO_E2E_API_URL, "STUDIO_E2E_API_URL is not set");
  test.setTimeout(240_000);
  const apiOrigin = new URL(process.env.STUDIO_E2E_API_URL!).origin;
  const urls = watchRequests(page);
  await login(page);

  // 1. create from the quotation starter (the + card is already open on an empty catalog)
  const addCard = page.getByRole("button", { name: /รายงานใหม่จาก starter/ });
  if (await addCard.isVisible()) await addCard.click();
  await page.getByLabel("id").fill(ID);
  await page.getByLabel("ชื่อรายงาน").fill("ใบเสนอราคา E2E");
  await page.getByLabel("เริ่มจาก").selectOption({ label: "ใบเสนอราคา" });
  await page.getByRole("button", { name: "สร้างรายงาน" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}$`));
  await expect(page.locator(".cm-content")).toBeVisible();

  // 2. edit a file with the keyboard, save, validate: the problem shows with its line
  await openFile(page, "template.html");
  const original = await editorText(page);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n<p>{{ params.quoteId | nosuchfilter }}</p>");
  await save(page);
  await page.getByRole("button", { name: "Validate" }).click();
  const problems = page.getByRole("tabpanel");
  await expect(problems.getByText(/nosuchfilter/)).toBeVisible();
  await expect(problems.getByText(/template\.html:\d+/)).toBeVisible();

  // put the file back, save, validate clean
  await setEditorText(page, original);
  await save(page);
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(problems.getByText("ไม่พบปัญหา")).toBeVisible();

  // 3. prepared data has the computed total
  await page.getByRole("tab", { name: "Prepared data" }).click();
  await page.getByRole("button", { name: "คำนวณใหม่" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("3210.00");

  // 4. preview: the iframe gets a PDF from Studio's own route
  const previewed = page.waitForResponse((r) => r.url().includes(`/preview/${ID}`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const pdf = await previewed;
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");

  // 5. publish v1 (the note comes from a prompt)
  page.once("dialog", (dialog) => dialog.accept("e2e v1"));
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("e2e v1");

  // the Render dialog gives the request body another system would send
  await page.getByRole("button", { name: "Render…" }).click();
  const dialog = page.getByRole("dialog", { name: "Render" });
  const params = await dialog.locator('textarea[name="params"]').inputValue();
  const data = await dialog.locator('textarea[name="data"]').inputValue();
  await dialog.getByRole("button", { name: "ปิด" }).click();

  // 6. an API key: the secret is shown once
  await page.goto("/settings?tab=keys");
  await page.getByLabel("ชื่อ (เช่น ระบบที่จะใช้)").fill("e2e-erp");
  await page.getByRole("button", { name: "สร้าง key" }).click();
  const secretBox = page.getByLabel("secret", { exact: true });
  const secret = await secretBox.inputValue();
  expect(secret).toMatch(/^jrk_/);
  await page.getByRole("button", { name: "ปิด (เก็บแล้ว)" }).click();
  await expect(secretBox).toHaveCount(0);

  // 7. another system renders the published version with that key (from the test, not the browser)
  const rendered = await request.post(`${apiOrigin}/v1/render`, {
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    data: `{"template":{"id":"${ID}","version":"published"},"params":${params},"data":${data}}`,
  });
  expect(rendered.status(), await rendered.text()).toBe(200);
  expect(rendered.headers()["content-type"]).toContain("application/pdf");
  expect(rendered.headers()["jester-template-version"]).toBe("1");

  // 8. history shows that run, by the key
  await page.goto(`/history?template=${ID}`);
  await expect(page.getByText(/api-key/).first()).toBeVisible();
  await expect(page.getByText("v1", { exact: true }).first()).toBeVisible();

  // 9. two tabs on one draft: the second save is refused, not written over the first
  const second = await context.newPage();
  await page.goto(`/templates/${ID}`);
  await second.goto(`/templates/${ID}`);
  for (const tab of [page, second]) {
    await openFile(tab, "report.css");
    await expect(tab.locator(".cm-content")).toBeVisible();
  }
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n/* first tab */");
  await save(page);
  await second.locator(".cm-content").click();
  await second.keyboard.press("Control+End");
  await second.keyboard.type("\n/* second tab */");
  await second.getByRole("button", { name: "บันทึก (Ctrl+S)" }).click();
  await expect(second.getByRole("alert").filter({ hasText: "มีคนแก้ draft นี้แล้ว" })).toBeVisible();
  await second.close();

  // 10. themes: mahasamut is the default; classic adds the glass look; suriyan and a custom theme are flat
  const look = () => page.evaluate(() => document.documentElement.dataset.look ?? null);
  await page.goto("/");
  expect(await themeCss(page)).toContain("--color-primary:#155fa8");
  const picker = page.getByLabel("Theme");
  await picker.selectOption({ label: "Classic" });
  await expect.poll(() => themeCss(page)).toContain("--color-primary:#1e90d6");
  expect(await look()).toBe("aero");
  await picker.selectOption({ label: "Suriyan" });
  await expect.poll(() => themeCss(page)).toContain("--color-primary:#d9730d");
  expect(await look()).toBeNull();

  await page.goto("/settings?tab=themes");
  await page.getByRole("button", { name: /^Suriyan/ }).click();
  await page.getByRole("button", { name: "ทำสำเนา" }).click();
  await page.getByLabel("ชื่อ theme").fill("E2E แบรนด์");
  await page.getByLabel(/^สีหลัก/).fill("#2457c5");
  await page.getByRole("button", { name: "สร้าง theme" }).click();
  await expect(page.getByRole("status")).toHaveText("บันทึกแล้ว");
  await page.getByLabel("Theme").selectOption({ label: "E2E แบรนด์" });
  await expect.poll(() => themeCss(page)).toContain("--color-primary:#2457c5");

  // the browser only ever talked to Studio
  const studioOrigin = new URL(page.url()).origin;
  expect(urls.filter((u) => u.startsWith(apiOrigin))).toEqual([]);
  expect(urls.filter((u) => !u.startsWith(studioOrigin) && !/^(data|blob|about):/.test(u))).toEqual([]);
});
