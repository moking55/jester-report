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
