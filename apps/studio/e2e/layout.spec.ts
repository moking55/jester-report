// v1.8 (tasks/v1.8/todo.md T16): the sheet size and layout chosen when a report is made, and what the designer does with
// them: a roll 80 mm receipt prints one page as tall as its content; a free A5 sheet takes boxes dropped, dragged and
// snapped by the pointer and prints them where they sit; a header with a logo and a footer with page numbers repeat
// on every page; lists nested three deep (order → detail → part) print every level.
// Makes its own reports (ids below; E2E_LAYOUT_SUFFIX reruns on a stack that has them). The file name sorts after
// full-flow (which wants an empty catalog) and before lifecycle.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { createReport, login, pdfInfo, previewPdf, thai } from "./shared";

test.use({ viewport: { width: 1440, height: 900 } });

const SUFFIX = process.env.E2E_LAYOUT_SUFFIX ?? "";
const id = (name: string) => `${name}${SUFFIX}`;

/** The PDF's pages through python + pypdf; without them the PDF checks are left out, and the run says so. */
function pages(pdf: Buffer) {
  const info = pdfInfo(pdf);
  if (!info) test.info().annotations.push({ type: "pdf-checks-skipped", description: "python with pypdf not found" });
  return info;
}

// a 1×1 GIF: a picture the api takes as a logo
const GIF = Buffer.from("R0lGODlhAQABAIAAAExpcf8AACH5BAUAAAAALAAAAAABAAEAAAICTAEAOw==", "base64");

async function createBlank(page: Page, rid: string, name: string, choose?: (form: Locator) => Promise<void>) {
  await page.goto("/");
  await createReport(page, rid, name, "ว่าง", choose);
}

async function openDesigner(page: Page, rid: string) {
  await page.goto(`/templates/${rid}/designer`);
  await expect(page.locator("[data-paper]")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500); // fonts and the first layout
}

async function save(page: Page) {
  await page.waitForTimeout(150); // @dnd-kit swallows clicks for 50 ms after a drag ends; a person is slower
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^บันทึกแล้ว$/ })).toBeVisible({ timeout: 30_000 });
}

const sheetBox = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector("[data-paper]")!.shadowRoot!.querySelector(sel)!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);

/** A real mouse drag from a palette item to a point on the screen. */
async function dropAt(page: Page, kind: string, x: number, y: number) {
  const from = (await page.locator(`[data-kind="${kind}"]`).first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 4 });
  await page.mouse.move(x, y, { steps: 15 });
  await page.mouse.up();
}

test("a roll 80 mm receipt prints one page as tall as its content", async ({ page }) => {
  test.setTimeout(180_000);
  const rid = id("e2e-roll");
  await login(page);
  await createBlank(page, rid, "ใบเสร็จม้วน", async (dialog) => {
    // a roll is a flow layout only: the free card is switched off
    await dialog.getByLabel("ขนาดกระดาษ").selectOption("roll80");
    await expect(dialog.getByRole("radio", { name: /จัดวางแบบอิสระ/ })).toBeDisabled();
  });

  await openDesigner(page, rid);
  const sheet = await sheetBox(page, ".jd-sheet");
  expect(Math.round((sheet.w / 96) * 25.4)).toBe(80);

  const pdf = pages(await previewPdf(page, rid));
  if (pdf) {
    expect(pdf).toHaveLength(1);
    expect(pdf[0].widthMm).toBeCloseTo(80, 0);
    expect(pdf[0].heightMm).toBeLessThan(400); // as tall as the content, not a sheet
  }
});

test("a free A5 sheet: boxes dropped at the pointer, dragged, snapped, then printed where they sit", async ({ page }) => {
  test.setTimeout(240_000);
  const rid = id("e2e-free");
  await login(page);
  await createBlank(page, rid, "ฟอร์มพิกัด", async (dialog) => {
    await dialog.getByRole("radio", { name: /จัดวางแบบอิสระ/ }).click();
    await dialog.getByLabel("ขนาดกระดาษ").selectOption("A5");
    await dialog.getByLabel("แนวนอน").check();
  });

  await openDesigner(page, rid);
  await expect(page.getByText("แบบอิสระ", { exact: true })).toBeVisible();
  const sheet = await sheetBox(page, "[data-jd-page]");
  const mm = sheet.w / 210; // screen px per mm
  expect(Math.round(sheet.h / mm)).toBe(148); // A5 landscape

  // a text box dropped with its corner at (20, 15) mm; a rectangle and a line
  await dropAt(page, "text", sheet.x + 20 * mm, sheet.y + 15 * mm);
  const x = page.getByLabel("X (mm)");
  const y = page.getByLabel("Y (mm)");
  await expect(x).toHaveValue("20");
  await expect(y).toHaveValue("15");
  await expect(page.getByLabel("กว้าง (mm)")).toHaveValue("60");
  await dropAt(page, "rect", sheet.x + 100 * mm, sheet.y + 60 * mm);
  await expect(x).toHaveValue("100");
  await dropAt(page, "line", sheet.x + 20 * mm, sheet.y + 110 * mm);
  await expect(page.locator("[data-paper] .jd-fbox")).toHaveCount(3);

  // type in the text box
  await page.locator('[data-paper] .jd-fbox[data-kind="box"]').first().dblclick();
  await expect(page.locator(".jd-editing")).toBeVisible();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("ชื่อลูกค้า");
  await page.keyboard.press("Enter");
  await expect(page.locator(".jd-editing")).toHaveCount(0);

  // drag the text box left to 0.8 mm from the sheet's edge: it snaps to the edge (X 0); with Alt it follows the pointer
  const text = page.locator('[data-paper] .jd-fbox[data-kind="box"]').first();
  await text.click();
  async function dragBy(dxMm: number, dyMm: number, alt = false) {
    const b = (await text.boundingBox())!;
    const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await page.mouse.move(from.x, from.y);
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y, { steps: 3 });
    await page.mouse.move(from.x + dxMm * mm, from.y + dyMm * mm, { steps: 10 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
  }
  await dragBy(-19.2, 0);
  await expect(x).toHaveValue("0");
  await dragBy(10.4, 0, true);
  await expect(x).toHaveValue("10.4"); // Alt: no snapping, to 0.1 mm
  await dragBy(-10.4, 0);
  await expect(x).toHaveValue("0");

  // the numbers in the panel move the box; the arrow keys nudge it 0.5 mm, Shift 5 mm
  await x.fill("12");
  await x.press("Enter");
  await expect(x).toHaveValue("12");
  await text.click();
  await page.keyboard.press("ArrowRight");
  await expect(x).toHaveValue("12.5");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(y).toHaveValue("20");

  // one undo step per drag: the last arrow goes, then the one before
  await page.getByRole("button", { name: "เลิกทำ" }).click();
  await expect(y).toHaveValue("15");
  await page.getByRole("button", { name: "เลิกทำ" }).click();
  await expect(x).toHaveValue("12");
  await page.getByRole("button", { name: "ทำซ้ำ" }).click();
  await page.getByRole("button", { name: "ทำซ้ำ" }).click();
  await expect(x).toHaveValue("12.5");

  // a guide picture: shown while designing, hidden on demand, not printed
  await page.mouse.click(sheet.x + 150 * mm, sheet.y + 120 * mm); // the empty sheet: nothing selected
  await page.locator('input[aria-label="เลือกภาพพื้นหลังนำทาง"]').setInputFiles({ name: "guide.gif", mimeType: "image/gif", buffer: GIF });
  await expect(page.locator('[data-paper] img[data-jd="guide"]')).toHaveCount(1, { timeout: 30_000 });
  await page.getByLabel("แสดงภาพ").uncheck();
  await expect(page.locator('[data-paper] img[data-jd="guide"]')).toHaveCount(0);
  await page.getByLabel("แสดงภาพ").check();

  // changing the sheet in the toolbar rewrites the page in template.html too (one undo step)
  await page.getByLabel("ขนาดกระดาษ", { exact: true }).selectOption("A4");
  const resized = await sheetBox(page, "[data-jd-page]");
  expect(Math.round(resized.w / mm)).toBe(297); // A4 landscape
  await page.getByRole("button", { name: "เลิกทำ" }).click();
  expect(Math.round((await sheetBox(page, "[data-jd-page]")).w / mm)).toBe(210);

  await save(page);
  const info = pages(await previewPdf(page, rid));
  if (info) {
    expect(info).toHaveLength(1);
    expect(info[0].widthMm).toBeCloseTo(210, 0);
    expect(info[0].heightMm).toBeCloseTo(148, 0);
    expect(thai(info[0].text)).toContain(thai("ชื่อลูกค้า"));
    expect(info[0].images).toBe(0); // the guide picture is not printed
  }
});

test("ข้อความล้นกล่อง: a selected box is not flagged, text longer than its box is", async ({ page }) => {
  // regression: the resize handles of a selected box hang below it and were measured as its content (v1.15.2 fix)
  test.setTimeout(120_000);
  const rid = id("e2e-overflow");
  await login(page);
  await createBlank(page, rid, "กล่องล้น", async (dialog) => {
    await dialog.getByRole("radio", { name: /จัดวางแบบอิสระ/ }).click();
    await dialog.getByLabel("ขนาดกระดาษ").selectOption("A5");
  });
  await openDesigner(page, rid);
  const sheet = await sheetBox(page, "[data-jd-page]");
  const mm = sheet.w / 148;
  await dropAt(page, "text", sheet.x + 20 * mm, sheet.y + 20 * mm);
  const text = page.locator('[data-paper] .jd-fbox[data-kind="box"]').first();
  await text.click();
  await expect(text).toHaveClass(/jd-selected/);
  await expect(page.locator("[data-paper] .jd-rh")).not.toHaveCount(0); // the handles are there
  await expect(page.locator("[data-paper] .jd-over")).toHaveCount(0);

  // three lines in a box one line tall: flagged, selected or not
  await text.dblclick();
  await expect(page.locator(".jd-editing")).toBeVisible();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("ข้อความยาวมากที่ไม่พอดีกล่อง ".repeat(6));
  await page.keyboard.press("Enter");
  await expect(page.locator(".jd-editing")).toHaveCount(0);
  await expect(page.locator("[data-paper] .jd-over")).toHaveCount(1);
  await page.mouse.click(sheet.x + 120 * mm, sheet.y + 150 * mm); // nothing selected
  await expect(page.locator("[data-paper] .jd-over")).toHaveCount(1);
});

test("layers and resizing: ส่งไปหลังสุด shows at once, a resized QR box resizes the QR code", async ({ page }) => {
  // regressions (v1.15.2): the selected box was always drawn in front, and a QR code kept its size in a resized box
  test.setTimeout(120_000);
  const rid = id("e2e-layers");
  await login(page);
  await createBlank(page, rid, "ชั้นและขนาด", async (dialog) => {
    await dialog.getByRole("radio", { name: /จัดวางแบบอิสระ/ }).click();
    await dialog.getByLabel("ขนาดกระดาษ").selectOption("A5");
  });
  await openDesigner(page, rid);
  const sheet = await sheetBox(page, "[data-jd-page]");
  const mm = sheet.w / 148;
  await dropAt(page, "code", sheet.x + 10 * mm, sheet.y + 10 * mm); // QR box 30 x 30 mm at (10, 10)
  await expect(page.locator("[data-paper] .jd-over")).toHaveCount(0); // the default 30 mm QR code fits its box
  await dropAt(page, "rect", sheet.x + 20 * mm, sheet.y + 20 * mm); // a rectangle over its corner, selected
  const kindAt = (xMm: number, yMm: number) =>
    page.evaluate(([x, y]) => {
      const el = document.querySelector("[data-paper]")!.shadowRoot!.elementFromPoint(x, y)?.closest(".jd-fbox") as HTMLElement | null;
      return el?.dataset.kind ?? "none";
    }, [sheet.x + xMm * mm, sheet.y + yMm * mm] as const);
  expect(await kindAt(30, 30)).toBe("rect");
  await page.waitForTimeout(150); // @dnd-kit swallows clicks for 50 ms after a drag ends; a person is slower
  await page.getByRole("button", { name: "ส่งไปหลังสุด" }).click();
  await expect(page.locator("[data-paper] .jd-selected")).toHaveAttribute("data-kind", "rect"); // still selected …
  await expect.poll(() => kindAt(30, 30)).toBe("box"); // … and already behind the QR box

  // drag the QR box's corner from 30 to 50 mm: the QR code (drawn at its printed size) grows with it
  const qr = page.locator('[data-paper] .jd-fbox[data-kind="box"]').first();
  await qr.click();
  const size = () => qr.locator("svg").evaluate((e) => Math.round(e.getBoundingClientRect().width));
  expect(Math.abs((await size()) - 30 * mm)).toBeLessThan(3); // fmt.qr's default 30 mm
  const h = (await page.locator("[data-paper] .jd-rh-se").boundingBox())!;
  await page.mouse.move(h.x + 4, h.y + 4);
  await page.mouse.down();
  await page.mouse.move(h.x + 4 + 20 * mm, h.y + 4 + 20 * mm, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByLabel("กว้าง (mm)")).toHaveValue("50");
  await expect.poll(size).toBeGreaterThan(48 * mm);
  await expect(page.locator("[data-paper] .jd-over")).toHaveCount(0);
});

test("a header logo and a footer with page numbers repeat on every page", async ({ page }) => {
  test.setTimeout(240_000);
  const rid = id("e2e-running");
  await login(page);
  await createBlank(page, rid, "หัวท้ายกระดาษ");
  await openDesigner(page, rid);

  // header: double-click the zone, drop a picture (none uploaded yet: the file chooser opens)
  await page.locator(".jd-zone-header").dblclick();
  await expect(page.getByText(/กำลังแก้ header\.html/)).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  const zone = (await page.locator(".jd-zone-header").boundingBox())!;
  await dropAt(page, "image", zone.x + zone.width / 2, zone.y + zone.height / 2);
  await (await chooser).setFiles({ name: "logo.gif", mimeType: "image/gif", buffer: GIF });
  await expect(page.locator('.jd-zone-header img')).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: "กลับไปแก้เนื้อหา" }).click();

  // the body: two page breaks make three pages
  const end = (await page.locator("[data-paper] .jd-sheet").boundingBox())!;
  for (let i = 0; i < 2; i++) await dropAt(page, "pagebreak", end.x + end.width / 2, end.y + 400);
  await save(page);

  const info = pages(await previewPdf(page, rid));
  if (info) {
    expect(info.length).toBeGreaterThanOrEqual(3);
    for (const p of info) expect(p.images, "the header logo on every page").toBeGreaterThanOrEqual(1);
    info.forEach((p, i) => expect(p.text).toContain(`${i + 1}/${info.length}`)); // footer: หน้า n/N
  }
});

