# Tasks: `render-service`

แผน: [plan.md](plan.md) · Spec: [SPEC-render-service.md](../../SPEC-render-service.md)
คำสั่ง test: `cd apps/api && uv run ruff check . && uv run pytest tests -q --cov=jester_api.render_service --cov-report=term-missing`
DB/engine: `JESTER_TEST_DATABASE_URL=… JESTER_TEST_S3_ENDPOINT=… GOTENBERG_URL=… uv run pytest tests/render_service -m "db or engine or storage" -q` (ผ่าน SSH tunnel ไป VM)

## Phase 1: ชิ้นส่วน

### T1: worker

**Description:** `run_in_worker(definition, files, assets, params, data, meta, timeout) -> WorkerResult` (BindResult หรือ prepare problems) — process ใหม่ต่องาน (`fork` บน Linux, `spawn` บน Windows) ส่งผลกลับทาง `Pipe`; รอผลด้วย `asyncio.to_thread`; เกิน timeout → `kill` + `join` แล้ว raise timeout; exception ใน child เป็น problem ไม่ใช่ crash; comment `shortcut:` บอกวิธีเปลี่ยนเป็น pool

**Acceptance criteria:**
- [x] fixture quotation ได้ `BindResult` เท่ากับเรียก `prepare` + `bind` ตรง ๆ
- [x] template ลูปซ้อนไม่รู้จบ (timeout 1 วินาที ใน test) → timeout ภายใน ~2 วินาที และ child ไม่ค้าง (`is_alive()` เป็นเท็จ)
- [x] ระหว่างรอ worker coroutine อื่นยังทำงาน; `ReportDefinition` pickle ได้

**Verification:**
- [x] `uv run pytest tests/render_service/test_worker.py -q`

**Dependencies:** None
**Files likely touched:** `render_service/worker.py`, `tests/render_service/test_worker.py`
**Estimated scope:** M

### T2: probe ฟอนต์

**Description:** `EngineFonts(engine).known(families) -> frozenset | None`: family ที่ยังไม่รู้ → render หน้าเปล่าที่มี `header.html` ใช้ `font-family: "<family>"` แล้วอ่าน `/BaseFont` ด้วย `pypdf` (ชื่อฟอนต์ที่ฝัง เช่น `THSarabunNew`); จำผลทั้งมีและไม่มี; engine ล่ม → `None`

**Acceptance criteria:**
- [x] engine จำลอง (respx) ที่คืน PDF ที่มี TH Sarabun New → family นั้นอยู่ในผล; คืน Noto → ไม่อยู่
- [x] เรียกซ้ำไม่ยิง engine อีก; engine ล่ม → `None` และครั้งหน้าลองใหม่ (ไม่ cache ความล้มเหลว)

**Verification:**
- [x] `uv run pytest tests/render_service/test_fonts.py -q`

**Dependencies:** None
**Files likely touched:** `render_service/fonts.py`, `tests/render_service/test_fonts.py`, `pyproject.toml` (`pypdf` เป็น dependency จริง)
**Estimated scope:** S

### T3: runs + retention

**Description:** `0003_runs.sql` (runs + `run_retention` แถวเดียว + sequence สำหรับนับ); `Runs.record(...)`, `get`, `list` (newest first, cursor `before`), `last(template_ids)`, `retention(preview_days)`, `set_retention(days|None, by)`; ลบตามนโยบายทุก 100 run; canonical hash ของ params/data

**Acceptance criteria:**
- [x] ไม่มี params/data/PDF ใน DB (ค้นค่าลับไม่เจอ); hash เท่ากันเมื่อเรียง key ต่างกัน และ Decimal ไม่ผ่าน float
- [x] ค่าเริ่มต้นไม่ลบ run เก่า 5 ปี; `preview_days=90` นับถูกโดยไม่ลบ; ตั้ง 90 วันแล้วถูกลบในรอบถัดไปพร้อม `set_by`/`set_at`; ตั้งกลับ `None` แล้วหยุดลบ
- [x] cursor ไล่หน้าได้ครบไม่ซ้ำ; filter template/status ถูก

