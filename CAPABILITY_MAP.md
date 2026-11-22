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

## v1.6: Form builder (อนุมัติ 19 พ.ย. 2026 หลัง interview · ปล่อยเป็น `v1.6.0`)

เป้า: dev สร้างข้อมูลนำเข้าของรายงาน (parameters + `data.schema.json`) ด้วยการลากวางใน Studio โดยไม่ต้องเขียน JSON
แล้วหัวหน้าทีมได้ฟอร์มออกเอกสารที่จัดตามนั้น · dev ยังแก้ JSON ด้วยมือได้ และ builder กับไฟล์เห็นตรงกันเสมอ

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| E1 `lib/schema-edit.ts`: อ่าน/เขียน schema + parameters + `form.json` + sample แบบ pure (เพิ่ม, แก้, ย้าย, เปลี่ยนชื่อ, ลบช่อง; เก็บ keyword ที่ไม่รู้จักไว้) | `studio` | — |
| E2 ตัวสร้างฟอร์มในช่อง code เมื่อเปิด `data.schema.json` (ปุ่ม "แก้ไข JSON" สลับ), Form Preview ในช่องขวา, บันทึกด้วยปุ่มเดิม | `studio` | E1 |
| E3 ฟอร์มออกเอกสารอ่าน `form.json` (ชนิด input, ความกว้าง) + แท็บ "ช่องข้อมูล" ใน workspace (copy expression, เตือนช่องที่เทมเพลตไม่ได้ใช้) | `studio` | E1 |

