# Capability Map: Jester Report Server v1

อนุมัติโดยผู้ใช้: 13 พฤศจิกายน 2026
Intent: [docs/intent/report-server-v1.md](docs/intent/report-server-v1.md)
ไฟล์นี้เป็นดัชนีของ spec ทั้งหมด: แต่ละ module มี spec ของตัวเองชื่อ `SPEC-<module-id>.md` ที่ root (ยังไม่มี spec ใด)

Module id ตั้งครั้งเดียว ห้ามเปลี่ยนชื่อระหว่างโครงการ dependency ไปทางเดียว ไม่มีวงวน

## Backend — FastAPI (Python)

| Module id | หน้าที่ | ขึ้นกับ |
| --- | --- | --- |
| `engine-client` | Adapter ไป Gotenberg: สร้าง multipart request, เปิด `failOnResourceHttpStatusCodes` + `failOnResourceLoadingFailed`, timeout, map error, เก็บ engine digest | — |
| `report-definition` | Schema ของ `report.json` (parameters, data schema, aggregates, bands, page setup) และ semantic validation พร้อมตำแหน่ง error | — |
| `data-prep` | Validate data/params, sort/group, aggregate ด้วย `Decimal`, formatter ไทย (เงิน, พ.ศ., บาทตัวอักษร), no-data/overflow policy | `report-definition` |
| `binder` | Jinja2 `SandboxedEnvironment`, escape ตาม context, ประกอบ bands → index/header/footer + assets | `report-definition`, `data-prep` |
| `template-store` | Template/version (draft → publish, published immutable, rollback); ไฟล์ข้อความใน PostgreSQL; asset ใน S3-compatible แบบ content-addressed (sha256) | `report-definition` |
| `auth` | บัญชี Studio (password hash, สิทธิ์เท่ากัน), first-run setup ด้วย one-time setup token ที่พิมพ์ลง log, API key (สร้าง/เพิกถอน, เก็บ hash, เห็นครั้งเดียว) | — |
| `render-service` | Orchestrate pipeline, provenance, error taxonomy, run history | `binder`, `engine-client`, `template-store` |
| `public-api` | FastAPI routes: `POST /render`, template/version CRUD, preview, runs, setup/auth; OpenAPI contract; limits | `render-service`, `template-store`, `auth` |

## Frontend — Next.js (TypeScript)

| Module id | หน้าที่ | ขึ้นกับ |
| --- | --- | --- |
| `studio` | UI ตาม [mockup](design/studio-mvp.html): first-run setup, login, catalog, workspace (ไฟล์/editor/PDF preview/problems), Render dialog, history, publish, API keys; Server Components เป็นหลัก, Client state `useImmer` เท่านั้น, เขียนข้อมูลผ่าน Server Actions → FastAPI | `public-api` (ผ่าน OpenAPI contract) |

## Build order

1. `engine-client` + spike M0 — render รายงานอ้างอิง 3 แบบผ่าน Gotenberg จริงบน VM (SP-B → SP-A → SP-C ตาม research T28/T29)
2. ร่าง OpenAPI contract ของ `public-api` เพื่อให้ `studio` เริ่มด้วย mock ได้
3. Backend: `report-definition` → `data-prep` → `binder`; `template-store` และ `auth` คู่ขนานได้ → `render-service` → `public-api` (implement ตาม contract)
4. Frontend: `studio` คู่ขนานกับข้อ 3 หลังข้อ 2

ผล spike M0 อาจเปลี่ยน spec ของ `binder` (เช่นต้องแบ่งหน้าที่ชั้นแอปถ้าหัวตารางซ้ำใช้ไม่ได้)

## Deployment

Docker Compose (ไม่ใช้ Kubernetes) 5 services: `studio` (Next.js), `api` (FastAPI), `gotenberg` (image ของเรา `jester/gotenberg` = 9.4.1 pin digest + TH Sarabun New เป็น system font; ดู [infra/gotenberg](infra/gotenberg/Dockerfile)), `postgres`, `rustfs`

- PostgreSQL มากับ compose เป็นค่าเริ่มต้น; ตั้ง `DATABASE_URL` เพื่อใช้ฐานข้อมูลเดิมขององค์กรแทน
- Object storage ค่าเริ่มต้น RustFS; ตั้งค่า endpoint/credentials เพื่อใช้ S3-compatible อื่น
- **ต้องตรวจก่อนแจกจ่าย:** license และ maturity ของ RustFS (ยังไม่ตรวจ)

## Out of scope v1

