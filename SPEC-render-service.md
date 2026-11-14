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