Build order: E1 → E2, E3 · ปล่อยเป็น `v1.6.0` · spec: [SPEC-studio.md](SPEC-studio.md) หัวข้อ v1.6
**dependency ใหม่:** `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2 (MIT, ผู้ใช้เลือก 19 พ.ย. 2026)
**ไม่มีงานฝั่ง api:** `form.json` ผ่านรูปแบบชื่อ `TEXT_FILE` เดิม, publish คัดลอกทุกไฟล์ของ draft, export/import zip พาไปด้วย —
api ถือ `form.json` เป็นไฟล์ข้อความทึบ (ไม่ตรวจ ไม่ใช้ตอน render)

**ไม่ทำ:** designer ลากวางตัวเอกสาร (**MVP ถัดไป**, ผู้ใช้ตัดสิน 19 พ.ย. 2026) · ช่องโชว์/ซ่อนตามเงื่อนไข · ช่องคำนวณในฟอร์ม ·
อัปโหลดรูป/ไฟล์ · ตารางซ้อนตาราง · ให้หัวหน้าทีมจัดฟอร์มเอง · role · builder แก้ `lists`/`totals`/`template.html`

## v1.7: Document Designer (อนุมัติ 19 พ.ย. 2026 หลัง interview · ปล่อยเป็น `v1.7.0`)

เป้า: dev จัดหน้าเอกสาร (`template.html`) ด้วยการลากวางบนผืน A4 ที่จำลองกระดาษจริง แทนการเขียน HTML/CSS เอง และ PDF ออกมาตรงกับผืน
**`template.html` เป็นความจริงเดียว** (แบบ site builder ไม่มีไฟล์ข้อมูลแยก): ส่วนที่ designer รู้จักเป็นบล็อกแก้ได้, ส่วนอื่นเป็น "Custom Code"

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| G1 `lib/doc-parse.ts`: parser HTML+Jinja ที่จำตำแหน่งในข้อความต้นฉบับ → ต้นไม้บล็อก; เขียนกลับเฉพาะส่วนที่แก้ (ส่วนอื่นคงทุกตัวอักษร) | `studio` | — |
| G2 ผืน A4 จำลอง: ขนาด/ขอบ/แนวตาม `report.json`, ฟอนต์ TH Sarabun New ที่ Studio เสิร์ฟ, `report.css` + CSS ของ binder, เส้นตัดหน้า, โซน header/footer | `studio` | G1 |
| G3 หน้า Document Designer: palette, ลากวาง (`@dnd-kit` + ช่อง "วางที่นี่"), แก้ข้อความบนผืน + ชิปช่องข้อมูล/เงื่อนไข, บล็อกเงื่อนไข/วนซ้ำ/ตั้งค่าตัวแปร, แผงคุณสมบัติ (`style=`), Custom Code modal กันพลาด, undo/redo, บันทึก, "Preview pdf" modal | `studio` | G1, G2 |
| G4 starter ทั้ง 5 ตัวเขียน `template.html` ใหม่ให้ designer อ่านออก — PDF เหมือนเดิม | `template-store` | G1 |

Build order: G1 → G2 → G3, G4 (G4 คู่ขนานกับ G3 ได้หลัง G1) · ปล่อยเป็น `v1.7.0` · spec: [SPEC-studio.md](SPEC-studio.md) หัวข้อ v1.7,
[SPEC-template-store.md](SPEC-template-store.md) หัวข้อ v1.7
**ไม่มี endpoint ใหม่:** อ่าน/เขียนไฟล์ draft ด้วย `getDraft`/`putDraftFile`, PDF ด้วย `previewDraft`, ข้อมูลตัวอย่างด้วย `prepareDraft` เดิม

**ไม่ทำ:** กระดาษนอกจาก A4 · วางตามพิกัด (absolute) · แก้ header/footer ใน designer · group-by ในตาราง (เป็น Custom Code) · class หรือแก้ `report.css` ·
ให้หัวหน้าทีมใช้ designer

## v1.8: การจัดหน้า — ขนาดกระดาษ, จัดวางแบบอิสระ, header/footer, ซ้อนหลายชั้น (อนุมัติ 20 พ.ย. 2026 หลัง interview · ปล่อยเป็น `v1.8.0`, แก้บั๊กจากผู้ใช้ลองเป็น `v1.8.1`)

เป้า: dev ทำเอกสารนอกจาก A4 ได้ — กระดาษทุกขนาด, ใบเสร็จม้วน, ฟอร์มหน้าเดียวที่วางของตามพิกัด, หัว/ท้ายกระดาษที่แก้ได้ใน designer
และข้อมูลซ้อนหลายชั้น — โดยไม่เขียน Custom Code และ PDF ตรงกับผืน

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| L1 `page` ใหม่ใน `report.json`: ขนาดสำเร็จรูป/กำหนดเอง/ม้วน, `layout` = `flow`/`free`; list ซ้อนได้ลึก 3 ชั้น | `report-definition` | — |
| L2 engine: ขนาดกระดาษใด ๆ (mm), ใบเสร็จม้วน = หน้าเดียวยาวเท่าเนื้อหา | `engine-client` | L1 |
| L3 binder: CSS ของแบบอิสระ/ม้วน, รูปใน header/footer เป็น data URI, ไม่มี header/footer ในม้วนและแบบอิสระ, ซ่อนภาพพื้นหลังนำทาง | `binder` | L1 |
| L4 data-prep: totals ของ list ลูก/หลานต่อแถวแม่ (ซ้อน 3 ชั้น) | `data-prep` | L1 |
| L5 สร้างรายงานพร้อม `page` (ขนาด + รูปแบบ) → `report.json` + `template.html` ตั้งต้นตามรูปแบบ | `template-store`, `public-api` | L1 |
| L6 Studio: modal สร้างรายงาน, ผืนทุกขนาด/ม้วน, เปลี่ยนขนาดใน toolbar, designer แบบอิสระ, แก้ header/footer บนผืน, ซ้อนหลายชั้นใน designer และ form builder | `studio` | L1–L5 |

Build order: L1 → L2, L3, L4, L5 (คู่ขนานได้) → L6 · ปล่อยเป็น `v1.8.0` · spec: หัวข้อ v1.8 ใน [SPEC-report-definition.md](SPEC-report-definition.md),
[SPEC-engine-client.md](SPEC-engine-client.md), [SPEC-binder.md](SPEC-binder.md), [SPEC-data-prep.md](SPEC-data-prep.md), [SPEC-template-store.md](SPEC-template-store.md),
[SPEC-public-api.md](SPEC-public-api.md), [SPEC-studio.md](SPEC-studio.md)

**ไม่ทำ:** header/footer หน้าแรกต่างจากหน้าอื่น · แปลงระหว่างแบบคงที่กับแบบอิสระ · แบบอิสระหลายหน้า / ตารางไหลข้ามหน้าในแบบอิสระ ·
หมุนของเป็นมุม · ซ้อนลึกเกิน 3 ชั้น · เปลี่ยนระหว่างม้วนกับกระดาษแผ่น · header/footer ในแบบอิสระและม้วน · พิมพ์ภาพพื้นหลังนำทาง

## v1.9: toolbar และตัวแปรมีประเภท/เงื่อนไข (อนุมัติ 20 พ.ย. 2026 หลัง interview · ปล่อยเป็น `v1.9.0`)

เป้า: toolbar ไอคอนแบบ Word (จัดรูปแบบระดับคำ + ปุ่มของบล็อกที่เลือก) โดยแผงขวาเหลือ advanced; บล็อก "ตั้งค่าตัวแปร" เลือกประเภท (ข้อความ/ตัวเลข/จริง-เท็จ/นิพจน์) และตั้งค่าตามเงื่อนไขได้ด้วยแผง และผืนแสดงค่าตัวแปรกับข้อมูลตัวอย่าง

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| V1 อ่าน/เขียน `{% set %}` เป็นประเภท + แถวเงื่อนไข (ternary ต่อกัน) | `studio` | — |
| V2 แผงตัวแปร + รายการข้างผืน + เตือนใช้ก่อนตั้ง | `studio` | V1 |
| V3 ผืนคำนวณตัวแปรกับข้อมูลตัวอย่าง | `studio` | V1 |
| V4 toolbar ส่วนจัดรูปแบบ: รูปแบบระดับคำ, ฟอนต์/ขนาด/จัดชิด, บล็อกรายการ | `studio` | — |
| V5 toolbar ส่วนของบล็อก (ทุกชนิด) + ย้ายปุ่มออกจากแผงขวา | `studio` | V4, V2 |
| V6 scrollbar ตาม theme ทั้ง Studio | `studio` | — |

ปล่อยเป็น `v1.9.0` · spec: หัวข้อ v1.9 ใน [SPEC-studio.md](SPEC-studio.md)

**ไม่ทำ:** ขีดฆ่า/ไฮไลต์/ตัวยก/เยื้อง · รายการซ้อน · toolbar ลอย · ตัวแปรสะสมข้ามรอบวนซ้ำ · ตัวแปรใน `report.json` · ประเภทวันที่/รายการ · Jinja ครบชุดใน browser

## v1.10: toolbar รอบสอง และติดตั้งเป็นแอป (อนุมัติ 20 พ.ย. 2026)

เป้า: ปุ่มตารางใน toolbar ทำงานกับเซลล์ที่คลิกเลือก (เพิ่มซ้าย/ขวา/บน/ล่าง, ลบ, เลื่อน), รวม/แยกช่องในตารางเปล่า, แถวแบ่งคอลัมน์เลือกจำนวน 2/3/4,
ขึ้น/ลงย้ายไป toolbar — แผงขวาเป็น advanced ล้วน; ติดตั้ง Studio เป็นแอป (PWA: manifest, ไอคอน, service worker บาง ๆ, หน้าออฟไลน์)

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| B1 เลือกเซลล์ในตาราง (คลิกครั้งเดียว) + สถานะเซลล์ที่เลือก | `studio` | — |
| B2 ตารางเปล่ารับ colspan; รวม/แยกช่อง; edit ต่อแถว/คอลัมน์ตามเซลล์ | `studio` | — |
| B3 ปุ่ม toolbar ตามเซลล์ (ตารางรายการ, ตารางเปล่า), จำนวนคอลัมน์ของแถว, ขึ้น/ลง; เก็บแผงขวา | `studio` | B1, B2 |
| B4 PWA: manifest + ไอคอน + theme color, service worker (static + หน้าออฟไลน์) | `studio` | — |

ปล่อยเป็น `v1.10.0` · spec: หัวข้อ v1.10 ใน [SPEC-studio.md](SPEC-studio.md)

**ไม่ทำ:** PWA offline/push · rowspan · เลือกหลายเซลล์ · รวมช่องในตารางรายการ · ข้อเสนอ UX อื่น (ผู้ใช้ตัดสิน 20 พ.ย. 2026)

## v1.11: tag และสี (อนุมัติ 22 พ.ย. 2026)

เป้า: ติด tag (ข้อความสั้น มีสีหนึ่งใน 9 สี) ให้รายงานและเอกสารที่ออก แก้ได้ กรองได้ใน catalog และหน้าเอกสารที่ออก

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| T1 module `tags` ใหม่ (กติกา, สี, นับการใช้) + migration `0009` | `tags` | — |
| T2–T3 tag ของรายงาน (store, route, duplicate, zip) | `template-store`, `public-api` | T1 |
| T4–T5 tag ของเอกสารที่ออก (สำเนาตอนออก, กรอง, แก้) | `render-service`, `public-api` | T1 |
| T6 `GET /v1/tags`, `PUT /v1/tag-colors` | `tags`, `public-api` | T1 |
| T7–T11 Studio: ชิป, dialog, catalog, หน้าเอกสาร, ฟอร์มออกเอกสาร, contrast | `studio` | T3, T5, T6 |

module `tags` เล็กและไม่ขึ้นกับใคร: `template-store` และ `render-service` เรียกเฉพาะ `normalize_tags`; `public-api` ขึ้นกับ `tags`
ปล่อยเป็น `v1.11.0` · spec: [docs/ideas/tags-v1-11.md](docs/ideas/tags-v1-11.md) และหัวข้อ v1.11 ของ SPEC-template-store/render-service/public-api/studio

**ไม่ทำ:** เปลี่ยนชื่อ/ลบ tag ทั้งระบบ · bulk edit · tag ใน PDF · สี hex เอง · ให้ API key แก้ tag ย้อนหลัง

## v1.13: MCP สำหรับคนทำรายงาน (อนุมัติ 23 พ.ย. 2026)

เป้า: คนทำรายงานใช้ Jester ผ่าน claude.ai (remote MCP connector, login ด้วยบัญชีตัวเองผ่าน OAuth) ให้ AI สร้าง/แก้ draft จนเป็นรายงานที่ validate ผ่านและ preview ตรงต้นฉบับ; publish ยังทำใน Studio

| Module id | หน้าที่ | ขึ้นกับ |
| --- | --- | --- |
| `mcp` | แพ็กเกจแยก `apps/mcp`: Streamable HTTP + OAuth (หน้า login, DCR ตาม allow-list), tool ระดับ draft, preview เป็นภาพ, guide จาก skill `to-jester`; session ของ Jester เก็บใน SQLite ของตัวเอง | `public-api` (ผ่าน HTTP ตาม contract เท่านั้น) |

| งาน | module | ขึ้นกับ |
| --- | --- | --- |
| T1–T2 session อายุยาว (idle 30 วัน, เพดาน 90 วัน) + `lifetime` ใน login + migration `0010` | `auth`, `public-api` | — |
| T3–T6 โครง `apps/mcp`, OAuth, หน้า login, token หมดอายุ | `mcp` | T2 |
| T7–T10 tool อ่าน/เขียน draft, preview, guide | `mcp` | T6 |
| T11–T12 Docker, compose (subdomain `mcp` หลัง proxy), live + claude.ai | `mcp`, `infra` | T10 |

ปล่อยเป็น `v1.13.0` · spec: [SPEC-mcp.md](SPEC-mcp.md), หัวข้อ v1.13 ของ SPEC-auth/public-api · intent: [docs/intent/mcp-report-authoring.md](docs/intent/mcp-report-authoring.md) · task: [tasks/v1.13/todo.md](tasks/v1.13/todo.md)

**ไม่ทำ:** publish/alias ผ่าน AI · จัดการผู้ใช้/API key/retention/theme ผ่าน MCP · stdio สำหรับ dev · role/RBAC
