# Tasks: `data-prep`

แผน: [plan.md](plan.md) · Spec: [SPEC-data-prep.md](../../SPEC-data-prep.md)
คำสั่ง test: `cd apps/api && uv run ruff check . && uv run pytest tests/data_prep -q --cov=jester_api.data_prep --cov-report=term-missing`

## Phase 1: ชิ้นส่วนอิสระ

### T1: formatters

**Description:** `money(v, places=2)`, `number(v, places=0)`, `thai_date(d)`, `thai_date_short(d)`, `baht_text(v)` ตามตารางใน spec; `None` → `""`; ค่าผิดชนิด → `ValueError`

**Acceptance criteria:**
- [ ] `baht_text` ตรงอย่างน้อย 15 ค่า: 0, 1, 11, 21, 101, 111, 1,000,001, 21,000,000, 1,000,000,000,000, 0.50, 21.25, 3,210.00, 0.005 (ปัดเป็น 0.01), -5, 100,000
- [ ] `thai_date` ครบ 12 เดือน, ปี พ.ศ. = ค.ศ. + 543; `thai_date_short` ใช้ชื่อย่อ
- [ ] `money(3210)` = `3,210.00`, `money(Decimal("1.005"))` = `1.01`, `money(-100.7)` ด้วย Decimal = `-100.70`

**Verification:**
- [ ] `uv run pytest tests/data_prep/test_formatters.py -q`

**Dependencies:** None
**Files likely touched:** `data_prep/formatters.py`, `tests/data_prep/test_formatters.py`
**Estimated scope:** S

### T2: evaluator

**Description:** คำนวณ AST (`Num`, `Ref`, `Neg`, `BinOp`, `Call`, `Compare`, `BoolOp`, `Not`) ใน `localcontext` (precision 28, `ROUND_HALF_UP`); ชื่อหาจาก environment ที่ผู้เรียกให้; aggregate รับ list ของค่า

**Acceptance criteria:**
- [ ] ทุกแถวในตาราง "กติกาการคำนวณ" มี test: round HALF_UP (1.005 → 1.01, -0.005 → -0.01), sum ว่าง = 0, min/max ว่าง = `EMPTY_AGGREGATE`, null = `VALUE_MISSING`, หารศูนย์ = `DIVISION_BY_ZERO`, `if` ไม่คำนวณกิ่งที่ไม่ถูกเลือก
- [ ] decimal context global เหมือนเดิมหลังเรียก (ตรวจ precision/rounding ก่อนและหลัง)

**Verification:**
- [ ] `uv run pytest tests/data_prep/test_evaluate.py -q`

**Dependencies:** None
**Files likely touched:** `data_prep/evaluate.py`, `tests/data_prep/test_evaluate.py`
**Estimated scope:** M

### T3: params

**Description:** ตรวจ params ที่ส่งมาเทียบกับ `report.parameters`: ไม่ได้ประกาศ, required ขาด, ชนิด/enum/date/decimal/maxLength ผิด; เติม default ที่ประกาศไว้

**Acceptance criteria:**
- [ ] `PARAM_UNKNOWN`, `PARAM_REQUIRED`, `PARAM_INVALID` พร้อม pointer `/params/<name>`
- [ ] default ถูกเติมเมื่อไม่ส่ง; ค่าที่ส่งมาชนะ default
- [ ] decimal param ได้ `Decimal`; message ไม่มีค่าที่ส่งมา

**Verification:**
- [ ] `uv run pytest tests/data_prep/test_params.py -q`

**Dependencies:** None
**Files likely touched:** `data_prep/params.py`, `tests/data_prep/test_params.py`
**Estimated scope:** S

### Checkpoint A

- [ ] tests T1–T3 ผ่าน, ruff สะอาด, decimal context global ไม่เปลี่ยน

## Phase 2: รวมเป็น view model

### T4: lists

**Description:** ดึง array ตาม `path` (list ลูกสัมพัทธ์กับแถวแม่); สร้าง row ใหม่โดยแปลง field ตัวเลขตาม schema เป็น `Decimal` (`float` → `NUMBER_IS_FLOAT`); ตรวจ `id` ซ้ำ; คำนวณ computed → list ลูก → totals ของแถว; sort แบบ stable; ตัดกลุ่มและคำนวณ `groupBy.totals`; คืน `ListView`/`Group`

**Acceptance criteria:**
- [ ] `DUPLICATE_ID` ชี้ตำแหน่งที่ซ้ำ; id ซ้ำข้าม parent คนละใบไม่ใช่ error
- [ ] `VALUE_MISSING` เมื่อ field ที่ใช้ sort/group หรือคำนวณเป็น null/ไม่มี
- [ ] กลุ่มเรียงตาม sort และตัดเมื่อค่า key เปลี่ยน; ไม่มีกลุ่มว่าง
- [ ] data ของผู้เรียกไม่ถูกแก้ (เทียบก่อน/หลัง)

**Verification:**
- [ ] `uv run pytest tests/data_prep/test_lists.py -q`

**Dependencies:** T2
**Files likely touched:** `data_prep/lists.py`, `tests/data_prep/test_lists.py`
**Estimated scope:** M

### T5: prepare + fixtures + specimens

**Description:** `prepare(definition, params, data, meta)`: params → ตรวจ data กับ schema (`DATA_INVALID`) → หยุดถ้ามี error → lists → report totals → `Prepared`; รวมปัญหาไม่เกิน 50 รายการ + `TOO_MANY_PROBLEMS`; test ด้วย fixture 3 แบบของ `report-definition` และ specimen ของ research

**Acceptance criteria:**
- [ ] quotation: subtotal 3100.70, net 3000.00, vat 210.00, grand 3210.00
- [ ] sales: North 2000.00 / South 400.00 / grand 2400.00 เรียง North, South; `sample-empty.json` ได้ grand 0.00 และไม่มีกลุ่ม
- [ ] PO: PO01 350.00, PO02 0.00, grand 350.00
- [ ] specimen `grouped-cases.json` และ `master-detail-cases.json` ได้ผลหรือ error ตรง expected
- [ ] เรียกซ้ำด้วย input เดิมได้ผลเท่ากัน; ค่าลับใน data ไม่ปรากฏใน message ใด

**Verification:**
- [ ] `uv run pytest tests/data_prep -q --cov=jester_api.data_prep` ≥ 90%

**Dependencies:** T1, T3, T4
**Files likely touched:** `data_prep/{__init__,prepare}.py`, `tests/data_prep/test_prepare.py`
**Estimated scope:** M

### Checkpoint B

- [ ] Success criteria 1–5 ของ spec ผ่าน
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม `binder`
