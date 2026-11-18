# Spec: `render-service`

สถานะ: **อนุมัติแล้ว 14 พ.ย. 2026** (ปรับตาม interview)
Module id: `render-service` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: `template-store`, `report-definition`, `data-prep`, `binder`, `engine-client` · ถูกใช้โดย: `public-api`
อ้างอิง: [public-api.yaml](apps/api/openapi/public-api.yaml) (`/v1/render`, `draft/validate`, `draft/preview`, `/v1/runs/**`, `/v1/health`, schema `Run`, `ValidationResult`), [SPEC-report-definition.md](SPEC-report-definition.md) ("ที่มาของ `system_fonts`"), [SPEC-binder.md](SPEC-binder.md), audit ข้อ 1 (render ค้างจากลูปซ้อน)

## สมมติฐาน (ผู้ใช้ยืนยันใน interview)

1. **ลำดับงานของหนึ่ง render:** หา version → `load_definition` (มี cache) → `prepare` + `bind` ใน worker process ที่มี timeout → ดึง asset bytes → `EngineClient.convert_html` → บันทึก run → คืน PDF
2. **`prepare` + `bind` ทำใน process แยกที่ฆ่าได้ (audit ข้อ 1):** template ที่วนลูปซ้อนจะใช้ CPU ไม่รู้จบ และ timeout ของ asyncio หยุดงาน CPU ไม่ได้
   - worker เป็น process ต่อหนึ่งงาน (fork บน Linux, spawn บน Windows สำหรับ dev) เกิน **10 วินาที** → kill process แล้วตอบ `RENDER_TIMEOUT` (504)
   - ส่งเข้า worker: ไฟล์ของ template, รายการ asset, params, data, meta; คืน `BindResult` (bytes + problems) ซึ่ง pickle ได้
   - **process ต่องาน (ผู้ใช้ยืนยัน):** kill ได้แน่นอนทีละงาน งานค้างไม่กระทบงานอื่น ต้นทุนราว 10–50 ms ต่อ render บน Linux
   - ต้องมี comment แบบ `shortcut:` ในโค้ดที่บอกว่าเปลี่ยนเป็น pool ได้เมื่อต้องการ throughput สูงขึ้น และต้องแก้ตรงไหน (interface ของ `run_in_worker` ไม่เปลี่ยน)
3. **Error → HTTP (ตาม contract):**

   | ที่มา | code | HTTP |
   | --- | --- | --- |
   | ไม่มี template/version หรือยังไม่ publish | `NOT_FOUND` | 404 |
   | params/data ไม่ผ่าน (`data-prep`) หรือ template ใช้ data ไม่ได้ (`binder`: `TEMPLATE_UNDEFINED`, `RESOURCE_NOT_ALLOWED` …) | `INPUT_INVALID` + `problems` | 422 |
   | definition ของ version ที่ publish แล้วมี error ตอนนี้ (เช่นฟอนต์ถูกถอดออกจาก engine) | `FONT_MISSING` / `RENDER_FAILED` + `problems` | 502 |
   | `prepare`+`bind` เกิน 10 วินาที, engine timeout | `RENDER_TIMEOUT` (`retryable`) | 504 |
   | engine ไม่ว่างหรือติดต่อไม่ได้, คิวเต็ม | `SERVICE_UNAVAILABLE` (`retryable`) | 503 |
   | engine: resource โหลดไม่ได้ / render fail / ตั้งค่าผิด | `RENDER_RESOURCE_FAILED` / `RENDER_FAILED` / `ENGINE_MISCONFIGURED` | 502 |

   warning (เช่น `TEMPLATE_PRINTS_OBJECT`, `FONT_UNVERIFIED`) ไม่ขวางผล เก็บไว้ใน run
4. **Cache ใน memory ต่อ process (ของที่ไม่เปลี่ยน):**
   - `ReportDefinition` ของ version ที่ publish แล้ว key = sha256 ของ version (LRU 64 รายการ); draft ไม่ cache
   - asset bytes key = sha256 (LRU รวมไม่เกิน 64 MB)
   - ฟอนต์ของ engine (`system_fonts`) ตาม SPEC-report-definition: probe ด้วยการ render header ที่ใช้ `font-family` นั้นแล้วอ่านชื่อฟอนต์ที่ฝังใน PDF; cache จนกว่า process จะ restart; engine ล่ม → `None` (`FONT_UNVERIFIED`)