SSO/OIDC, role/RBAC, multi-tenant, เก็บ PDF ที่ render แล้วระยะยาว, Kubernetes/Helm, CLI, data connector, drag-drop designer, async job/schedule/email, PDF/A และ digital signature, JRXML, export XLSX/DOCX, page subtotal

## v1.1: Foundations (อนุมัติ 17 พฤศจิกายน 2026)

ที่มา: [docs/ideas/foundations-v1-1.md](docs/ideas/foundations-v1-1.md) · ไม่มี module ใหม่: แต่ละ spec ด้านล่างเพิ่มหัวข้อ "v1.1" ต่อท้าย

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| H1 Next.js 16.4.6 | `studio` | — |
| H2 CI เขียว | `.github` (เจ้าของบัญชีตรวจ Actions/billing) | — |
| A1 export/import zip | `template-store` → `public-api` → `studio` | — |
| A2 ทำสำเนารายงาน | `template-store` → `public-api` → `studio` | — |
| A3 archive (render ตอบ 410) | `template-store`, `render-service` → `public-api` → `studio` | — |
| A4 แอดมินตั้งรหัสผ่านให้ผู้อื่น | `auth` → `public-api` → `studio` | — |
| B1 API key: วันหมดอายุ + จำกัดรายงาน | `auth`, `render-service` → `public-api` → `studio` | A3 |
| B2 rate limit ต่อ key (ปิดเป็นค่าเริ่มต้น) | `auth`, `public-api` → `studio` | B1 |
| B3 backup/restore | `infra` (README + สคริปต์ + CLI `jester_api.ops.blobs`) | — |
| C1 `fmt.qr()` / `fmt.barcode()` (SVG, PromptPay) | `data-prep` → `binder` | — |
| C2 starter ใบกำกับภาษีเต็มรูป | `template-store` | C1, A1 |

Build order: H1 → A1–A4 → B1 → B2 → B3 → C1 → C2 (H2 คู่ขนานได้; B3, C1 ไม่ขึ้นกับใคร)
ลำดับเขียน spec: `template-store` → `render-service` → `auth` → `data-prep`/`binder` → `public-api` → `studio` → infra

**สถานะ (18 พ.ย. 2026):** ปล่อยทีละ phase — H1 + A1–A4 = `v1.1.0`, B1–B3 = `v1.2.0`, C1–C2 = `v1.3.0` (ผู้ใช้สแกน QR ผ่าน); H2 ยังค้างที่ผู้ใช้ (Actions/billing) · บันทึกผลและจุดที่ต่างจาก spec: [tasks/v1.1/todo.md](tasks/v1.1/todo.md)

## v1.4: ฟอร์มออกเอกสาร (อนุมัติ 18 พ.ย. 2026 หลัง interview)

ผู้ใช้กลุ่มแรก: dev ที่ติดตั้ง Jester แล้วชวน **หัวหน้าทีม** มาลอง (เห็นข้อมูลทั้งหมดได้ จึงไม่มี role) · เป้าของ release:
หัวหน้ากรอกฟอร์มแล้วได้ PDF เองโดยไม่แตะ JSON และไม่ต้องให้ dev ช่วย เพื่อเก็บ feedback ก่อนตัดสินรอบถัดไป

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| F0 ป้ายภาษาไทย: `title`/`description` ใน parameters ของ `report.json`; starter ทุกตัวเติม `title` ภาษาไทยใน `report.json` และ `data.schema.json` | `report-definition` → `template-store` | — |
| F1 โหมด "ออกเอกสาร" ใน workspace (เปิดตรงจากปุ่มใน catalog): ฟอร์มจาก parameters + `data.schema.json` ของ version ที่ publish แทน editor, PDF ข้างฟอร์ม | `studio` | F0 |

Build order: F0 → F1 · ปล่อยเป็น `v1.4.0` · ลำดับเขียน spec: `report-definition` → `template-store` → `studio`
ไม่มี endpoint ใหม่: อ่านไฟล์ของ version ด้วย `getVersion` และออก PDF ด้วย `POST /v1/render` เดิมผ่าน session ของ Studio

**ไม่ทำในรอบนี้ (รอ feedback):** designer ลากวาง · `form.json` และตัวจัดฟอร์มแบบลากเรียง · role · เก็บเอกสารที่ออก (เลขรันอัตโนมัติตัดออกจากแผน 18 พ.ย. 2026)

## v1.5: เก็บเอกสารที่ออก (อนุมัติ 19 พ.ย. 2026 หลัง interview)

