# Tasks: `binder`

แผน: [plan.md](plan.md) · Spec: [SPEC-binder.md](../../SPEC-binder.md)
คำสั่ง test: `cd apps/api && uv run ruff check . && uv run pytest tests -q --cov=jester_api.binder --cov-report=term-missing`

## Phase 1: ชิ้นส่วน

### T1: data-prep เติมค่าที่หาย

**Description:** ในสำเนาของ `data` และในแถวของทุก list (รวม list ลูก) เติม property ที่ schema ประกาศใน `properties` แต่ไม่ได้ส่งมา: object → โครงว่างตาม `properties` (ซ้อนทุกชั้น), array → `[]`, อื่น ๆ → `None`; schema ที่ไม่มี `properties` ตรง ๆ ไม่เติม; อัปเดต SPEC-data-prep.md (view model)

**Acceptance criteria:**
- [x] object ไม่บังคับซ้อน 2 ชั้นที่หายได้โครงว่าง; array ที่หายได้ `[]`; scalar ได้ `None`
- [x] แถวของ list และ list ลูกได้ property ที่หายครบ; property ที่ส่งมาไม่ถูกแตะ
- [x] data ของผู้เรียกไม่ถูกแก้; ยอดของ fixture 3 แบบเท่าเดิม

**Verification:**
- [x] `uv run pytest tests/data_prep -q`

**Dependencies:** None
**Files likely touched:** `data_prep/{lists,prepare}.py`, `tests/data_prep/test_prepare.py`, `SPEC-data-prep.md`
**Estimated scope:** S

### T2: environment

**Description:** `SandboxedEnvironment(autoescape=True, undefined=StrictUndefined, finalize=…)` บน `DictLoader` ของไฟล์ .html; ลบ `lipsum`; render แบบ `generate()` หยุดเมื่อเกิน 20 MB; แปลง `UndefinedError`/`SecurityError`/`ValueError`/อื่น ๆ เป็น `Problem` พร้อมไฟล์และบรรทัด; `finalize`: `None` → `""`, object/list → `""` + warning `TEMPLATE_PRINTS_OBJECT` ครั้งเดียวต่อบรรทัด

**Acceptance criteria:**
- [x] `{{ item.amont }}` → `TEMPLATE_UNDEFINED` บรรทัดถูก ทั้งใน template และ partial ที่ `include`
- [x] `{{ fmt.__class__ }}` → `TEMPLATE_UNSAFE`; `fmt.money("abc")` → `TEMPLATE_ERROR`; ข้อความไม่มีค่าจาก data
- [x] `<b>x</b>` และ `" onerror="x` ใน data ถูก escape; output เกิน 20 MB → `OUTPUT_TOO_LARGE`

**Verification:**
- [x] `uv run pytest tests/binder/test_environment.py -q`

**Dependencies:** None
**Files likely touched:** `binder/environment.py`, `tests/binder/test_environment.py`
**Estimated scope:** M

### T3: document

**Description:** ห่อ body เป็น `index.html` (doctype, `lang="th"`, charset, CSS พื้นฐาน: `font-family` ตาม `fonts.body`, `thead` ซ้ำ, `tr { break-inside: auto }`) + `@font-face` ของ asset ที่ `font_family` อยู่ใน `fonts.body`; เติม `<style>` ให้ header/footer (`fonts.headerFooter`, `box-sizing: border-box`, ไม่มี `@font-face`); แปลง `report.page` เป็น `PageSetup`

**Acceptance criteria:**
- [x] CSS พื้นฐานอยู่ก่อนเนื้อหาของผู้เขียน; ไม่มีฟอนต์สำรองนอกจาก `fonts.body`
- [x] header/footer ไม่มี `@font-face`; `pageNumber`/`totalPages` ผ่านไปตามเดิม
- [x] landscape และ margin ของ `report.page` ตรงกับ `PageSetup`

**Verification:**
- [x] `uv run pytest tests/binder/test_document.py -q`

**Dependencies:** None
**Files likely touched:** `binder/document.py`, `tests/binder/test_document.py`
**Estimated scope:** S

### T4: resources

**Description:** เปลี่ยน regex resource/external/tfoot ใน `report_definition/lint.py` เป็น public; ตรวจ HTML/CSS หลัง render: URL ภายนอกหรือไฟล์ที่ไม่มี → `RESOURCE_NOT_ALLOWED`, `data:` ผ่าน, `<script>`/`on*=` → `SCRIPT_NOT_ALLOWED`, `<tfoot>` → `TFOOT_FORBIDDEN`; คืนไฟล์ข้อความและ asset ที่ถูกอ้าง (รวมที่อ้างจาก CSS) ไม่รวม partial

