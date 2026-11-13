# Tasks: `engine-client` + Spike M0

แผน: [plan.md](plan.md) · Spec: [SPEC-engine-client.md](../../SPEC-engine-client.md)
คำสั่ง test หลัก (หลัง T2): `cd apps/api && uv run ruff check . && uv run pytest tests/engine_client -q`
Live/spike ต้องเปิด tunnel ก่อน: `ssh -N -L 3000:127.0.0.1:3000 root@10.0.1.29`

## Phase 0: Foundation

### T1: ตรวจ license ฟอนต์และตัดสินฟอนต์ค่าเริ่มต้น

**Description:** อ่านเงื่อนไขการแจกจ่ายต่อของ TH Sarabun New และ TH SarabunPSK จากต้นทาง (SIPA/ฟอนต์แห่งชาติ) และยืนยัน license ของ Sarabun (Google Fonts) และ Noto Sans Thai จาก repo ทางการ แล้วตัดสินฟอนต์ค่าเริ่มต้นตามกติกาที่ผู้ใช้ตกลงใน spec

**Acceptance criteria:**
- [x] มีบันทึก license ของ 4 ฟอนต์ พร้อม URL ต้นทาง, วันที่ตรวจ และข้อสรุป "แจกต่อได้/ไม่ได้/ไม่ชัด"
- [x] ระบุฟอนต์ค่าเริ่มต้นที่ใช้ใน spike ตามกติกาใน spec (ฟอนต์แห่งชาติถ้าแจกต่อได้ ไม่งั้น Sarabun)
- [x] ระบุ URL ไฟล์ที่จะดาวน์โหลดและ sha256 หลังดาวน์โหลด

**Verification:**
- [x] ทุกข้อสรุปมีลิงก์ต้นทางที่เปิดได้
- [x] ถ้า license ไม่ชัด ระบุว่า "ไม่ชัด" และใช้ทางสำรอง ไม่ตีความเอง

**Dependencies:** None
**Files likely touched:** `spikes/m0/fonts/LICENSES.md`, `SPEC-engine-client.md` (อัปเดตสมมติฐานข้อ 4)
**Estimated scope:** XS

### T2: Scaffold `apps/api` และ git init

**Description:** สร้างโปรเจกต์ Python ด้วย `uv` ที่ `apps/api` พร้อม `ruff`, `pytest`, `pytest-asyncio`, `respx`, `httpx`, `pydantic` และ marker `engine` ที่ข้ามอัตโนมัติเมื่อไม่มี `GOTENBERG_URL`; สร้าง `.gitignore` (รวม `spikes/m0/out/`) และ `git init`

**Acceptance criteria:**
- [x] `uv sync` สำเร็จ และมี `uv.lock` ที่ pin version
- [x] `uv run pytest -q` รันได้ (ยังไม่มี test หรือมี smoke test 1 ตัว) และ `-m engine` ถูก skip เมื่อไม่ตั้ง `GOTENBERG_URL`
- [x] `uv run ruff check .` และ `ruff format --check .` ผ่าน

**Verification:**
- [x] รันสามคำสั่งข้างบนแล้วบันทึกผล
- [x] `git status` แสดงไฟล์ที่ควร track และไม่มี `out/`

**Dependencies:** None
**Files likely touched:** `apps/api/pyproject.toml`, `apps/api/uv.lock`, `apps/api/tests/conftest.py`, `.gitignore`
**Estimated scope:** S

## Phase 1: engine-client

### T3: Models และการตรวจไฟล์ก่อนส่ง