5. **จำกัดงานพร้อมกัน:** ไม่เกิน 6 render ต่อ API process (เท่า `--chromium-max-concurrency` ของ Gotenberg); งานที่เกินรอคิวได้ไม่เกิน 10 วินาที ไม่งั้น `SERVICE_UNAVAILABLE` (503, retryable)
6. **Run history ใน PostgreSQL (`0003_runs.sql`):** ทุก render/preview ทั้งสำเร็จและล้มเหลวมี run หนึ่งแถว
   - ไม่เก็บ params, data หรือ PDF — เก็บแค่ sha256 ของ params/data (JSON แบบ canonical: เรียง key, ตัวเลข Decimal เป็น string) และของ PDF
   - provenance: sha256 ของ template, เวอร์ชันและ image ของ engine, ฟอนต์ asset (ชื่อ + sha256), options ที่ส่ง engine, trace ของ Gotenberg
   - problems ที่ไม่มีค่าจาก data (ทุก module รับประกันไว้แล้ว)
   - **เก็บตลอดเป็นค่าเริ่มต้น และ rotate เฉพาะเมื่อมีคนตั้งเองใน Studio (ผู้ใช้ยืนยัน):** ไม่มีการลบเงียบ ๆ
     - นโยบายเก็บในตาราง `run_retention` (แถวเดียว: `days` หรือ `NULL` = เก็บตลอด, `set_by`, `set_at`)
     - ก่อนตั้ง Studio ขอดูจำนวนที่จะถูกลบ (นับจริง) แล้วจึงยืนยัน
     - หลังตั้ง N วัน ระบบลบแถวที่เก่ากว่า N วันทุก ๆ 100 run (ไม่ต้องมี job); กลับเป็น "เก็บตลอด" ได้ทุกเมื่อ (แถวที่ลบไปแล้วไม่กลับมา)
     - หน้าประวัติแสดงนโยบายปัจจุบันพร้อมชื่อคนที่ตั้งและเวลา
     - เพิ่มใน contract: `GET /v1/runs/retention` (นโยบายปัจจุบัน; `?previewDays=N` คืนจำนวนที่จะถูกลบด้วย) และ `PUT /v1/runs/retention` (`{days: int | null}`)
7. **Preview ของ draft:** pipeline เดียวกับ render ทุกอย่าง (engine, options, ฟอนต์) ต่างแค่ใช้ draft และมีลายน้ำ "DRAFT" — เพิ่มเป็น element `position: fixed` ท้าย `index.html` หลัง bind (Chromium พิมพ์ element fixed ซ้ำทุกหน้า) ไม่แตะ template ของผู้ใช้; ไม่มี `data` → ใช้ `sampleFile` (ค่าเริ่มต้น `sample.json`)
8. **Validate draft:** `load_definition` (พร้อม `system_fonts`) + trial bind ทุก sample (`prepare` + `bind` ใน worker เดียวกับ render) คืน problems ทั้งหมดพร้อม `revision` ที่ตรวจ ให้ `public-api` ส่ง revision นี้ต่อให้ `publish`
9. **จำนวนหน้า (`pages`) (ผู้ใช้ยืนยัน):** นับจาก PDF ด้วย `pypdf` (ย้ายจาก dev เป็น dependency จริง; ใช้แค่นับหน้า ไม่อ่านข้อความไทย); นับไม่ได้ → `null` โดยไม่ทำให้ render fail
10. **`lastRun` ของ `TemplateSummary`:** module นี้ให้ `last_runs(template_ids)` แล้ว `public-api` เอาไปรวมกับข้อมูลของ template-store

## Objective

รวมทุก module เป็น pipeline เดียวที่ `public-api` เรียก: render PDF จาก version ที่ publish แล้ว, preview ของ draft, validate draft, ประวัติการ render และ health
- ปลอดภัยจาก template ที่ค้าง (worker ที่ฆ่าได้) และจาก engine ที่ล่มหรือช้า (timeout, คิวจำกัด)
- ทุกการ render ตามรอยได้ (run + provenance) โดยไม่เก็บข้อมูลของลูกค้า

### User stories