**Verification:**
- [x] `uv run pytest tests/render_service/test_runs.py -m db -q`

**Dependencies:** None
**Files likely touched:** `db/migrations/0003_runs.sql`, `render_service/runs.py`, `tests/render_service/test_runs.py`
**Estimated scope:** M

### Checkpoint A

- [x] tests T1–T3 ผ่าน (T3 บน db), ruff สะอาด

## Phase 2: service

### T4: render

**Description:** `RenderService.render`: คิว (6 งาน, รอ 10 วินาที) → `definition_input` → definition (cache ต่อ sha256 + `system_fonts`) → worker → asset bytes (cache) → engine → นับหน้า → run + provenance → `RenderOutcome`; ทุกทางล้มเหลวบันทึก run failed แล้ว raise `RenderError` ตามตาราง error → HTTP

**Acceptance criteria:**
- [ ] ทุกแถวของตาราง error → HTTP มี test (engine จำลอง respx, store จริงบน db, blob ใน memory)
- [ ] render version เดิมสองครั้ง: `load_definition` ครั้งเดียว, asset ดึงครั้งเดียว
- [ ] งานที่ 7 รอ; รอเกิน `queue_wait_s` → `SERVICE_UNAVAILABLE` (retryable)

**Verification:**
- [ ] `uv run pytest tests/render_service/test_service.py -m db -q`

**Dependencies:** T1, T2, T3
**Files likely touched:** `render_service/{__init__,service}.py`, `tests/render_service/test_service.py`
**Estimated scope:** M

### T5: preview, validate, runs API, health, contract

**Description:** `preview` (draft + ลายน้ำ DRAFT, ไม่มี data → `sampleFile`), `validate` (definition + trial bind ทุก sample ใน worker → `ValidationResult` พร้อม revision), `list_runs`/`get_run`/`last_runs`, `health` (db, storage, engine), `retention`/`set_retention`; เพิ่ม `GET`/`PUT /v1/runs/retention` ใน contract

**Acceptance criteria:**
- [ ] preview มี element ลายน้ำใน `index_html` ที่ส่ง engine และมี run `kind=preview` ที่ `version=null`, `draftRevision` ตรง
- [ ] validate draft ที่มี typo → `TEMPLATE_UNDEFINED` พร้อมบรรทัด และ `revision` ตรงกับที่ตรวจ; draft ถูกต้อง → `valid=true`
- [ ] health: engine ล่ม → `degraded` พร้อม `engine.status=down`

**Verification:**
- [ ] `uv run pytest tests/render_service -m db -q --cov=jester_api.render_service` ≥ 90%

**Dependencies:** T4
**Files likely touched:** `render_service/service.py`, `tests/render_service/test_preview_validate.py`, `openapi/public-api.yaml`
**Estimated scope:** M

### T6: live

**Description:** test marker `engine` + `db` + `storage` บน VM: publish starter quotation แล้ว render จริง, preview, probe ฟอนต์, ลูปไม่รู้จบ

**Acceptance criteria:**
- [ ] PDF ของ quotation มี `3,210.00` (poppler หรือ pypdf สำหรับตัวเลข) และ run มี provenance ครบ (engine version, options, output sha256)
- [ ] preview มีคำว่า DRAFT ทุกหน้า; probe เจอ TH Sarabun New
- [ ] draft ที่ลูปไม่รู้จบได้ `RENDER_TIMEOUT` ภายใน timeout และ request อื่นที่ส่งพร้อมกันสำเร็จ

**Verification:**
- [ ] `uv run pytest tests/render_service/test_live.py -m "engine and db" -q`

**Dependencies:** T5; VM `10.0.1.29`
**Files likely touched:** `tests/render_service/test_live.py`
**Estimated scope:** S

### Checkpoint B

- [ ] Success criteria 1–5 ของ spec ผ่าน
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป
