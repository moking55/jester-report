# Tasks: `studio`

แผน: [plan.md](plan.md) · Spec: [SPEC-studio.md](../../SPEC-studio.md)
backend: `cd apps/api && uv run ruff check . && uv run pytest tests -q` (+ `-m db` ผ่าน tunnel)
studio: `cd apps/studio && npm run lint && npm run typecheck && npm test && npm run build`

## Phase 1: backend ที่ต้องเพิ่ม + โครง Studio

### T1: backend — prepared data + theme

**Description:** contract ก่อน: `POST /v1/templates/{templateId}/draft/prepared`, `GET/POST /v1/themes`, `PUT/DELETE /v1/themes/{themeId}`, `GET/PUT /v1/themes/default` (+ schema `Theme`, `ThemeTokens`, `PreparedData`); `render-service.prepared()` (data-prep ใน worker, Decimal → string); `jester_api/themes/` (built-in `classic`/`suriyan` ในโค้ด, ตาราง `themes` + `theme_default` ใน `0004_themes.sql`, ตรวจ token ด้วย allow-list + regex); route ใน public-api

**Acceptance criteria:**
- [x] prepared ของ starter quotation → `totals.grand == "3210.00"` และ `lists.items.rows[0].amount == "2501.00"`; data ผิด → 422 พร้อม problems
- [x] token ไม่อยู่ในรายการ, สีที่ไม่ใช่ `#RRGGBB` (รวม `red;}body{display:none`), ตัวเลขนอกช่วง → 422 พร้อม pointer; built-in แก้/ลบ → 409; ลบ theme ที่เป็นค่าเริ่มต้น → ค่าเริ่มต้นกลับเป็น `classic`
- [x] `GET /v1/themes/default` ไม่ต้อง login; test contract ของ api ผ่าน (route ครบ 42 operation)

**Verification:**
- [x] `uv run pytest tests -q` และ `-m db` (themes, prepared, contract)

**Dependencies:** None
**Files likely touched:** `openapi/public-api.yaml`, `themes/{__init__,builtin,store}.py`, `db/migrations/0004_themes.sql`, `render_service/service.py`, `public_api/routes/{themes,render}.py`, tests
**Estimated scope:** M

### T2: studio scaffold

**Description:** `apps/studio` ด้วย Next.js (App Router, TS) เวอร์ชัน pin; ESLint (`no-restricted-imports` สำหรับ state library และ `lib/api` ใน client); `npm run gen:api` (openapi-typescript); `lib/api.ts` (`server-only`, header ครบ, `ApiProblem`, 401), `lib/session.ts` (cookie httpOnly), client IP (`JESTER_TRUST_PROXY`); `styles/tokens.css` (classic จาก mockup, suriyan) + `lib/theme.ts` (ตรวจ token แล้วสร้าง `<style>`); Vitest; `Dockerfile` (standalone, non-root) + service `studio` ใน `infra/compose.yaml`

**Acceptance criteria:**
- [x] `npm run build`/lint/typecheck/test ผ่าน; import `zustand` หรือ `lib/api` ใน client component → lint ล้ม
- [x] `lib/api` ส่ง `Authorization`, `X-Jester-Studio-Key`, `X-Jester-Client-IP`; problem+json → `ApiProblem` (Vitest)
- [x] `lib/theme` ตัดค่าที่ไม่ผ่าน regex (test ด้วย `;}`, `</style>`); image build ได้และไม่รันเป็น root

**Verification:**
- [x] `npm run lint && npm run typecheck && npm test && npm run build`

**ผล:** Next 16.4.3, React 19.3.1, TypeScript 5.9.3 (6.x ชน peer ของ openapi-typescript), ESLint 9.39.5 (eslint-plugin-react ยังไม่รองรับ 10); image 297MB รันเป็น uid 1000 (build บน VM)
**Dependencies:** T1
**Files likely touched:** `apps/studio/{package.json,next.config.ts,eslint.config.mjs,Dockerfile}`, `lib/{api,session,theme,types.gen}.ts`, `styles/tokens.css`, `infra/compose.yaml`
**Estimated scope:** M

