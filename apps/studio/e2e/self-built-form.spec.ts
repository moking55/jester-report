// v1.6 (tasks/v1.6/todo.md T10): a developer opens the data schema and builds the form by dragging fields in the code view;
// "แก้ไข JSON" and back keeps a hand edit; one save writes all; the lead's issue form follows form.json and gives a PDF.
// Runs on the same fresh stack after checkpoint-a (the E2E user) and after full-flow (which wants an empty
// catalog), so the file name sorts after both; makes its own template from the blank starter.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { login } from "./shared";

// a desktop screen: in a short canvas the last card sits in @dnd-kit's auto-scroll band and drifts under the pointer
test.use({ viewport: { width: 1440, height: 900 } });

const ID = process.env.E2E_FORM_ID ?? "e2e-form"; // a fresh id to rerun on a stack that has one

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

/**
 * A real mouse drag: aim at the target as the form looks now, press, move past the 5px start distance, glide there,
 * check the slot "วางที่นี่" shows the drop, release. `fy` is where on the target to point: 0.25 = its upper half
 * (drop before it), 0.5 = an empty list's middle. The slot takes the dragged card's room, so the form near the
 * pointer looks as it did before the drag.
 */
async function drag(page: Page, from: Locator, to: Locator, fy = 0.25) {
  // the target in the middle of the screen: near an edge, @dnd-kit's auto-scroll moves the canvas mid-drag
  await to.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height * fy, { steps: 15 });
  await expect(page.locator("[data-drop-slot]")).toHaveCount(1); // the drop is shown before it happens
  await page.mouse.up();
  await settled(page);
}

/** Wait until no card is mid-animation, so the next drag aims at where cards really are. */
async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
    .toBe(0);
  await page.waitForTimeout(250); // the drop's transform transition (not a Web Animation)
}

const palette = (page: Page, kind: string) => page.locator(`[data-kind="${kind}"]`);
// the builder's cards (Form Preview beside it uses data-pointer too)
const card = (page: Page, pointer: string) =>
  page.getByRole("region", { name: "Editor" }).locator(`[data-pointer="${pointer}"]`);
const box = (page: Page, id: string) => page.locator(`[data-container="${id}"]`);
const order = (page: Page, id: string) =>
  box(page, id).evaluate((el) => [...el.children].map((c) => (c as HTMLElement).dataset.pointer).filter(Boolean));

async function select(page: Page, pointer: string) {
  await card(page, pointer).locator("button[aria-pressed]").first().click();
}

