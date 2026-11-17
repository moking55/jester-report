# Spec: `template-store`

สถานะ: **อนุมัติแล้ว 14 พ.ย. 2026** (ปรับตาม interview)
Module id: `template-store` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: `report-definition` (ชนิด `AssetInfo`, `DefinitionInput`, `definition_sha256`) · ถูกใช้โดย: `render-service`, `public-api`
อ้างอิง: [public-api.yaml](apps/api/openapi/public-api.yaml) (`/v1/templates/**`, schema `TemplateSummary`, `Draft`, `Version`, `Asset`, `TextFileName`, `AssetName`), [intent](docs/intent/report-server-v1.md)

## สมมติฐาน (ผู้ใช้ยืนยันใน interview)

1. **พฤติกรรมตาม contract ที่ร่างไว้แล้ว:** template มี draft หนึ่งชุดที่แก้ได้, publish = แช่แข็ง draft เป็น version ใหม่ที่แก้ไม่ได้ (เลขเพิ่มทีละ 1) แล้วชี้ alias "published" ไปที่ version นั้น, rollback/forward = ย้าย alias, reset draft = คัดลอก version กลับมาเป็น draft
2. **กันการเขียนทับกัน:** ทุกการแก้ draft ต้องส่ง revision ที่อ่านมา (`If-Match`) ถ้า draft เปลี่ยนไปแล้ว → `REVISION_CONFLICT` (412); revision เพิ่มทีละ 1 ทุกการแก้
3. **การตรวจก่อน publish ไม่อยู่ใน module นี้:** `public-api` ตรวจ draft ที่ revision N (definition + trial bind) แล้วเรียก `publish(expected_revision=N)`; store เช็กว่า revision ยังเป็น N ใน transaction เดียวกับที่แช่แข็ง จึงไม่มีช่องที่ draft เปลี่ยนระหว่างตรวจกับ publish
4. **ไฟล์ข้อความอยู่ใน PostgreSQL, asset อยู่ใน S3-compatible แบบ content-addressed:** key = `assets/<sha256>`; อัปโหลด bytes เดิมซ้ำไม่เขียนใหม่; asset ของ draft/version เก็บแค่ชื่อ → sha256
5. **ไม่ลบ bytes ใน object storage ใน v1:** asset ที่ถูกถอดออกจาก draft ก่อน publish จะค้างใน storage (ขยะ) การเก็บกวาดอยู่นอก scope
6. **ชื่อผู้แก้ (`updatedBy`, `publishedBy`) ผู้เรียกส่งมาเป็น string** — module นี้ไม่รู้จัก `auth`
7. **ขีดจำกัด:** ไฟล์ข้อความ ≤ 1 MB (ตาม contract), asset ≤ 5 MB, ขนาดรวมของ draft (ข้อความ + asset) ≤ 20 MB (เท่ากับขีดจำกัด request ของ engine) ไฟล์ข้อความ ≤ 50 ไฟล์ asset ≤ 50 ไฟล์
8. **ฟอนต์ ttf/otf เท่านั้น (ผู้ใช้ยืนยัน):** ตอนอัปโหลดอ่านชื่อ family จากตาราง `name` ด้วย `fonttools` เก็บเป็น `font_family` (ใช้ทำ `@font-face` และตรวจ `fonts.body`)
   - ไม่รับ woff2: ฟอนต์ไทยสำหรับเอกสารแจกเป็น ttf/otf อยู่แล้ว และไม่ต้องเพิ่ม `brotli`; ตัด `woff2` ออกจาก `AssetName` และ content type ของ `uploadDraftAsset` ใน contract
9. **SVG รับได้ (ผู้ใช้ยืนยัน):** ตรวจแค่ว่า bytes เป็น SVG จริง ไม่ sanitize — ความเสี่ยงกันไว้แล้วที่ engine (ปิด JS, บล็อก URL) และ binder (allow-list resource)
10. **RustFS เป็นค่าเริ่มต้น (ผู้ใช้ยืนยัน):** ตรวจ license และความพร้อมใช้ตอนทำ compose แล้วเขียนสถานะไว้ใน README ของ infra; เปลี่ยนค่าเริ่มต้น (MinIO/SeaweedFS) เฉพาะเมื่อ license ไม่ใช่ open source หรือ test `storage` ไม่ผ่าน — โค้ดใช้แค่ S3 API จึงเปลี่ยนด้วย config
11. **Starter:** `createTemplate(starter=…)` คัดลอก fixture อ้างอิง 3 แบบ (`quotation`, `grouped-table` = sales-grouped, `master-detail` = purchase-order) และ `blank` = report.json + template.html + data.schema.json + sample.json ขั้นต่ำที่ผ่าน `load_definition`; starter ที่มี `logo.png` ต้องมี asset ตัวอย่างมาด้วย

