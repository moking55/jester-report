# Implementation Plan: `template-store`

สถานะ: **Phase 1 เสร็จ — Checkpoint A ผ่าน** (14 พฤศจิกายน 2026)
Spec: [SPEC-template-store.md](../../SPEC-template-store.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

สร้าง module เก็บ template: ไฟล์ข้อความใน PostgreSQL (psycopg 3, SQL ตรง), asset ใน S3-compatible แบบ content-addressed, draft ที่กันการเขียนทับด้วย revision, version ที่ insert-only และ alias published
เริ่มจากโครงสร้างพื้นฐานที่ test ต้องใช้ (Postgres + RustFS บน VM) แล้วทำชิ้นที่ไม่ต้องใช้ DB (ตรวจ asset, blob store) ก่อนจะต่อด้วย schema และ store

## Architecture Decisions

- **Postgres จริงสำหรับ test ที่แตะ DB:** เครื่อง dev ไม่มี docker daemon จึงรัน `infra/compose.dev.yaml` (postgres + rustfs) บน VM `10.0.1.29` และเข้าผ่าน SSH tunnel; test ที่ต้องใช้ DB ใช้ marker `db` และอ่าน `JESTER_TEST_DATABASE_URL` (ไม่มี = skip แบบเดียวกับ `GOTENBERG_URL`) แต่ละ test สร้าง schema ใหม่แล้วลบทิ้ง
- **migration runner เขียนเอง ~30 บรรทัด:** อ่าน `migrations/*.sql` ตามลำดับเลข, `pg_advisory_xact_lock` กันหลาย process, ตาราง `schema_migrations`
- **immutable ด้วย trigger:** `version_files`/`version_assets`/`versions` ปฏิเสธ UPDATE/DELETE ที่ระดับ DB ไม่ใช่แค่ในโค้ด
- **starter เป็นสำเนาเดียว:** ย้าย fixture อ้างอิง 3 แบบจาก `tests/report_definition/fixtures` ไปเป็น package data ที่ `template_store/starters/` แล้วให้ test เดิมอ้าง path ใหม่ จะได้ไม่มีสองสำเนาที่ต้องแก้คู่กัน; เพิ่ม `blank` และไฟล์ `logo.png` จริงสำหรับ quotation
- **BlobStore สองแบบ:** ใน memory (unit test) และ S3 ผ่าน `boto3` + `asyncio.to_thread`; key `assets/<sha256>`; `put_if_absent` ใช้ HEAD ก่อน PUT
- **ตรวจชนิด asset จาก bytes:** PNG/JPEG ด้วย magic bytes, SVG ด้วยการหา `<svg` ใน 1 KB แรก (หลัง BOM/`<?xml`/comment), ttf/otf ด้วย `fonttools` (เปิดไม่ได้ = ไม่ใช่ฟอนต์)

## Dependency Graph

```
T1 infra (compose บน VM, RustFS check) ──┬── T4 migrations + schema ── T5 store: templates + draft ── T6 store: versions + render
T2 assets (ชนิดไฟล์, font family) ───────┤                                   ▲
T3 blobs (memory + S3) ──────────────────┘───────────────────────────────────┘
```

T2, T3 ไม่ต้องใช้ DB ทำคู่กับ T1 ได้

## Task List

### Phase 1: พื้นฐาน
- [x] T1: `infra/compose.dev.yaml` (postgres 16 + rustfs) บน VM + ตรวจ license/maturity ของ RustFS + marker `db`/`storage` ใน conftest
- [x] T2: `assets.py` — ตรวจชนิดจาก bytes, อ่าน font family; dependency `fonttools`; ตัด woff2 ออกจาก contract
- [x] T3: `blobs.py` — BlobStore ใน memory + S3 (`boto3`); test `storage` กับ RustFS จริง

### Checkpoint A
- [x] tests T1–T3 ผ่าน (รวม `storage` บน VM), ruff สะอาด

### Phase 2: store
- [ ] T4: migrations + runner + schema + trigger immutable; migrate พร้อมกันสอง process ได้
- [ ] T5: templates + draft (create/list/get/rename, get_draft, put/delete file, add/delete asset, ขีดจำกัด, revision) + starter 4 แบบ (ย้าย fixture)
- [ ] T6: versions + render (publish, list/get version, set_published, reset_draft, definition_input, asset_bytes) + concurrency tests

### Checkpoint B
- [ ] Success criteria 1–5 ของ spec ผ่าน; ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| RustFS license หรือ API S3 ไม่ครบ (เช่น HEAD/conditional) | กลาง | ตรวจใน T1; โค้ดใช้แค่ PUT/GET/HEAD; ทางถอย MinIO/SeaweedFS ด้วย config |
| tunnel ไป VM หลุดระหว่าง test | ต่ำ | test DB ใช้ marker แยก รันซ้ำได้; unit test ส่วนใหญ่ไม่ต้องใช้ VM |
| ย้าย fixture แล้ว test เดิมพัง | ต่ำ | ย้ายพร้อมแก้ path ใน commit เดียว รัน test ทั้งชุด |
| psycopg async บน Windows ต้องใช้ `SelectorEventLoop` | กลาง | ตั้ง event loop policy ใน conftest ของ test DB และระบุใน README ของ api |
| `fonttools` อ่านฟอนต์ไทยบางตัวได้ชื่อ family ไม่ตรงที่คาด (nameID 1 vs 16) | ต่ำ | ใช้ nameID 16 (typographic) ก่อนแล้วค่อย 1; test กับ TH Sarabun New และ Noto Sans Thai |

## Open Questions

ไม่มี (ปิดใน interview ของ spec)