**Description:** สร้าง `PageSetup`, `RenderFile`, `EngineResult`, `EngineHealth`, `ErrorCode`, `EngineError` และฟังก์ชันรวมไฟล์ที่ตรวจชื่อ (basename เท่านั้น, ห้าม `/`, `\`, `..`, ห้ามซ้ำ, ห้ามชนชื่อสงวน) และขนาดรวมตาม spec

**Acceptance criteria:**
- [x] ชื่อไฟล์ผิดหรือซ้ำ หรือขนาดเกิน → `EngineError(RENDER_INPUT_INVALID)` ก่อนส่ง request
- [x] `PageSetup` ค่าเริ่มต้น A4 portrait margin 20/20/15/15 mm และแปลงเป็น form fields ครบ 6 ตัว
- [x] `EngineError.message` ไม่มีเนื้อหาไฟล์

**Verification:**
- [x] `uv run pytest tests/engine_client/test_validation.py -q` ผ่าน ครอบทุกกรณีข้างบน

**Dependencies:** T2
**Files likely touched:** `src/jester_api/engine_client/{__init__,models,errors}.py`, `tests/engine_client/test_validation.py`
**Estimated scope:** S

### T4: `convert_html` happy path + live test

**Description:** สร้าง `EngineClient.convert_html` ที่ส่ง multipart ไป `/forms/chromium/convert/html` พร้อม safety options บังคับ (`failOnResourceLoadingFailed`, `failOnResourceHttpStatusCodes`, `failOnConsoleExceptions`) และคืน `EngineResult` พร้อม trace, duration และ options ที่ส่ง

**Acceptance criteria:**
- [x] Unit test (respx) ยืนยันว่า request มี `index.html`, header/footer ถ้ามี, assets ทุกตัว, page fields ครบ และ safety options ทุกครั้ง
- [x] Live test: HTML ง่าย ๆ ได้ PDF ที่ขึ้นต้นด้วย `%PDF-` และ `EngineResult.options` ตรงกับที่ส่ง
- [x] ไม่มี parameter ใดให้ผู้เรียกปิด safety options หรือส่ง URL ภายนอก

**Verification:**
- [x] `uv run pytest tests/engine_client/test_request.py -q`
- [x] `GOTENBERG_URL=http://localhost:3000 uv run pytest tests/engine_client -m engine -q`

**Dependencies:** T3
**Files likely touched:** `src/jester_api/engine_client/client.py`, `tests/engine_client/test_request.py`, `tests/engine_client/test_live.py`
**Estimated scope:** M

### T5: Error mapping, network errors และ `health()`

**Description:** แปล HTTP status และ exception ของ httpx เป็น `ErrorCode` ตามตารางใน spec พร้อม `retryable`; เพิ่ม `health()` ที่อ่าน `/health` และ `/version`; ยืนยันค่าของ `failOnResourceHttpStatusCodes` และพฤติกรรม 503 จาก Gotenberg จริง

**Acceptance criteria:**
- [x] ทุกแถวในตาราง error ของ spec มี unit test (400/401/403/404/409/413/415/429/500/503, timeout, connection error, status ที่ไม่รู้จัก)
- [x] Live: อ้าง asset ที่ไม่ได้แนบ → `RENDER_RESOURCE_FAILED`; `health()` คืนเวอร์ชัน 9.4.1
- [x] Spec อัปเดตค่า `failOnResourceHttpStatusCodes` ที่ถูกต้องและสิ่งที่พบเรื่อง 503

**Verification:**
- [x] `uv run pytest tests/engine_client -q --cov=jester_api.engine_client --cov-report=term-missing` ≥ 90%
- [x] `GOTENBERG_URL=http://localhost:3000 uv run pytest tests/engine_client -m engine -q`

**Dependencies:** T4
**Files likely touched:** `src/jester_api/engine_client/{errors,client}.py`, `tests/engine_client/test_errors.py`, `tests/engine_client/test_live.py`, `SPEC-engine-client.md`
**Estimated scope:** M

### Checkpoint A: engine-client

- [x] Unit tests ผ่าน, coverage ≥ 90%, ruff สะอาด
- [x] Live tests ผ่าน
- [x] Spec อัปเดตจากผลจริงแล้ว
- [ ] แจ้งผู้ใช้สั้น ๆ ก่อนเริ่ม spike

## Phase 2: Spike M0

### T6: Spike harness

**Description:** เขียน `spikes/m0/run_spike.py` ที่อ่าน case จาก `fixtures/<case>/` (HTML + `case.json` ระบุ page setup, expected row IDs, expected totals, expected Thai strings, ฟอนต์ที่คาด) แล้ว render ผ่าน `EngineClient` N รอบ เก็บ PDF + `manifest.json` ทำ check L1–L3 ด้วย `pypdf` และส่ง PDF ไป VM ทำภาพหน้าและ `pdftotext` เทียบ

**Acceptance criteria:**
- [ ] manifest มีครบตาม spec: digest, version, options, sha256 input/ฟอนต์/PDF, page count, text, trace, duration, ผล check
- [ ] Check L1 (ID ครบ/ไม่ซ้ำ), L2 (ยอด), L3 (สตริงไทยหลัง NFC, ฟอนต์ที่ฝัง, ไม่มี `.notdef`) และ determinism ข้ามรอบ
- [ ] ภาพหน้า PNG ทุกหน้าใน `out/<case>/run-1/` และผล `pdftotext` เทียบกับ `pypdf`

**Verification:**
- [ ] รันกับ case ทดสอบเล็ก 1 ตัว (HTML ง่ายพร้อม expected ที่ทั้งผ่านและตั้งใจให้ fail) แล้วเห็นผล check ตรงคาด
- [ ] ติดตั้ง `poppler-utils` บน VM แล้ว `pdftoppm -v` ทำงาน

**Dependencies:** Checkpoint A
**Files likely touched:** `spikes/m0/run_spike.py`, `spikes/m0/checks.py`, `spikes/m0/fixtures/_smoke/`
**Estimated scope:** M

### T7: SP-B ตารางข้ามหน้า + หัวตารางซ้ำ

**Description:** สร้าง fixture sales grouped จาก `research/specimens/grouped-cases.json` ขยายเป็น 0, 1, 50 และ 500 แถว แบบ portrait และ landscape ใช้ `<thead>` ซ้ำ ใส่ฟอนต์ค่าเริ่มต้นจาก T1 แล้วรัน 3 รอบ

**Acceptance criteria:**
- [ ] ทุก variation มีผล L1–L3 ใน manifest
- [ ] ภาพหน้าที่มีรอยต่อระหว่างหน้า (หัวตารางซ้ำ, ใกล้ footer) ถูกคัดไว้สำหรับ L4
- [ ] กรณี 0 แถวแสดง no-data และไม่ error

**Verification:**
- [ ] `uv run python ../../spikes/m0/run_spike.py --case sp-b --runs 3` จบโดยไม่มี exception

**Dependencies:** T1, T6
**Files likely touched:** `spikes/m0/fixtures/sp-b/`, `spikes/m0/fixtures/sp-b/make_rows.py`
**Estimated scope:** M

### T8: SP-A ใบเสนอราคา + ไทยใน header/footer + fallback

**Description:** สร้าง fixture ใบเสนอราคา Q-DEMO-001 พร้อม header/footer ภาษาไทย, เลขหน้า และ `@font-face` ทั้งใน body และ header/footer; เพิ่ม variation ที่ตัดฟอนต์หลักออกเพื่อทดสอบ fallback Noto Sans Thai

**Acceptance criteria:**
- [ ] ยอด 3,100.70 / 3,210.00 ตรวจได้ใน L2
- [ ] ผล L3 แยก body กับ header/footer และแยกรอบฟอนต์หลักกับรอบ fallback
- [ ] ภาพหน้า header/footer ถูกคัดไว้สำหรับ L4

**Verification:**
- [ ] `uv run python ../../spikes/m0/run_spike.py --case sp-a --runs 3`

**Dependencies:** T1, T6
**Files likely touched:** `spikes/m0/fixtures/sp-a/`
**Estimated scope:** M

### T9: SP-C แถวสูงเกินหน้า + PO02 ไม่มี detail

**Description:** สร้าง fixture PO master-detail จาก `research/specimens/master-detail-cases.json` โดยขยายข้อความ `long-detail` ให้สูงเกินหนึ่งหน้า (specimen เดิมสั้นเกินไป) และรวม PO02 ที่ไม่มี detail

**Acceptance criteria:**
- [ ] ข้อความใน long-detail ทั้งหมดตรวจด้วย L1 ว่าครบหรือหายส่วนไหน
- [ ] PO01 = 350.00, PO02 = 0.00 ตรวจใน L2
- [ ] ภาพหน้าที่แถวถูกตัดถูกคัดไว้สำหรับ L4

**Verification:**
- [ ] `uv run python ../../spikes/m0/run_spike.py --case sp-c --runs 3`

**Dependencies:** T6
**Files likely touched:** `spikes/m0/fixtures/sp-c/`
**Estimated scope:** S

### T10: REPORT.md

**Description:** สรุปผล SP-A/B/C ราย case เป็น ผ่าน/ไม่ผ่าน พร้อมลิงก์ manifest และภาพ ผลการดูภาพ (L4) และการตัดสินใจที่เปิดให้ผู้ใช้ตาม spec; ระบุข้อจำกัดว่าผ่าน ≠ production ready

**Acceptance criteria:**
- [ ] ทุก case มีผล L1–L4 และ determinism พร้อมหลักฐาน
- [ ] ทุกข้อที่ไม่ผ่านมีทางเลือกให้ผู้ใช้ตัดสินตาม spec
- [ ] บันทึก environment (digest, version, ฟอนต์ + sha256) ไว้ต้นไฟล์

**Verification:**
- [ ] ลิงก์ทุกอันใน REPORT.md ชี้ไฟล์ที่มีจริง (script ตรวจลิงก์)
- [ ] ผู้ใช้ดูภาพหน้าที่คัดไว้ร่วมกันก่อนสรุป L4

**Dependencies:** T7, T8, T9
**Files likely touched:** `spikes/m0/REPORT.md`
**Estimated scope:** S

### Checkpoint B: ผล spike

- [ ] REPORT.md ครบทุก case
- [ ] ผู้ใช้ตัดสินทางเดินของ `binder` แล้ว
- [ ] อัปเดต CAPABILITY_MAP.md ถ้าผลกระทบ module boundary
