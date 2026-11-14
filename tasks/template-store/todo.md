# Tasks: `template-store`

แผน: [plan.md](plan.md) · Spec: [SPEC-template-store.md](../../SPEC-template-store.md)
คำสั่ง test: `cd apps/api && uv run ruff check . && uv run pytest tests -q --cov=jester_api.template_store --cov-report=term-missing`
DB/storage: `JESTER_TEST_DATABASE_URL=postgresql://…@localhost:5432/jester JESTER_TEST_S3_ENDPOINT=http://localhost:9000 uv run pytest -m "db or storage" -q` (ผ่าน SSH tunnel ไป VM)

## Phase 1: พื้นฐาน

### T1: infra สำหรับ dev/test

**Description:** `infra/compose.dev.yaml` มี postgres 16 และ rustfs (pin เวอร์ชัน, bind 127.0.0.1); รันบน VM; ตรวจ license และระดับความพร้อมของ RustFS แล้วเขียนใน `infra/README.md`; conftest ข้าม test marker `db`/`storage` เมื่อไม่มี env

**Acceptance criteria:**
- [x] `docker compose -f infra/compose.dev.yaml up -d` บน VM ได้ postgres และ rustfs ที่ health ผ่าน
- [x] README บอก license, เวอร์ชัน, ระดับความพร้อมของ RustFS และวิธีเปลี่ยนเป็น MinIO/SeaweedFS
- [x] test ทั้งชุดยังผ่านบนเครื่องที่ไม่มี env (marker ใหม่ถูก skip)

**Verification:**
- [x] `psql` และ S3 PUT/GET ผ่าน tunnel ได้

**Dependencies:** None
**Files likely touched:** `infra/compose.dev.yaml`, `infra/README.md`, `apps/api/tests/conftest.py`, `apps/api/pyproject.toml` (markers)
**Estimated scope:** S

### T2: assets

**Description:** `detect(name, data) -> AssetInfo`: ชนิดจาก bytes (png, jpeg, svg, ttf, otf) ต้องตรงนามสกุล; ฟอนต์อ่าน family (nameID 16 ก่อน 1) ด้วย `fonttools`; เพิ่ม dependency `fonttools`; ตัด woff2 ออกจาก `AssetName` และ content type ใน `public-api.yaml`

**Acceptance criteria:**
- [x] TH Sarabun New Regular/Bold → `font_family == "TH Sarabun New"`; Noto Sans Thai อ่านได้
- [x] `.png` ที่เป็น HTML, `.ttf` ที่เป็น PNG, `.woff2` → `UNSUPPORTED_MEDIA_TYPE`
- [x] SVG ที่ขึ้นต้นด้วย `<?xml`/comment ผ่าน; ไฟล์ข้อความที่ไม่มี `<svg` ไม่ผ่าน

**Verification:**
- [x] `uv run pytest tests/template_store/test_assets.py -q`

**Dependencies:** None
**Files likely touched:** `template_store/assets.py`, `tests/template_store/test_assets.py`, `pyproject.toml`, `openapi/public-api.yaml`
**Estimated scope:** S

### T3: blobs

**Description:** `BlobStore` protocol + `MemoryBlobStore` + `S3BlobStore` (`boto3` ผ่าน `asyncio.to_thread`, key `assets/<sha256>`, `put_if_absent` = HEAD แล้ว PUT, ตรวจ sha256 ของ bytes ก่อนเขียน); เพิ่ม dependency `boto3`

**Acceptance criteria:**
- [x] put ซ้ำด้วย bytes เดิมไม่เขียนใหม่ (นับ PUT จริงใน memory และใน S3 ด้วย HEAD)
- [x] sha256 ที่ไม่ตรงกับ bytes → error ไม่เขียน
- [x] `storage`: put/get/exists กับ RustFS จริงผ่าน

**Verification:**
- [x] `uv run pytest tests/template_store/test_blobs.py -q` และ `-m storage`

**Dependencies:** T1 (เฉพาะ test storage)
**Files likely touched:** `template_store/blobs.py`, `tests/template_store/test_blobs.py`, `pyproject.toml`
**Estimated scope:** S

### Checkpoint A

- [x] tests T1–T3 ผ่าน (รวม `storage` บน VM), ruff สะอาด

## Phase 2: store

### T4: migrations + schema

**Description:** `migrations/0001_init.sql` (8 ตารางตาม spec + trigger ปฏิเสธ UPDATE/DELETE บน `versions`, `version_files`, `version_assets`); `migrate(pool)` รันไฟล์ที่ยังไม่รันใน transaction พร้อม `pg_advisory_xact_lock`; เพิ่ม dependency `psycopg[binary,pool]`

**Acceptance criteria:**
- [x] migrate สองครั้งติดกัน → ครั้งที่สองไม่ทำอะไร
- [x] สอง task migrate พร้อมกันบน schema ว่าง → ไม่ error, รันครั้งเดียว
- [x] UPDATE/DELETE ตรงบน `version_files` ถูกปฏิเสธ

**Verification:**
- [x] `uv run pytest tests/template_store/test_migrations.py -m db -q`

**Dependencies:** T1
**Files likely touched:** `template_store/migrations/0001_init.sql`, `template_store/migrate.py`, `tests/template_store/{conftest,test_migrations}.py`, `pyproject.toml`
**Estimated scope:** M

### T5: templates + draft + starters

**Description:** `TemplateStore` ส่วน templates และ draft ตาม interface ใน spec; ตรวจชื่อตาม pattern ของ contract, ขีดจำกัด (1 MB / 5 MB / 20 MB / 50 ไฟล์), ห้ามลบ `report.json`/`template.html`, revision check; starter 4 แบบ (ย้าย fixture อ้างอิงไปเป็น package data แล้วแก้ path ใน test เดิม, เพิ่ม `blank`, `logo.png` จริง)

**Acceptance criteria:**
- [x] สอง task `put_file` ด้วย revision เดียวกันพร้อมกัน → หนึ่งสำเร็จ หนึ่ง `REVISION_CONFLICT`
- [x] เกินขีดจำกัดทุกแบบ → `PAYLOAD_TOO_LARGE` และ draft ไม่เปลี่ยน (revision เดิม)
- [x] starter ทั้ง 4 แบบ: `load_definition` + `prepare` + `bind` ด้วย sample ของตัวเองไม่มี error; test เดิมของ report-definition/data-prep/binder ผ่านด้วย path ใหม่

**Verification:**
- [x] `uv run pytest tests -q` และ `-m db`

**Dependencies:** T2, T3, T4
**Files likely touched:** `template_store/{__init__,store,starters}.py`, `template_store/starters/**`, `tests/template_store/test_store_drafts.py`, conftest ของ test เดิม
**Estimated scope:** M

### T6: versions + render

**Description:** `publish` (lock draft, เช็ก revision, version = max+1, คัดลอก, sha256 = `definition_sha256`), `list_versions`, `get_version`, `set_published`, `reset_draft`, `definition_input("draft" | "published" | n)`, `asset_bytes`

**Acceptance criteria:**
- [x] publish พร้อมกันสองครั้งด้วย revision เดียวกัน → version 1 และ `REVISION_CONFLICT`
- [x] แก้ draft หลัง publish ไม่กระทบ `get_version`; `definition_input(...).sha256 == definition_sha256(DefinitionInput(...))`
- [x] `set_published` ไป version ก่อนหน้า แล้ว `definition_input("published")` ได้ไฟล์ของ version นั้น; reset draft ได้ไฟล์และ asset ของ version

**Verification:**
- [x] `uv run pytest tests/template_store -m db -q --cov=jester_api.template_store` ≥ 90%

**Dependencies:** T5
**Files likely touched:** `template_store/store.py`, `tests/template_store/test_store_versions.py`
**Estimated scope:** M

### Checkpoint B

- [x] Success criteria 1–5 ของ spec ผ่าน (404 tests รวม db/storage บน VM, coverage template_store 97%)
- [x] ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป (review แล้ว แก้ข้อ 1: NUL ในไฟล์ข้อความเป็น INPUT_INVALID)
