# Spec: `studio`

สถานะ: **อนุมัติแล้ว 15 พ.ย. 2026** (ปรับตาม interview)
Module id: `studio` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: `public-api` (ผ่าน [public-api.yaml](apps/api/openapi/public-api.yaml)) · ถูกใช้โดย: นักพัฒนาในทีมผ่าน browser
อ้างอิง: [intent](docs/intent/report-server-v1.md) (stack ของ frontend), [mockup](design/studio-mvp.html), [SPEC-public-api.md](SPEC-public-api.md) (`X-Jester-Studio-Key`, `X-Jester-Client-IP`), [SPEC-auth.md](SPEC-auth.md)

## สมมติฐาน (ผู้ใช้ยืนยันใน interview)

1. **Stack ตาม intent:** Next.js (App Router, TypeScript)
   - หน้าเป็น **Server Components** เป็นหลัก ดึงข้อมูลจาก FastAPI แบบ server-to-server
   - Client Components เฉพาะส่วนที่โต้ตอบ (editor, PDF preview, แท็บล่าง, Render dialog, ฟอร์ม theme)
   - **Client state ใช้ `useImmer` เท่านั้น** (ส่งต่อผ่าน props/Context ได้) — ไม่มี Redux/Zustand/Jotai/React Query/SWR
   - การเขียนข้อมูลผ่าน **Server Actions** → FastAPI; browser ไม่เรียก FastAPI ตรง (ไม่ต้องเปิด CORS)
2. **Session:** token (`jrs_…`) อยู่ใน cookie `httpOnly; Secure; SameSite=Lax` ที่ Next.js ตั้งตอน login/setup; ทุกการเรียก API จาก server ใส่ `Authorization: Bearer …`, `X-Jester-Studio-Key` (env `JESTER_STUDIO_KEY` เดียวกับ api) และ `X-Jester-Client-IP`; 401 → ลบ cookie แล้วไปหน้า login
3. **Type จาก contract:** สร้าง TypeScript types จาก `public-api.yaml` ด้วย `openapi-typescript` แล้วเขียน client บาง ๆ บน `fetch`; contract เปลี่ยนแล้ว type ไม่ตรง → build ล้ม
4. **หน้าจอ:**
   - `setup` (setup token + บัญชีแรก), `login`
   - `catalog` (รายการรายงาน + สร้างจาก starter): มุมมอง **ตาราง** (ค่าเริ่มต้น) หรือ **การ์ด** สลับด้วยไอคอนข้างหัวเรื่อง จำไว้ใน cookie `jester_catalog_view`
   - `workspace`: ไฟล์ / editor / PDF preview / แท็บล่าง **Problems, Prepared data, Provenance, Versions** (ไม่มี Engine log — Gotenberg ไม่คืน log ต่อ request และ trace/options อยู่ใน Provenance แล้ว)
     - **ตรวจ draft อัตโนมัติ** ตอนเปิดและทุกครั้งที่ revision เปลี่ยน (บันทึก, เพิ่ม/ลบไฟล์หรือ asset, reset) — ไม่มีปุ่ม Validate; ตรวจเฉพาะสิ่งที่บันทึกแล้ว เพราะ api ตรวจจาก draft
     - ปุ่ม Preview, **Publish (สีเขียว)**, **Render… (สีหลัก)**; Render dialog พร้อมตัวอย่าง `curl` ปิดได้ด้วย × หรือปุ่มปิด; versions + rollback + reset
     - **ดู diff ก่อนยืนยัน** (`@codemirror/merge` แบบ unified, อ่านอย่างเดียว; asset เทียบ sha256): Publish = draft ที่พิมพ์อยู่ (รวมที่ยังไม่บันทึก) เทียบ published พร้อมช่องโน้ต ปุ่มปิดเมื่อไม่มีอะไรเปลี่ยน; ตั้งเป็น published = vN เทียบ published; reset draft = draft เทียบ vN
     - ปุ่ม **"+ เพิ่มไฟล์"** เปิดเมนู: สร้างไฟล์ใหม่ (.html .css .json ว่าง) หรือ import ไฟล์ (ข้อความ → ไฟล์ draft, รูป/ฟอนต์ → asset)
     - กดรูปใน Assets (PNG/JPEG/SVG) → **ดูรูปทับ editor** พร้อมชนิด ขนาดไฟล์ และขนาด pixel; editor ยังอยู่ข้างใต้ งานที่ยังไม่บันทึกไม่หาย
     - **ลากเส้นแบ่งเพื่อปรับขนาด** ช่องไฟล์, preview และแท็บล่าง (ลูกศรบนคีย์บอร์ดได้, ดับเบิลคลิกคืนค่าเดิม) จำไว้ใน `localStorage` ของ browser; editor เล็กสุด 280×140
     - pane ชิดกันมีเส้นแบ่ง 1px ทุก theme ยกเว้น `classic` ที่เป็นกล่องแยกมีช่องว่างตาม mockup
     - ช่อง PDF preview ก่อนกด Preview ครั้งแรก: มาสคอต Jester สีจาง + "คลิก Preview เพื่อ render ตัวอย่าง PDF"
   - `api`: คู่มือสำหรับระบบอื่น — สร้าง API key, เรียก `POST /v1/render` (ตัวอย่าง `curl`), รูปแบบ error, รายงานที่ publish แล้ว และดาวน์โหลด contract (`/api/openapi.yaml` ผ่าน Studio)
   - `history`: ประวัติ render + ลิงก์ไปตั้งนโยบายเก็บ
   - `settings`: ผู้ใช้ (เพิ่มด้วยปุ่ม "+ เพิ่มผู้ใช้" ที่เปิด dialog), API key (secret แสดงครั้งเดียว), เปลี่ยนรหัสผ่าน, **theme**, **ประวัติ Render** = นโยบายเก็บ (แสดงจำนวนที่จะลบก่อนยืนยัน)
5. **Editor: CodeMirror 6 (ผู้ใช้ยืนยัน)** — HTML/CSS/JSON + เน้น `{{ }}`/`{% %}` ของ Jinja; problem จาก `ValidationProblem.line` แสดงเป็น gutter marker และขีดเส้นใต้บรรทัด
6. **PDF preview:** Route Handler เรียก `draft/preview` แล้วส่ง PDF ให้ `<iframe>` (viewer ในตัวของ browser ไม่เพิ่ม pdf.js)
7. **แก้ draft พร้อมกัน:** เก็บ revision ล่าสุดใน state; บันทึกส่ง `If-Match`; ได้ 412 → แจ้ง "มีคนแก้ draft นี้แล้ว" พร้อมปุ่มโหลดใหม่ (ไม่เขียนทับ)
8. **Theme (ผู้ใช้ยืนยัน):**
   - ทุก component อ่านค่าจาก **ตัวแปร CSS (design tokens)** เท่านั้น — สลับ theme โดยไม่แก้ component
   - **มีในตัว 3 แบบ:** `mahasamut` (ค่าเริ่มต้น, modern business สีฟ้าคราม), `classic` (สไตล์ Aero/enterprise ตาม mockup; ลุคกระจกผูกกับ id นี้ สำเนาได้แค่สี) และ `suriyan` (modern business: เรียบ แบน ช่องไฟกว้าง) — แก้ไม่ได้ แต่ทำสำเนาได้
   - **คนในทีมสร้าง/แก้/ลบ theme ได้ในหน้า settings** ด้วยฟอร์มแก้ token (เลือกสี, เลือกฟอนต์จากรายการ, ความโค้ง ฯลฯ) ที่ดูตัวอย่างหน้าจอทันที และ **import/export เป็น JSON**
   - theme ใช้ร่วมกันทั้งทีม ทุกคนแก้ได้ (สิทธิ์เท่ากัน)
   - **ปลอดภัย:** server รับเฉพาะ token ในรายการและรูปแบบค่าที่กำหนด (สี `#RRGGBB`, ขนาดเป็นตัวเลขในช่วง, ค่าจากรายการ) **ไม่รับ CSS ดิบ** จึงใส่ CSS ที่ซ่อนปุ่มหรือปลอมหน้าจอไม่ได้
   - แต่ละคนเลือก theme ของตัวเอง จำไว้ใน cookie; **theme เริ่มต้นของทั้งระบบ** ตั้งได้ในหน้า settings (ใช้กับหน้า login/setup และคนที่ยังไม่เลือก)
9. **ทางเข้า (ผู้ใช้ยืนยัน):** studio (3000) กับ api (8000) เปิดพอร์ตแยกกัน reverse proxy ของทีมจัด domain/path เอง (เช่น `studio.example.com`, `api.example.com`) — render ไม่ต้องผ่าน Next.js และ studio ล่มแล้วระบบภายนอกยัง render ได้; IP ของ browser อ่านจาก `X-Forwarded-For` hop แรกเฉพาะเมื่อ `JESTER_TRUST_PROXY=1` ไม่งั้นใช้ IP ของ connection
10. **หน้าตา:** CSS Modules ที่อ่าน token ไม่ใช้ UI framework หรือ Tailwind; UI ภาษาไทย; desktop เป็นหลักแบบเต็มจอตาม mockup
11. **Test (ผู้ใช้ยืนยัน):** Vitest + Testing Library และ `npm run build` ทุก task; **Playwright บน compose จริงที่ VM ตอนจบแต่ละ phase** (Checkpoint A และ B)

## ส่วนที่ต้องเพิ่มฝั่ง backend (ทำเป็น task แรกของแผน)

ทุกอย่างเข้า `public-api.yaml` ก่อน แล้วจึงเขียน route (test contract บังคับอยู่แล้ว)

1. **Prepared data:** `POST /v1/templates/{templateId}/draft/prepared` body `{ params?, data?, sampleFile? }` (ไม่มี data → sample) คืน view model ของ `data-prep` (`params`, `data`, `lists` พร้อม `rows`/`groups`, `totals`) โดยตัวเลข `Decimal` เป็น string ทศนิยม; error เหมือน preview (422 พร้อม problems); รันใน worker เดียวกับ render (template ไม่เกี่ยว แต่ data-prep ใช้ CPU)
2. **Theme:** ตาราง `themes` (`0004_themes.sql`) + store เล็ก ๆ ใน `jester_api/themes/`:
   - `GET /v1/themes` (session) → theme ทั้งหมด รวม built-in 3 แบบ
   - `POST /v1/themes`, `PUT /v1/themes/{themeId}`, `DELETE /v1/themes/{themeId}` (session; built-in → 409; ลบ theme ที่เป็นค่าเริ่มต้น → ค่าเริ่มต้นกลับเป็น `mahasamut`)
   - `GET /v1/themes/default` (**ไม่ต้อง login** — หน้า login ต้องใช้; คืนแค่ token ไม่มีข้อมูลลับ) และ `PUT /v1/themes/default` (session)
   - token ที่รับ (ชุดเดียวกับ CSS ของ Studio):

     | token | ค่าที่รับ |
     | --- | --- |
     | `color.background`, `color.surface`, `color.surfaceAlt`, `color.border`, `color.text`, `color.textMuted`, `color.primary`, `color.onPrimary`, `color.danger`, `color.warning`, `color.success` | `#RRGGBB` |
     | `font.family` | หนึ่งใน `TH Sarabun New`, `Sarabun`, `Noto Sans Thai`, `system-ui` |
     | `font.size` | 12–18 (px) |
     | `radius` | 0–16 (px) |
     | `shadow` | `none`, `soft`, `strong` |
     | `density` | `compact`, `comfortable` |

   - ชื่อ theme 1–40 ตัวอักษร, ไม่เกิน 50 theme; JSON ที่ import มี token เกินหรือค่าผิด → 422 พร้อม pointer
3. **อ่าน asset ของ draft:** `GET /v1/templates/{templateId}/draft/assets/{assetName}` (session) คืน bytes ด้วยชนิดที่ตรวจจากเนื้อไฟล์ตอน upload พร้อม `X-Content-Type-Options: nosniff`, CSP แบบ `sandbox` และ `Cache-Control: private, no-store` — SVG ที่ถูกเปิดตรง ๆ รัน script ไม่ได้; Studio ดึงผ่าน `GET /assets/[id]?name=`

## Objective

ให้นักพัฒนาในทีมทำงานกับรายงานได้ครบใน browser: ติดตั้งครั้งแรก, เขียน template, ตรวจ, ดูข้อมูลที่คำนวณแล้วและ PDF จริง, publish, ออก API key ให้ระบบอื่น, ดูประวัติ และปรับหน้าตาให้เข้ากับองค์กร — โดยไม่ต้องเรียก API เองและไม่แบก logic ไว้ที่ browser

### User stories

- ในฐานะคนติดตั้ง ฉันเปิด Studio ครั้งแรก ใส่ setup token จาก log แล้วได้บัญชีแรกและเข้า catalog ทันที
- ในฐานะนักพัฒนา ฉันสร้างรายงานจาก starter ใบเสนอราคา แก้ `template.html` บันทึกแล้วเห็น problem ที่บรรทัดทันที (ตรวจอัตโนมัติ) เปิดแท็บ Prepared data แล้วเห็น `totals.grand = "3210.00"` กด Preview แล้วเห็น PDF จริงพร้อมลายน้ำ DRAFT
- ในฐานะนักพัฒนา ฉัน publish แล้วสร้าง API key ให้ระบบ ERP ได้ secret ครั้งเดียว พร้อมตัวอย่าง `curl` สำหรับ `/v1/render`
- ในฐานะผู้ดูแล ฉันดูประวัติ render และตั้งนโยบายเก็บโดยเห็นก่อนว่าจะลบกี่รายการ
- ในฐานะผู้ดูแล ฉันทำสำเนา `suriyan` แก้สีหลักเป็นสีขององค์กร ตั้งเป็นค่าเริ่มต้น แล้ว export เป็น JSON ไปใช้กับอีก server
- ในฐานะผู้ใช้สองแท็บ แท็บที่บันทึกทีหลังได้คำเตือน ไม่มีงานหาย

## Interface (ระหว่าง Studio กับ FastAPI)

```ts
// lib/api.ts — server only ("server-only")
export async function api<T>(path: string, init?: RequestInit & { revision?: number }): Promise<T>
//  - เติม Authorization จาก cookie, X-Jester-Studio-Key, X-Jester-Client-IP
//  - problem+json → throw ApiProblem { status, code, detail, problems, runId }
//  - 401 → ลบ cookie แล้ว redirect("/login")
export type paths = /* generated from public-api.yaml */
```

