# Tasks: `report-definition`

แผน: [plan.md](plan.md) · Spec: [SPEC-report-definition.md](../../SPEC-report-definition.md)
คำสั่ง test: `cd apps/api && uv run ruff check . && uv run pytest tests/report_definition -q --cov=jester_api.report_definition --cov-report=term-missing`

## Phase 1: Definition model และ expressions

### T1: deps + model ของ `report.json`

**Description:** เพิ่ม `jsonschema` และ `jinja2`; สร้าง `Problem`, `AssetInfo`, `DefinitionInput` และ pydantic model ของ `report.json` (strict, `extra="forbid"`) ตามตาราง "กติกาของ field" ใน spec; แปลง validation error เป็น `Problem` พร้อม JSON Pointer และ syntax error ของ JSON เป็น `Problem` พร้อม line/column

**Acceptance criteria:**
- [x] ตัวอย่าง `report.json` ทั้ง 4 ก้อนใน spec ผ่าน model
- [x] field ที่ไม่รู้จัก, `schemaVersion` ≠ 1, page size ≠ A4, margin นอกช่วง, `required`+`default` พร้อมกัน, `default` ผิด type, list ซ้อนเกิน 1 ระดับ, `groupBy.key` ไม่ใช่ตัวแรกของ `sort` → ปัญหาพร้อม pointer ที่ถูกต้อง
- [x] JSON พัง → ปัญหาเดียวพร้อม line/column

**Verification:**
- [x] `uv run pytest tests/report_definition/test_model.py -q`

**Dependencies:** None
**Files likely touched:** `pyproject.toml`, `uv.lock`, `report_definition/{__init__,problems,model}.py`, `tests/report_definition/test_model.py`
**Estimated scope:** M

### T2: ภาษา expression

**Description:** Tokenizer + recursive-descent parser ตาม grammar ใน spec ทั้งโหมด basic และ advanced คืน AST หรือ `Problem` (`EXPRESSION_INVALID` / `EXPRESSION_MODE`) พร้อม column; ตัวเลขเก็บเป็น `Decimal`

**Acceptance criteria:**
- [x] ทุก expression ใน spec parse ได้ในโหมดที่ถูกต้อง
- [x] syntax ของ advanced ในโหมด basic → `EXPRESSION_MODE`
- [x] syntax นอก grammar ถูกปฏิเสธ: `__import__('os')`, `a.b()`, `a[0]`, `lambda`, `'text'`, `a if b else c`, `round(x)` (ขาดอาร์กิวเมนต์), `1 ++`
- [x] ไม่มี `eval`/`exec`/`compile`/`ast` ใน module (test grep)

**Verification:**
- [x] `uv run pytest tests/report_definition/test_expressions.py -q`

**Dependencies:** T1
**Files likely touched:** `report_definition/expressions.py`, `tests/report_definition/test_expressions.py`
**Estimated scope:** M

### T3: การอ้างอิงและลำดับคำนวณ

**Description:** ตรวจ ref ใน `computed`/`totals` ทุกระดับกับ data schema, list และชื่อที่นิยามไว้; ตรวจว่าเป็นตัวเลข; ห้าม `computed` ชื่อซ้ำ field ใน schema; หาลำดับ topological และวงวน; บันทึกลำดับคำนวณใน definition

**Acceptance criteria:**
- [x] ref ไม่มีจริง → `REF_UNKNOWN` พร้อม pointer ไปยัง expression
- [x] ref ไปยัง field ที่ไม่ใช่ตัวเลข → `REF_NOT_NUMERIC`
- [x] วงวน `a → b → a` → `REF_CYCLE` ระบุชื่อในวง
- [x] ลำดับคำนวณของใบเสนอราคาเป็น `subtotal, net, vat, grand`

**Verification:**
- [x] `uv run pytest tests/report_definition/test_refs.py -q`

**Dependencies:** T2
**Files likely touched:** `report_definition/refs.py`, `tests/report_definition/test_refs.py`
**Estimated scope:** M

### Checkpoint A

- [x] tests T1–T3 ผ่าน, ruff สะอาด
- [x] expression นอก grammar ถูกปฏิเสธทั้งหมด

## Phase 2: ไฟล์ประกอบและการรวม

### T4: data schema และ sample

**Description:** ตรวจว่า `data.schema.json` เป็น JSON Schema Draft 2020-12 ที่ถูกต้อง และ sample ทุกไฟล์ใน `data.samples` ผ่าน schema; ตรวจ `lists.*.path` ชี้ไปยัง array ใน schema

**Acceptance criteria:**
- [x] schema ไม่ถูกต้อง → `DATA_SCHEMA_INVALID`
- [x] sample ไม่ผ่าน → `SAMPLE_INVALID` พร้อม file + pointer ภายใน sample
- [x] ไฟล์ schema/sample หาย → `FILE_MISSING`; `lists.*.path` ไม่ใช่ array → `LIST_PATH_INVALID`

**Verification:**
- [x] `uv run pytest tests/report_definition/test_data_schema.py -q`

**Dependencies:** T1
**Files likely touched:** `report_definition/data_schema.py`, `tests/report_definition/test_data_schema.py`
**Estimated scope:** S

### T5: lint template

**Description:** ตรวจ Jinja2 syntax (พร้อมบรรทัด) และตัวแปรระดับบนสุดที่อนุญาต; `<tfoot`; `@font-face` ใน header/footer; `font-family` ใน header/footer เทียบ `system_fonts` (`FONT_MISSING` หรือ warning `FONT_UNVERIFIED` เมื่อเป็น `None`); ไฟล์ที่อ้างแต่ไม่มี; URL ภายนอก; ชื่อ `index.html`; `fonts.body` ต้องมีใน system หรือ asset

**Acceptance criteria:**
- [x] ทุกแถวในตาราง lint ของ spec มีกรณีผ่าน + ไม่ผ่าน พร้อม file/line
- [x] คำต้องห้ามในคอมเมนต์ HTML/Jinja ไม่ทำให้ false positive

**Verification:**
- [x] `uv run pytest tests/report_definition/test_lint.py -q`

**Dependencies:** T1
**Files likely touched:** `report_definition/lint.py`, `tests/report_definition/test_lint.py`
**Estimated scope:** M

### T6: `load_definition` + fixtures

**Description:** รวม T1–T5 เป็น `load_definition` ที่คืน `DefinitionResult` (definition หรือ `None` เมื่อมี error, problems ทั้งหมด, sha256); สร้าง fixture รายงานอ้างอิง quotation, sales grouped, purchase order จาก spike เป็น Jinja template + data schema + sample

**Acceptance criteria:**
- [x] 3 fixture ผ่านโดยไม่มีปัญหา
- [x] definition ที่ผิด 5 จุดคืนปัญหาครบ 5 รายการ
- [x] sha256 คงที่เมื่อเนื้อหาเหมือนเดิม (ลำดับ key ไม่มีผล) และเปลี่ยนเมื่อไฟล์/asset เปลี่ยน

**Verification:**
- [x] `uv run pytest tests/report_definition -q --cov=jester_api.report_definition` ≥ 90%

**Dependencies:** T3, T4, T5
**Files likely touched:** `report_definition/loader.py`, `tests/report_definition/test_loader.py`, `tests/report_definition/fixtures/*`
**Estimated scope:** M

### Checkpoint B

- [x] Success criteria 1–5 ของ spec ผ่าน (168 tests, coverage 99%)
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม `data-prep`
