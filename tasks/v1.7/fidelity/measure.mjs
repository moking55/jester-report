// T11: where the main pieces of text sit on the Document Designer's paper (sample mode), plus the draft's PDF.
// Not part of E2E. Run from apps/studio with the test stack reachable:
//   STUDIO=http://localhost:3100 API=http://localhost:8002 node ../../tasks/v1.7/fidelity/measure.mjs
// Writes <id>.paper.json, <id>.pdf and <id>.paper.png next to this file; compare.py reads them.
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

export const CASES = {
  "d-quote": { starter: "quotation", anchors: ["ใบเสนอราคา", "เรียน", "รหัส", "QL01", "QL02", "รวม", "ยอดสุทธิ"] },
  "d-tax": { starter: "tax-invoice", anchors: ["ใบกำกับภาษี", "Tax Invoice", "ผู้ซื้อ", "เลขที่", "ลำดับ", "ยอด 25", "ผู้มีอำนาจลงนาม"] },
};

async function api(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
}

/** The draft carries the v1.7 starter's template.html and report.css. */
async function useStarter(token, id, starter) {
  for (const name of ["template.html", "report.css"]) {
    const { revision } = await api(token, `/v1/templates/${id}/draft`);
    await api(token, `/v1/templates/${id}/draft/files/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8", "If-Match": `"${revision}"` },
      body: readFileSync(join(STARTERS, starter, name), "utf8"),
    });
  }
}

const { token } = await api(null, "/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: USER, password: PASSWORD }),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${STUDIO}/login`);
await page.getByLabel("ชื่อผู้ใช้").fill(USER);
await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
await page.getByRole("heading", { name: "รายงาน" }).waitFor({ timeout: 30_000 });

for (const [id, c] of Object.entries(CASES)) {
  await useStarter(token, id, c.starter);
  await page.goto(`${STUDIO}/templates/${id}/designer`);
  await page.getByLabel("แสดงข้อมูลตัวอย่าง").click(); // turns on after the sample has loaded
  await page.waitForFunction(() => document.querySelector('input[type="checkbox"]')?.checked, null, { timeout: 30_000 });
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
  writeFileSync(join(here, `${id}.paper.json`), JSON.stringify(found, null, 2));
  await page.locator("[data-paper]").screenshot({ path: join(here, `${id}.paper.png`) });
  console.log(id, found);
}
await browser.close();