Server Actions คืน `{ ok: true, data } | { ok: false, problem }` เพื่อให้ Client Component แสดง error ได้โดยไม่ throw ข้ามขอบ
Theme ที่ใช้ render ฝั่ง server: layout อ่าน theme ที่ผู้ใช้เลือก (cookie) หรือค่าเริ่มต้น แล้วใส่ token เป็น `<style>:root{--color-primary:…}</style>` ที่สร้างจากค่าที่ผ่านการตรวจแล้วเท่านั้น

## Tech Stack

- Next.js (App Router) + React + TypeScript — pin เวอร์ชัน stable ที่ออกมาอย่างน้อย 2 สัปดาห์ตอนเริ่ม implement
- `use-immer` (+ `immer`), CodeMirror 6 (`@codemirror/*`)
- dev: `openapi-typescript`, Vitest, Testing Library, Playwright, ESLint (config ของ Next), Prettier
- npm (มากับ Node 24)
- backend: ไม่มี dependency ใหม่ (theme store ใช้ psycopg/SQL ตรงแบบเดียวกับ module อื่น)

## Commands

```bash
cd apps/studio
npm ci
npm run gen:api            # types จาก ../api/openapi/public-api.yaml
npm run lint && npm run typecheck && npm test
npm run build
JESTER_API_URL=http://127.0.0.1:8000 JESTER_STUDIO_KEY=… npm run dev
STUDIO_E2E_URL=http://… npx playwright test   # กับ compose stack บน VM
```

## Project Structure

```
apps/api/src/jester_api/themes/              → store + การตรวจ token (backend)
apps/api/src/jester_api/db/migrations/0004_themes.sql
apps/api/src/jester_api/public_api/routes/   → + themes.py, prepared ใน render.py
apps/studio/
  app/
    (auth)/setup/page.tsx, (auth)/login/page.tsx
    (app)/layout.tsx              → header + status bar ตาม mockup, ตรวจ session, ใส่ token ของ theme
    (app)/page.tsx                → catalog
    (app)/templates/[id]/page.tsx → workspace
    (app)/history/page.tsx
    (app)/settings/page.tsx       → ผู้ใช้, API key, รหัสผ่าน, theme, นโยบายเก็บประวัติ
    (app)/api/page.tsx            → คู่มือ API สำหรับระบบอื่น; (app)/api/openapi.yaml/route.ts → ดาวน์โหลด contract
    preview/[id]/route.ts         → ส่ง PDF ให้ iframe
    assets/[id]/route.ts          → upload asset (POST) และอ่านรูปสำหรับ preview (GET)
  components/                     → Client Components (Editor, PdfPane, BottomTabs, RenderDialog, ThemeEditor, …)
  lib/api.ts, lib/session.ts, lib/theme.ts, lib/types.gen.ts, lib/actions/*.ts
  styles/tokens.css (ค่า fallback = mahasamut + ตัวแปรบทบาท; ลุค Aero ใต้ `:root[data-look="aero"]` ที่ layout ใส่ให้เฉพาะ theme `classic`), styles/*.module.css
  tests/ (Vitest), e2e/ (Playwright)
  Dockerfile, next.config.ts
infra/compose.yaml                → + service studio (พอร์ต 3000)
```

## Code Style

```tsx
"use client";
export function Workspace({ draft }: { draft: Draft }) {
  const [state, update] = useImmer({ revision: draft.revision, files: draft.files, active: "template.html",
                                     problems: [] as Problem[], conflict: false });
  async function save(name: string, content: string) {
    const result = await saveFile(draft.templateId, name, content, state.revision);   // Server Action
    if (result.ok) update(s => { s.revision = result.data.revision; });
    else update(s => { s.conflict = result.problem.code === "REVISION_CONFLICT"; });
  }
  …
}
```

## Testing Strategy

- **Backend (pytest):** prepared data ได้ยอดของ quotation (`totals.grand == "3210.00"`) และ error เหมือน preview; theme: built-in แก้/ลบไม่ได้, token เกิน/ค่าผิด/สีที่มี CSS แฝง (`red;}body{display:none`) → 422, ลบค่าเริ่มต้นแล้วกลับเป็น mahasamut, อ่าน asset ได้ bytes/404/401 พร้อม header กัน script, `GET /v1/themes/default` ไม่ต้อง login; test contract ครอบ endpoint ใหม่
- **Unit/component (Vitest):** client ของ API (header ครบ, problem+json → `ApiProblem`, 401 → logout), update ของ workspace (บันทึก, 412, 422 → problem ที่บรรทัด), ฟอร์ม setup/login, ThemeEditor (แก้ token → ตัวอย่างเปลี่ยน, import JSON ที่ผิด → error), การสร้าง `<style>` จาก token (ไม่มีค่าที่หลุดออกนอก declaration)
- **E2E (Playwright, compose บน VM ตอนจบ phase):** setup → สร้างจาก starter → แก้ไฟล์ → บันทึกแล้วการตรวจอัตโนมัติเห็น problem → Prepared data เห็นยอด → preview เห็น PDF → publish → สร้าง API key → `curl` render ได้ PDF → history เห็น run; สองแท็บแก้พร้อมกันได้คำเตือน; สลับ classic/suriyan และ theme ที่สร้างเองแล้วหน้าจอเปลี่ยน
- **กติกา:** ESLint ห้าม import state library อื่นนอกจาก `use-immer`/`immer` และห้ามเรียก FastAPI จาก Client Component (`lib/api.ts` เป็น `server-only`); Playwright ตรวจว่าไม่มี request จาก browser ไปที่ api ตรง
- `npm run build` ผ่านโดย type ตรง contract

## Boundaries

- **Always:** Server Components เป็นหลัก, เขียนผ่าน Server Actions, client state ด้วย `useImmer` เท่านั้น, type จาก contract, cookie `httpOnly`, component อ่านสี/ฟอนต์จาก token เท่านั้น, ตรวจ token ที่ server
- **Ask first:** เพิ่ม dependency นอกจากที่ระบุ (UI framework, state library), ให้ browser เรียก FastAPI ตรง, เพิ่ม endpoint นอกจากที่ระบุใน spec นี้, เพิ่ม token ของ theme
- **Never:** เก็บ token ใน `localStorage`, เรียก FastAPI จาก browser, Redux/Zustand/Jotai/React Query/SWR, แสดง secret ของ API key ซ้ำ, รับ CSS ดิบจากผู้ใช้

## Success Criteria

1. Flow ใน E2E ผ่านทั้งหมดบน compose stack จริง (setup → render ด้วย API key → history) รวมการสลับและสร้าง theme
2. ไม่มีการเรียก FastAPI จาก browser และไม่มี state library อื่น (Playwright + ESLint)
3. problem จาก validate แสดงที่บรรทัด; 412 ได้คำเตือนไม่เขียนทับ; Prepared data แสดงยอดที่คำนวณแล้ว
4. theme ที่มีค่าผิดหรือมี CSS แฝงถูกปฏิเสธที่ server; mahasamut, classic และ suriyan แก้ไม่ได้
5. `npm run build` / lint / typecheck / test ผ่าน; test ของ backend ที่เพิ่มผ่าน; `docker compose up` ได้ studio ที่ login แล้วใช้งานได้; หน้าจอหลักตรงกับ mockup ใน theme classic

## Open Questions

ปิดแล้วทั้งหมดจาก interview 15 พ.ย. 2026: ทำแท็บ Prepared data (เพิ่ม endpoint) และตัด Engine log, studio/api เปิดพอร์ตแยกหลัง proxy, CodeMirror 6, Playwright ตอนจบ phase, theme classic + suriyan + สร้าง/อัปโหลดเองผ่าน settings ด้วย token ที่ตรวจที่ server

## Out of scope

designer แบบลากวาง, หลายภาษา (UI ไทยอย่างเดียว), SSO, role, dark mode แยกต่างหาก (ทำเป็น theme ได้เอง), mobile layout, real-time collaboration, ประวัติ revision ของ draft, CSS ดิบใน theme

---

# v1.1: Foundations (H1, A1–A4, B1, B2, C2)

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.1, [SPEC-public-api.md](SPEC-public-api.md) หัวข้อ v1.1
หัวข้อ v1 ด้านบนยังใช้ทั้งหมด (Server Components, Server Actions, `useImmer`, browser ไม่เรียก api ตรง)

## สมมติฐาน v1.1

1. **H1:** `next` และ `eslint-config-next` เป็น `16.4.6` แบบ exact (แก้ advisory GHSA-mfr8-8qww-v76h; ออก 9 พ.ย. 2026 เกิน 2 สัปดาห์ตามกติกา v1) เป็นงานแรกและแยก commit
2. **ไฟล์ zip ผ่าน Route Handler ไม่ใช่ Server Action:** Server Action จำกัด body 1 MB (เหตุผลเดียวกับการอัปโหลด asset ใน v1) — `GET /templates/[id]/export` ส่ง zip ต่อจาก api พร้อม `Content-Disposition`; `POST /templates/import` รับ multipart แล้วส่งต่อ ตรวจ same-origin แบบ route asset เดิม
3. **ที่วางปุ่ม:**
   - **catalog:** ปุ่ม "นำเข้า (.zip)" ข้างปุ่มสร้าง; ตัวสลับ "แสดงที่ archive" (`?archived=1`); แต่ละแถว/การ์ดมีเมนู ⋯ = export draft, ทำสำเนา, archive/unarchive
   - **workspace:** เมนู ⋯ ใน toolbar ชุดเดียวกัน; แท็บ Versions เพิ่มปุ่ม "export" ต่อ version
   - **settings › ผู้ใช้:** ปุ่ม "ตั้งรหัสผ่าน" ต่อแถว (ปิดในแถวของตัวเอง พร้อม title ชี้ไปแท็บรหัสผ่าน) เปิด dialog แบบเดียวกับเพิ่มผู้ใช้
   - **settings › API key:** ฟอร์มสร้างเพิ่ม 3 ช่องที่เลือกใส่ได้; ตารางเพิ่มคอลัมน์ "หมดอายุ", "รายงาน", "จำกัด/นาที"
4. **วันหมดอายุของ key เลือกเป็นวัน** (`<input type="date">`) แล้วส่งเป็นสิ้นวันนั้นเวลาไทย (`23:59:59+07:00`) — คนตั้งคิดเป็นวัน ไม่ใช่เวลา; ต้องเป็นวันพรุ่งนี้ถึง 5 ปี
5. **รายงานของ key** เลือกด้วย checkbox จากรายการรายงาน (รวมที่ archive ไม่ได้); ไม่เลือกเลย = ทุกรายงาน (ข้อความใต้ช่องบอกชัด)
6. **import ที่ id ซ้ำ:** ส่งครั้งแรกไม่มี revision; ได้ 409 → dialog ถาม "มีรายงาน `<id>` แล้ว จะทับ draft ไหม (version ที่ publish แล้วไม่เปลี่ยน)" พร้อมทางเลือก "นำเข้าเป็น id ใหม่" (ช่อง id); ยืนยันทับ → อ่าน revision ปัจจุบันแล้วส่งใหม่พร้อม `If-Match`; สำเร็จ → ไปที่ workspace ของรายงานนั้น
7. **รายงานที่ archive ใน workspace:** แถบบอกด้านบน "รายงานนี้ถูก archive เมื่อ … โดย …" พร้อมปุ่ม unarchive; editor อ่านอย่างเดียว; ปุ่มบันทึก, Preview, Publish, Render… และเมนูแก้ไฟล์ปิด; export และทำสำเนายังใช้ได้
8. **archive ยืนยันด้วย `confirm()`** (กลับคืนได้ จึงไม่ต้องดู diff): "archive `<name>`? ระบบที่ render รายงานนี้จะได้ 410 จนกว่าจะ unarchive"
9. **ข้อความ error ภาษาไทยใหม่ใน `lib/messages.ts`:** `TEMPLATE_ARCHIVED`, `TEMPLATE_NOT_ALLOWED`, `RATE_LIMITED` (ของ render) และ 409 ของ import
10. **starter ใหม่** ในฟอร์มสร้าง: `tax-invoice` = "ใบกำกับภาษีเต็มรูป"
11. **หน้า `/api`** เพิ่ม 403/410/429 ในส่วนรูปแบบ error และอธิบาย `Retry-After`

## Project Structure v1.1

```
apps/studio/
  app/export/[id]/route.ts             → ส่งต่อ zip จาก api — ใหม่ (ไม่อยู่ใต้ /templates เพราะ /templates/import จะชนกับรายงาน id "import")
  app/import/route.ts                  → รับ zip แล้วส่งต่อ — ใหม่
  lib/zip.ts                           → อ่าน jester.json ใน browser ให้ dialog นำเข้ารู้ id ก่อนอัปโหลด — ใหม่
  components/TemplateMenu.tsx          → เมนู ⋯ (export, ทำสำเนา, archive) ใช้ทั้ง catalog และ workspace — ใหม่
  components/ImportDialog.tsx, DuplicateDialog.tsx, SetPasswordDialog.tsx — ใหม่
  components/ApiKeysPanel.tsx, UsersPanel.tsx, Workspace.tsx, VersionsPanel.tsx, CreateTemplate.tsx
  app/(app)/page.tsx                   → ปุ่มนำเข้า, ตัวสลับ archive, badge
  lib/actions/templates.ts             → duplicate, setArchived
  lib/actions/settings.ts              → setUserPassword, createApiKey (ช่องใหม่)
  lib/keys.ts                          → วันที่ → สิ้นวันเวลาไทย, ตรวจช่องของ key — ใหม่ (pure, มี test)
  lib/messages.ts, lib/types.gen.ts (gen:api)
```

## Testing Strategy v1.1