test("build a form by dragging, then issue a PDF from it", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);

  const create = page.getByRole("form", { name: "สร้างรายงาน" });
  await create.getByLabel("id", { exact: true }).fill(ID);
  await create.getByLabel("ชื่อรายงาน").fill("ฟอร์มที่สร้างเอง");
  await create.getByLabel("เริ่มจาก").selectOption({ label: "ว่าง" });
  await create.getByRole("button", { name: "สร้างรายงาน" }).click();
  // a blank report asks for its sheet size and layout first (v1.8): the defaults, A4 and fixed
  await page.getByRole("dialog", { name: "ขนาดกระดาษและรูปแบบ" }).getByRole("button", { name: "สร้าง", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${ID}$`), { timeout: 30_000 });

  // the data schema opens in the form builder, Form Preview beside it
  const files = page.getByRole("navigation", { name: "ไฟล์" });
  await files.getByRole("button", { name: "data.schema.json", exact: true }).click();
  await expect(card(page, "/data/title")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Preview" })).toContainText("Form Preview");

  // the nine kinds into the data, each dropped on the starter's title (so it lands before it)
  const kinds = ["text", "textarea", "number", "money", "date", "choice", "checkbox", "group", "table"];
  for (const kind of kinds) await drag(page, palette(page, kind), card(page, "/data/title"));
  expect((await order(page, "c:data")).sort()).toEqual([...kinds.map((_, i) => `/data/field${i + 1}`), "/data/title"].sort());

  // a field in the group; three columns in the table, money among them
  await drag(page, palette(page, "text"), box(page, "c:data/field8"), 0.5);
  await drag(page, palette(page, "text"), box(page, "c:data/field9"), 0.5);
  await drag(page, palette(page, "number"), card(page, "/data/field9/field1"));
  await drag(page, palette(page, "money"), card(page, "/data/field9/field1"));
  expect(await order(page, "c:data/field9")).toHaveLength(3);
  // a group cannot be a column: refused with the reason
  await drag(page, palette(page, "group"), card(page, "/data/field9/field1"));
  await expect(page.getByText("คอลัมน์ในตารางต้องเป็นช่องธรรมดา")).toBeVisible(); // next also has a role=alert announcer

  // a table can be a column of a table (v1.8, up to three deep): with the table selected, the palette adds one inside it
  await select(page, "/data/field9");
  await palette(page, "table").click();
  expect(await order(page, "c:data/field9")).toHaveLength(4);
  await select(page, "/data/field9/field4");
  await palette(page, "table").click(); // a third level
  expect(await order(page, "c:data/field9/field4")).toHaveLength(1);
  await select(page, "/data/field9/field4/field1");
  await palette(page, "table").click(); // a fourth is refused
  await expect(page.getByText(/ตารางซ้อนได้ไม่เกิน 3 ชั้น/).first()).toBeVisible();

  // dragging a table onto a table's column puts it in that table too
  await drag(page, palette(page, "table"), card(page, "/data/field9/field2"));
  expect(await order(page, "c:data/field9")).toHaveLength(5);

  // two parameters
  await drag(page, palette(page, "text"), box(page, "c:params"), 0.5);
  await drag(page, palette(page, "choice"), card(page, "/params/field1"));
  expect((await order(page, "c:params")).sort()).toEqual(["/params/field1", "/params/field2"]);

  // the keyboard moves the first field down one place: Space, ArrowDown, Space
  const before = await order(page, "c:data");
  const handle = card(page, before[0]!).getByRole("button", { name: /^ลาก / }).first();
  await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settled(page);
  await handle.focus();
  // a beat between keys, as a person gives: @dnd-kit measures after the lift before it can move
  for (const key of ["Space", "ArrowDown", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
  }
  await expect.poll(() => order(page, "c:data")).toEqual([before[1], before[0], ...before.slice(2)]);
  await settled(page);
  const dataOrder = await order(page, "c:data");

  // properties: a label, half width, radio for the choice
  await select(page, "/data/field1");
  const label = page.locator("label", { hasText: /^ป้าย/ }).locator("input");
  await label.fill("ชื่อผู้ติดต่อ");
  await label.blur();
  await page.locator("label", { hasText: /^ความกว้าง/ }).locator("select").selectOption("half");
  await select(page, "/data/field6");
  await page.locator("label", { hasText: /^แสดงเป็น/ }).locator("select").selectOption("radio");

  // Form Preview follows the unsaved edits
  await expect(page.getByRole("region", { name: "Preview" }).getByText("ชื่อผู้ติดต่อ")).toBeVisible();

  // a hand edit of the schema shows in the builder ("แก้ไข JSON" and back), then one save writes everything
  await page.getByRole("button", { name: "แก้ไข JSON" }).click();
  const schema = JSON.parse(await editorText(page));
  expect(schema.properties.field1.title).toBe("ชื่อผู้ติดต่อ"); // the builder's edit is in the text
  schema.properties.field3.title = "จำนวนที่แก้มือ";
  await setEditorText(page, `${JSON.stringify(schema, null, 2)}\n`);
  await page.getByRole("button", { name: "แก้ไขแบบฟอร์ม" }).click();
  await expect(card(page, "/data/field3")).toContainText("จำนวนที่แก้มือ");
  await page.getByRole("button", { name: "บันทึก (Ctrl+S)" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible({ timeout: 30_000 });
  await expect(files.getByRole("button", { name: "form.json", exact: true })).toBeVisible(); // created by the builder
  await expect(page.getByRole("tab", { name: "Problems" })).toHaveText("Problems"); // no count: nothing wrong

  // publish, then the lead's form follows form.json
  await page.getByRole("button", { name: "Publish" }).click();
  const publish = page.getByRole("dialog", { name: "Publish" });
  await publish.getByRole("button", { name: "Publish" }).click();
  await expect(publish).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "true");

  await page.goto(`/templates/${ID}?mode=issue`);
  const form = page.getByRole("form", { name: "ฟอร์มออกเอกสาร" });
  await expect(form).toBeVisible({ timeout: 30_000 });
  const pointers = await form.evaluate((el) =>
    [...el.querySelectorAll(":scope > [data-pointer]")].map((c) => (c as HTMLElement).dataset.pointer),
  );
  expect(pointers).toEqual(dataOrder); // the builder's order is the form's order
  await expect(form.locator('[data-pointer="/data/field2"] textarea')).toBeVisible();
  await expect(form.locator('[data-pointer="/data/field6"] [role="radiogroup"]')).toBeVisible();
  expect(await form.locator('[data-pointer="/data/field1"]').getAttribute("class")).toMatch(/half/);
  await expect(form.getByText("ชื่อผู้ติดต่อ")).toBeVisible();

  await form.locator("#f-data-title").fill("สวัสดีจากฟอร์มที่สร้างเอง");
  await form.locator("#f-data-field1").fill("สมชาย");
  await form.locator("#f-data-field4").fill("1250.5");
  const response = page.waitForResponse((r) => r.url().endsWith(`/issue/${ID}`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "ออก PDF" }).click();
  const issued = await response;
  expect(issued.status(), await issued.text().catch(() => "")).toBe(200);
  expect(issued.headers()["content-type"]).toContain("application/pdf");
});