## Objective

เก็บ template ของรายงานอย่างปลอดภัยต่อการแก้พร้อมกัน และให้ `render-service` ได้ไฟล์ชุดที่ "ไม่เปลี่ยนแน่นอน" ของ version ที่ publish แล้ว
- CRUD ของ template, draft (ไฟล์ข้อความ + asset), version, alias published, reset draft
- คืน `DefinitionInput` ของ draft หรือ version ใด ๆ และ bytes ของ asset สำหรับส่ง engine
- version ที่ publish แล้วแก้ไม่ได้ทั้งใน DB และ storage (sha256 ของ version ตรวจซ้ำได้)

### User stories

- ในฐานะผู้ใช้ Studio สองแท็บ ฉันแก้ไฟล์เดียวกันพร้อมกัน แท็บที่บันทึกทีหลังได้ `REVISION_CONFLICT` ไม่มีงานหายเงียบ ๆ
- ในฐานะ `render-service` ฉันขอ "published ของ template X" แล้วได้ version, ไฟล์ข้อความ, รายการ asset และ sha256 ที่ใช้ cache ได้ตลอดไป
- ในฐานะผู้ดูแล ฉันย้อน published กลับไป version ก่อนหน้าได้ทันทีโดยไม่ต้อง publish ใหม่
- ในฐานะนักพัฒนา ฉันสร้าง template จาก starter ใบเสนอราคาแล้ว Validate ผ่านทันที

## Interface

```python
class TemplateStore:
    def __init__(self, db: AsyncConnectionPool, blobs: BlobStore) -> None: ...

    # templates
    async def create(self, template_id: str, name: str, starter: Starter, by: str) -> TemplateSummary
    async def list(self) -> list[TemplateSummary]
    async def get(self, template_id: str) -> TemplateSummary
    async def rename(self, template_id: str, name: str) -> TemplateSummary

    # draft (every write takes expected_revision and returns the new revision)
    async def get_draft(self, template_id: str) -> Draft
    async def put_file(self, template_id: str, name: str, content: str, expected_revision: int, by: str) -> int
    async def delete_file(self, template_id: str, name: str, expected_revision: int, by: str) -> int
    async def add_asset(self, template_id: str, name: str, data: bytes, expected_revision: int, by: str) -> tuple[Asset, int]
    async def delete_asset(self, template_id: str, name: str, expected_revision: int, by: str) -> int
    async def reset_draft(self, template_id: str, version: int, expected_revision: int, by: str) -> int

    # versions
    async def publish(self, template_id: str, expected_revision: int, note: str | None, by: str) -> Version
    async def list_versions(self, template_id: str) -> list[Version]
    async def get_version(self, template_id: str, version: int) -> VersionFiles
    async def set_published(self, template_id: str, version: int) -> TemplateSummary

    # for render-service
    async def definition_input(self, template_id: str, ref: Literal["draft", "published"] | int) -> StoredDefinition
    async def asset_bytes(self, sha256: str) -> bytes

class StoreError(Exception):  # code -> HTTP in public-api
    code: Literal["NOT_FOUND", "CONFLICT", "REVISION_CONFLICT", "PAYLOAD_TOO_LARGE",
                  "UNSUPPORTED_MEDIA_TYPE", "INPUT_INVALID"]
```

`StoredDefinition = (template_id, version | None, revision | None, files: dict[str, str], assets: dict[str, AssetInfo], sha256)` — `files`/`assets` ใส่ `DefinitionInput` ได้ตรง ๆ และ `sha256` เท่ากับ `definition_sha256` ของชุดนั้น

`BlobStore` เป็น interface เล็ก (`put_if_absent(sha256, data, content_type)`, `get(sha256)`, `exists(sha256)`) มี 2 แบบ: S3-compatible จริง และแบบใน memory สำหรับ unit test

## Data model (PostgreSQL)

```sql
templates      (id text PK, name text, published_version int NULL, created_at, updated_at)
drafts         (template_id PK/FK, revision int, based_on_version int NULL, updated_at, updated_by)
draft_files    (template_id FK, name text, content text, sha256 text, PK(template_id, name))
draft_assets   (template_id FK, name text, blob_sha256 FK, PK(template_id, name))
versions       (template_id FK, version int, sha256 text, note text NULL, published_at, published_by, PK(template_id, version))
version_files  (template_id, version, name, content, sha256, PK(template_id, version, name))   -- insert only
version_assets (template_id, version, name, blob_sha256, PK(template_id, version, name))     -- insert only
blobs          (sha256 text PK, content_type text, size int, font_family text NULL, created_at)
```