- **Vitest:** `lib/keys.ts` (วันที่ → `…T23:59:59+07:00`, วันนี้/อดีต/เกิน 5 ปีถูกปฏิเสธ, limit นอก 1–10000, ไม่เลือกรายงาน = `undefined` ไม่ใช่ `[]`); ข้อความของ code ใหม่ใน `messages`
- **เบราว์เซอร์กับ api ที่ VM ทุก task:** แบบเดียวกับ v1 (dev server + api จริง)
- **E2E (`full-flow.spec.ts` ต่อท้าย):**
  1. export draft ของรายงานใน flow → import เป็น id ใหม่ → workspace ของ id ใหม่มีไฟล์ครบ
  2. import zip เดิมทับ id เดิม → dialog ถาม → ยืนยัน → revision เพิ่ม
  3. ทำสำเนา → แถวใหม่ใน catalog
  4. archive → หายจาก catalog, เห็นเมื่อสลับ "แสดงที่ archive", `POST /v1/render` ด้วย key ได้ 410 → unarchive → render ได้
  5. สร้าง key ที่จำกัดรายงานอื่น → render รายงานใน flow ได้ 403
  6. ตั้งรหัสผ่านให้ผู้ใช้ที่สองจาก settings → login ผู้ใช้นั้นด้วยรหัสใหม่ได้
- ตรวจ network ใน E2E ต่อ: browser ไม่เรียก api ตรง (zip ผ่าน Route Handler)
- lint, typecheck, test, build ผ่านทุก task

## Boundaries v1.1

- **Always:** zip ผ่าน Route Handler เท่านั้น; ทุกการกระทำที่เปลี่ยนสิ่งที่ระบบภายนอกได้รับ (archive) มีคำยืนยัน; ปุ่มที่ใช้ไม่ได้บอกเหตุผลด้วย `title`
- **Ask first:** เพิ่ม dependency ของ Studio (เช่น ไลบรารี zip ฝั่ง browser — ไม่ควรต้องใช้), แก้ secret ของ key หลังสร้าง
- **Never:** อ่านหรือแตก zip ใน browser, ส่ง zip ผ่าน Server Action, แสดง secret ของ key ซ้ำ

## Success Criteria v1.1

1. ผู้ใช้ Studio ย้ายรายงานจากเครื่อง dev ไปเครื่อง production ได้ด้วยปุ่ม export/import โดยไม่ต้องก๊อปทีละไฟล์
2. ทำสำเนา, archive/unarchive, ตั้งรหัสผ่านให้ผู้อื่น และสร้าง key แบบจำกัดทำได้ครบจาก Studio
3. รายงานที่ archive แก้ไม่ได้จาก Studio และบอกสถานะชัดเจน
4. Next.js 16.4.6, `npm audit --omit=dev` ไม่มี advisory ของ `next`
5. E2E ทั้ง 2 spec (รวมขั้นใหม่) ผ่านบน stack ใหม่ที่ VM; lint, typecheck, test, build ผ่าน

## Open Questions v1.1

ไม่มี

# v1.4: โหมดออกเอกสารใน workspace (F1)

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** (ปรับตาม interview รอบสอง) · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.4

## Objective

หัวหน้าทีมที่ dev ชวนมาลอง เปิด Studio แล้วออกใบเสนอราคาหรือใบกำกับภาษีได้เองโดยไม่แตะ JSON:
กดปุ่ม "ออกเอกสาร" ของรายงาน → กรอกฟอร์มภาษาไทย → ได้ PDF ดูข้างฟอร์มและดาวน์โหลดได้ เพื่อเก็บ feedback ก่อนตัดสินรอบถัดไป

## สมมติฐาน v1.4

1. **ไม่มี role** (ผู้ใช้ตัดสิน): ใครที่ login ก็ใช้โหมดนี้ได้ และยังเข้าทุกหน้าของ Studio ได้เหมือนเดิม
2. **ไม่เก็บเอกสาร** (ผู้ใช้ตัดสิน): PDF ไม่ถูกเก็บ; แต่ละครั้งเป็น run ปกติในประวัติ Render (caller = ผู้ใช้); เลขที่เอกสารคนกรอกใส่เอง
3. **ใช้ version ที่ publish เสมอ** (ผู้ใช้ตัดสิน) เหมือนระบบอื่นที่เรียก API — ไม่มีลายน้ำ DRAFT และฟอร์มไม่เปลี่ยนตามที่ dev แก้
   draft ค้างไว้; รายงานที่ยังไม่ publish หรือ archive แล้ว ไม่มีปุ่มออกเอกสาร
4. **ฟอร์มสร้างจากไฟล์ของ version นั้น** (`getVersion`): parameters ใน `report.json` + `data.schema.json`; ป้ายจาก `title`
   (ไม่มี → ชื่อ key), คำอธิบายจาก `description`, ค่าเริ่มต้นจาก `default`; ลำดับช่องตามลำดับใน schema
5. **ไม่มี endpoint ใหม่**: ออก PDF ผ่าน Route Handler ของ Studio ที่ส่งต่อ `POST /v1/render` ด้วย session (แบบเดียวกับ Render dialog)
6. **ไม่เพิ่ม dependency**: ตรวจค่าในฟอร์มเองตามกติกาที่ใช้บ่อย แล้วให้ api ตรวจเต็มตาม schema; problem จาก api แสดงที่ช่องตาม `pointer`
7. **ตัวเลขไม่ผ่าน float**: body ของ render ประกอบจากข้อความที่ผู้ใช้กรอก (หลักเดียวกับ `lib/render.ts`) — decimal ส่งเป็น string
   ตาม schema, integer/number ส่งเป็นตัวเลข JSON จากข้อความที่ผ่าน regex แล้ว

## โหมดออกเอกสาร

- **อยู่ใน workspace เดิม** (ไม่มีหน้าแยก): URL `/templates/<id>?mode=issue`
- **ทางเข้า:**
  - catalog: ปุ่ม "ออกเอกสาร" ในแถวและในการ์ด → เปิด workspace ในโหมดออกเอกสารทันที (ไม่เห็นหน้า code ก่อน)
  - workspace: ปุ่ม "ออกเอกสาร" ใน toolbar **แทนที่ปุ่ม Render… เดิม** (ผู้ใช้ขอ 18 พ.ย. 2026) → สลับเป็นโหมดออกเอกสาร
    (ถ้ามีไฟล์ที่ยังไม่บันทึก ถามก่อน); รายงานที่ยังไม่ publish หรือ archive แล้ว ปุ่มนี้กดไม่ได้พร้อมบอกเหตุผล
  - Render dialog เดิม (เลือก version, params/data เป็น JSON, curl) และ Route Handler `/render/[id]` ถูกลบ; curl ย้ายไปปุ่ม
    "สำหรับนักพัฒนา" ในโหมดออกเอกสาร ซึ่งสร้างจากค่าในฟอร์มตอนนั้น (version ที่ publish); การ render version เก่าเจาะจงทำผ่าน API
  - ทั้งสองปุ่มแสดงเฉพาะรายงานที่มี `publishedVersion` และไม่ถูก archive
- **บนจอในโหมดนี้:** ฟอร์มแทนที่ช่อง code editor และ PDF อยู่ในช่องขวา; **ซ่อน** รายการไฟล์ ทางซ้ายและแท็บล่าง
  (Problems/Prepared data/Provenance/Versions) และปุ่มของ draft (บันทึก, Preview, Publish, Render…)
- **toolbar:** ชื่อรายงาน, "สำหรับนักพัฒนา" (dialog curl + คัดลอก) และ "กลับไปแก้ code" (กลับเป็น workspace ปกติ, URL ไม่มี `mode`) · **แถบบนของช่องฟอร์ม** (ติดอยู่ตอนเลื่อน):
  "version N", "ใช้ข้อมูลตัวอย่าง" (เติมจาก sample แรกของ version), "ล้างฟอร์ม", "ออก PDF" — ย้ายมาจาก toolbar ระหว่างทำ (18 พ.ย. 2026)
  เพื่อให้ปุ่มอยู่ใกล้ฟอร์ม
- **เปิดครั้งแรก:** ฟอร์มว่าง มีแค่ค่า `default` (ผู้ใช้ตัดสิน — กันการออกเอกสารจริงทั้งที่ข้อมูลตัวอย่างค้างอยู่)
- **ฟอร์ม:** ส่วน "ข้อมูลเอกสาร" = parameters; ส่วนต่อไป = ข้อมูลตาม schema; ช่อง "ชื่อไฟล์" (เลือกใส่, ค่าเริ่มต้น `<id>-v<N>.pdf`)
- **"ออก PDF":** ตรวจฟอร์ม → ส่ง → สำเร็จ: PDF ในช่องขวา + ลิงก์ "ดาวน์โหลด"; ฟอร์มยังอยู่ แก้แล้วออกใหม่ได้
- **ล้มเหลว:** problem ที่มี `pointer` (เช่น `/data/items/0/qty`, `/params/issueDate`) แสดงใต้ช่องนั้นและเลื่อนไปช่องแรกที่ผิด;
  problem อื่นแสดงเป็นรายการบนสุดด้วย `problemMessage`

## การแปลง schema เป็นช่อง (`lib/form.ts`, pure, มี test)

| schema / parameter | ช่อง | ค่าที่ส่ง |
| --- | --- | --- |
| parameter `string` / schema `string` | text (`maxLength`, `pattern` ตรวจในฟอร์ม) | string |
| `string` + `format: "date"` / parameter `date` | `<input type="date">` | `"YYYY-MM-DD"` |
| `string` + `format: "decimal"` / parameter `decimal` | text `inputmode="decimal"` ตรวจด้วย regex เดียวกับ api | string เช่น `"1250.50"` |
| `enum` (schema หรือ parameter) | select | ค่าที่เลือก |
| `integer` / `number` / parameter `integer` | text `inputmode="numeric"` ตรวจ regex | ตัวเลข JSON |
| `boolean` | checkbox | `true`/`false` |
| `object` | fieldset ที่มี `title` เป็นหัว | object ของช่องลูก |
| `array` ของ object | ตาราง: หนึ่งแถวต่อ item, คอลัมน์ = property ของ item, ปุ่ม "+ เพิ่มแถว" / "ลบ" (เคารพ `minItems`/`maxItems`) | array |
| `array` ของ string/ตัวเลข | รายการช่องเดียวต่อแถว เพิ่ม/ลบได้ | array |
| อื่น ๆ (`oneOf`, `$ref`, `type` หลายชนิด, …) | textarea JSON ดิบของส่วนนั้น (ตรวจว่าเป็น JSON) | ค่าที่ parse แล้ว |

- `required` → เครื่องหมาย `*` และตรวจว่าไม่ว่าง; ช่องที่ไม่ required และว่าง → ไม่ส่ง key นั้น (ไม่ส่ง `""`)
- ตรวจในฟอร์ม: required, `maxLength`/`minLength`, `pattern`, รูปแบบ date/decimal/integer, `enum`, `minItems`/`maxItems` — ข้อความไทย

## Project Structure v1.4

```
apps/studio/
  app/(app)/templates/[id]/page.tsx → อ่าน `mode=issue`; โหลด getVersion ของ version ที่ publish เมื่ออยู่ในโหมดนี้
  app/issue/[id]/route.ts           → POST: ส่งต่อ /v1/render (version published), ตอบ PDF หรือ problem JSON — ใหม่
  components/IssueForm.tsx (+ .module.css) → ฟอร์ม, ตาราง, การแสดง problem — ใหม่
  components/Workspace.tsx (+ .module.css) → โหมดออกเอกสาร: ซ่อนไฟล์/แท็บล่าง, ฟอร์มแทน editor, PDF ในช่องขวา
  app/(app)/page.tsx                → ปุ่ม "ออกเอกสาร" ในแถวและการ์ด
  lib/form.ts                       → schema/parameters → ช่อง, ค่าฟอร์ม → JSON body, ตรวจค่า, pointer → ช่อง — ใหม่
  tests/form.test.ts                → ใหม่
  e2e/issue.spec.ts                 → ใหม่
```

## Testing Strategy v1.4

- **Vitest (`lib/form.ts`):** ทุกแถวในตารางแปลง; ลำดับช่องตาม schema; title/description/default; ช่องว่างที่ไม่ required ไม่ถูกส่ง;
  decimal `"12345678901234567.89"` ส่งเป็น string ตรงทุกหลัก; integer ส่งเป็นตัวเลขจากข้อความ; ตรวจค่าแต่ละกติกา;
  pointer `/data/items/1/unitPrice` ชี้ช่องแถวที่ 2; schema ที่ไม่รองรับกลายเป็น textarea; เติมจาก sample ได้ค่าตรง
- **เบราว์เซอร์กับ api ที่ VM:** แบบเดียวกับรอบก่อน
- **E2E (`e2e/issue.spec.ts`, หลัง lifecycle บน stack ใหม่):** สร้างรายงานจาก starter `tax-invoice` → publish → กด "ออกเอกสาร"
  ใน catalog → เปิดในโหมดฟอร์ม (ไม่เห็นรายการไฟล์และแท็บล่าง, ฟอร์มว่าง) → กรอกทุกช่องเอง (ไม่ใช้ปุ่มตัวอย่าง) รวมเพิ่ม 2 แถว → ออก PDF ได้ `application/pdf` ใน iframe และมีลิงก์ดาวน์โหลด;
  ลบค่าช่อง required → ข้อความใต้ช่องก่อนส่ง; ใส่วันที่ที่ api ปฏิเสธ → problem ใต้ช่องนั้น; browser ไม่เรียก api ตรง
- lint, typecheck, test, build ผ่าน

## Boundaries v1.4

- **Always:** ประกอบ body จากข้อความ (ไม่ผ่าน float); ทุกค่าจาก browser ตรวจก่อนใส่ URL (เหมือน `draftPath`)
- **Ask first:** เพิ่ม dependency (เช่น JSON Schema validator ฝั่ง browser), เพิ่ม endpoint หรือเปลี่ยน contract
- **Never:** เก็บ PDF หรือข้อมูลที่กรอก (ยกเว้น run history เดิม); ให้ browser เรียก api ตรง

## Success Criteria v1.4

1. หัวหน้าออกใบกำกับภาษีจาก starter ได้เองจากหน้า "ออกเอกสาร" โดยไม่เห็น JSON เลย (ยกเว้น schema ส่วนที่ไม่รองรับ)
2. ป้ายและคำอธิบายในฟอร์มของทุก starter เป็นภาษาไทย
3. ค่าที่ผิดถูกบอกที่ช่องนั้น ทั้งที่ตรวจในฟอร์มและที่ api ตอบกลับ
4. ตัวเลขเงินไปถึง api ตรงทุกหลัก
5. E2E ทุก spec (รวม `issue.spec.ts`) ผ่านบน stack ใหม่; lint, typecheck, test, build ผ่าน

## Open Questions v1.4

ไม่มี — ทางเข้า, หน้าจอ, version และสถานะเริ่มต้นของฟอร์มตัดสินแล้วใน interview รอบสอง (18 พ.ย. 2026)

## Not Doing v1.4

หน้ารายการออกเอกสารแยก · ตัวเลือกให้ดูฟอร์มจาก draft · designer · `form.json` · role · เก็บเอกสารที่ออกและเลขรันอัตโนมัติ

---

# v1.5: หน้าเอกสารที่ออก (D3)

สถานะ: **อนุมัติ 19 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.5, [SPEC-public-api.md](SPEC-public-api.md) หัวข้อ v1.5

## Objective

หัวหน้าที่ออกใบไปแล้ว หาใบนั้นเจอจากเลขเอกสารหรือชื่อลูกค้า แล้วดาวน์โหลด PDF เดิมได้ — รวมใบที่ระบบอื่นออกผ่าน API

## สมมติฐาน v1.5

0. **แทนที่ข้อห้ามของ v1.4:** สมมติฐาน v1.4 ข้อ 2 "ไม่เก็บเอกสาร" และ Boundaries v1.4 **Never** "เก็บ PDF หรือข้อมูลที่กรอก" ไม่ใช้แล้ว
1. **หน้าใหม่ `/documents`** แบบเดียวกับหน้าประวัติ (server component, ฟอร์ม GET, paging ด้วย cursor) — ไม่มี state ฝั่ง browser
2. **ทางเข้า:** เมนูหลัก "เอกสาร"; ปุ่ม "เอกสารที่ออก" ในแถว/การ์ดของ catalog และใน toolbar ของโหมดออกเอกสาร → `/documents?template=<id>`;
   หลังออก PDF สำเร็จในโหมดออกเอกสาร มีข้อความ "เก็บแล้ว · ดูเอกสารที่ออก"
3. **หน้าประวัติ:** run ที่ `hasDocument` มีลิงก์ "ดาวน์โหลด PDF"
4. **ดาวน์โหลดผ่าน Route Handler** `app/documents/[runId]/route.ts` (GET) ส่งต่อ `getDocument` ด้วย session — browser ไม่เรียก api ตรง;
   ตรวจ `runId` ด้วย regex ก่อนใส่ URL (หลักเดียวกับ `draftPath`)

## หน้า `/documents`

- **ตัวกรอง:** เลือกรายงาน (ทั้งหมด/ทีละรายงาน) และช่องค้นหา "เลขเอกสาร ชื่อลูกค้า หรือค่าใดก็ได้ที่กรอก" → `q`
- **ตาราง (ใหม่สุดก่อน):** วันเวลา (`fmt` ไทย) · รายงาน + version · ผู้ออก (ชื่อผู้ใช้ หรือ "API: <ชื่อ key>") · ค่า parameter (สรุปบรรทัดเดียว `title: ค่า`)
  · ชื่อไฟล์ · "ดาวน์โหลด"
- **ว่าง:** "ยังไม่มีเอกสาร — ออกจากปุ่ม ออกเอกสาร หรือผ่าน API แล้วจะขึ้นที่นี่"; ค้นไม่เจอ → "ไม่พบเอกสารที่ตรงกับ …"
- บอกนโยบายเก็บปัจจุบันใต้หัวหน้า (เช่น "เก็บตลอด" หรือ "ลบเมื่อเก่ากว่า 90 วัน") พร้อมลิงก์ไปตั้งค่า
- **หน้าตั้งอายุเก็บประวัติ (เดิม):** ข้อความยืนยันบอกทั้งสองจำนวนจาก `wouldDelete` และ `wouldDeleteDocuments`
  เช่น "จะลบประวัติ 1,240 รายการ และเอกสาร PDF 980 ใบ — กู้คืนไม่ได้"

## Project Structure v1.5

```
apps/studio/
  app/(app)/documents/page.tsx       → รายการ + ค้นหา — ใหม่
  app/documents/[runId]/route.ts     → GET: ส่งต่อ getDocument (PDF) — ใหม่
  app/(app)/layout.tsx               → เมนู "เอกสาร"
  app/(app)/page.tsx                 → ปุ่ม "เอกสารที่ออก"
  app/(app)/history/page.tsx         → ลิงก์ดาวน์โหลดเมื่อ hasDocument
  components/Workspace.tsx           → ปุ่มใน toolbar ของโหมดออกเอกสาร + ข้อความหลังออก PDF
  e2e/issued-documents.spec.ts       → ใหม่ (ชื่อเรียงหลัง full-flow ซึ่งต้องการ catalog ว่าง)
```

## Testing Strategy v1.5

- **E2E (`issued-documents.spec.ts`):** ออกใบกำกับภาษีจากฟอร์มด้วยเลขเอกสารสุ่ม → เปิด "เอกสารที่ออก" → ค้นด้วยเลขนั้นเจอหนึ่งแถว → ดาวน์โหลดได้
  `application/pdf` ไบต์เท่ากับที่ออก; render ผ่าน API key แล้วใบขึ้นในรายการโดยผู้ออกเป็น "API: <ชื่อ>"; preview ของ draft ไม่ขึ้น
- E2E เดิมทุก spec ผ่าน; lint, typecheck, test, build ผ่าน

## Boundaries v1.5

- **Always:** ทุกค่าจาก browser ตรวจก่อนใส่ URL; ไม่ให้ browser เรียก api ตรง
- **Never:** แสดง data ทั้งก้อนในรายการ (แสดงแค่ params) — data อยู่ใน PDF อยู่แล้ว

## Not Doing v1.5

เลขรันอัตโนมัติ · ลบทีละใบ · ห้ามแก้/ห้ามลบเพื่อเป็นหลักฐาน · ออกซ้ำจากใบเดิม (เติมฟอร์มจากใบเก่า) · role

---

# v1.6: Form builder (E1–E3)

สถานะ: **อนุมัติ 19 พ.ย. 2026** (Open Questions ปิดแล้วใน interview รอบสอง) · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.6 (interview 19 พ.ย. 2026)

## Objective

dev สร้างข้อมูลนำเข้าของรายงานด้วยการลากวางใน Studio แทนการเขียน `data.schema.json` และ `parameters` ใน `report.json` เอง
แล้วหัวหน้าทีมที่กด "ออกเอกสาร" ได้ฟอร์มที่จัดตามนั้น

**สำเร็จเมื่อ:** dev สร้างรายงานใหม่จาก starter `blank` → ลากช่องครบทุกชนิด (รวมตารางรายการ) โดยไม่เปิดไฟล์ JSON → publish →
หัวหน้ากรอกฟอร์มแล้วได้ PDF; dev แก้ `data.schema.json` ด้วยมือ → เปิด builder อีกครั้งเห็นค่าที่แก้

## สมมติฐาน v1.6 (ผู้ใช้ตัดสินใน interview)

1. **ผู้ใช้ builder คือ dev** — หัวหน้าทีมไม่จัดฟอร์มเอง; ไม่มี role
2. **ไฟล์จริงคือความจริงเดียว:** builder อ่านจาก draft ทุกครั้งที่เปิดโหมด และเขียนกลับไปที่ `data.schema.json` + `parameters` ใน `report.json` โดยตรง
   - ลำดับช่อง = ลำดับ key ใน schema/parameters (ไม่เก็บซ้ำใน `form.json`)
   - กลุ่ม = `object` ใน schema (ไม่มีกลุ่มที่มีแต่ในหน้าจอ)
   - สิ่งที่ JSON Schema ไม่มีที่เก็บ (ชนิด input, ความกว้าง) อยู่ใน `form.json`
   - ส่วนที่ builder ไม่เข้าใจ (`oneOf`, `$ref`, `type` หลายชนิด, keyword อื่นที่ไม่อยู่ในตาราง) แสดงเป็นการ์ด "แก้ใน JSON" อ่านอย่างเดียว
     และ **ค่าถูกเก็บไว้ครบ** ตอนเขียนกลับ (เช่น `additionalProperties`, `examples`, `$comment`)
3. **builder ไม่แตะ `template.html`, header/footer, `lists`, `totals`** — มีแค่แท็บ "ช่องข้อมูล" ให้ copy expression และเตือนช่องที่ไม่ถูกใช้;
   ข้อยกเว้นเดียว: เปลี่ยนชื่อ array ที่ `lists.*.path` ชี้อยู่ (ดู "เปลี่ยนชื่อและลบ")
4. **แก้เฉพาะ draft** ตาม flow เดิม (ฟอร์มออกเอกสารยังใช้ version ที่ publish); รายงานที่ archive แล้ว builder อ่านอย่างเดียว
5. **ไม่มี endpoint ใหม่:** บันทึกทีละไฟล์ด้วย `putDraftFile` เดิม (`If-Match` revision); api ถือ `form.json` เป็นไฟล์ข้อความทึบ
6. **ลากวางด้วย `@dnd-kit`** (ผู้ใช้เลือกเพื่อความลื่นและ performance): ลากด้วยเมาส์, สัมผัส และแป้นพิมพ์ (`KeyboardSensor`)
7. **รูปแบบไฟล์:** builder เขียน JSON ใหม่ทั้งไฟล์ (2 ช่องว่าง) — การจัดบรรทัดที่ dev เขียนมือหาย ค่าและลำดับ key ไม่หาย (ผู้ใช้รับ)

## `form.json`

ไฟล์ข้อความใน draft (ไม่บังคับ, ชื่อตายตัว) — ไม่มีไฟล์ = ทุกช่องใช้ค่าเริ่มต้นตามชนิดใน schema (พฤติกรรม v1.4 ทุกอย่าง)

```json
{
  "formVersion": 1,
  "fields": {
    "/params/note":           { "widget": "textarea" },
    "/data/customer/address": { "widget": "textarea", "width": "full" },
    "/data/customer/taxId":   { "width": "half" },
    "/data/payment":          { "widget": "radio" },
    "/data/items/unitPrice":  { "widget": "money" }
  }
}
```

- key = JSON pointer ของช่อง: `/params/<key>` หรือ `/data/...`; คอลัมน์ในตาราง = pointer ของ array ต่อด้วยชื่อคอลัมน์ (ไม่มี index)
- `widget`: `textarea` (string), `radio` (enum), `money` (decimal: แสดงหลักพันเมื่อออกจากช่อง, ค่าที่ส่งยังเป็นข้อความเดิม เช่น `"1250.50"`) — อื่น ๆ ใช้ค่าเริ่มต้นตามชนิด
- `width`: `full` | `half` | `third` (ค่าเริ่มต้น `full`; ไม่มีผลกับคอลัมน์ในตาราง)
- อ่านแบบผ่อนปรน: parse ไม่ได้, `formVersion` ไม่ใช่ 1, pointer ที่ไม่มีช่องแล้ว, ค่าที่ไม่รู้จัก → **ข้าม** (ฟอร์มยังเปิดได้)
  และ builder แสดงคำเตือนบนสุด; บันทึกครั้งถัดไป builder เขียนใหม่ในรูปแบบที่ถูกต้อง (pointer ที่ไม่มีช่องถูกลบ)

## ชนิดช่องใน builder

| palette | ใน `data.schema.json` | ใน `parameters` | `form.json` |
| --- | --- | --- | --- |
| ข้อความ | `{"type": "string"}` | `type: string` | — |
| ข้อความหลายบรรทัด | `{"type": "string"}` | `type: string` | `widget: textarea` |
| ตัวเลข | `{"type": "number"}` หรือ `"integer"` (สวิตช์ "จำนวนเต็ม") | `type: integer` เท่านั้น | — |
| เงิน | `{"type": "string", "format": "decimal"}` | `type: decimal` | `widget: money` |
| วันที่ | `{"type": "string", "format": "date"}` | `type: date` | — |
| ตัวเลือก | `{"type": "string", "enum": [...]}` | `type: enum`, `values` | `widget: radio` ถ้าเลือก radio |
| checkbox | `{"type": "boolean"}` | `type: boolean` | — |
| กลุ่ม | `{"type": "object", "properties": {}}` | — (parameters ไม่มีกลุ่ม) | — |
| ตารางรายการ | `{"type": "array", "items": {"type": "object", "properties": {}}}` | — | — |

- คอลัมน์ในตาราง = ช่องชนิด scalar เท่านั้น (ไม่มีกลุ่มหรือตารางในตาราง); ลากกลุ่ม/ตารางลงตาราง → ไม่รับพร้อมบอกเหตุผล
- กลุ่มซ้อนกลุ่มได้; ตารางอยู่ในกลุ่มได้; parameters รับเฉพาะชนิดที่มีคอลัมน์ "ใน parameters"

### คุณสมบัติที่แก้ได้ (แผงขวา)

| คุณสมบัติ | schema | parameter | หมายเหตุ |
| --- | --- | --- | --- |
| key | ชื่อ property | ชื่อ parameter | `^[A-Za-z_][A-Za-z0-9_]*$` (กติกา `Name` ของ api), ไม่ซ้ำในระดับเดียวกัน |
| ป้าย | `title` | `title` (≤ 80) | ว่าง = ลบ key |
| คำอธิบาย | `description` | `description` (≤ 300) | ว่าง = ลบ key |
| บังคับกรอก | `required` ของ object แม่ | `required: true` | parameter: เปิดบังคับแล้ว `default` ถูกล้าง (api ห้ามมีทั้งคู่) |
| ค่าเริ่มต้น | `default` | `default` | ตรวจชนิดก่อนเขียน |
| ต่ำสุด/สูงสุด | `minimum`/`maximum` | — | ตัวเลข |
| ความยาว | `minLength`/`maxLength` | `maxLength` | ข้อความ |
| pattern | `pattern` | — | ตรวจว่า `new RegExp(p, "u")` อ่านได้ |
| ตัวเลือก | `enum` | `values` | อย่างน้อย 1 ค่า ไม่ซ้ำ |
| จำนวนแถว | `minItems`/`maxItems` | — | ตาราง |
| ชนิด input / ความกว้าง | — | — | `form.json` |

key ใหม่: builder เสนอ `field1`, `field2`, … (ตัวถัดไปที่ไม่ซ้ำ) — dev แก้ได้ทันที