### T3: setup, login, shell

**Description:** หน้า `setup` (เมื่อ `setupRequired`), `login`, logout (Server Action), `(app)/layout` (header + status bar ตาม mockup, ตรวจ session, ใส่ theme ของผู้ใช้หรือค่าเริ่มต้น), ตัวเลือก theme ส่วนตัว (cookie)

**Acceptance criteria:**
- [x] ยังไม่ setup → ทุกหน้าพาไป `setup`; setup แล้ว → login → catalog; 401 → login
- [x] login ผิด → ข้อความไทย; 429 → ข้อความให้รอ
- [x] สลับ classic/suriyan แล้วสีเปลี่ยนทั้งหน้า และจำหลัง reload

**Verification:**
- [x] Vitest (ฟอร์ม, action) + `npm run build`

**Dependencies:** T2
**Files likely touched:** `app/(auth)/*`, `app/(app)/layout.tsx`, `lib/actions/auth.ts`, `components/{Shell,ThemePicker}.tsx`, tests
**Estimated scope:** M

### Checkpoint A

- [x] Vitest/build/lint ผ่าน; Playwright บน compose ที่ VM: setup → login → สลับ classic/suriyan → logout; ไม่มี request จาก browser ไป api
- ผล 15 พ.ย. 2026: `e2e/checkpoint-a.spec.ts` ผ่านบน stack แยก `-p jester-e2e` (volume ใหม่) ที่ VM; เจอและแก้ 2 อย่าง: hint อยู่ใน `<label>` (ย้ายเป็น `aria-describedby`), React reset form ทำให้ชื่อผู้ใช้หายหลังรหัสผิด (action คืนค่าที่ไม่ใช่รหัสผ่าน)

## Phase 2: หน้าจอหลัก

### T4: catalog + workspace

**Description:** catalog (รายการ + สร้างจาก starter); workspace: รายการไฟล์, CodeMirror 6 (HTML/CSS/JSON + เน้น Jinja), บันทึกด้วย `If-Match` และคำเตือน 412, เพิ่ม/ลบไฟล์และ asset, Validate → problems ในแท็บและ gutter, แท็บ Prepared data (ต้นไม้ของ view model), Provenance (ของ run ล่าสุด), Preview ใน iframe (form POST → Route Handler)

**Acceptance criteria:**
- [ ] บันทึกแล้ว revision เพิ่ม; สองแท็บบันทึกพร้อมกัน → แท็บหลังเห็นคำเตือนและไม่เขียนทับ
- [ ] problem ที่มี `line` แสดงที่บรรทัดนั้นในไฟล์นั้น; คลิก problem แล้ว editor กระโดดไปบรรทัด
- [ ] Prepared data แสดง `totals.grand`; Preview แสดง PDF ที่มี DRAFT

**Verification:**
- [ ] Vitest (state ของ workspace: บันทึก/412/422) + `npm run build`

**Dependencies:** T3
**Files likely touched:** `app/(app)/page.tsx`, `app/(app)/templates/[id]/page.tsx`, `app/preview/[id]/route.ts`, `components/{Workspace,Editor,BottomTabs,PdfPane}.tsx`, `lib/actions/draft.ts`
**Estimated scope:** L (แตกย่อยเมื่อเริ่มถ้าเกิน 5 ไฟล์หลัก)

**แตกย่อย (เรียงตามความเสี่ยง, commit ละชิ้น):**
- [x] T4a: catalog (รายการ + สร้างจาก starter) + workspace: รายการไฟล์, CodeMirror, บันทึกด้วย `If-Match`, 412 → แถบเตือนพร้อมปุ่มโหลดใหม่
- [x] T4b: Validate → แท็บ Problems + `@codemirror/lint` (gutter + ขีดเส้นใต้), คลิก problem → กระโดดไปบรรทัด
- [x] T4c: Prepared data (ต้นไม้), Preview ใน iframe (form POST → `preview/[id]/route.ts`), Provenance จาก `/v1/runs?templateId=…&limit=1`
- [ ] T4d: เพิ่ม/ลบไฟล์ข้อความ และ asset (upload ผ่าน Route Handler เพราะ Server Action จำกัด body ~1 MB)