- **revision:** ทุกการเขียน draft ทำ `UPDATE drafts SET revision = revision + 1 WHERE template_id = $1 AND revision = $2`; 0 แถว → อ่านดูว่ามี template ไหม → `NOT_FOUND` หรือ `REVISION_CONFLICT`
- **publish:** ใน transaction เดียว: `SELECT … FROM drafts … FOR UPDATE` → เช็ก revision → `version = coalesce(max(version), 0) + 1` → คัดลอก draft_files/draft_assets → คำนวณ sha256 → ตั้ง `published_version`
- **immutable:** ไม่มี UPDATE/DELETE บน `versions`, `version_files`, `version_assets` ในโค้ด และ migration สร้าง trigger ที่ปฏิเสธ UPDATE/DELETE บนสามตารางนี้
- **migrations:** ไฟล์ SQL เรียงเลข (`migrations/0001_init.sql` …) รันตอน start ใน transaction พร้อม `pg_advisory_xact_lock` เพื่อให้หลาย process start พร้อมกันได้; ตาราง `schema_migrations` จดว่ารันอะไรแล้ว

## กติกาที่ module นี้ตรวจ

| กรณี | ผล |
| --- | --- |
| ชื่อ template/ไฟล์/asset ไม่ตรง pattern ใน contract | `INPUT_INVALID` |
| ลบ `report.json` หรือ `template.html` | `CONFLICT` |
| template id ซ้ำ | `CONFLICT` |
| asset ชื่อซ้ำใน draft | `CONFLICT` (ลบก่อนแล้วอัปโหลดใหม่) |
| ชนิด asset (ตรวจจาก bytes ไม่เชื่อ `Content-Type`) ไม่ใช่ png/jpeg/svg/webp/avif/bmp/ttf/otf (gif ไม่รับ) หรือไม่ตรงนามสกุล | `UNSUPPORTED_MEDIA_TYPE` |
| เกินขีดจำกัดในสมมติฐานข้อ 7 | `PAYLOAD_TOO_LARGE` |
| revision ไม่ตรง | `REVISION_CONFLICT` |
| ไม่มี template/version | `NOT_FOUND` |

store ไม่ตรวจเนื้อหาของ report/template (เป็นงานของ `report-definition`) — draft ที่ผิดเก็บได้ตามปกติเพื่อให้ผู้ใช้แก้ต่อ

## Tech Stack

- Python ≥3.11
- **dependency ใหม่ (ผู้ใช้อนุมัติใน interview):**
  - `psycopg[binary,pool]` 3.x (LGPL-3.0, ใช้เป็น library ได้) — async, SQL ตรง ๆ ไม่ใช้ ORM; migration เป็นไฟล์ `.sql` เรียงเลข ไม่ใช้ Alembic
  - `boto3` (Apache-2.0) — S3 client เรียกผ่าน `asyncio.to_thread`
  - `fonttools` (MIT) — อ่านชื่อ family ของฟอนต์ ttf/otf
- PostgreSQL 16, RustFS (S3-compatible) ค่าเริ่มต้นจาก compose

## Commands

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check .
uv run pytest tests/template_store -q --cov=jester_api.template_store --cov-report=term-missing   # unit: BlobStore ใน memory + Postgres จริง
JESTER_TEST_DATABASE_URL=postgresql://… JESTER_TEST_S3_ENDPOINT=http://… uv run pytest -m storage -q   # กับ Postgres + RustFS จริง
```

## Project Structure

```
apps/api/src/jester_api/template_store/
  __init__.py       → TemplateStore, StoreError, ชนิดข้อมูล
  store.py          → TemplateStore (SQL ทั้งหมดอยู่ที่นี่)
  blobs.py          → BlobStore: S3 + ใน memory
  assets.py         → ตรวจชนิดไฟล์จาก bytes, อ่าน font family
  starters.py       → starter 4 แบบ (คัดลอกจาก fixture ตอน build)
  migrations/0001_init.sql
apps/api/tests/template_store/
  test_assets.py  test_store_drafts.py  test_store_versions.py  test_blobs_s3.py (marker storage)
