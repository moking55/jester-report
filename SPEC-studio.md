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
     - ปุ่ม **"+ เพิ่มไฟล์"** เปิดเมนู: สร้างไฟล์ใหม่ (.html .css .json ว่าง) หรือ import ไฟล์ (ข้อความ → ไฟล์ draft, รูป/ฟอนต์ → asset)
     - กดรูปใน Assets (PNG/JPEG/SVG) → **ดูรูปทับ editor** พร้อมชนิด ขนาดไฟล์ และขนาด pixel; editor ยังอยู่ข้างใต้ งานที่ยังไม่บันทึกไม่หาย
     - **ลากเส้นแบ่งเพื่อปรับขนาด** ช่องไฟล์, preview และแท็บล่าง (ลูกศรบนคีย์บอร์ดได้, ดับเบิลคลิกคืนค่าเดิม) จำไว้ใน `localStorage` ของ browser; editor เล็กสุด 280×140
     - pane ชิดกันมีเส้นแบ่ง 1px ทุก theme ยกเว้น `classic` ที่เป็นกล่องแยกมีช่องว่างตาม mockup
   - `api`: คู่มือสำหรับระบบอื่น — สร้าง API key, เรียก `POST /v1/render` (ตัวอย่าง `curl`), รูปแบบ error, รายงานที่ publish แล้ว และดาวน์โหลด contract (`/api/openapi.yaml` ผ่าน Studio)
   - `history`: ประวัติ render + นโยบายเก็บ (แสดงจำนวนที่จะลบก่อนยืนยัน)
   - `settings`: ผู้ใช้, API key (secret แสดงครั้งเดียว), เปลี่ยนรหัสผ่าน, **theme**
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
    (app)/settings/page.tsx       → ผู้ใช้, API key, รหัสผ่าน, theme
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