## เปลี่ยนชื่อและลบ

- **เปลี่ยน key:** แก้ใน `properties`/`parameters` (คงลำดับ), `required`, pointer ใน `form.json`, key ในทุก sample ที่ `data.samples` ระบุ,
  และ `lists.*.path` (รวม list ลูก) ที่ชี้ array นั้นหรือ array ข้างใน
- **ลบ:** เอาออกจาก schema, `required`, `form.json`, ทุก sample; array ที่ `lists.*.path` ชี้อยู่ **ลบไม่ได้** พร้อมบอกชื่อ list (ต้องแก้ `report.json` เอง)
- **เพิ่มช่องบังคับกรอก (หรือเปิดบังคับ):** ทุก sample ที่ยังไม่มีค่าได้ค่าตัวอย่างตามชนิด — `default` ถ้ามี; ไม่มี → `"ตัวอย่าง"`, `0`, `"0.00"`,
  วันนี้, ค่าแรกของตัวเลือก, `false`, `{}` พร้อมช่องบังคับข้างใน, `minItems` แถว — เพื่อไม่ให้เกิด `SAMPLE_INVALID`
- **ก่อนเปลี่ยน key หรือลบ:** ถ้าพบข้อความ `.<key>` หรือ `["<key>"]` ในไฟล์ `.html` ของ draft หรือใน expression ของ `report.json` →
  dialog ยืนยันพร้อมรายชื่อไฟล์ ("เทมเพลตอาจยังใช้ช่องนี้: template.html") — builder **ไม่แก้** ไฟล์เหล่านั้น
- หลังบันทึก builder เรียก `validateDraft` เดิมแล้วแสดงจำนวน problem ใน toolbar; expression ที่อ้างช่องเก่าเห็นในแท็บ Problems

## ตัวสร้างฟอร์มในช่อง code (E2)

**เปลี่ยน 19 พ.ย. 2026 หลังผู้ใช้ลอง rc** (เดิมเป็นหน้าแยก `?mode=form` ที่มีปุ่มบันทึกของตัวเอง): แก้ที่เดียวในหน้า code

- คลิก `data.schema.json` (ชื่อตาม `report.json` → `data.schema`) ในรายการไฟล์ → ช่อง code แสดง **ตัวสร้างฟอร์ม** แทน editor;
  หัวช่องมุมขวามีปุ่ม **"แก้ไข JSON"** สลับเป็น editor ข้อความของไฟล์เดียวกัน (กดอีกครั้ง "แก้ไขแบบฟอร์ม" กลับมา โดยอ่านไฟล์ใหม่จาก editor)
- **ช่องขวา:** ขณะตัวสร้างฟอร์มแสดงอยู่ "PDF Preview" เปลี่ยนเป็น **"Form Preview"** = `IssueForm` จริงจากไฟล์ที่ยังไม่บันทึก (กรอกได้ ปุ่ม "ตรวจฟอร์ม" ไม่ส่งอะไร)
- **ในตัวสร้าง:** ซ้าย palette (9 ชนิด), กลาง ผืนฟอร์มสองส่วน "ข้อมูลเอกสาร" (parameters) และ "ข้อมูล" (schema), ขวา แผงคุณสมบัติของช่องที่เลือก
- **บันทึกด้วยปุ่มเดิมของ workspace:** ทุกการแก้ในตัวสร้างเขียนลง editor เป็นไฟล์ที่ยังไม่บันทึก (เฉพาะไฟล์ที่ค่าเปลี่ยน — ไฟล์ที่ dev จัดรูปแบบเองไม่ถูกแตะ)
  แล้ว "บันทึก (Ctrl+S)" เขียนทุกไฟล์ด้วยลำดับและการจัดการ 412 แบบเดิม; `form.json` ที่ draft ยังไม่มี ถูกสร้าง (บันทึก) ทันทีครั้งแรกที่ต้องใช้
- `?mode=form` เดิม → หน้า code ที่เปิด `data.schema.json` ให้ (ไม่มีปุ่ม "ออกแบบฟอร์ม" ใน toolbar แล้ว)
- **ลากวาง (`@dnd-kit`):** ลากจาก palette ลงผืน, ลากย้ายในระดับเดียวกันและข้ามกลุ่ม/เข้าตาราง (ตามกติกาชนิด);
  ใช้ sensor ของเมาส์ (เริ่มลากเมื่อเลื่อน ≥ 5px เพื่อให้คลิกเลือกได้), สัมผัส (กดค้าง 200ms) และแป้นพิมพ์
  - **จำลองการวาง (เพิ่ม 19 พ.ย. 2026 หลังผู้ใช้ลอง):** ระหว่างลาก การ์ดที่ลากออกจากผืน และช่องเส้นประ "วางที่นี่" แทรกอยู่ ณ ตำแหน่งที่จะวางจริง
    (การ์ดอื่นเลื่อนให้ เห็นฟอร์มหลังวาง) — ตำแหน่งคิดจาก pointer: รายการชั้นในสุดที่ pointer อยู่ แล้วก่อน/หลังการ์ดแต่ละใบตามครึ่งบน/ล่าง
    (การ์ดแคบที่วางเรียงกัน เช่นคอลัมน์ในตาราง: ครึ่งซ้าย/ขวา); วางไม่ได้ → ช่องเป็นสีแดงพร้อมเหตุผลตั้งแต่ยังไม่ปล่อย และปล่อยแล้วไม่มีอะไรเปลี่ยน
  - ตำแหน่งการ์ดวัดครั้งเดียวตอนเริ่มลาก (ก่อนยกการ์ด) แล้วชดเชยเฉพาะระยะ scroll ของผืน — ช่องวางจึงไม่ "ไล่ตัวเอง";
    auto-scroll ทำงานเฉพาะ 8% ล่าง/บนของผืน
  - **แป้นพิมพ์:** Space ยก/วาง, ลูกศรสลับในระดับเดียวกัน, Esc ยกเลิก (พร้อมข้อความประกาศภาษาไทยสำหรับ screen reader);
    ย้ายข้ามกลุ่ม/เข้าตารางด้วยช่อง "อยู่ใน" ในแผงคุณสมบัติ; palette กด Enter = เพิ่มท้ายส่วนที่เลือก
  - **performance:** ผืนที่มี 150 ช่อง ลากแล้วไม่กระตุก — ลากไม่ render ทั้งผืนใหม่ทุกครั้งที่เมาส์ขยับ (หัวการ์ด `memo`, state ของตัวสร้างเปลี่ยนเมื่อวางเท่านั้น)
- JSON ที่ตัวสร้างเขียน: 2 ช่องว่าง + ขึ้นบรรทัดท้ายไฟล์ (การจัดบรรทัดที่ dev เขียนมือหายเมื่อไฟล์นั้นถูกแก้ผ่านตัวสร้าง แต่ค่าและลำดับ key ไม่หาย)
- archive แล้ว: ผืนอ่านอย่างเดียว ไม่มี palette

## ฟอร์มออกเอกสารอ่าน `form.json` (E3)

- `formSpec(reportJson, schemaJson, formJson?)` เพิ่ม `widget` และ `width` ให้ `Field`; ช่องจัดเป็น grid 6 คอลัมน์ (`full` = 6, `half` = 3, `third` = 2)
- `textarea` → `<textarea>`; `radio` → กลุ่ม radio; `money` → ช่อง decimal ที่แสดงหลักพันเมื่อออกจากช่อง (ค่าภายในและที่ส่งยังเป็น `"1250.50"`)
- version ที่ไม่มี `form.json` (ทุก version ก่อน v1.6) → ฟอร์มเหมือน v1.4 ทุกอย่าง

## แท็บ "ช่องข้อมูล" (E3)

- แท็บใหม่ข้าง Problems ในโหมด code: ต้นไม้ของทุกช่อง (ป้ายไทย + expression) ปุ่ม "คัดลอก" ต่อแถว
  - parameter → `{{ params.quoteId }}`; ช่องใน schema → `{{ data.customer.name }}`
  - array ที่มี `lists.<name>` ชี้ → `{% for item in lists.<name> %}…{% endfor %}` และคอลัมน์ → `{{ item.<col> }}`; ไม่มี list ชี้ → `data.<path>`
  - เงิน → `{{ fmt.money(...) }}`, วันที่ → `{{ fmt.thai_date(...) }}`
- **เตือน "ไม่ถูกใช้":** ช่อง scalar ที่ไม่พบ `.<key>` ในไฟล์ `.html` ใดของ draft และไม่พบใน expression ของ `report.json` → ป้ายสีเหลือง
  (ตรวจแบบข้อความ ไม่ parse Jinja — เตือนพลาดได้เมื่อเข้าถึงแบบ dynamic เช่น `data[k]`; บอกไว้ในคำอธิบายของแท็บ)

## Tech Stack v1.6

Next.js 16.4.6 + React 19.3.1 เดิม, `useImmer` สำหรับ state ของ builder, CSS Modules

**dependency ใหม่ (ผู้ใช้อนุมัติ 19 พ.ย. 2026), pin version ตรง:**

| package | version | license | หมายเหตุ |
| --- | --- | --- | --- |
| `@dnd-kit/core` | 6.3.1 | MIT | peer `react >=16.8` |
| `@dnd-kit/sortable` | 10.0.0 | MIT | peer `@dnd-kit/core ^6.3.0` |
| `@dnd-kit/utilities` | 3.2.2 | MIT | `CSS.Transform` |

release ล่าสุดธ.ค. 2024 (ตรวจ 19 พ.ย. 2026) — เสถียรแต่ออกช้า; ใช้เฉพาะใน `FormBuilder` เพื่อเปลี่ยนได้ถ้าเลิกดูแล

## Commands v1.6

```bash
cd apps/studio && npm run lint && npm run typecheck && npm test && npm run build
STUDIO_E2E_URL=http://localhost:3002 API_URL=http://localhost:8002 npx playwright test   # stack jester-e2e บน VM
```

## Project Structure v1.6

```
apps/studio/
  lib/schema-edit.ts        → ใหม่: model ของ builder (ไฟล์ → ต้นไม้ช่อง, เพิ่ม/แก้/ย้าย/เปลี่ยนชื่อ/ลบ, เขียนกลับเป็นข้อความไฟล์) — pure
  lib/form-layout.ts        → ใหม่: อ่าน/เขียน form.json แบบผ่อนปรน
  lib/form.ts               → formSpec รับ form.json; Field มี widget/width
  lib/field-refs.ts         → ใหม่: expression ของแต่ละช่อง, ตรวจ "ไม่ถูกใช้", ค้นการอ้างก่อนเปลี่ยนชื่อ/ลบ
  components/FormBuilder.tsx (+ .module.css) → ใหม่: ตัวสร้างฟอร์มในช่อง code (palette, ผืนลากวาง, แผงคุณสมบัติ) + Form Preview
  components/FieldsTab.tsx  → ใหม่: แท็บ "ช่องข้อมูล"
  components/IssueForm.tsx  → widget/width
  components/Workspace.tsx  → โหมด form + ปุ่ม + แท็บ
  app/(app)/templates/[id]/page.tsx → `?mode=form` เดิมเปิด data.schema.json ในหน้า code
  tests/schema-edit.test.ts, tests/form-layout.test.ts, tests/field-refs.test.ts, tests/form.test.ts (เพิ่ม)
  e2e/form-builder.spec.ts  → ใหม่
```

## Code Style v1.6

model เป็นฟังก์ชัน pure รับข้อความไฟล์ คืนข้อความไฟล์ใหม่ — UI ไม่จัดการ JSON เอง:

```ts
/** Rename a field everywhere the builder owns it; template files are reported, never changed. */
export function renameField(files: BuilderFiles, at: FieldPath, newKey: string): Result<BuilderFiles> {
  // properties order kept, required, form.json pointers, samples, lists.*.path
}
```

- แก้ object เดิมแบบ immutable เพื่อเก็บ keyword ที่ไม่รู้จัก (ไม่สร้าง schema ใหม่จากต้นไม้ของ builder)
- ตัวเลขใน sample/default ไม่ผ่าน float: เงินเป็น string อยู่แล้ว; `number`/`integer` เขียนจากข้อความที่ผ่าน regex (หลักเดียวกับ `lib/form.ts`)

## Testing Strategy v1.6

- **Vitest `schema-edit`:** round-trip ทุก starter (อ่าน → เขียนโดยไม่แก้ = ค่าเท่าเดิมทุก key รวม keyword ที่ไม่รู้จัก);
  เพิ่มทุกชนิดทั้งใน schema และ parameters; ย้ายในระดับเดียวกัน/ข้ามกลุ่ม/เข้าตาราง (ปฏิเสธกลุ่มในตาราง);
  เปลี่ยน key อัปเดต required, form.json, sample, `lists.path` (รวม list ลูก); ลบ array ที่ list ชี้ = ปฏิเสธ;
  เพิ่มช่องบังคับแล้ว sample ยังผ่าน; parameter บังคับ + default = ล้าง default; key ซ้ำ/ผิดรูปแบบ = ปฏิเสธ;
  `oneOf`/`$ref` เป็นการ์ดอ่านอย่างเดียวและไม่เปลี่ยน
- **performance (ด้วยมือในเบราว์เซอร์, บันทึกผลใน `tasks/`):** schema ทดสอบ 150 ช่อง → ลากข้ามผืนด้วย Performance panel ของ Chrome ไม่มี long task > 50ms ระหว่างลาก
- **Vitest `form-layout`, `field-refs`, `form`:** form.json เสีย/pointer เก่าถูกข้าม; widget/width ถึง Field; expression ถูกรวม list ลูก; เตือนไม่ถูกใช้
- **E2E `form-builder.spec.ts`:** สร้างจาก `blank` → โหมดออกแบบฟอร์ม → ลากครบ 9 ชนิด (ตาราง 3 คอลัมน์รวมเงิน) + 2 parameters ด้วยเมาส์
  และย้ายหนึ่งช่องด้วยแป้นพิมพ์ (Space, ลูกศร, Space) → บันทึก → Problems ว่าง (`validateDraft` จริง) → แก้ `title` ใน `data.schema.json` มือ → กลับโหมดฟอร์มเห็นป้ายใหม่ →
  publish → "ออกเอกสาร" เห็นช่องตามลำดับ, textarea, radio, ความกว้างครึ่ง → กรอก → ได้ `application/pdf`
- lint, typecheck, test, build ผ่าน; E2E ทุก spec ผ่านบน stack ใหม่

## Boundaries v1.6

- **Always:** เขียนผ่าน `putDraftFile` + `If-Match`; ไม่ทิ้ง keyword ที่ไม่รู้จัก; ทุก key ผ่านกติกา `Name` ก่อนเขียน; ถามก่อนทิ้งการแก้ที่ยังไม่บันทึก
- **Ask first:** dependency อื่นนอกจาก `@dnd-kit` สามตัวข้างบน, endpoint ใหม่ (เช่นบันทึกหลายไฟล์แบบ atomic), ให้ api ตรวจ `form.json`
- **Never:** แก้ `template.html`/header/footer/`lists`/`totals` เอง (ยกเว้น `lists.*.path` ตอนเปลี่ยนชื่อ); เขียนทับเมื่อ revision ไม่ตรง

## Success Criteria v1.6

1. รายงานใหม่จาก `blank` มีฟอร์มครบ 9 ชนิดโดยไม่เปิดไฟล์ JSON, validate ไม่มี problem, ออก PDF ได้
2. แก้ JSON มือแล้ว builder เห็นตรงกัน; builder บันทึกแล้วค่าที่ไม่รู้จักยังอยู่ครบ (round-trip ทุก starter)
3. เปลี่ยนชื่อ/ลบช่องไม่ทำให้ sample หรือ `lists.path` เสีย และเตือนก่อนเมื่อเทมเพลตอาจใช้ช่องนั้น
4. ฟอร์มออกเอกสารใช้ชนิด input และความกว้างจาก `form.json`; version เก่าไม่เปลี่ยน
5. ลากวางทุกอย่างทำด้วยเมาส์, สัมผัส และแป้นพิมพ์ได้; ผืน 150 ช่องลากไม่กระตุก
6. lint, typecheck, test, build, E2E ผ่าน

## Open Questions v1.6

ไม่มี — ตัดสินใน interview รอบสอง 19 พ.ย. 2026:
1. ลากวาง: `@dnd-kit` (ไม่ใช่ HTML5 DnD) เพื่อความลื่น, สัมผัส และ performance
2. บันทึก: ทีละไฟล์ด้วย `putDraftFile` เดิม (ไม่เพิ่ม endpoint atomic)
3. รูปแบบ JSON: เขียนใหม่ทั้งไฟล์แบบ 2 ช่องว่าง (ไม่ใช้ parser ที่รักษารูปแบบ)

## Not Doing v1.6

designer ลากวางตัวเอกสาร (MVP ถัดไป) · ช่องโชว์/ซ่อนตามเงื่อนไข · ช่องคำนวณในฟอร์ม · อัปโหลดรูป/ไฟล์ · ตารางซ้อนตาราง ·
กลุ่มที่มีแต่ในหน้าจอ · builder แก้ `lists`/`totals`/template · undo หลายขั้น (มีแค่ "ยกเลิกการแก้" ทั้งหมด) · หัวหน้าทีมจัดฟอร์ม · role

---

# v1.7: Document Designer (G1–G3)

สถานะ: **อนุมัติ 19 พ.ย. 2026** (Open Questions ปิดแล้วใน interview รอบสอง · ปล่อยรวมเป็น v1.7 ก้อนเดียว) · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.7 (interview 19 พ.ย. 2026)

## Objective

dev จัดหน้าเอกสาร (`template.html`) ด้วยการลากวางบนผืน A4 ที่จำลองกระดาษจริง แทนการเขียน HTML/CSS เอง — สิ่งที่เห็นบนผืนตรงกับ PDF ที่ render

**สำเร็จเมื่อ:**
- starter ทั้ง 5 ตัวเปิดใน designer แล้วแก้ได้เกือบทั้งหน้า (ส่วนที่ยังไม่รองรับเป็น Custom Code) และ PDF เหมือนก่อนเขียนใหม่ (SPEC-template-store v1.7)
- dev สร้างใบเสนอราคาใหม่ทั้งหน้าจาก starter `blank` (โลโก้, หัวเอกสาร 2 คอลัมน์, ตารางรายการ, สรุปยอด, QR) โดยไม่เปิด editor HTML แล้ว PDF ตรงกับผืน
- dev แก้ HTML มือ (เพิ่ม comment, จัดบรรทัด, เขียน `{% if %}` เอง) → เปิด designer → แก้บล็อกอื่น → บันทึก: ส่วนที่ไม่ได้แก้เหมือนเดิมทุกตัวอักษร

## สมมติฐาน v1.7 (ผู้ใช้ตัดสินใน interview)

1. **ผู้ใช้คือ dev**; หัวหน้าทีมไม่ใช้ designer
2. **`template.html` เป็นความจริงเดียว** แบบ site builder: designer อ่านไฟล์ → ต้นไม้บล็อก → เขียนกลับไฟล์เดียวกัน (ไม่มี `design.json`)
3. **ส่วนที่ไม่ได้แก้คงทุกตัวอักษร** ตอนบันทึก (การเว้นบรรทัด, comment `{# #}`, Jinja ที่เขียนมือ, ลำดับ attribute) — parser ของเราเองที่จำตำแหน่งต้นฉบับ
   ไม่ใช่ DOM ของ browser (ซึ่งย้าย `{% for %}` ออกจาก `<table>` และจัดรูปแบบใหม่)
4. **จัดวางแบบไหลต่อกัน** บนลงล่าง แถวแบ่งคอลัมน์ได้ — ไม่มีวางตามพิกัด (ข้อมูลยาวไม่แน่นอน: ตารางต้องดันส่วนล่างและขึ้นหน้าใหม่ได้)
5. **A4 แนวตั้ง/แนวนอน** ตาม `report.json` → `page` ที่มีอยู่ (ไม่แก้ api)
6. **สไตล์ = `style="…"`** บน element เฉพาะ property ที่ designer รู้จัก; `class` และ property อื่นคงไว้; `report.css` อ่านอย่างเดียว
7. **หน้าแยกเต็มจอ** `/templates/<id>/designer`, บันทึกของตัวเอง; PDF จริงดูใน modal

## หน้าจอ

- **ทางเข้า:** ปุ่ม **"Document Designer"** มุมขวาของหัวช่อง code editor (แสดงเสมอ ไม่ว่าเปิดไฟล์ไหน; designer แก้ `template.html`)
  - มีไฟล์ที่ยังไม่บันทึกใน editor → ถามก่อน (แบบไปโหมดออกเอกสาร) เพราะ designer อ่านไฟล์ที่บันทึกแล้ว
- **toolbar:** ชื่อรายงาน · "แสดงข้อมูลตัวอย่าง" (สวิตช์) · undo / redo · "Preview pdf" · สถานะบันทึก · **"บันทึก"** (Ctrl+S) · "กลับไปแก้ code"
  - ออกทั้งที่ยังไม่บันทึก (ปุ่มหรือปิดแท็บ) → ถามก่อน
- **ซ้าย:** palette (บล็อก) และแท็บ "ช่องข้อมูล" (ต้นไม้เดียวกับแท็บใน workspace, ลากช่องลงผืนหรือลงข้อความได้)
- **กลาง:** ผืนกระดาษ (ดู "ผืน A4") เลื่อนได้, zoom 50–150% (ค่าเริ่มต้นพอดีความกว้าง)
- **ขวา:** แผงคุณสมบัติของบล็อกที่เลือก
- **Preview pdf:** `previewDraft` ใช้ draft ที่บันทึกแล้ว → มีการแก้ที่ยังไม่บันทึก: ถาม "บันทึกแล้วดู PDF?" (ผู้ใช้ตัดสิน: ไม่มี endpoint ใหม่)
  แล้วเปิด PDF ใน modal ขนาดเกือบเต็มจอ (iframe แบบเดียวกับ PDF Preview เดิม)
- archive แล้ว → อ่านอย่างเดียว (ไม่มี palette, ไม่มีบันทึก)

## ผืน A4 (G2)

- ขนาดตาม `page.orientation`: 210×297 mm หรือ 297×210 mm; พื้นที่เนื้อหา = ลบ `marginsMm` (top/bottom/left/right) — วาดด้วยหน่วย `mm` ของ CSS
- **ขอบกระดาษ** สีจาง; **โซน header/footer** ในขอบบน/ล่าง แสดง `header.html`/`footer.html` แบบอ่านอย่างเดียว (expression เป็นชิป)
- **เส้นตัดหน้า:** เนื้อหาสูงเกินพื้นที่หนึ่งหน้า → เส้นประ "หน้า 2", "หน้า 3", … ทุกความสูงพื้นที่เนื้อหา (ประมาณการ: การตัดจริงของ Chromium เลี่ยงตัดกลางแถว
  และซ้ำหัวตาราง — ใช้ "Preview pdf" ยืนยัน)
- **เหมือน PDF:** เอกสารอยู่ใน Shadow DOM แยกจากสไตล์ของ Studio; ใส่ CSS เดียวกับที่ binder ใส่ (`@font-face` ของ `report.json` → `fonts.body`,
  `body { font-family }`, `BASE_CSS`) + `report.css` ของ draft + asset (รูป/ฟอนต์) จาก route เดิมของ Studio
- **ฟอนต์:** Studio เสิร์ฟ TH Sarabun New (Regular/Bold, ไฟล์และใบอนุญาตเดียวกับ `infra/gotenberg/fonts`, GPL v2+ with font exception)
  ที่ `/fonts/` ให้ผืนใช้ชื่อ family เดียวกับที่ Gotenberg มี; ฟอนต์อื่นจาก asset ของรายงานใช้ได้เหมือนเดิม

## บล็อก

ทุกบล็อกเป็นรูปแบบ HTML ตายตัวที่ designer เขียนเองและอ่านกลับได้ — HTML ที่ไม่ตรงรูปแบบใดเป็น **Custom Code**

| บล็อก | HTML ที่ designer อ่าน/เขียน | แก้ได้ |
| --- | --- | --- |
| ข้อความ | `<p>`, `<h1>`–`<h3>`, `<div>` ที่ข้างในมีแต่ข้อความ, `<b>`/`<i>`/`<br>` และ `{{ expr }}` | ข้อความบนผืน; ชิปช่องข้อมูล; ระดับหัวข้อ |
| ค่าช่องข้อมูล | `<div>{{ expr }}</div>` ที่มีแค่ expression เดียว | expression (เลือกจากช่องข้อมูล), `fmt` |
| รูป / โลโก้ | `<img src="<asset>">` | asset, ความกว้าง (mm หรือ %), จัดแนว |
| แถวแบ่งคอลัมน์ | `<div data-jd="row">` ที่มี `<div data-jd="col">` 2–4 ตัว (`display:flex` ใน `style`) | จำนวนคอลัมน์, สัดส่วนความกว้าง, ระยะห่าง; คอลัมน์รับบล็อกอื่น |
| ตารางรายการ | `<table>` ที่มี `<thead>` หนึ่งแถว, `<tbody>` = `{% for v in lists.X %}<tr>…</tr>{% else %}<tr>…</tr>{% endfor %}` ตามด้วยแถวท้ายตาราง (รวม) ได้ | list, คอลัมน์ (หัว, expression, จัดแนว, กว้าง), แถว "ไม่มีรายการ", แถวท้าย, เส้นกรอบ |
| สรุปยอด | `<table data-jd="summary">` แถวละ `<td>ป้าย</td><td>{{ expr }}</td>` | แถว (ป้าย + expression), จัดชิดขวา, ตัวหนาแถวสุดท้าย |
| QR / PromptPay / บาร์โค้ด | `<div>{{ fmt.qr(...) }}</div>` / `fmt.promptpay` / `fmt.barcode` | ค่าที่เข้ารหัส (expression), ขนาด mm |
| เส้นคั่น | `<hr>` | ความหนา, สี (ชุดสีที่กำหนด) |
| ช่องว่าง | `<div data-jd="space" style="height:…mm"></div>` | ความสูง |
| ขึ้นหน้าใหม่ | `<div data-jd="page-break" style="break-after:page"></div>` | — |
| **เงื่อนไข** | `{% if c %}…{% elif c2 %}…{% else %}…{% endif %}` ที่ครอบบล็อกทั้งก้อน (ไม่อยู่กลางข้อความ) | เงื่อนไขแต่ละสาขา (modal: เลือกช่อง + ตัวดำเนินการ หรือพิมพ์เอง), เพิ่ม/ลบสาขา; **แต่ละสาขาลากบล็อกใส่ได้** |
| **วนซ้ำ** | `{% for v in X %}…{% else %}…{% endfor %}` ที่ครอบบล็อกทั้งก้อน (X = `lists.<name>` หรือ list ลูกของตัวแปร loop ที่ครอบอยู่ เช่น `order.details`) | list และชื่อตัวแปร, ส่วน "ไม่มีรายการ"; **ลากบล็อกใส่ได้**; บล็อกข้างใน (ตาราง, ข้อความ) ใช้ตัวแปร loop ได้ |
| **ตั้งค่าตัวแปร** | `{% set name = expr %}` บรรทัดเดียว | ชื่อ (กติกา `Name`) และ expression; ตัวแปรขึ้นในแท็บ "ช่องข้อมูล" ของบล็อกที่อยู่ถัดลงมา |
| **Custom Code** | อะไรก็ได้ที่ไม่ตรงข้างบน (รวม `{% macro %}`, loop ซ้อนแบบแบ่งกลุ่ม, `{% set %}` หลายบรรทัด) และบล็อกเปล่าที่ลากจาก palette | ดับเบิลคลิก → modal code editor (ดู "Custom Code กันพลาด") |

- `data-jd="…"` คือเครื่องหมายของ designer บน element ที่จำเป็นต้องแยกแยะ (แถว/คอลัมน์/สรุป/ช่องว่าง/ขึ้นหน้า) — ไม่มีผลต่อ PDF
- `<link rel="stylesheet" href="report.css">` บนสุดของไฟล์: ไม่ใช่บล็อก คงไว้เสมอ (designer เพิ่มให้ถ้ารายงานมี `report.css` แต่ template ไม่มี link)
- **ชิปเงื่อนไขในข้อความ:** `{% if c %}ข้อความ{% endif %}` (และ `{% if c %}…{% else %}…{% endif %}`) ที่อยู่กลางบล็อกข้อความเป็นชิป "ถ้า …" บนผืน
  คลิกเพื่อแก้เงื่อนไขและข้อความแต่ละสาขาใน popover; ข้อความข้างในมีชิปช่องข้อมูลได้แต่ไม่มีบล็อก