**Acceptance criteria:**
- [x] `http://10.0.0.1/x`, `//evil`, `file:///etc/passwd`, `HTTP://X` (ตัวใหญ่) → `RESOURCE_NOT_ALLOWED`
- [x] `url(font.ttf)` ใน `report.css` ทำให้ `font.ttf` อยู่ใน `asset_names`
- [x] test เดิมของ `report_definition` ผ่านไม่เปลี่ยน

**Verification:**
- [x] `uv run pytest tests/binder/test_resources.py tests/report_definition -q`

**Dependencies:** None
**Files likely touched:** `report_definition/lint.py`, `binder/resources.py`, `tests/binder/test_resources.py`
**Estimated scope:** S

### Checkpoint A

- [x] tests T1–T4 ผ่าน, ruff สะอาด, test เดิมทั้งหมดยังผ่าน (333 passed, coverage binder 97–100%)

## Phase 2: รวมและยืนยันกับ engine จริง

### T5: bind()

**Description:** `bind(definition, files, assets, prepared)` รวม T2–T4: render template/header/footer (คืน error ของทุกไฟล์ในครั้งเดียว), ห่อ, ตรวจ resource, คืน `BindResult`; test ด้วย fixture 3 แบบ + sample จาก `prepare`

**Acceptance criteria:**
- [x] fixture 3 แบบ bind ผ่าน: `3,210.00`, `สามพันสองร้อยสิบบาทถ้วน`, ชื่อบริษัทใน header, `pageNumber` ใน footer, `report.css` ใน `files`, `logo.png` ใน `asset_names`
- [x] ทุกแถวของ "กติกาค่าที่หายไป" ให้ผลตามตารางผ่าน `prepare` → `bind`
- [x] SSRF ผ่าน data (รวม `|safe`) ถูกจับ; bind ซ้ำได้ bytes เดิม
- [x] ขีดจำกัด 20 MB เป็นขนาดรวมของทุกไฟล์ (ส่ง budget ที่เหลือต่อจากไฟล์ก่อน)

**Verification:**
- [x] `uv run pytest tests/binder -q --cov=jester_api.binder` ≥ 90%

**Dependencies:** T1–T4
**Files likely touched:** `binder/{__init__,bind}.py`, `tests/binder/test_bind.py`
**Estimated scope:** M

### T6: engine hardening + live

**Description:** (ตัดสินแล้วจาก review Phase 1: allow-list ของ engine เป็นข้อบังคับในทุกกรณี ไม่ใช่แค่ทางถอย เพราะ regex ของ binder จับ CSS/markup แปลก ๆ ได้ไม่ครบทุกแบบ) ตรวจ `gotenberg --help` ใน `jester/gotenberg:9.4.1-th1`; เพิ่ม args `--chromium-disable-javascript`, `--chromium-allow-list` (และ `--chromium-deny-private-ips` ถ้ามี); รัน spike SP-A/B/C ซ้ำบน VM; เพิ่ม live test ของ binder (marker `engine`); บันทึก args ใน infra และ SPEC-engine-client.md

**Acceptance criteria:**
- [x] 500 แถว 19 หน้า: เลขหน้า 1/19…19/19 ครบ, หัวตารางซ้ำทุกหน้า (poppler); SP-A/B/C ผ่านเหมือนเดิม
- [x] HTML ที่มี `<img src="http://…">` ส่งตรงเข้า engine (ข้าม binder) ถูกปฏิเสธ
- [x] live: fixture ใบเสนอราคาได้ยอดและไทยครบ, TH Sarabun New ทั้ง body และ header/footer
- [x] ถ้าเลขหน้าหาย: เปิด JS ไว้ ใช้แค่ allow-list และบันทึกเหตุผล (ไม่ต้องใช้: เลขหน้าครบ 19/19 เมื่อปิด JS)

**Verification:**
- [x] `GOTENBERG_URL=... uv run pytest -m engine -q` และ manifest ของ spike ใน `spikes/m0/evidence`

**Dependencies:** T5; VM `10.0.1.29`
**Files likely touched:** `infra/gotenberg/*`, `SPEC-engine-client.md`, `spikes/m0/*`, `tests/binder/test_bind_engine.py`
**Estimated scope:** M

### Checkpoint B

- [x] Success criteria 1–6 ของ spec ผ่าน (367 tests รวม live 4 ตัว, coverage binder 99%, spike รอบ 3)
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป
