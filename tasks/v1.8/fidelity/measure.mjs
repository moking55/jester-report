// v1.8 T15: where the main pieces of text sit on the Document Designer's paper, on every sheet size the designer knows,
// plus the draft's PDF. Not part of E2E. Run from apps/studio with the test stack reachable:
//   STUDIO=http://localhost:3100 API=http://localhost:8002 node ../../tasks/v1.8/fidelity/measure.mjs
// Writes <id>.paper.json, <id>.pdf and <id>.paper.png next to this file; compare.py reads them.
//   CASES=f-a5,f-roll80 limits the run to those ids.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../apps/studio/package.json"));
const { chromium } = require("playwright");

const STUDIO = process.env.STUDIO ?? "http://localhost:3100";
const API = process.env.API ?? "http://localhost:8002";
const USER = "e2e-admin";
const PASSWORD = "e2e correct horse battery";
const STARTERS = join(here, "../../../apps/api/src/jester_api/template_store/starters");

const QUOTE = ["ใบเสนอราคา", "เรียน", "รหัส", "QL01", "QL02", "รวม", "ยอดสุทธิ"];

// a free A5 landscape sheet: text placed by mm; the page div is the sheet
const FREE_HTML = `<div data-jd="page" style="position: relative; width: 210mm; height: 148mm">
  <div data-jd="box" style="position: absolute; left: 12mm; top: 10mm; width: 80mm; height: 10mm"><p style="margin-top: 0mm; margin-bottom: 0mm">กล่องมุมซ้าย</p></div>
  <div data-jd="box" style="position: absolute; left: 120.5mm; top: 33.3mm; width: 70mm; height: 10mm"><h2 style="margin-top: 0mm; margin-bottom: 0mm">หัวข้อกลาง</h2></div>
  <div data-jd="box" style="position: absolute; left: 20mm; top: 90mm; width: 100mm; height: 12mm"><p style="margin-top: 0mm; margin-bottom: 0mm">ล่างซ้ายสุด</p></div>
  <div data-jd="rect" style="position: absolute; left: 100mm; top: 60mm; width: 40mm; height: 20mm; border: 0.3mm solid #000"></div>
  <div data-jd="box" style="position: absolute; left: 150mm; top: 120mm; width: 50mm; height: 10mm"><p style="margin-top: 0mm; margin-bottom: 0mm">มุมขวาล่าง</p></div>
</div>
`;
const ROLL_HTML = `<div style="text-align: center; font-weight: bold">ร้านตัวอย่าง</div>
<hr>
<div>ใบเสร็จรับเงิน</div>
<div>กาแฟเย็น x2</div>
<div>ขนมปังปิ้ง x1</div>
<hr>
<div style="text-align: center">ขอบคุณที่ใช้บริการ</div>
`;

// kind "starter": a copy of a v1.7 starter with its report.json page replaced; "blank": a blank report made with a page
export const CASES = {
  "f-a5": { starter: "quotation", page: { size: "A5" }, anchors: QUOTE, limit: 2 },
  "f-letter": { starter: "quotation", page: { size: "Letter" }, anchors: QUOTE, limit: 2 },
  "f-custom": { starter: "quotation", page: { size: "custom", widthMm: 180, heightMm: 250 }, anchors: QUOTE, limit: 2 },
  "f-roll80": {
    starter: "blank",
    page: { size: "roll", rollWidthMm: 80 },
    html: ROLL_HTML,
    anchors: ["ร้านตัวอย่าง", "ใบเสร็จรับเงิน", "กาแฟเย็น", "ขนมปังปิ้ง", "ขอบคุณที่ใช้บริการ"],
    limit: 2,
  },
  "f-free-a5": {
    starter: "blank",
    page: { size: "A5", orientation: "landscape", layout: "free" },
    html: FREE_HTML,
    anchors: ["กล่องมุมซ้าย", "หัวข้อกลาง", "ล่างซ้ายสุด", "มุมขวาล่าง"],
    limit: 0.5,
  },
};

async function api(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok && res.status !== 409) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
}

async function put(token, id, name, body) {
  const { revision } = await api(token, `/v1/templates/${id}/draft`);
  await api(token, `/v1/templates/${id}/draft/files/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain; charset=utf-8", "If-Match": `"${revision}"` },
    body,
  });
}

/** Make (or reuse) the report and put the case's files in its draft. */
async function prepare(token, id, c) {
  const body = { id, name: id, starter: c.starter };
  if (c.starter === "blank") body.page = c.page;
  await api(token, "/v1/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (c.starter !== "blank") {
    for (const name of ["template.html", "report.css", "report.json"]) {
      let text = readFileSync(join(STARTERS, c.starter === "quotation" ? "quotation" : c.starter, name), "utf8");
      if (name === "report.json") {
        const report = JSON.parse(text);
        report.page = c.page;
        text = JSON.stringify(report, null, 2);
      }
      await put(token, id, name, text);
    }
  } else {
    await put(token, id, "template.html", c.html);
  }
}

const { token } = await api(null, "/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: USER, password: PASSWORD }),
});

const only = process.env.CASES?.split(",");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${STUDIO}/login`);
await page.getByLabel("ชื่อผู้ใช้").fill(USER);
await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
await page.getByRole("heading", { name: "รายงาน" }).waitFor({ timeout: 60_000 });

for (const [id, c] of Object.entries(CASES)) {
  if (only && !only.includes(id)) continue;
  await prepare(token, id, c);
  await page.goto(`${STUDIO}/templates/${id}/designer`);
  await page.locator("[data-paper]").waitFor({ timeout: 60_000 });
  await page.getByLabel("แสดงข้อมูลตัวอย่าง").click(); // turns on after the sample has loaded
  await page.waitForFunction(() => document.querySelector('input[type="checkbox"]')?.checked, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready);
  // the PDF of the saved draft, with the params the designer uses
  await page.getByRole("button", { name: "Preview pdf" }).click();
  const params = await page.locator('input[name="params"]').inputValue();
  const pdf = await page.evaluate(
    async ([id, params]) => {
      const body = new FormData();
      body.set("params", params);
      const res = await fetch(`/preview/${id}`, { method: "POST", body });
      return Array.from(new Uint8Array(await res.arrayBuffer()));
    },
    [id, params],
  );
  writeFileSync(join(here, `${id}.pdf`), Buffer.from(pdf));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ปิด" }).click().catch(() => {});

  // each anchor's baseline start, in mm from the sheet's top-left corner
  const found = await page.evaluate((anchors) => {
    const root = document.querySelector("[data-paper]").shadowRoot;
    const sheet = root.querySelector(".jd-sheet").getBoundingClientRect();
    const mm = 25.4 / 96;
    const out = {};
    for (const a of anchors) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.data.indexOf(a);
        if (at < 0 || n.parentElement.closest(".jd-margin, .jd-container-label, .jd-custom-label")) continue;
        const probe = document.createElement("span");
        probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
        const rest = n.splitText(at);
        rest.before(probe);
        const r = probe.getBoundingClientRect();
        out[a] = { x: +((r.left - sheet.left) * mm).toFixed(2), y: +((r.top - sheet.top) * mm).toFixed(2), lineStart: !n.data.trim() };
        probe.remove();
        n.parentNode.normalize();
        break;
      }
    }
    return out;
  }, c.anchors);
  writeFileSync(join(here, `${id}.paper.json`), JSON.stringify({ limit: c.limit, anchors: found }, null, 2));
  await page.locator("[data-paper]").screenshot({ path: join(here, `${id}.paper.png`) });
  console.log(id, found);
}
await browser.close();