- **Custom Code บนผืน:** แสดงผล HTML ข้างในจริง (Jinja เป็นชิป / ค่าตัวอย่างตามโหมด) ในกรอบเส้นประมีป้าย "Custom Code"; ลากย้ายได้; ข้างในไม่ใช่บล็อก
- **Custom Code กันพลาด (modal):** CodeMirror (HTML + Jinja) พร้อม autocomplete ช่องข้อมูลและ `fmt` (ตัวเดียวกับ editor), snippet (if, for, set);
  **ตรวจไวยากรณ์ก่อนปิด** ด้วย parser ตัวเดียวกัน — tag เปิด/ปิดครบคู่ (`if`/`for`/`macro`/`raw`…), `{{ }}` `{% %}` `{# #}` ปิดครบ, ชื่อ tag ที่ Jinja มี,
  HTML ที่แท็กเปิด/ปิดไม่ครบ → บอกบรรทัดและปิด modal ไม่ได้จนกว่าจะแก้หรือ "ยกเลิก"; ชื่อตัวแปร/filter ที่ผิดยังตรวจด้วย `validateDraft` หลังบันทึก
- **เงื่อนไขบนผืน:** โหมด expression แสดงทุกสาขาพร้อมป้าย "ถ้า …" / "ไม่เช่นนั้น"; โหมดข้อมูลตัวอย่างแสดงเฉพาะสาขาที่ตรงกับตัวอย่าง (ประเมินเงื่อนไขที่ประเมินได้ — ดู "ข้อมูลตัวอย่าง")

### คุณสมบัติสไตล์ (เขียนลง `style=`)

`font-size` (pt), `font-weight` (ปกติ/หนา), `text-align`, `color` (ชุดสี 8 สี + ดำ), `margin-top`/`margin-bottom` (mm), `width` (รูป, คอลัมน์),
`border` ของตาราง (ไม่มี/เส้นนอก/ทุกช่อง) — property อื่นใน `style` ที่ dev เขียนเองคงไว้ตามลำดับเดิม

## การแก้บนผืน

- **เลือก:** คลิก; **ลาก:** จับที่ handle ของบล็อก (`@dnd-kit` + ช่อง "วางที่นี่" แบบ v1.6 รวมวางลงคอลัมน์และสาขาเงื่อนไข; วางไม่ได้ = ช่องแดง + เหตุผล)
- **palette → ผืน:** ลากบล็อกใหม่ (ค่าเริ่มต้นที่อ่านง่าย เช่นตารางใหม่ถามเลือก list ก่อนวาง)
- **ข้อความ:** ดับเบิลคลิกเพื่อพิมพ์บนผืน; ชิปช่องข้อมูลลบได้ทั้งก้อนแต่แก้ทีละตัวอักษรไม่ได้; เพิ่มชิปด้วยการลากจากแท็บ "ช่องข้อมูล" หรือพิมพ์ `{{` แล้วเลือก
  (autocomplete เดียวกับ editor)
- **ลบ:** Delete หรือปุ่ม × บนบล็อกที่เลือก
- **undo/redo:** Ctrl+Z / Ctrl+Shift+Z หลายขั้น (ทุกการแก้ = หนึ่งขั้น; พิมพ์ข้อความต่อเนื่อง = หนึ่งขั้น) **ไม่ล้างเมื่อบันทึก** (ย้อนข้ามการบันทึกได้
  แล้วบันทึกอีกครั้งเพื่อให้ไฟล์กลับ); ล้างเมื่อโหลดใหม่หรือออกจากหน้า

## ข้อมูลตัวอย่าง

- **ค่าเริ่มต้น: expression** — ชิป `{{ data.customer.name }}` (เงิน/วันที่แสดงชื่อ `fmt`)
- **"แสดงข้อมูลตัวอย่าง":** ใช้ `prepareDraft` (view model ของ sample แรก จาก draft ที่บันทึกแล้ว) แล้วแทนค่าในฝั่ง browser สำหรับ expression ที่ประเมินได้:
  path (`data.x.y`, `params.x`, `item.col`, `totals.x`, `loop.index`), `fmt.money`, `fmt.number`, `fmt.thai_date` — ตารางแสดงแถวตามตัวอย่าง
  - expression อื่น (`fmt.baht_text`, `fmt.qr`, filter, คำนวณ) → ยังเป็นชิป
  - เงื่อนไขที่ประเมินได้: path, `==`/`!=` กับค่าคงที่, `not`, `and`/`or` ของสองอย่างนี้; อื่น ๆ → แสดงทุกสาขา

## บันทึก

- เขียน `template.html` ด้วย `putDraftFile` + revision; `412` → หยุด, "โหลดใหม่" (การแก้หาย) — ไม่เขียนทับ
- เขียนเฉพาะช่วงข้อความของบล็อกที่แก้/ย้าย/เพิ่ม/ลบ; ข้อความระหว่างบล็อกที่ไม่เกี่ยวคงเดิม
- บล็อกใหม่เขียนด้วยการเยื้อง 2 ช่องว่างตามระดับที่วาง

## รอบแก้หลังผู้ใช้ทดลอง (19 พ.ย. 2026, ก่อนปล่อย v1.7.0)

ผู้ใช้ลอง designer บน stack ทดสอบแล้วขอ 9 ข้อ (อยู่ใน v1.7.0 ก้อนเดิม):

1. **ปรับขนาดแผงซ้าย/ขวาได้:** ลากเส้นแบ่งระหว่าง palette–ผืน และ ผืน–แผงคุณสมบัติ (ใช้ `Resizer` ตัวเดียวกับ workspace) ความกว้างจำไว้ในเบราว์เซอร์
2. **แผงซ้ายแบ่งกลุ่ม พับ/กางได้:** "บล็อกทั่วไป" (ข้อความ, หัวข้อ, ค่าช่องข้อมูล, รูป, แถวแบ่งคอลัมน์, ตาราง, สรุปยอด, QR/บาร์โค้ด, เส้นคั่น, ช่องว่าง,
   ขึ้นหน้าใหม่) · "มาโคร" (เงื่อนไข, วนซ้ำ, ตั้งค่าตัวแปร, Custom Code — ส่วนที่เป็น Jinja) · "ช่องข้อมูล"; จำสถานะพับไว้ในเบราว์เซอร์
3. **ลากบล็อกกลับไปที่แผงซ้าย = ลบ:** ระหว่างลากบล็อกบนผืน แผงซ้ายเปลี่ยนเป็นพื้นที่ "ปล่อยเพื่อลบ"; Custom Code ถามก่อน; เป็นหนึ่งขั้น undo เหมือนปุ่มลบ
4. **แถวแบ่งคอลัมน์: เพิ่ม/รวมคอลัมน์:** แผงคุณสมบัติของแถวมี "+ คอลัมน์" (สูงสุด 4) และในแต่ละคอลัมน์ "รวมกับคอลัมน์ขวา" — บล็อกของคอลัมน์ขวา
   ย้ายมาต่อท้าย, สัดส่วน `flex` รวมกัน, คอลัมน์ขวาหายไป (ต่ำสุด 2; เหลือ 1 → ถาม "ยกเลิกแถว" แล้วบล็อกออกมาอยู่แทนที่แถว)
5. **ชิป expression ไม่ดันหน้ากระดาษเพี้ยน:** ชิปบรรทัดเดียว (`nowrap`) ไม่กว้างเกินช่องของมัน (ตัดด้วย "…" และเห็นเต็มใน tooltip),
   ตัวอักษรตามเอกสารขนาดเล็กลงแทน monospace, ป้ายเป็น expression แบบย่อ (ไม่มี `{{ }}` และ `fmt.`, path เหลือส่วนท้าย เช่น
   `money(unitPrice)`, `customer.name`; เต็มใน tooltip) — ตารางและคอลัมน์จึงกว้างใกล้ PDF
6. **ไม้บรรทัดแบบ Word + ปรับขอบกระดาษ:** ไม้บรรทัดแนวนอนบนผืนและแนวตั้งด้านซ้าย หน่วย mm; ส่วนขอบกระดาษแรเงา; ลากเครื่องหมายขอบ
   (บน/ล่าง/ซ้าย/ขวา) เพื่อเปลี่ยน `page.marginsMm` ใน `report.json` (ทีละ 1 mm, ขั้นต่ำ 5 mm, ขอบบน/ล่างไม่น้อยกว่าที่ header/footer ต้องใช้ไม่ตรวจ — ผู้ใช้ดูเอง)
   — **ไม่มี** การเยื้องย่อหน้า (indent) บนไม้บรรทัด
   - designer จึงแก้ 2 ไฟล์: `template.html` และ `page.marginsMm` ใน `report.json` (เขียนเฉพาะค่านั้น ส่วนอื่นของ JSON คงข้อความเดิม);
     undo/redo ครอบทั้งสองไฟล์; "บันทึก" เขียนเฉพาะไฟล์ที่เปลี่ยน (revision ต่อเนื่อง, 412 แบบเดิม)

7. **ตารางเปล่า (ขอเพิ่ม 19 พ.ย.):** บล็อกใหม่ "ตารางเปล่า" ในกลุ่มบล็อกทั่วไป — ตารางคงที่ไม่ผูก list: `<table data-jd="grid">` แถวละ
   `<td>` ที่ข้างในเป็นข้อความ inline (ข้อความ, ชิปช่องข้อมูล, `<b>`/`<br>`); ค่าเริ่ม 3 × 2 มีเส้นตาราง; ดับเบิลคลิกเซลล์ → พิมพ์บนผืนแบบบล็อกข้อความ
   (ชิป, `{{`); แผงคุณสมบัติ: เพิ่ม/ลบแถว, เพิ่ม/ลบ/ย้ายคอลัมน์, แถวแรกเป็นหัวตาราง (`<th>`) เปิด/ปิด, เส้นตาราง มี/ไม่มี
8. **ปรับขนาดตาราง (ทั้งตารางรายการและตารางเปล่า):** แผงคุณสมบัติตั้ง "ความกว้างตาราง" (% ของหน้า) และ "ความกว้างแต่ละคอลัมน์" (%; ว่าง = อัตโนมัติ)
   — เขียนเป็น `style="width: …"` บน `<table>` และบนเซลล์ของแถวแรก (`<th>` หรือ `<td>`); บนผืนลากเส้นแบ่งคอลัมน์ที่หัวตารางเพื่อปรับได้ด้วย (ปัดเป็น %)
   ระยะในเซลล์ (padding, mm) ตั้งได้ทั้งตาราง

9. **อัปโหลดรูปได้ทุกไฟล์รูปทั่วไป (ขอเพิ่ม 20 พ.ย.):**
   - ชนิดรูป: png, jpg/jpeg, **gif (ใหม่)**, svg, webp, avif, bmp — นามสกุลตัวใหญ่ (`.PNG`, `.JPG`) รับได้; api ตรวจชนิดจาก bytes เหมือนเดิม
     (gif: `GIF87a`/`GIF89a`)
   - **ชื่อไฟล์อะไรก็ได้:** Studio ตั้งชื่อปลอดภัยให้ก่อนส่ง — ช่องว่างและอักขระที่ใช้ไม่ได้ (รวมภาษาไทย) เป็น `-`, รวม `-` ที่ติดกัน,
     นามสกุลตัวเล็ก, ยาวไม่เกิน 100; ไม่เหลือตัวอักษรเลย (เช่น `โลโก้.png`) → `image.png`; ชื่อซ้ำกับ asset ที่มี → เติม `-2`, `-3`, …
     (ไม่เขียนทับ); บอกผู้ใช้ว่าได้ชื่ออะไร — กฎชื่อของ api (`ASSET_FILE`) ไม่เปลี่ยน จึงไม่มี `src` ที่ต้อง escape ใน HTML
   - **ปุ่มอัปโหลดใน designer:** แผงของบล็อกรูปมี "อัปโหลดรูป…" (เลือกไฟล์ → อัปโหลด → เปลี่ยน `src` ของบล็อกเป็นไฟล์ใหม่ = หนึ่งขั้น undo);
     ลาก "รูป / โลโก้" ลงกระดาษตอนยังไม่มีรูปใน assets → เปิดตัวเลือกไฟล์ให้ทันที; อัปโหลดได้ revision ใหม่ของ draft → designer ใช้ต่อ
     (บันทึกครั้งถัดไปไม่ชน 412); การแก้ที่ยังไม่บันทึกใน designer ไม่หาย
   - หน้า code (Import ไฟล์…) ใช้กฎชื่อและชนิดเดียวกัน

## Tech Stack v1.7

ของเดิม (Next.js 16.4.6, React 19.3.1, `@dnd-kit` 3 ตัว, CodeMirror ใน Custom Code modal) · **ไม่เพิ่ม dependency** — parser HTML+Jinja เขียนเอง (ดู Open Questions)
· ไฟล์ฟอนต์ TH Sarabun New 2 ไฟล์ + ใบอนุญาต คัดลอกเข้า `apps/studio/public/fonts/`

## Commands v1.7

```bash
cd apps/studio && npm run lint && npm run typecheck && npm test && npm run build
STUDIO_E2E_URL=http://localhost:3002 STUDIO_E2E_API_URL=http://localhost:8002 npx playwright test   # stack jester-e2e บน VM
```

## Project Structure v1.7