### T5: publish, versions, render, history

**Description:** Publish (ส่ง revision ปัจจุบัน; 422 → problems), รายการ versions + ตั้ง published + reset draft, Render dialog (เลือก version/params/data, แสดงตัวอย่าง `curl` ที่ไม่มี secret จริง), history (ตาราง run, ตัวกรอง, ไล่หน้า, รายละเอียด provenance), นโยบายเก็บ (ดูจำนวนที่จะลบก่อนยืนยัน)

**Acceptance criteria:**
- [ ] publish draft ที่ผิด → เห็น problems ไม่ publish; ถูก → version ใหม่ขึ้นในรายการ
- [ ] ตั้งนโยบาย N วันต้องผ่านหน้ายืนยันที่แสดงจำนวนจริง; ค่าเริ่มต้นแสดง "เก็บตลอด"
- [ ] ตัวอย่าง `curl` ใช้ placeholder `jrk_…` ไม่ใช่ secret จริง

**Verification:**
- [ ] Vitest + `npm run build`

**Dependencies:** T3
**Files likely touched:** `components/{VersionsPanel,RenderDialog}.tsx`, `app/(app)/history/page.tsx`, `lib/actions/{versions,runs}.ts`
**Estimated scope:** M

### T6: settings + theme editor

**Description:** ผู้ใช้ (รายการ, เพิ่ม, ลบ; ลบคนสุดท้ายไม่ได้), API key (สร้าง → แสดง secret ครั้งเดียวพร้อมปุ่มคัดลอก, เพิกถอน), เปลี่ยนรหัสผ่าน, theme editor (เลือก theme ฐาน, ฟอร์ม token 16 ตัวพร้อมตัวอย่างสด, ทำสำเนา built-in, บันทึก/ลบ, import/export JSON, ตั้งค่าเริ่มต้นของระบบ)

**Acceptance criteria:**
- [ ] secret ของ API key แสดงครั้งเดียว ปิดแล้วไม่มีทางดูอีก
- [ ] แก้สีในฟอร์ม → ตัวอย่างเปลี่ยนทันทีโดยยังไม่บันทึก; import JSON ที่มีค่าผิด → แสดง error ตาม pointer จาก server
- [ ] ตั้ง theme ที่สร้างเองเป็นค่าเริ่มต้น → หน้า login ใช้ theme นั้น

**Verification:**
- [ ] Vitest (ThemeEditor, การสร้าง style) + `npm run build`

**Dependencies:** T3
**Files likely touched:** `app/(app)/settings/page.tsx`, `components/{UsersPanel,ApiKeysPanel,PasswordForm,ThemeEditor}.tsx`, `lib/actions/{users,keys,themes}.ts`
**Estimated scope:** M

### T7: E2E เต็ม + ให้ตรง mockup

**Description:** Playwright บน compose ที่ VM ครอบ flow ใน spec (setup → render ด้วย API key → history, สองแท็บ, theme ที่สร้างเอง); ตรวจ network ว่าไม่มี request ไป api จาก browser; ปรับ catalog/workspace/history ใน theme classic ให้ตรง mockup (เต็มจอ, ไม่มีกรอบ card ครอบหน้า)

**Acceptance criteria:**
- [ ] Playwright ผ่านทั้งหมดบน VM
- [ ] ภาพหน้าจอ catalog/workspace/history ใน classic เทียบ mockup แล้วจัดวางตรงกัน
- [ ] `docker compose up` (5 services) แล้ว login ใช้งานได้

**Verification:**
- [ ] `STUDIO_E2E_URL=… npx playwright test`

**Dependencies:** T4, T5, T6; VM `10.0.1.29`
**Files likely touched:** `e2e/*.spec.ts`, CSS modules, `infra/compose.yaml`
**Estimated scope:** M

### Checkpoint B

- [ ] Success criteria 1–5 ของ spec ผ่าน
- [ ] ผู้ใช้ทบทวน