infra/compose.dev.yaml   → postgres + rustfs สำหรับ dev/test
```

## Code Style

```python
async def put_file(self, template_id: str, name: str, content: str, expected_revision: int, by: str) -> int:
    _check_name(TEXT_FILE, name)
    _check_size(content.encode(), MAX_TEXT_BYTES)
    async with self._db.connection() as conn, conn.transaction():
        revision = await _bump_revision(conn, template_id, expected_revision, by)  # raises REVISION_CONFLICT / NOT_FOUND
        await conn.execute(
            "INSERT INTO draft_files (template_id, name, content, sha256) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (template_id, name) DO UPDATE SET content = EXCLUDED.content, sha256 = EXCLUDED.sha256",
            (template_id, name, content, _sha256(content)),
        )
        await _check_draft_total(conn, template_id)  # PAYLOAD_TOO_LARGE rolls the whole write back
        return revision
```

SQL ตรง ๆ ใน `store.py`, ทุกการเขียนอยู่ใน transaction เดียว, ไม่มี global state

## Testing Strategy

- **Postgres จริงทุก test ที่แตะ DB** (ไม่ mock SQL) — แต่ละ test ใช้ schema ใหม่ของตัวเอง; BlobStore ใน memory สำหรับ unit test, S3 จริงเฉพาะ marker `storage`
- **Concurrency:** สอง task เขียน draft ด้วย revision เดียวกันพร้อมกัน → หนึ่งสำเร็จ หนึ่ง `REVISION_CONFLICT`; publish พร้อมกันสองครั้ง → ได้ version 1 และ `REVISION_CONFLICT` (ไม่มี version ซ้ำ)
- **Immutable:** แก้ draft หลัง publish ไม่กระทบ `get_version`; UPDATE ตรงบน `version_files` ถูก trigger ปฏิเสธ
- **sha256:** `definition_input(...).sha256 == definition_sha256(DefinitionInput(...))`; version เดียวกันได้ sha256 เดิมทุกครั้ง
- **Starter:** ทุก starter ผ่าน `load_definition` + `prepare` + `bind` ด้วย sample ของมันเองไม่มี error
- **Asset:** ไฟล์ปลอมนามสกุล (`.png` ที่เป็น HTML), ฟอนต์ ttf/otf อ่าน family ได้ (`TH Sarabun New`), อัปโหลด bytes เดิมสองครั้ง → blob เดียว
- **Migration:** start สอง process พร้อมกันบน DB ว่าง → migrate ครั้งเดียว ไม่ error
- Coverage ≥ 90%

## Boundaries

- **Always:** ทุกการเขียน draft ผ่าน revision check ใน transaction, version insert-only, ชื่อไฟล์ตรวจตาม pattern ของ contract, ตรวจชนิด asset จาก bytes
- **Ask first:** เพิ่ม dependency นอกจากที่อนุมัติ, เปลี่ยน schema ของตารางที่มีข้อมูลแล้ว (ต้องมี migration ใหม่ ไม่แก้ไฟล์เก่า), ลบ bytes ใน object storage, เปลี่ยนขีดจำกัด
- **Never:** UPDATE/DELETE version ที่ publish แล้ว, เชื่อ `Content-Type` จาก client, เก็บ asset bytes ใน PostgreSQL, ORM/auto-migration ที่เดา schema เอง

## Success Criteria

1. ทุก endpoint `/v1/templates/**` ใน contract มีเมธอดของ store ที่ให้ข้อมูลครบตาม schema (`TemplateSummary`, `Draft`, `Version`) ยกเว้น `lastRun` (มาจาก `render-service`)
2. Concurrency tests ผ่าน: ไม่มีการเขียนทับเงียบ ๆ และไม่มี version ซ้ำ
3. version ที่ publish แล้วแก้ไม่ได้ทั้งจากโค้ดและ SQL ตรง และ sha256 ตรงกับ `definition_sha256`
4. Starter ทั้ง 4 แบบ validate + bind ผ่าน
5. test `storage` ผ่านกับ Postgres + RustFS จริงบน VM; coverage ≥ 90%, `ruff` สะอาด

## Open Questions

ปิดแล้วทั้งหมดจาก interview 14 พ.ย. 2026: `psycopg` 3 + SQL ตรง + migration เป็นไฟล์ SQL, ฟอนต์ ttf/otf เท่านั้น (ตัด woff2), รับ SVG โดยตรวจแค่ชนิด, RustFS เป็นค่าเริ่มต้นแล้วตรวจ license/ความพร้อมใช้ตอนทำ compose, ขีดจำกัดตามสมมติฐานข้อ 7

## Out of scope

เก็บกวาด blob ที่ไม่มีใครใช้, ลบ template/version, สิทธิ์ราย template, ประวัติ revision ของ draft (undo), diff ระหว่าง version, การ import/export template เป็นไฟล์ zip, `lastRun` (มาจาก `render-service`)