- ในฐานะระบบภายนอก ฉันส่ง `template: {id: quotation, version: published}` + params + data แล้วได้ PDF พร้อม `Jester-Run-Id` และ `Jester-Template-Version`; ถ้าข้อมูลผิดได้ 422 ที่ชี้ `/data/items/0/qty`
- ในฐานะผู้ใช้ Studio ฉันกด Preview แล้วได้ PDF ที่มีลายน้ำ DRAFT จาก pipeline เดียวกับของจริง และกด Validate แล้วเห็นปัญหาทั้งหมดพร้อมบรรทัด
- ในฐานะผู้ดูแล ฉันเปิดประวัติแล้วรู้ว่า run ไหนใช้ template version ใด, engine รุ่นอะไร, ฟอนต์ไหน และ hash ของ PDF ที่ออกไป แต่ไม่เห็นข้อมูลลูกค้า
- ในฐานะผู้ดูแล template ที่มีลูปไม่รู้จบไม่ทำให้ server ค้าง: ได้ 504 ภายใน 10 วินาที

## Interface

```python
@dataclass(frozen=True)
class RenderOutcome:
    pdf: bytes
    run_id: str
    version: int | None          # None สำหรับ preview ของ draft
    filename: str
    problems: list[Problem]      # warning เท่านั้น

class RenderError(Exception):
    code: str                    # ErrorCode ของ contract
    http_status: int
    retryable: bool
    problems: list[Problem]
    run_id: str | None

class RenderService:
    def __init__(self, store: TemplateStore, engine: EngineClient, db: AsyncConnectionPool,
                 settings: RenderSettings) -> None: ...
    async def render(self, template_id: str, version: int | Literal["published"], params: dict, data: Any,
                     caller: Principal, request_id: str | None, filename: str | None) -> RenderOutcome
    async def preview(self, template_id: str, params: dict | None, data: Any | None, sample_file: str | None,
                      caller: Principal) -> RenderOutcome
    async def validate(self, template_id: str) -> ValidationResult      # (valid, revision, problems)
    async def list_runs(self, template_id: str | None, status: str | None, limit: int, before: str | None) -> RunPage
    async def get_run(self, run_id: str) -> Run
    async def last_runs(self, template_ids: list[str]) -> dict[str, RunSummary]
    async def health(self) -> Health
    async def retention(self, preview_days: int | None = None) -> Retention    # days|None, set_by, set_at, would_delete
    async def set_retention(self, days: int | None, set_by: str) -> Retention
```

`RenderSettings`: `bind_timeout_s=10`, `max_concurrent=6`, `queue_wait_s=10`, `engine_image` (สำหรับ provenance), ขนาด cache

## Tech Stack

Python ≥3.11, `multiprocessing` (stdlib) สำหรับ worker, module เดิมทั้งหมด, `psycopg`; dependency: `pypdf` ย้ายจาก dev เป็น dependency จริง (ผู้ใช้อนุมัติ) นอกนั้นไม่มี dependency ใหม่

## Commands

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check .
uv run pytest tests/render_service -q --cov=jester_api.render_service --cov-report=term-missing
JESTER_TEST_DATABASE_URL=… GOTENBERG_URL=… uv run pytest tests/render_service -m "db or engine" -q
```

## Project Structure

```
apps/api/src/jester_api/render_service/
  __init__.py     → RenderService, RenderError, RenderOutcome, RenderSettings
  worker.py       → prepare+bind ใน process แยกที่ฆ่าได้ (timeout)
  fonts.py        → probe ฟอนต์ของ engine + cache
  runs.py         → บันทึก/อ่าน run, canonical hash, เก็บ 90 วัน
  service.py      → RenderService: pipeline, cache, คิว, map error
apps/api/src/jester_api/db/migrations/0003_runs.sql   → runs + run_retention
apps/api/tests/render_service/
  test_worker.py  test_fonts.py  test_runs.py  test_service.py (engine จำลองด้วย respx)  test_live.py (engine + db)
```

## Code Style

```python
async def render(self, template_id, version, params, data, caller, request_id, filename) -> RenderOutcome:
    async with self._slot():                                  # SERVICE_UNAVAILABLE when the queue is full
        stored = await self._store.definition_input(template_id, version)
        definition = await self._definition(stored)          # cached per version sha256
        bound = await run_in_worker(stored, params, data, meta, timeout=self._settings.bind_timeout_s)
        assets = [RenderFile(n, await self._asset(stored.assets[n].sha256)) for n in bound.asset_names]
        result = await self._engine.convert_html(bound.index_html, page=bound.page, ..., assets=[*bound.files, *assets])
        run_id = await self._runs.record_success(...)
        return RenderOutcome(result.pdf, run_id, stored.version, filename or f"{template_id}-v{stored.version}.pdf", ...)