```
apps/studio/
  lib/doc-parse.ts          → ใหม่: tokenizer + ต้นไม้ HTML/Jinja ที่จำ offset ต้นฉบับ; รู้จักบล็อกตามตาราง; เขียนกลับแบบแทนเฉพาะช่วง — pure
  lib/doc-edit.ts           → ใหม่: แก้ต้นไม้ (เพิ่ม/ย้าย/ลบ/สไตล์/ข้อความ/ตาราง/เงื่อนไข/วนซ้ำ/ตัวแปร) + undo stack — pure
  lib/doc-check.ts          → ใหม่: ตรวจไวยากรณ์ Custom Code (tag ครบคู่, delimiter ปิดครบ) ด้วย tokenizer ของ doc-parse
  lib/doc-sample.ts         → ใหม่: ประเมิน expression/เงื่อนไขชุดเล็กกับ view model ตัวอย่าง
  components/designer/      → ใหม่: DesignerPage, PaperCanvas (Shadow DOM + เส้นตัดหน้า), Palette, PropsPanel, CustomCodeModal, PdfModal
  app/(app)/templates/[id]/designer/page.tsx → ใหม่
  components/Workspace.tsx  → ปุ่ม "Document Designer" ที่หัวช่อง code
  public/fonts/             → TH Sarabun New + LICENSE
  tests/doc-parse.test.ts, doc-edit.test.ts, doc-sample.test.ts; e2e/designer.spec.ts
```

## Code Style v1.7

แก้ข้อความไฟล์ด้วยช่วง offset ไม่ใช่ serialize ทั้งต้นไม้:

```ts
/** Replace one block's source range; every byte outside it stays. */
export function replaceBlock(source: string, block: Block, html: string): string {
  return source.slice(0, block.start) + html + source.slice(block.end);
}
```

## Testing Strategy v1.7

- **Vitest `doc-parse`:** round-trip: อ่าน → เขียนโดยไม่แก้ = ข้อความเดิมทุกตัวอักษร สำหรับ starter ทั้ง 5 (ก่อนและหลังเขียนใหม่) และไฟล์ทดสอบที่มี comment,
  `{% macro %}`, `{% if %}` กลางข้อความ, HTML ผิดรูป (แท็กไม่ปิด); จำแนกบล็อกทุกชนิดในตาราง; ส่วนที่ไม่รู้จักเป็น Custom Code ที่ครอบช่วงข้อความถูก
- **Vitest `doc-edit`:** แก้บล็อกหนึ่งแล้ว diff ของไฟล์มีแค่ช่วงนั้น; ย้าย/ลบ/เพิ่มในคอลัมน์และสาขาเงื่อนไข; สไตล์คง property ที่ไม่รู้จัก; undo/redo คืนข้อความเดิมทุกตัวอักษร
- **Vitest `doc-sample`:** ค่า path, `fmt.money`/`thai_date` ตรงกับฝั่ง api (ค่าทดสอบชุดเดียวกับ test ของ data-prep), เงื่อนไขที่ประเมินได้/ไม่ได้
- **ความตรงของผืนกับ PDF (ด้วยมือ + สคริปต์):** starter `quotation` และ `tax-invoice` — จับภาพผืน (โหมดข้อมูลตัวอย่าง) เทียบภาพหน้าแรกของ PDF ด้วยตา + วัดตำแหน่ง
  บล็อกหลัก (ต่างกันไม่เกิน ~2 mm) บันทึกผลใน `tasks/`
- **E2E `designer.spec.ts`:** blank → Document Designer → ลากแถว 2 คอลัมน์, โลโก้, ข้อความที่มีชิป, ตารางผูก list, สรุปยอด, เงื่อนไขที่มีบล็อกข้างใน, Custom Code (แก้ใน modal)
  → วนซ้ำที่มีตารางของตัวแปร loop → Custom Code ที่พิมพ์ `{% if %}` ไม่ปิด = ปิด modal ไม่ได้ + บอกบรรทัด → แก้แล้วปิดได้
  → undo/redo → บันทึก → "Preview pdf" เปิด modal ได้ PDF → กลับหน้า code เห็น HTML ใหม่; แก้ HTML มือ (comment) แล้วเปิด designer แก้บล็อกอื่น → comment ยังอยู่
- **Vitest `doc-check`:** tag ไม่ครบคู่/ซ้อนผิด, `{{` ไม่ปิด, tag ไม่รู้จัก, HTML ไม่ปิด → error พร้อมบรรทัด; starter ทุกตัวผ่าน

## Boundaries v1.7

- **Always:** ส่วนที่ไม่ได้แก้คงทุกตัวอักษร; ไม่ทิ้ง property/attribute ที่ไม่รู้จัก; ถามก่อนทิ้งการแก้; เขียนผ่าน `putDraftFile` + `If-Match`
- **Ask first:** dependency ใหม่ (เช่น HTML parser), endpoint ใหม่ (เช่น render HTML ตัวอย่างฝั่ง api), แก้ `report.css` หรือ header/footer จาก designer
- **Never:** ใช้ DOM ของ browser parse/serialize `template.html`; เขียนทับเมื่อ revision ไม่ตรง; รัน Jinja จริงใน browser กับข้อมูลที่ไม่ใช่ตัวอย่าง

## Success Criteria v1.7

1. starter ทั้ง 5 ตัว: round-trip ไม่เปลี่ยนแม้แต่ตัวอักษร; เปิดใน designer แล้วบล็อกส่วนใหญ่แก้ได้ (Custom Code เฉพาะส่วนที่ตกลงใน SPEC-template-store v1.7)
2. ใบเสนอราคาใหม่ทั้งหน้าจาก `blank` ทำได้โดยไม่เปิด editor HTML; PDF ตรงกับผืน (ตำแหน่งบล็อกหลักต่างไม่เกิน ~2 mm)
3. แก้บล็อกหนึ่งแล้ว diff ใน Versions แสดงเฉพาะบล็อกนั้น
4. Custom Code แก้ได้ใน modal และปิดไม่ได้เมื่อไวยากรณ์ผิด; เงื่อนไขและวนซ้ำลากบล็อกใส่ได้; `purchase-order` แก้ได้ทั้งหน้า
5. lint, typecheck, test, build, E2E ทุก spec ผ่าน

## Open Questions v1.7

ไม่มี — ตัดสินใน interview รอบสอง 19 พ.ย. 2026:
1. parser HTML+Jinja เขียนเอง (ไม่เพิ่ม dependency)
2. บล็อก "วนซ้ำ" ทำในรอบนี้ (+ ตั้งค่าตัวแปร, ชิปเงื่อนไขในข้อความ เพื่อลดงานที่ต้องเป็น Custom Code)
3. Preview pdf: บันทึกก่อนแล้วดู (ไม่มี endpoint ใหม่); undo ไม่ล้างเมื่อบันทึก
4. block-coding เต็มรูปแบบ (แบบ Blockly) ไม่ทำ: ต้นเหตุคือกลัวพิมพ์ Jinja ผิด → Custom Code กันพลาดแทน
5. ปล่อยรวมเป็น v1.7 ก้อนเดียว (ไม่แบ่ง v1.8)

## Not Doing v1.7

กระดาษนอกจาก A4 · วางตามพิกัด · การเยื้องบนไม้บรรทัด · แก้ header/footer ใน designer (แสดงอย่างเดียว) · group-by ในตาราง (Custom Code) · class หรือแก้ `report.css` ·
ประเมิน Jinja ครบชุดใน browser · block-coding เต็มรูปแบบ (Blockly) · endpoint preview ชั่วคราว · หัวหน้าทีมใช้ designer · หลายคนแก้พร้อมกัน

# v1.8: การจัดหน้า (L6)

สถานะ: **อนุมัติ 20 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.8 · interview 20 พ.ย. 2026

## สร้างรายงาน: modal ขนาดกระดาษและรูปแบบ

- กด "สร้างรายงาน" (starter "ว่าง") → modal: การ์ด 2 ใบ **"จัดวางแบบคงที่"** (บล็อกไหลต่อกัน ข้ามหน้าได้) / **"จัดวางแบบอิสระ"** (วางตามพิกัด หน้าเดียว)
  พร้อมไอคอน; dropdown **"ขนาดกระดาษ"**: A3 A4 A5 A6 B5 Letter Legal DL, "กำหนดเอง (mm)" (กว้าง × สูง), "ใบเสร็จม้วน 58 mm", "ใบเสร็จม้วน 80 mm";
  แนวตั้ง/แนวนอน (ไม่แสดงเมื่อม้วน); ม้วนเลือกแบบอิสระไม่ได้ (การ์ดปิดพร้อมเหตุผล); ปุ่ม "สร้าง"
- starter อื่น (ใบเสนอราคา ฯลฯ) ไม่มี modal: A4 แบบคงที่ตามเดิม
- รูปแบบการจัดวางล็อกตั้งแต่สร้าง (หัว designer แสดง "แบบคงที่"/"แบบอิสระ")

## ผืนทุกขนาด + toolbar

- ผืน/ไม้บรรทัด/ขอบตาม `page` ใหม่ทุกขนาด; ม้วน = แถบกว้าง 58/80 mm ยาวตามเนื้อหา ไม่มีเส้นตัดหน้า ไม่มีโซน header/footer
- toolbar "ขนาดกระดาษ": เปลี่ยนระหว่างขนาดแผ่น (และแนว) ได้ — เขียน `page` ใน `report.json` (แก้เฉพาะค่านั้น, หนึ่งขั้น undo); ม้วน ↔ แผ่น เปลี่ยนไม่ได้
- แบบอิสระ: เปลี่ยนขนาดแล้วกล่องที่หลุดขอบถูกเตือน (ไม่ย้ายให้เอง)

## designer แบบอิสระ

- ผืนหน้าเดียว (`data-jd="page"`); palette: ข้อความ, หัวข้อ, ค่าช่องข้อมูล, รูป/โลโก้ (อัปโหลดได้), QR/บาร์โค้ด, เส้น (แนวนอน/ตั้ง), กรอบสี่เหลี่ยม, ตารางเปล่า
  — ไม่มีตารางรายการ วนซ้ำ ขึ้นหน้าใหม่ (ความยาวไม่แน่นอน)
- ลากจาก palette วางตรงไหนก็ได้ = กล่อง (`data-jd="box"`) ที่พิกัดนั้น; ลากกล่องย้าย; มุม/ขอบมีจุดปรับขนาด; ลูกศรขยับ 0.5 mm (Shift = 5 mm)
- จับแนว (snap): ขอบกระดาษ, เส้นกึ่งกลาง, ขอบ/กึ่งกลางของกล่องอื่น (เส้นนำทางสีแดง), ตาราง 1 mm; กด Alt ค้างเพื่อปิด snap
- แผงคุณสมบัติ: X, Y, กว้าง, สูง (mm) + สไตล์เดิม; ลำดับซ้อน (ยกขึ้นหน้า/ส่งไปหลัง)
- ภาพพื้นหลังนำทาง: อัปโหลดสแกนแบบฟอร์ม → แสดงจางใต้ทุกกล่อง ไม่พิมพ์ออก (`data-jd="guide"`); ซ่อน/แสดง/ลบได้
- ข้อความยาวเกินกล่อง = ตัดที่ขอบกล่อง (เหมือน PDF) พร้อมขีดเตือนสีแดงที่กล่อง

## header/footer บนผืน (แบบคงที่)

- ดับเบิลคลิกโซนขอบบน/ล่าง → แก้ `header.html`/`footer.html` ด้วยบล็อกชุดเล็ก: ข้อความ, ค่าช่องข้อมูล, รูป/โลโก้, แถวแบ่งคอลัมน์, ชิป "หน้า X/Y"
  (`<span class="pageNumber">` / `<span class="totalPages">`); palette แสดงเฉพาะบล็อกเหล่านี้ขณะแก้โซนนั้น
- ทุกหน้าเหมือนกัน; ยังไม่มีไฟล์ = สร้างให้เมื่อวางบล็อกแรก; ฟอนต์ตาม `fonts.headerFooter`
- undo/redo และ "บันทึก" ครอบ `template.html`, `header.html`, `footer.html`, `report.json`

## ซ้อนหลายชั้น

- designer: วนซ้ำซ้อนวนซ้ำได้ลึก 3 ชั้น; ตารางรายการมี **แถวรายละเอียด** (เปิด/ปิดในแผง): แถวที่สองต่อทุกแถว คร่อมทุกคอลัมน์ มีตารางรายการย่อยของ array ลูก
  (`item.<ลูก>`) ซ้อนได้อีกชั้น; ยอดรวมของชั้นย่อยเป็นชิปให้ใช้
- form builder: ตารางในตารางได้ลึก 3 ชั้น (เลิกข้อห้าม "ตารางซ้อนตารางยังไม่รองรับ"); ฟอร์มออกเอกสารกรอกตารางซ้อนได้
- `report.json` lists ซ้อน: Studio ไม่สร้างให้อัตโนมัติ (dev เขียนเอง หรือใช้ path ของ array ลูกตรง ๆ ในวนซ้ำ)

## Success Criteria v1.8

1. สร้าง "ใบเสร็จม้วน 80 mm" จาก modal → designer → Preview pdf ได้ PDF กว้าง 80 mm ยาวพอดีเนื้อหา หน้าเดียว
2. สร้างฟอร์มแบบอิสระบน A5 แนวนอน วาง 6 กล่องด้วย snap → PDF ตำแหน่งตรงกับผืน ≤ 0.5 mm
3. แก้ header/footer บนผืน (โลโก้ + เลขหน้า) → PDF ทุกหน้ามีโลโก้และ "หน้า X/Y"
4. ใบสั่งซื้อ → รายการ → ชิ้นส่วน ทำด้วยบล็อก ไม่มี Custom Code ใหม่ ยอดทุกชั้นถูก
5. รายงานเดิมและ starter ทั้ง 5 ได้ PDF เหมือน v1.7 (test เทียบ PDF เดิมผ่าน)
6. ผืนเทียบ PDF (สคริปต์ T11) ≤ 2 mm บน A5, Letter, custom และม้วน 80 mm

## Open Questions v1.8

1. ~~`singlePage` ของ Gotenberg~~ — ใช้ได้ (spike 20 พ.ย. 2026)
2. snap ตาราง 1 mm หรือ 0.5 mm เป็นค่าเริ่ม (เสนอ 1 mm)

## Not Doing v1.8

header/footer หน้าแรกต่างจากหน้าอื่น · แปลงแบบคงที่ ↔ แบบอิสระ · แบบอิสระหลายหน้า / ตารางไหลข้ามหน้าในแบบอิสระ · หมุนเป็นมุม · ซ้อนเกิน 3 ชั้น ·
เปลี่ยนม้วน ↔ แผ่น · header/footer ในแบบอิสระและม้วน · พิมพ์ภาพพื้นหลังนำทาง · สั่งเครื่องพิมพ์ใบเสร็จ (ESC/POS) โดยตรง
