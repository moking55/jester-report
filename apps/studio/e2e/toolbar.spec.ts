// v1.9 (tasks/v1.9/todo.md T12): the designer's toolbar formats the selected words (bold) and turns a paragraph into a
// list, and the variable block takes a type and conditional values that fill a text — each checked in the PDF.
// Makes its own report (id below; E2E_TOOLBAR_SUFFIX reruns on a stack that has it). The file name sorts after
// full-flow (which wants an empty catalog).
import { expect, test, type Locator, type Page } from "@playwright/test";

import { createReport, login, pdfInfo, previewPdf, thai } from "./shared";

test.use({ viewport: { width: 1600, height: 900 } });

const RID = `e2e-toolbar${process.env.E2E_TOOLBAR_SUFFIX ?? ""}`;

const palette = (page: Page, kind: string) => page.locator(`[data-kind="${kind}"]`);
const list = (page: Page, id: string) => page.locator(`[data-jd-list="${id}"]`);
const blocks = (page: Page) => page.locator("[data-jd-block]");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "เครื่องมือจัดรูปแบบ" });
const panel = (page: Page) => page.getByRole("complementary", { name: "คุณสมบัติของบล็อก" });

async function drag(page: Page, from: Locator, to: Locator, fy = 0.5) {
  await to.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height * fy, b.height + 40), { steps: 15 });
  await expect(page.locator(".jd-slot")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".jd-slot")).toHaveCount(0);
}

/** Select, inside the text being typed in, exactly `part` (the selection lives in the paper's shadow root). */
async function selectText(page: Page, part: string) {
  await page.evaluate((text) => {
    const root = document.querySelector("[data-paper]")!.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null };
    const editing = root.querySelector(".jd-editing")!;
    const walker = document.createTreeWalker(editing, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const at = n.data.indexOf(text);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + text.length);
      const sel = root.getSelection?.() ?? document.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    throw new Error(`no "${text}" in the text being typed`);
  }, part);
}

async function save(page: Page) {
  await page.waitForTimeout(150); // @dnd-kit swallows clicks for 50 ms after a drag ends
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible({ timeout: 30_000 });
}

test("the toolbar makes words bold and a paragraph a list; the PDF follows", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/");
  await createReport(page, RID, "ทดสอบ toolbar", "ว่าง");
  await page.goto(`/templates/${RID}/designer`);
  await expect(page.locator("[data-paper]")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  // the toolbar is there, above the paper; with nothing selected the formatting is grey
  await expect(toolbar(page)).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "ตัวหนา" })).toBeDisabled();

  // a paragraph; the words in the middle are made bold with the toolbar alone
  await drag(page, palette(page, "text"), list(page, "root"));
  await blocks(page).first().dblclick();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("เรียน คุณสมชาย ครับ");
  await expect(toolbar(page).getByRole("button", { name: "ตัวหนา" })).toBeDisabled(); // a caret alone formats nothing
  await selectText(page, "คุณสมชาย");
  await toolbar(page).getByRole("button", { name: "ตัวหนา" }).click();
  await expect(toolbar(page).getByRole("button", { name: "ตัวหนา" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");

  // a second paragraph of three lines becomes a bulleted list with one button
  await drag(page, palette(page, "text"), list(page, "root"), 1.2);
  await blocks(page).nth(1).dblclick();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("หนึ่ง");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("สอง");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("สาม");
  await page.keyboard.press("Enter");
  await blocks(page).nth(1).click();
  await toolbar(page).getByRole("button", { name: "รายการจุด" }).click();
  await expect(page.locator("[data-paper]").locator("ul > li")).toHaveCount(3);
  await save(page);

  const pdf = await previewPdf(page, RID);
  const info = pdfInfo(pdf);
  expect(info, "this spec is about the PDF: a python with pypdf is needed (E2E_PYTHON or apps/api/.venv)").not.toBeNull();
  if (info) {
    expect(info).toHaveLength(1);
    const text = thai(info[0].text);
    expect(text).toContain(thai("เรียน คุณสมชาย ครับ"));
    for (const item of ["หนึ่ง", "สอง", "สาม"]) expect(text).toContain(thai(item));
    expect(info[0].fonts.some((f) => /bold/i.test(f)), `fonts ${info[0].fonts}`).toBe(true); // the bold words
    expect(info[0].fonts.some((f) => !/bold/i.test(f))).toBe(true); // and the rest is not
  }
});

test("a variable with a type and conditional values fills a text; the PDF has the value", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  await page.goto(`/templates/${RID}/designer`);
  await expect(page.locator("[data-paper]")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  // a "ตั้งค่าตัวแปร" block lands first in the page: dropped on the page, it keeps its place in the file
  await drag(page, palette(page, "set"), list(page, "root"), 1.2);
  await expect(page.getByRole("button", { name: /^x = / })).toBeVisible();
  await page.getByRole("button", { name: /^x = / }).click();
  await panel(page).getByLabel("ชื่อตัวแปร", { exact: true }).fill("status");
  await panel(page).getByLabel("ชื่อตัวแปร", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: /^status = / })).toBeVisible();
  await panel(page).getByLabel("ประเภท", { exact: true }).selectOption("text");
  await panel(page).getByLabel("ตั้งค่าแบบ").selectOption("if");
  await panel(page).getByLabel("เงื่อนไขข้อ 1", { exact: true }).fill("1 == 1");
  await panel(page).getByLabel("ค่าข้อ 1", { exact: true }).fill("ชำระแล้ว");
  await panel(page).getByLabel("ค่าข้อ 1", { exact: true }).press("Enter");
  await panel(page).getByLabel("ไม่เช่นนั้น", { exact: true }).fill("ค้างชำระ");
  await panel(page).getByLabel("ไม่เช่นนั้น", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: /^status = ตามเงื่อนไข 1 ข้อ/ })).toBeVisible();

  // a number computed from whole numbers (Jinja gives a float for 7 / 100, which a PDF cannot print)
  await drag(page, palette(page, "set"), list(page, "root"), 1.2);
  await page.getByRole("button", { name: /^x = / }).click();
  await panel(page).getByLabel("ชื่อตัวแปร", { exact: true }).fill("vat");
  await panel(page).getByLabel("ชื่อตัวแปร", { exact: true }).press("Enter");
  await panel(page).getByLabel("ประเภท", { exact: true }).selectOption("number");
  await panel(page).getByLabel("ค่า", { exact: true }).fill("7 * 10 + 2");
  await panel(page).getByLabel("ค่า", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: /^vat = 7 \* 10 \+ 2/ })).toBeVisible();

  // a text that uses both: typing "{{" lists them with the other fields
  await drag(page, palette(page, "text"), list(page, "root"), 1.2);
  await blocks(page).last().dblclick();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("สถานะ ");
  await page.keyboard.type("{{ sta");
  await expect(page.getByRole("listbox", { name: "ช่องข้อมูล" }).getByRole("option", { name: /ตัวแปร status/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type(" VAT ");
  await page.keyboard.type("{{ va");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // done typing
  await save(page);

  const info = pdfInfo(await previewPdf(page, RID));
  expect(info, "this spec is about the PDF: a python with pypdf is needed (E2E_PYTHON or apps/api/.venv)").not.toBeNull();
  if (info) {
    const text = thai(info[0].text);
    expect(text).toContain(thai("สถานะ ชำระแล้ว"));
    expect(text).toContain("VAT 72");
  }
});