```

ทุกทางที่ล้มเหลวบันทึก run แบบ `failed` พร้อม `errorCode` ก่อน raise `RenderError`

## Testing Strategy

- **Worker:** template ปกติได้ผลเท่ากับเรียก `bind` ตรง ๆ; ลูปซ้อนไม่รู้จบถูก kill ภายใน ~10 วินาที (ใน test ตั้ง 1 วินาที) แล้ว process ไม่ค้างอยู่; exception ใน worker กลายเป็น problem ไม่ใช่ crash
- **Map error:** ทุกแถวในตาราง error → HTTP มี test (engine จำลองด้วย respx, store จริงบน db)
- **Run:** สำเร็จและล้มเหลวบันทึกครบ; ไม่มี params/data/PDF ใน DB (ค้นค่าลับใน DB ไม่เจอ); hash ของ data เดิมเท่ากันแม้ลำดับ key ต่างกัน; PDF ที่นับหน้าไม่ได้ → `pages = null`
- **Retention:** ค่าเริ่มต้นไม่ลบอะไรเลยแม้ run เก่า 5 ปี; `preview_days=90` คืนจำนวนที่ถูกต้องโดยไม่ลบ; ตั้ง 90 วันแล้วแถวเก่าถูกลบในรอบถัดไป และ `set_by`/`set_at` ถูกบันทึก; ตั้งกลับเป็น `None` แล้วหยุดลบ
- **Cache:** render version เดิมสองครั้ง `load_definition` ถูกเรียกครั้งเดียว; asset ดึงจาก storage ครั้งเดียว
- **คิว:** งานที่ 7 รอ; เกิน `queue_wait_s` → `SERVICE_UNAVAILABLE`
- **Validate:** draft ที่ typo ใน template ได้ `TEMPLATE_UNDEFINED` พร้อมบรรทัดจาก trial bind; revision ใน result ตรงกับที่ตรวจ
- **Live (engine + db):** render quotation จาก starter ที่ publish แล้ว → PDF ที่มี `3,210.00`; preview มีคำว่า DRAFT ทุกหน้า (poppler); probe ฟอนต์เจอ TH Sarabun New
- Coverage ≥ 90%

## Boundaries

- **Always:** `prepare`+`bind` ใน worker ที่ฆ่าได้, ทุก render มี run, ไม่เก็บ params/data/PDF, ใช้ version ที่ resolve แล้วเพียงหนึ่งเดียวตลอด request
- **Ask first:** เก็บ PDF, เพิ่ม job queue/async render, เปลี่ยน timeout หรือขนาดคิว, ส่ง draft ไป render ผ่าน `/v1/render`
- **Never:** fallback ไป draft เมื่อไม่มี published, `eval` หรือ render template ใน process ของ API, เก็บค่าจาก data ใน log หรือ run

## Success Criteria

1. Render quotation จริงผ่าน pipeline ได้ PDF ถูกต้อง พร้อม run ที่มี provenance ครบ (live test)
2. Template ที่วนลูปไม่รู้จบได้ 504 ภายในเวลาที่ตั้ง และ server ยังตอบ request อื่นได้ระหว่างนั้น
3. ทุก error ใน taxonomy ได้ code และ HTTP ตามตาราง และมี run แบบ failed
4. ไม่มี params, data หรือ PDF ใน DB และไม่มี run ถูกลบจนกว่าจะมีคนตั้งนโยบายเอง
5. Coverage ≥ 90%, `ruff` สะอาด

## Open Questions

ปิดแล้วทั้งหมดจาก interview 14 พ.ย. 2026: worker เป็น process ต่องาน (มี comment ว่าต่อยอดเป็น pool ได้), นับหน้าด้วย `pypdf`, เก็บ run ตลอดเป็นค่าเริ่มต้นและ rotate เฉพาะเมื่อตั้งใน Studio, ลายน้ำ DRAFT ทำใน render-service

## Out of scope

เก็บ PDF, async render/job queue/webhook, retry อัตโนมัติ, render จาก draft ผ่าน `/v1/render`, metrics/Prometheus, rate limit ต่อ API key, render หลายไฟล์รวมเป็น zip

---

# v1.1: Foundations (A3, B1)

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.1, [SPEC-template-store.md](SPEC-template-store.md) หัวข้อ v1.1
หัวข้อ v1 ด้านบนยังใช้ทั้งหมด ส่วนนี้เพิ่ม error สองตัวและการตรวจสิทธิ์ของ API key ต่อรายงาน

## สมมติฐาน v1.1

1. **A3 (ผู้ใช้ตัดสินแล้ว):** `template-store` โยน `StoreError("ARCHIVED")` จาก `definition_input` ทุก ref; module นี้แปลงเป็น `TEMPLATE_ARCHIVED` **410** ไม่ retry
2. **B1:** `auth` ตรวจวันหมดอายุของ key ตอน `authenticate` (key หมดอายุ = 401 เหมือน key ที่ถูกเพิกถอน ไม่ถึง module นี้); module นี้ตรวจแค่ **รายการรายงานที่ key ใช้ได้**
3. `Principal` (จาก `auth`) เพิ่มฟิลด์ `templates: frozenset[str] | None` — `None` = ใช้ได้ทุกรายงาน (key เดิมทั้งหมด และ session ของผู้ใช้ Studio)
4. **ไม่บอกว่ารายงานมีอยู่ไหมให้ key ที่ไม่มีสิทธิ์:** key ที่ไม่มีสิทธิ์กับรายงาน X ได้ `TEMPLATE_NOT_ALLOWED` (403) เสมอ ไม่ว่า X จะมีอยู่, archive แล้ว หรือไม่มีเลย — จึงตรวจสิทธิ์ **ก่อน** เรียก store
5. **rate limit (B2) อยู่ที่ `public-api`:** request ที่ถูกจำกัดไม่ถึง module นี้และไม่มี run

## การเปลี่ยนแปลง

**ตาราง error เพิ่มสองแถว** (ต่อจากตารางในสมมติฐาน v1 ข้อ 3)

| ที่มา | code | HTTP |
| --- | --- | --- |
| API key ใช้กับรายงานนี้ไม่ได้ | `TEMPLATE_NOT_ALLOWED` | 403 |
| รายงานถูก archive | `TEMPLATE_ARCHIVED` | 410 |

**ลำดับใน `render()`**

```python
async def render(self, template_id, version, params, data, caller, request_id, filename) -> RenderOutcome:
    if caller.templates is not None and template_id not in caller.templates:
        raise await self._fail(template_id, caller, "TEMPLATE_NOT_ALLOWED")   # before the store: no existence leak
    async with self._slot():
        stored = await self._store.definition_input(template_id, version)    # StoreError ARCHIVED -> TEMPLATE_ARCHIVED
        ...