เป้า: หัวหน้าเปิดใบที่ออกไปแล้วกลับมาดาวน์โหลด PDF เดิมได้ โดยไม่ต้องกรอกใหม่ (ไม่ใช่หลักฐานเพื่อตรวจสอบ: ไม่มีห้ามแก้/ห้ามลบเพิ่ม)

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| D1 เก็บเอกสารของทุก render ที่สำเร็จจาก version ที่ publish (ทั้งฟอร์มใน Studio และ API key): PDF ใน rustfs ที่ `documents/<run_id>`, params + data ในตาราง `documents` ที่ผูกกับ run; ลบทั้งสองที่ตาม `run_retention` เดิม + คำสั่งเก็บกวาดไฟล์กำพร้า | `render-service` | — |
| D2 `GET /v1/documents` (รายการ + ค้นหา) และ `GET /v1/documents/{runId}` (PDF) — session เท่านั้น; `Run` เพิ่ม `hasDocument` | `public-api` | D1 |
| D3 หน้า "เอกสาร" (กรองรายงาน, ค้นหา, ดาวน์โหลด) + ทางเข้าจาก catalog, โหมดออกเอกสาร และหน้าประวัติ | `studio` | D2 |

Build order: D1 → D2 → D3 · ปล่อยเป็น `v1.5.0` · ลำดับเขียน spec: `render-service` → `public-api` → `studio` → infra (backup รวม PDF ของเอกสาร)
ผู้ใช้ตัดสิน 19 พ.ย. 2026: PDF เก็บใน rustfs ไม่ใช่ PostgreSQL · ผู้ใช้ Studio ทุกคนเห็นทุกใบ รวมใบที่ออกผ่าน API key
**กลับข้อตัดสินใจ v1:** เดิม "ไม่เก็บ params, data หรือ PDF" — ตั้งแต่ v1.5 ฐานข้อมูลมีข้อมูลลูกค้าจริง (ผู้ใช้ยืนยัน 19 พ.ย. 2026)

**ไม่ทำ:** เลขรันอัตโนมัติ · ห้ามแก้/ห้ามลบเพื่อเป็นหลักฐาน · ลบทีละใบ · อายุเก็บแยกจากประวัติ · API ให้ระบบอื่นดึงใบเดิม (API key) · role · เก็บ preview/draft/run ที่ล้มเหลว · ตัวเลือก "ไม่เก็บ" ต่อ API key/รายงาน (ทำเมื่อมีแผนต่อระบบเงินเดือน)

## v1.6: Form builder (ร่าง 19 พ.ย. 2026 หลัง interview — รออนุมัติ)

เป้า: dev สร้างข้อมูลนำเข้าของรายงาน (parameters + `data.schema.json`) ด้วยการลากวางใน Studio โดยไม่ต้องเขียน JSON
แล้วหัวหน้าทีมได้ฟอร์มออกเอกสารที่จัดตามนั้น · dev ยังแก้ JSON ด้วยมือได้ และ builder กับไฟล์เห็นตรงกันเสมอ

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| E1 `lib/schema-edit.ts`: อ่าน/เขียน schema + parameters + `form.json` + sample แบบ pure (เพิ่ม, แก้, ย้าย, เปลี่ยนชื่อ, ลบช่อง; เก็บ keyword ที่ไม่รู้จักไว้) | `studio` | — |
| E2 โหมด "ออกแบบฟอร์ม" ใน workspace: palette, ผืนลากวาง, แผงคุณสมบัติ, ตัวอย่างฟอร์ม, บันทึกลง draft | `studio` | E1 |
| E3 ฟอร์มออกเอกสารอ่าน `form.json` (ชนิด input, ความกว้าง) + แท็บ "ช่องข้อมูล" ใน workspace (copy expression, เตือนช่องที่เทมเพลตไม่ได้ใช้) | `studio` | E1 |

Build order: E1 → E2, E3 · ปล่อยเป็น `v1.6.0` · spec: [SPEC-studio.md](SPEC-studio.md) หัวข้อ v1.6
**ไม่มีงานฝั่ง api:** `form.json` ผ่านรูปแบบชื่อ `TEXT_FILE` เดิม, publish คัดลอกทุกไฟล์ของ draft, export/import zip พาไปด้วย —
api ถือ `form.json` เป็นไฟล์ข้อความทึบ (ไม่ตรวจ ไม่ใช้ตอน render)

**ไม่ทำ:** designer ลากวางตัวเอกสาร (**MVP ถัดไป**, ผู้ใช้ตัดสิน 19 พ.ย. 2026) · ช่องโชว์/ซ่อนตามเงื่อนไข · ช่องคำนวณในฟอร์ม ·
อัปโหลดรูป/ไฟล์ · ตารางซ้อนตาราง · ให้หัวหน้าทีมจัดฟอร์มเอง · role · builder แก้ `lists`/`totals`/`template.html`
