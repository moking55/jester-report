// v1.10 (tasks/v1.10/todo.md C5): a click picks a table cell and the toolbar's table buttons work around it — a column
// on the left, a row above, two cells merged and printed as one — a row of columns changes its number of columns
// without losing blocks, and Studio is installable (manifest and service worker served).
// Makes its own report (id below; E2E_TABLE_SUFFIX reruns on a stack that has it).
import { expect, test, type Locator, type Page } from "@playwright/test";

import { login, pdfInfo, previewPdf, thai } from "./shared";

test.use({ viewport: { width: 1600, height: 900 } });

const RID = `e2e-tables${process.env.E2E_TABLE_SUFFIX ?? ""}`;

const palette = (page: Page, kind: string) => page.locator(`[data-kind="${kind}"]`);
const list = (page: Page, id: string) => page.locator(`[data-jd-list="${id}"]`);
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "เครื่องมือจัดรูปแบบ" });
const paperCells = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelector("[data-paper]")!.shadowRoot!.querySelectorAll('table tr')].map((tr) =>
      [...(tr as HTMLTableRowElement).cells].map((c) => c.textContent!.trim() + (c.colSpan > 1 ? `*${c.colSpan}` : "")).join("|"),
    ),
  );

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
  await page.waitForTimeout(150); // @dnd-kit swallows clicks for 50 ms after a drag ends
}

/** A toolbar button, from the "…" menu when the toolbar folded it away. */
async function tool(page: Page, name: string) {
  const direct = toolbar(page).getByRole("button", { name, exact: true });
  if (!(await direct.count())) await toolbar(page).getByRole("button", { name: "เครื่องมืออื่น" }).click();
  await toolbar(page).getByRole("button", { name, exact: true }).click();
}

/** Type `text` into the fixed table's cell (row, col) on the paper. */
async function typeIn(page: Page, row: number, col: number, text: string) {
  await page.locator(`[data-paper] table tr:nth-child(${row + 1}) > td:nth-child(${col + 1})`).dblclick();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

const cell = (page: Page, text: string) => page.locator('[data-paper] table td', { hasText: text });

test("table cells picked by a click: columns, rows, merge; a row of columns; the app is installable", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/");
  const create = page.getByRole("form", { name: "สร้างรายงาน" });
  if (!(await create.isVisible())) await page.getByRole("button", { name: /รายงานใหม่จาก starter/ }).click();
  await create.getByLabel("id", { exact: true }).fill(RID);
  await create.getByLabel("ชื่อรายงาน").fill("ทดสอบเครื่องมือตาราง");
  await create.getByLabel("เริ่มจาก").selectOption({ label: "ว่าง" });
  await create.getByRole("button", { name: "สร้างรายงาน" }).click();
  await page.getByRole("dialog", { name: "ขนาดกระดาษและรูปแบบ" }).getByRole("button", { name: "สร้าง", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${RID}$`), { timeout: 30_000 });
  await page.goto(`/templates/${RID}/designer`);
  await expect(page.locator("[data-paper]")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  // a fixed table (3 × 2), its cells typed in
  await drag(page, palette(page, "grid"), list(page, "root"));
  for (const [r, c, t] of [[0, 0, "A"], [0, 1, "B"], [1, 0, "C"], [1, 1, "D"]] as const) await typeIn(page, r, c, t);
  await expect.poll(() => paperCells(page)).toEqual(["A|B", "C|D", "|"]);

  // a click picks the cell: a column on its left, then a row above it
  await cell(page, "B").click({ position: { x: 12, y: 8 } });
  await expect(page.locator("[data-paper] .jd-cell-on")).toHaveText("B");
  await tool(page, "เพิ่มคอลัมน์ซ้าย");
  await expect.poll(() => paperCells(page)).toEqual(["A||B", "C||D", "||"]);
  await cell(page, "C").click({ position: { x: 12, y: 8 } });
  await tool(page, "เพิ่มแถวบน");
  await expect.poll(() => paperCells(page)).toEqual(["A||B", "||", "C||D", "||"]);

  // C merged with the empty cell on its right; the column buttons count through the merged cell
  await cell(page, "C").click({ position: { x: 12, y: 8 } });
  await tool(page, "รวมกับช่องขวา");
  await expect.poll(() => paperCells(page)).toEqual(["A||B", "||", "C*2|D", "||"]);
  await expect(toolbar(page).getByRole("button", { name: "แยกช่อง", exact: true })).toBeEnabled();

  // a row of 3 columns, a text in the third, then 2 columns: the text moves, it does not go
  await drag(page, palette(page, "row"), list(page, "root"), 1.2);
  await page.locator("[data-paper] [data-jd-block]").last().click({ position: { x: 4, y: 4 } });
  await toolbar(page).getByLabel("จำนวนคอลัมน์").selectOption("3");
  const cols = () =>
    page.evaluate(() => [...document.querySelector("[data-paper]")!.shadowRoot!.querySelectorAll("[data-jd-list]")].map((e) => e.getAttribute("data-jd-list")!).filter((id) => id !== "root"));
  await expect.poll(async () => (await cols()).length).toBe(3);
  await drag(page, palette(page, "text"), list(page, (await cols())[2]));
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-paper] [data-jd-block]").filter({ has: page.locator("[data-jd-list]") }).last().click({ position: { x: 4, y: 4 } });
  await toolbar(page).getByLabel("จำนวนคอลัมน์").selectOption("2");
  await expect.poll(async () => (await cols()).length).toBe(2);
  await expect(list(page, (await cols())[1]).locator("p")).toHaveCount(1);

  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible({ timeout: 30_000 });

  // the PDF has the merged cell's text and the others
  const info = pdfInfo(await previewPdf(page, RID));
  expect(info, "a python with pypdf is needed (E2E_PYTHON or apps/api/.venv)").not.toBeNull();
  if (info) for (const t of ["A", "B", "C", "D"]) expect(thai(info[0].text)).toContain(t);

  // installable: the manifest and the service worker are served
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ name: "Jester Studio", display: "standalone" });
  const sw = await page.request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
});
