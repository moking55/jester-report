// v1.7 (tasks/v1.7/todo.md T12): the Document Designer builds a document from blocks on the A4 paper, Custom Code is
// guarded, undo/redo spans the edits, its own save writes template.html, Preview pdf gives a PDF, and the code view
// shows the new HTML; a hand-written comment survives an edit of another block in the designer.
// Starts from the quotation starter: it has a list, totals and a logo, so a table, a summary and an image bind to
// real data and Preview pdf renders. Makes its own template; runs after checkpoint-a (the E2E user).
import { expect, test, type Locator, type Page } from "@playwright/test";

import { login } from "./shared";

test.use({ viewport: { width: 1440, height: 900 } });

const ID = process.env.E2E_DESIGNER_ID ?? "e2e-designer";

type View = { state: { doc: { length: number; toString(): string } }; dispatch: (tr: object) => void };
const editorText = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector(".cm-content") as unknown as { cmTile: { view: View } }).cmTile.view.state.doc.toString(),
  );
const setEditorText = (page: Page, text: string) =>
  page.evaluate((value) => {
    const view = (document.querySelector(".cm-content") as unknown as { cmTile: { view: View } }).cmTile.view;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, text);

const palette = (page: Page, kind: string) => page.locator(`[data-kind="${kind}"]`);
const list = (page: Page, id: string) => page.locator(`[data-jd-list="${id}"]`);
const blocks = (page: Page) => page.locator("[data-jd-block]");
const panel = (page: Page) => page.getByRole("complementary", { name: "คุณสมบัติของบล็อก" });

/** The id of the list the last block of a kind holds (its first list: a column, a branch, a loop body). */
async function listOf(page: Page, kindLabel: string, index = 0): Promise<string> {
  const ids = await page.evaluate(() =>
    [...document.querySelector("[data-paper]")!.shadowRoot!.querySelectorAll("[data-jd-list]")].map((e) => e.getAttribute("data-jd-list")!),
  );
  const own = ids.filter((id) => id !== "root");
  expect(own.length, `lists after adding ${kindLabel}`).toBeGreaterThan(index);
  return own[own.length - 1 - index];
}

/**
 * A real mouse drag from the palette (or a block's handle) to a point inside `to`: `fy` is where on it, 1.2 = just
 * below its bottom (the empty paper under the last block appends to the page). Checks the slot shows first.
 */
async function drag(page: Page, from: Locator, to: Locator, fy = 0.5) {
  await to.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height * fy, b.height + 40), { steps: 15 });
  await expect(page.locator(".jd-slot")).toHaveCount(1); // where it will land, before it does
  await page.mouse.up();
  await expect(page.locator(".jd-slot")).toHaveCount(0);
}

/** Below the last block of the page. */
const pageEnd = (page: Page) => list(page, "root").locator(":scope > [data-jd-block]").last();

