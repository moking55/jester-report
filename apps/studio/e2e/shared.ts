// Shared by the specs. They run in file order on one fresh stack (workers: 1): checkpoint-a does the setup.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

export type PdfPage = { widthMm: number; heightMm: number; text: string; images: number; fonts: string[] };

/**
 * A PDF's pages (size, text, pictures, fonts) read with pypdf (E2E_PYTHON, the api's .venv, or `python`); null when python or pypdf is not there, so the
 * specs that look inside a PDF check only what they can then. Thai marks vary in a PDF's text (the font's own glyph
 * forms): compare with `thai()`.
 */
export function pdfInfo(pdf: Buffer): PdfPage[] | null {
  const script = [
    "import sys, io, json",
    "from pypdf import PdfReader",
    "r = PdfReader(io.BytesIO(sys.stdin.buffer.read()))",
    "def fonts(p):",
    "    r = p['/Resources'] if '/Resources' in p else {}",
    "    f = r['/Font'] if '/Font' in r else {}",
    "    return sorted({str(v.get_object().get('/BaseFont', '')) for v in f.values()})",
    'print(json.dumps([{"widthMm": float(p.mediabox.width) * 25.4 / 72, "heightMm": float(p.mediabox.height) * 25.4 / 72, "text": p.extract_text(), "images": len(p.images), "fonts": fonts(p)} for p in r.pages]))',
  ].join("\n");
  // the api's own environment has pypdf; a bare `python` often does not
  const pythons = [
    process.env.E2E_PYTHON,
    join(process.cwd(), "../api/.venv/Scripts/python.exe"), // Playwright runs from apps/studio
    join(process.cwd(), "../api/.venv/bin/python"),
    "python",
  ].filter((p): p is string => !!p && (p === "python" || existsSync(p)));
  for (const python of pythons) {
    try {
      const out = execFileSync(python, ["-c", script], { input: pdf, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      return JSON.parse(out) as PdfPage[];
    } catch {
      // the next python
    }
  }
  return null;
}

/** Thai text without its marks and the font's private glyph forms: what a PDF's text and the template's text share. */
export const thai = (text: string) =>
  [...text.replace(/ำ/g, "า")].filter((c) => !/\p{M}/u.test(c) && !(c >= "" && c <= "")).join("");

/** Preview pdf of the saved draft as the designer asks for it (the page's cookies carry the login). */
export async function previewPdf(page: Page, id: string, params = "{}"): Promise<Buffer> {
  const response = await page.request.post(`/preview/${id}`, { multipart: { params } });
  expect(response.status(), await response.text().catch(() => "")).toBe(200);
  return Buffer.from(await response.body());
}