test("lists nested three deep print every level", async ({ page, request }) => {
  test.skip(!process.env.STUDIO_E2E_API_URL, "STUDIO_E2E_API_URL is not set");
  test.setTimeout(240_000);
  const rid = id("e2e-nest3");
  const api = new URL(process.env.STUDIO_E2E_API_URL!).origin;
  await login(page);

  // the report is written through the api: an order has details, a detail has parts
  const { token } = (await (await request.post(`${api}/v1/auth/login`, { data: { username: "e2e-admin", password: "e2e correct horse battery" } })).json()) as { token: string };
  const auth = { Authorization: `Bearer ${token}` };
  const made = await request.post(`${api}/v1/templates`, { headers: auth, data: { id: rid, name: "ใบสั่งซื้อสามชั้น", starter: "blank" } });
  expect(made.status()).toBe(201);
  const files: Record<string, string> = {
    "report.json": JSON.stringify({
      schemaVersion: 1,
      name: "ใบสั่งซื้อสามชั้น",
      fonts: { body: ["TH Sarabun New"], headerFooter: ["TH Sarabun New"] },
      data: { schema: "data.schema.json", samples: ["sample.json"] },
      lists: {
        orders: {
          path: "/orders",
          id: "orderId",
          totals: { labourTotal: "sum(details.labour)" },
          lists: {
            details: {
              path: "/details",
              id: "detailId",
              computed: { labour: "hours * rate" },
              lists: { parts: { path: "/parts", id: "partId" } },
            },
          },
        },
      },
    }),
    "data.schema.json": JSON.stringify({
      type: "object",
      required: ["orders"],
      properties: {
        orders: {
          type: "array",
          items: {
            type: "object",
            required: ["orderId", "details"],
            properties: {
              orderId: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  required: ["detailId", "hours", "rate", "parts"],
                  properties: {
                    detailId: { type: "string" },
                    hours: { type: "number" },
                    rate: { type: "number" },
                    parts: {
                      type: "array",
                      items: { type: "object", required: ["partId", "price"], properties: { partId: { type: "string" }, price: { type: "number" } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    "sample.json": JSON.stringify({
      orders: [
        { orderId: "PO1", details: [{ detailId: "D1", hours: 2, rate: 100, parts: [{ partId: "P1", price: 10.5 }, { partId: "P2", price: 20 }] }, { detailId: "D2", hours: 1, rate: 50, parts: [] }] },
        { orderId: "PO2", details: [] },
      ],
    }),
    "template.html": [
      '<table style="width: 100%">',
      "  <thead><tr><th>ใบสั่งซื้อ</th><th>ค่าแรงรวม</th></tr></thead>",
      "  <tbody>",
      "  {% for o in lists.orders %}",
      "    <tr><td>{{ o.orderId }}</td><td>{{ o.labourTotal }}</td></tr>",
      '    <tr data-jd="detail"><td colspan="2">',
      '      <table style="width: 100%">',
      "        <thead><tr><th>งาน</th><th>ค่าแรง</th></tr></thead>",
      "        <tbody>",
      "        {% for d in o.details %}",
      "          <tr><td>{{ d.detailId }}</td><td>{{ d.labour }}</td></tr>",
      '          <tr data-jd="detail"><td colspan="2">',
      "            {% for p in d.parts %}",
      "            <div>{{ p.partId }} = {{ p.price }}</div>",
      "            {% endfor %}",
      "          </td></tr>",
      "        {% endfor %}",
      "        </tbody>",
      "      </table>",
      "    </td></tr>",
      "  {% endfor %}",
      "  </tbody>",
      "</table>",
      "",
    ].join("\n"),
  };
  for (const [name, body] of Object.entries(files)) {
    const { revision } = (await (await request.get(`${api}/v1/templates/${rid}/draft`, { headers: auth })).json()) as { revision: string };
    const put = await request.put(`${api}/v1/templates/${rid}/draft/files/${name}`, {
      headers: { ...auth, "Content-Type": "text/plain; charset=utf-8", "If-Match": `"${revision}"` },
      data: body,
    });
    expect(put.status(), `${name}: ${await put.text()}`).toBeLessThan(300);
  }

  // the designer reads the table, its detail row and the table inside it as blocks (none is Custom Code)
  await openDesigner(page, rid);
  await expect(page.locator("[data-paper] table").first()).toBeVisible();
  await expect(page.locator("[data-paper] .jd-custom")).toHaveCount(0);

  const info = pages(await previewPdf(page, rid));
  if (info) {
    const text = info.map((p) => p.text).join("\n");
    for (const part of ["PO1", "PO2", "D1", "D2", "P1", "P2"]) expect(text, part).toContain(part);
    expect(text).toContain("250"); // PO1's labour: 2 × 100 + 1 × 50
    expect(text).toContain("10.5");
  }
});