test("build a document on the paper, guard Custom Code, save, Preview pdf, keep a hand-written comment", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);

  const create = page.getByRole("form", { name: "สร้างรายงาน" });
  await create.getByLabel("id", { exact: true }).fill(ID);
  await create.getByLabel("ชื่อรายงาน").fill("เอกสารจาก designer");
  await create.getByLabel("เริ่มจาก").selectOption({ label: "ใบเสนอราคา" });
  await create.getByRole("button", { name: "สร้างรายงาน" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}$`), { timeout: 30_000 });

  await page.getByRole("button", { name: "Document Designer" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}/designer$`), { timeout: 30_000 });
  await expect(blocks(page).first()).toBeVisible({ timeout: 30_000 });
  const before = await blocks(page).count();

  // a row with two columns; the logo in the first, a text in the second
  await drag(page, palette(page, "row"), pageEnd(page), 1.2);
  const col1 = await listOf(page, "row", 1);
  const col2 = await listOf(page, "row", 0);
  await drag(page, palette(page, "image"), list(page, col1));
  await drag(page, palette(page, "text"), list(page, col2));

  // type in the new text on the paper; "{{" offers the fields, the pick is a chip
  const typed = list(page, col2).locator("p");
  await typed.dblclick();
  await expect(page.locator(".jd-editing")).toBeVisible();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("เรียน {{ ชื่อลูกค้า");
  await expect(page.getByRole("listbox", { name: "ช่องข้อมูล" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type(" ครับ");
  await page.keyboard.press("Enter");
  await expect(page.locator(".jd-editing")).toHaveCount(0);
  await expect(list(page, col2)).toContainText("เรียน");
  await expect(list(page, col2).locator(".jd-chip")).toContainText("data.customer.name");

  // a table bound to the list, a summary, a condition with a block inside
  await drag(page, palette(page, "table"), pageEnd(page), 1.2);
  await drag(page, palette(page, "summary"), pageEnd(page), 1.2);
  await drag(page, palette(page, "condition"), pageEnd(page), 1.2);
  const branch = await listOf(page, "condition");
  await drag(page, palette(page, "text"), list(page, branch));
  await expect(list(page, branch).locator("[data-jd-block]")).toHaveCount(1);

  // a loop with a field of the loop variable inside
  await drag(page, palette(page, "repeat"), pageEnd(page), 1.2);
  const loopList = await listOf(page, "repeat"); // its body: the last list on the page
  await drag(page, palette(page, "field"), list(page, loopList));
  await list(page, loopList).locator("[data-jd-block]").first().click();
  const expr = panel(page).getByLabel("ค่าที่แสดง (expression)");
  await expr.fill("row.id");
  await expr.press("Enter");
  await expect(list(page, loopList)).toContainText("row.id");

  // Custom Code: dropped from the palette, its modal opens; an unclosed {% if %} cannot close it
  await drag(page, palette(page, "custom"), pageEnd(page), 1.2);
  const modal = page.getByRole("dialog", { name: "Custom Code" });
  await expect(modal).toBeVisible();
  await setModalCode(page, '<div class="vip">\n{% if data.customer.name %}<b>VIP</b>\n</div>');
  await modal.getByRole("button", { name: "ตกลง" }).click();
  await expect(modal.getByRole("alert")).toContainText(/บรรทัด \d+/);
  await expect(modal).toBeVisible();
  await setModalCode(page, '<div class="vip">\n{% if data.customer.name %}<b>VIP</b>{% endif %}\n</div>');
  await modal.getByRole("button", { name: "ตกลง" }).click();
  await expect(modal).toHaveCount(0);
  await expect(list(page, "root")).toContainText("VIP");

  // undo takes the Custom Code away, redo brings it back
  const built = await blocks(page).count();
  expect(built).toBeGreaterThan(before + 8);
  await page.getByRole("button", { name: "เลิกทำ" }).click();
  await expect(list(page, "root")).not.toContainText("VIP");
  await page.getByRole("button", { name: "ทำซ้ำ" }).click();
  await expect(list(page, "root")).toContainText("VIP");
  await expect(blocks(page)).toHaveCount(built);

  // the designer's own save, then Preview pdf in a modal
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible({ timeout: 30_000 });
  const pdf = page.waitForResponse((r) => r.url().includes(`/preview/${ID}`) && r.request().method() === "POST", { timeout: 90_000 });
  await page.getByRole("button", { name: "Preview pdf" }).click();
  const response = await pdf;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const preview = page.getByRole("dialog", { name: "Preview pdf" });
  await preview.getByRole("button", { name: "ปิด (Esc)" }).click(); // Esc goes to the PDF viewer once it has focus
  await expect(preview).toHaveCount(0);

  // the code view has the new HTML
  await page.getByRole("button", { name: "กลับไปแก้ code" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}$`), { timeout: 30_000 });
  await page.getByRole("navigation", { name: "ไฟล์" }).getByRole("button", { name: "template.html", exact: true }).click();
  await expect.poll(() => editorText(page), { timeout: 30_000 }).toContain('data-jd="row"');
  const html = await editorText(page);
  expect(html).toContain("{{ data.customer.name }}");
  expect(html).toContain("{% for row in lists.items %}");
  expect(html).toContain('<div class="vip">');

  // a hand-written comment, then an edit of another block in the designer: the comment stays as written
  const note = "{# เขียนมือ: ห้ามหาย #}\n";
  await setEditorText(page, note + html);
  await page.getByRole("button", { name: "บันทึก (Ctrl+S)" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Document Designer" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}/designer$`), { timeout: 30_000 });
  await list(page, "root").locator("h1").first().click();
  await panel(page).getByLabel("ระดับ").selectOption("h2");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "กลับไปแก้ code" }).click();
  await page.getByRole("navigation", { name: "ไฟล์" }).getByRole("button", { name: "template.html", exact: true }).click();
  await expect.poll(() => editorText(page), { timeout: 30_000 }).toContain("<h2>ใบเสนอราคา</h2>");
  const after = await editorText(page);
  expect(after.startsWith(note)).toBe(true);
  expect(after.replace("<h2>ใบเสนอราคา</h2>", "<h1>ใบเสนอราคา</h1>")).toBe(note + html);
});

/** The Custom Code modal's editor text. */
const setModalCode = (page: Page, text: string) =>
  page.evaluate((value) => {
    const el = document.querySelector('[role="dialog"][aria-label="Custom Code"] .cm-content') as unknown as { cmTile: { view: View } };
    const view = el.cmTile.view;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, text);