```

- ทั้งสอง error บันทึก run แบบ `failed` พร้อม `errorCode` เหมือน error อื่น — ผู้ดูแลเห็นในหน้าประวัติว่าระบบไหนยังเรียกรายงานที่ archive หรือใช้ key ผิดรายงาน
- `TEMPLATE_NOT_ALLOWED` ไม่จองช่องในคิว (`_slot`) เพราะไม่มีงาน render
- `preview()` และ `validate()` ของรายงานที่ archive → `TEMPLATE_ARCHIVED` (410) เช่นกัน; สองเมธอดนี้รับแค่ session จึงไม่ต้องตรวจรายการรายงาน
- cache ของ definition (key = sha256 ของ version) ไม่ต้องล้างตอน archive เพราะ store ปฏิเสธก่อนถึง cache ทุกครั้ง

## Testing Strategy v1.1

- **สิทธิ์ของ key:** key ที่ `templates = {"a"}` render `a` ได้; render `b` (มีอยู่), `c` (archive แล้ว) และ `zzz` (ไม่มี) ได้ `TEMPLATE_NOT_ALLOWED` 403 เหมือนกันทั้งสาม พร้อม run แบบ failed; key ที่ `templates = None` render ได้ทุกรายงานเหมือนเดิม
- **archive:** render รายงานที่ archive → 410 `TEMPLATE_ARCHIVED` พร้อม run แบบ failed; preview และ validate → 410; unarchive แล้ว render version เดิมได้ (cache ไม่ทำให้ได้ผลผิด)
- **คิว:** ส่ง `TEMPLATE_NOT_ALLOWED` 20 ครั้งพร้อมกันไม่กินช่องคิว — render ปกติที่ส่งพร้อมกันยังผ่าน
- test เดิมทั้งหมดผ่านโดยไม่แก้ (`Principal` ที่ไม่ใส่ `templates` = `None`)

## Success Criteria v1.1

1. key ที่จำกัดรายงานไว้ render ได้เฉพาะรายงานในรายการ และไม่รู้ว่ารายงานอื่นมีอยู่หรือไม่
2. รายงานที่ archive ได้ 410 พร้อม run แบบ failed และกลับมา render ได้หลัง unarchive
3. coverage ≥ 90%, `ruff` สะอาด, test เดิมผ่าน

## Open Questions v1.1

ไม่มี — ข้อมูลของ key (วันหมดอายุ, รายการรายงาน) และการเก็บอยู่ใน spec ของ `auth`; การ map เป็น HTTP และ `ErrorCode` ใน contract อยู่ใน spec ของ `public-api`

---

# v1.5: เก็บเอกสารที่ออก (D1)

สถานะ: **ร่าง 19 พ.ย. 2026 — รออนุมัติ** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.5 (interview 19 พ.ย. 2026)
หัวข้อ v1 และ v1.1 ด้านบนยังใช้ ยกเว้นข้อที่ v1.5 กลับข้อตัดสินใจ (ผู้ใช้ยืนยัน) และ**ถูกแทนที่ด้วยหัวข้อนี้**:
สมมติฐาน v1 ข้อ 6 ("ไม่เก็บ params, data หรือ PDF"), Boundaries **Always** "ไม่เก็บ params/data/PDF" และ **Ask first** "เก็บ PDF",
Success Criteria v1 ข้อ 4 ส่วน "ไม่มี params, data หรือ PDF ใน DB" (ยังจริงสำหรับตาราง `runs` และ log) และ Out of scope "เก็บ PDF"

## สมมติฐาน v1.5

1. **เป้า (ผู้ใช้ตัดสิน):** เปิดใบเดิมกลับมาดาวน์โหลดซ้ำ — ไม่ใช่หลักฐานเพื่อตรวจสอบ จึงไม่มีกติกาห้ามแก้/ห้ามลบเพิ่ม
2. **ใบที่เก็บ (ผู้ใช้ตัดสิน):** ทุก `render()` ที่**สำเร็จ** — มาจากฟอร์มใน Studio (session) หรือระบบอื่น (API key) ก็ได้; ใช้ version ที่ publish
   (`published` หรือเลข version เจาะจง) **ไม่เก็บ:** `preview()` ของ draft (ลายน้ำ DRAFT), run ที่ล้มเหลว
3. **เก็บอะไร:** PDF ไบต์เดิมที่ส่งออกไป (ดาวน์โหลดซ้ำได้ไฟล์เดิมทุกไบต์ ไม่ render ใหม่), params, data และชื่อไฟล์ที่ตอบกลับ
4. **ที่เก็บ (ผู้ใช้ตัดสิน 19 พ.ย. 2026):** PDF อยู่ใน object storage เดิม (RustFS หรือ S3 อื่นตาม `JESTER_S3_*`) ที่ key `documents/<run_id>`;
   params, data, ชื่อไฟล์, ขนาดและ sha256 ของ PDF อยู่ในตาราง `documents` ของ PostgreSQL ผูก `runs(id)` ด้วย `ON DELETE CASCADE`
   - DB ไม่โตตามขนาด PDF; ราคาที่จ่ายคือ object storage กับ DB ไม่อยู่ใน transaction เดียวกัน จึงต้องมีกติกาลำดับเขียน/ลบ และการเก็บกวาดไฟล์กำพร้า (ด้านล่าง)
   - `BlobStore` ของ asset ไม่เปลี่ยน (content-addressed, ไม่มี delete); เอกสารใช้ store แยกที่ลบได้ ใน bucket เดียวกันคนละ prefix
5. **ใครเห็น (ผู้ใช้ตัดสิน):** ผู้ใช้ Studio ทุกคนเห็นทุกใบ รวมใบที่ระบบอื่นออกผ่าน API key (ไม่มี role เหมือน v1.4)
6. **ค้นหา:** ข้อความ `q` (ตัด space หัวท้าย, 1–100 ตัวอักษร) จับคู่แบบไม่สนตัวพิมพ์กับ `params::text || ' ' || data::text`
   (`ILIKE` และ escape `%` `_` `\` ของผู้ใช้) — ไม่มี index ใหม่; ไล่ตามรายงานด้วย index `documents_template`
   ใส่ comment `shortcut:` ว่าเปลี่ยนเป็น `pg_trgm` เมื่อรายงานเดียวมีเอกสารเกินหลักแสน
7. **ไม่มีสวิตช์ปิดการเก็บ** (ไม่มีใครขอ) — ตัวเลือก "ไม่เก็บ" ต่อ API key หรือต่อรายงานทำเมื่อมีแผนต่อระบบเงินเดือนจริง;
   README ระบุว่าตั้งแต่ v1.5 ฐานข้อมูล, object storage และ backup มีข้อมูลลูกค้า

## การเปลี่ยนแปลง v1.5

**`0008_documents.sql`**

```sql
-- v1.5: documents a successful /v1/render produced; the PDF itself is in object storage at documents/<run_id>
CREATE TABLE documents (
    run_id      text PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
    template_id text NOT NULL,
    filename    text NOT NULL,
    params      json NOT NULL,   -- json, not jsonb: jsonb rejects "\u0000", which callers may send
    data        json NOT NULL,
    pdf_size    integer NOT NULL,
    pdf_sha256  text NOT NULL
);
CREATE INDEX documents_template ON documents (template_id, run_id DESC);
```

**`DocumentFiles`** (ใหม่ใน `render_service`, มีแบบ S3 และแบบ memory สำหรับ test): `put(run_id, pdf)`, `get(run_id)`,
`delete(run_ids)` (S3 `DeleteObjects` ทีละไม่เกิน 1,000 key; key ที่ไม่มีอยู่แล้วไม่ถือว่าผิด), `list_older_than(cutoff)` สำหรับเก็บกวาด
ใช้ endpoint, bucket และ credential ชุดเดียวกับ asset

**ลำดับเขียน (render):** `record()` สร้าง `run_id` ก่อน → `put` PDF → transaction เดียว insert `runs` + `documents`
- `put` ล้ม → render ตอบ `503 SERVICE_UNAVAILABLE` (retryable) และบันทึก run เป็น failed ไม่มีเอกสาร; ผู้เรียกไม่ได้ PDF ที่ไม่ถูกเก็บ
- transaction ล้มหลัง `put` → ลบ object ทันทีแบบ best effort; ถ้าลบไม่ได้ก็เหลือไฟล์กำพร้าให้การเก็บกวาดจัดการ
- ผลคือ: แถวใน `documents` มี object เสมอ (ยกเว้นข้อ "backup" ใน SPEC-infra); object อาจไม่มีแถวได้ชั่วคราว

**`runs.py`:** `NewRun` เพิ่ม `document: NewDocument | None` (filename, params, data, pdf)
- `list_documents(template_id | None, q | None, limit, before) -> (list[DocumentSummary], cursor)` — ใหม่สุดก่อน; `DocumentSummary` = run_id, created_at,
  template_id, version, caller, filename, pages, params (ไม่มี data/pdf ในรายการ)
- `document(run_id) -> (filename, pdf_sha256) | None`; `RenderService.document_pdf(run_id)` อ่าน object แล้วตรวจ sha256
  — ไม่มีแถว → `None` (404); มีแถวแต่ object หายหรือ sha256 ไม่ตรง → `StoreError("NOT_FOUND")` และ log error พร้อม run_id
- `Run` เพิ่ม `has_document: bool` (`EXISTS` ใน query เดิม)

**`service.py`:** `_run()` คำนวณ `default_name` ก่อน `_record()` แล้วส่งเอกสารเข้า run เมื่อ `kind == "render"` และสำเร็จ;
params/data ที่เก็บคือค่าที่ผู้เรียกส่งมา: ใส่ด้วย `Json(value, dumps=…)` ของ psycopg โดยส่ง dumps ที่แปลง `Decimal` เป็นข้อความเดิม
(`default=str` เหมือน `canonical_sha256`) — ค่าเริ่มต้นของ psycopg ใช้ `json.dumps` เฉย ๆ ซึ่งโยน `TypeError` กับ Decimal
คอลัมน์ `json` (ไม่ใช่ `jsonb`) รับทุกค่าที่ JSON ของผู้เรียก parse ได้ รวม `"\u0000"` ซึ่ง `jsonb` ปฏิเสธ — test ครอบกรณีนี้

**retention ลบเป็นชุด แล้วลบ PDF หลัง commit:** `_apply_retention` (ทุก run ที่ 100, ภายใน transaction ของ `record()`)
- ลบไม่เกิน 500 run ต่อรอบ: `DELETE FROM runs WHERE id IN (SELECT id … ORDER BY id LIMIT 500)`; ส่วนที่เหลือถูกลบในรอบถัด ๆ ไป
  (ครั้งแรกที่ admin ตั้ง N วันหลังเก็บตลอดมานาน อาจมีหลายหมื่นใบ)
- เก็บ `run_id` ที่มีเอกสารก่อนลบ (`DELETE FROM documents … RETURNING run_id` ในชุดเดียวกัน) แล้ว**หลัง commit** เรียก `DocumentFiles.delete(...)`
- ลบ object ล้ม → log warning ไม่ทำให้ render ล้ม; ไฟล์ที่เหลือเป็นไฟล์กำพร้าให้การเก็บกวาดจัดการ
- ลำดับนี้ (DB ก่อน object) ทำให้ไม่มีแถวที่ชี้ไป object ที่ถูกลบแล้ว
- `retention(preview_days)` เพิ่ม `would_delete_documents` (นับแถว `documents` ของ run ที่จะถูกลบ) เพื่อให้ admin เห็นว่าจะเสีย PDF กี่ใบก่อนยืนยัน

**เก็บกวาดไฟล์กำพร้า:** `python -m jester_api.ops.blobs sweep-documents` ลบ object ใต้ `documents/` ที่ไม่มีแถวใน `documents`
และเก่ากว่า 1 ชั่วโมง (ไม่ชน render ที่กำลังเขียนอยู่) พิมพ์จำนวนที่ลบ; README แนะนำ cron วันละครั้ง
ใส่ comment `shortcut:` ว่าไล่ทั้ง prefix ทุกครั้ง พอสำหรับหลักแสน object ต่อวัน

`RenderService` เพิ่ม `list_documents(...)` และ `document_pdf(run_id)`; `build_services` สร้าง `DocumentFiles` จาก settings เดิม

## Testing Strategy v1.5

- render ที่สำเร็จ (session และ API key) มีเอกสาร: PDF จาก `document_pdf` ไบต์เท่ากับที่ตอบ, params/data/filename ตรง; `"12345678901234567.89"` กลับมาตรงทุกหลัก
- data ที่มีข้อความ `"\u0000"` และ Decimal ใน params render สำเร็จและมีเอกสาร
- preview, render ที่ล้มเหลว (422, 403 `TEMPLATE_NOT_ALLOWED`, 410) ไม่มีเอกสารและไม่มี object
- `put` ล้ม → 503 และไม่มีแถว; insert ล้มหลัง `put` → object ถูกลบ
- object หายหรือ sha256 ไม่ตรง → `document_pdf` โยน `NOT_FOUND` (ไม่ส่งไบต์ผิดออกไป)
- ค้นหา: เจอจากค่าใน params และใน data (ไทย, ไม่สนตัวพิมพ์อังกฤษ); `%` และ `_` ของผู้ใช้ไม่เป็น wildcard; กรองรายงาน; paging ด้วย cursor
- retention: ตั้ง 90 วันแล้ว run เก่าถูกลบพร้อมแถวและ object ไม่เกิน 500 ต่อรอบ; ลบ object ล้มแล้ว render ยังสำเร็จ; ค่าเริ่มต้นไม่ลบ
- sweep: ลบเฉพาะ object ที่ไม่มีแถวและเก่ากว่า 1 ชั่วโมง; object ที่มีแถวหรือใหม่กว่าไม่ถูกแตะ
- test แบบ S3 จริง (RustFS ใน compose dev, ตามแบบ test ของ `S3BlobStore`): put/get/delete/list
- `has_document` ถูกต้องใน `get_run`/`list_runs`; test เดิมผ่าน **ยกเว้น** test "ไม่มี params/data/PDF ใน DB" ซึ่งเปลี่ยนเป็น "ไม่มีใน `runs` และ log" (ยังจริง)

## Success Criteria v1.5

1. ทุก render ที่สำเร็จจาก version ที่ publish ดาวน์โหลด PDF เดิมได้ทุกไบต์; draft/preview/ล้มเหลวไม่ถูกเก็บ
2. ค้นเอกสารด้วยค่าใน params หรือ data ได้; เอกสารถูกลบทั้งแถวและ object ตามนโยบายเดิม และไม่มีแถวที่ชี้ไป object ที่ไม่มี
3. ไม่มี PDF ในตาราง PostgreSQL ใด
4. coverage ≥ 90%, `ruff` สะอาด

## Open Questions v1.5

ไม่มี — ที่เก็บ (rustfs) และใครเห็น (ทุกคน) ผู้ใช้ตัดสินแล้ว 19 พ.ย. 2026
