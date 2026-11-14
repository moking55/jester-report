# Spec: `data-prep`

สถานะ: **อนุมัติแล้ว 14 พ.ย. 2026** (ปรับตาม interview)
Module id: `data-prep` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: `report-definition` · ถูกใช้โดย: `binder`, `render-service`
อ้างอิง: [SPEC-report-definition.md](SPEC-report-definition.md), [T10 grouping/totals](docs/research/findings/10-grouping-totals.md), [T11 master-detail](docs/research/findings/11-master-detail.md), [T16 data contract](docs/research/findings/16-data-contract.md), fixture รายงานอ้างอิงใน [apps/api/tests/report_definition/fixtures](apps/api/tests/report_definition/fixtures/quotation/template.html)

## สมมติฐาน (แก้ได้ก่อนอนุมัติ)

1. **ตัวเลขจากผู้เรียก (ผู้ใช้ยืนยัน):** ผู้เรียกส่งตัวเลข JSON ธรรมดาได้ (เช่น `"unitPrice": 1250.5`)
   - `public-api` parse body ด้วย `parse_float=Decimal` ตั้งแต่รับ request จึงได้ `Decimal("1250.5")` ตรงตามข้อความ ไม่ผ่าน float
   - `data-prep` รับ `int`, `Decimal` และ string ที่ตรง `format: decimal`
   - ถ้ามี `float` หลุดมาถึง `data-prep` ถือเป็น bug ภายในของเรา (เช่นโค้ดที่เรียกตรงโดยไม่ผ่าน `public-api`) ตอบ `NUMBER_IS_FLOAT` ไม่แปลงเงียบ ๆ — เหตุผล: float ทำให้ยอดเงินเพี้ยน (T10)
2. **Parameter ที่ไม่ได้ประกาศ (ผู้ใช้ยืนยัน):** เป็น error `PARAM_UNKNOWN` ไม่ทิ้งเงียบ ๆ ช่วยจับชื่อพิมพ์ผิดจากระบบที่เรียก
3. **Formatter ภาษาไทยเท่านั้นใน v1 (ผู้ใช้ยืนยัน):**
   - มี `money`, `number`, `thai_date`, `thai_date_short`, `baht_text`
   - ไม่มีชุดภาษาอังกฤษ; ตัด `en-US` ออกจากตัวอย่าง `locale` ใน fixture และใน SPEC-report-definition เพื่อไม่ให้เข้าใจผิดว่ารองรับ
4. **ไม่มีเวลาปัจจุบันใน module:** `meta` (template id/version, run id, เวลาที่สร้างเอกสาร) ผู้เรียกส่งเข้ามา ผลจึงเหมือนเดิมทุกครั้งเมื่อ input เหมือนเดิม
5. **ลำดับกลุ่ม และกลุ่มว่าง (ผู้ใช้ยืนยัน: ไม่แสดงกลุ่มที่ไม่มีแถว):** เรียงตาม `sort` ก่อน (stable sort จากน้อยไปมาก) แล้วตัดกลุ่มเมื่อค่า `groupBy.key` เปลี่ยน แบบ Jasper (T10) ถ้าไม่ประกาศ `sort` ใช้ลำดับเดิมของ data

## Objective

แปลง `ReportDefinition` + params + data จากผู้เรียก ให้เป็น **view model** ที่ template ใช้ได้ทันที
- ตรวจ params และ data
- เรียงลำดับและจัดกลุ่ม
- คำนวณ computed/totals ด้วย `Decimal`
- เตรียม formatter ภาษาไทย

ยอดทุกตัวคำนวณที่ server จาก expression ใน definition ไม่เชื่อยอดที่ผู้เรียกส่งมา (T16) ปัญหาทั้งหมดคืนพร้อมตำแหน่ง (JSON Pointer ใน request) ไม่มีค่าจาก data ในข้อความ

### User stories

- ในฐานะ `render-service` ฉันส่ง definition, params, data และ meta แล้วได้ view model หรือรายการปัญหาที่แปลงเป็น 422 `INPUT_INVALID` ได้ตรง ๆ
- ในฐานะผู้เขียน template ฉันวนลูป `lists.items`, `lists.records.groups`, `order.details` และใช้ `totals.grand`, `fmt.money(...)` ได้ตามตัวอย่างใน fixture
- ในฐานะ Studio ฉันเรียกด้วย sample data เพื่อแสดงแท็บ "Prepared data" ได้ (ผู้เรียกคือ `render-service`)

## Interface

```python
@dataclass(frozen=True)
class Prepared:
    params: dict[str, Any]            # ค่าหลังตรวจ + default ที่ประกาศไว้; date คงเป็น "YYYY-MM-DD"
    data: Any                         # data เดิมของผู้เรียก (สำหรับ field ที่ไม่ได้อยู่ใน list)
    lists: dict[str, ListView]
    totals: dict[str, Decimal]
    meta: Mapping[str, Any]           # ส่งผ่านจากผู้เรียก
    fmt: Formatters

@dataclass(frozen=True)
class PrepareResult:
    prepared: Prepared | None         # None เมื่อมี error
    problems: list[Problem]           # Problem ของ report_definition (pointer เริ่มด้วย /params หรือ /data)

def prepare(definition: ReportDefinition, params: Mapping[str, Any], data: Any,
            meta: Mapping[str, Any]) -> PrepareResult: ...
```

### View model (สิ่งที่ template เห็น)

```python
class ListView(Sequence[Row]):      # วนลูปได้ตรง ๆ: {% for item in lists.items %}
    rows: list[Row]
    groups: list[Group]             # ว่างถ้า list นี้ไม่มี groupBy

@dataclass(frozen=True)
class Group:
    key: Any                        # ค่าของ groupBy.key
    rows: list[Row]
    totals: dict[str, Decimal]      # groupBy.totals

Row = dict[str, Any]                # field เดิม + computed + list totals; list ลูกเป็น ListView
```

ตัวเลขใน row ทุกตัวที่ data schema ระบุว่าเป็นตัวเลข (`integer`/`number`/`string`+`format: decimal`) แปลงเป็น `Decimal` ส่วน field อื่นคงชนิดเดิม

## ลำดับการทำงาน

1. **Params:** ทุก param ที่ส่งมาต้องประกาศไว้ (`PARAM_UNKNOWN`), param `required` ต้องมี (`PARAM_REQUIRED`), ชนิดต้องตรงตามกติกาเดียวกับ `default` ใน `report-definition` และ `maxLength` (`PARAM_INVALID`); ถ้าไม่ส่งและมี `default` ใช้ default
2. **Data:** ตรวจกับ data schema ด้วย validator และ format checker เดียวกับ `report-definition` (`DATA_INVALID` + pointer `/data/...`); เจอ float ที่ใดก็ตาม → `NUMBER_IS_FLOAT`
3. **Lists:** ดึง array ตาม `path`; `id` ซ้ำใน list เดียวกัน (ภายใน parent เดียวกันสำหรับ list ลูก) → `DUPLICATE_ID` ชี้ทั้งสองตำแหน่ง
4. **ต่อแถว** (จากลูกขึ้นแม่): แปลงตัวเลข → `computed` ตามลำดับใน `expressions.order` → list ลูก → `totals` ของแถว
5. **Sort และ group:** เรียงตาม `sort`; ข้อความไทยเรียงแบบพจนานุกรมอย่างง่าย คือสระหน้า (เ แ โ ใ ไ) เรียงตามพยัญชนะที่ตามมา เช่น กบ < แก้ว < ไก่ < เจริญ (ไม่ใช่ collation เต็มรูปแบบ, ไม่ใช้ ICU); ค่า `null`/ไม่มี ใน field ที่ใช้ sort หรือ group → `VALUE_MISSING`; ตัดกลุ่มแล้วคำนวณ `groupBy.totals`
6. **Report totals** ตามลำดับใน `expressions.order["/totals"]`

ถ้าขั้น 1–3 มี error ไม่ทำขั้น 4–6 (ข้อมูลยังไม่น่าเชื่อ) แต่ยังคืน error ทั้งหมดของขั้น 1–3 ในครั้งเดียว

### กติกาการคำนวณ

| เรื่อง | กติกา |
| --- | --- |
| ความแม่นยำ | `decimal` context ของตัวเอง: precision 28, `ROUND_HALF_UP` (ไม่แตะ context global) |
| `round(x, n)` | `quantize` ไป n ตำแหน่ง แบบ `ROUND_HALF_UP` (T10: 1.005 → 1.01, -0.005 → -0.01) |
| `sum` ของ list ว่าง | `0` |
| `min`/`max` ของ list ว่าง | error `EMPTY_AGGREGATE` |
| ค่าที่ใช้ในการคำนวณเป็น `null`/ไม่มี | error `VALUE_MISSING` ชี้แถวและ field ไม่แปลงเป็น 0 (T10) |
| หารด้วยศูนย์ | error `DIVISION_BY_ZERO` |
| ตัวเลขยาวเกิน precision จน `round` หรือการคำนวณทำต่อไม่ได้ | error `NUMBER_TOO_LARGE` (ไม่ crash); formatter ใน template ใช้ precision ไม่จำกัด จึงไม่ตัดหลัก |
| string ใน field ตัวเลขที่ไม่ใช่ทศนิยม (เช่น schema `["string", "number"]` ที่ไม่มี `format: decimal`) | ไม่แปลง; ถ้านำไปคำนวณ → error `VALUE_NOT_NUMERIC` |
| `if` | คำนวณเฉพาะกิ่งที่เลือก (กิ่งที่ไม่ถูกเลือกหารศูนย์ได้ไม่ error) |
| เปรียบเทียบ | เปรียบเทียบ `Decimal` ตรง ๆ |
| จำนวน error ระหว่างคำนวณ | เก็บสูงสุด 50 รายการ แล้วต่อท้ายด้วย `TOO_MANY_PROBLEMS` |

ไม่มี `eval`: evaluator เดิน AST จาก `report-definition` เอง

### Formatters (`fmt`)

| ฟังก์ชัน | ตัวอย่าง | กติกา |
| --- | --- | --- |
| `money(v, places=2)` | `3210` → `3,210.00`; `-100.7` → `-100.70` | คั่นหลักพันด้วย `,` ปัดแบบ `ROUND_HALF_UP` |
| `number(v, places=0)` | `1234.5, 1` → `1,234.5` | เหมือน `money` แต่กำหนดตำแหน่งเอง |
| `thai_date(d)` | `"2026-11-12"` → `12 พฤศจิกายน 2569` | ปี พ.ศ. = ค.ศ. + 543 |
| `thai_date_short(d)` | `"2026-11-12"` → `12 พ.ย. 2569` | ชื่อเดือนย่อ |
| `baht_text(v)` | `3210.00` → `สามพันสองร้อยสิบบาทถ้วน`; `0.50` → `ห้าสิบสตางค์`; `21.25` → `ยี่สิบเอ็ดบาทยี่สิบห้าสตางค์`; `-5` → `ลบห้าบาทถ้วน` | ปัดเป็นสตางค์ก่อน (`ROUND_HALF_UP`); "เอ็ด" เมื่อหลักหน่วยเป็น 1 และมีหลักอื่นนำ; "ยี่สิบ"; หลักล้านซ้ำได้ (`1000000000000` → `หนึ่งล้านล้านบาทถ้วน`) |

Formatter รับ `None` แล้วคืน `""` ไม่ throw เพราะ template อาจแสดง field ที่ไม่บังคับ ส่วนค่าผิดชนิด (เช่น string ที่ไม่ใช่ตัวเลข) throw `ValueError` ให้ `binder` รายงานพร้อมบรรทัดของ template

## Tech Stack

Python ≥3.11, stdlib `decimal`/`datetime`, `jsonschema` (มีแล้ว) — ไม่มี dependency ใหม่

## Commands

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check .
uv run pytest tests/data_prep -q --cov=jester_api.data_prep --cov-report=term-missing
```

## Project Structure

```
apps/api/src/jester_api/data_prep/
  __init__.py      → prepare, Prepared, PrepareResult, ListView, Group, Formatters
  params.py        → ตรวจและเติม params
  evaluate.py      → evaluator ของ AST + decimal context
  lists.py         → ดึง list, id ซ้ำ, computed/totals ต่อแถว, sort, group
  formatters.py    → money, number, thai_date, thai_date_short, baht_text
  prepare.py       → prepare: รวมทุกขั้น
apps/api/tests/data_prep/
  test_params.py  test_evaluate.py  test_lists.py  test_formatters.py  test_prepare.py
  (ใช้ fixture รายงานอ้างอิงจาก tests/report_definition/fixtures)
```

## Code Style

```python
def _eval(node: Node | Cond, env: Env) -> Decimal | bool:
    match node:
        case Num(value):
            return value
        case Ref(parts):
            return env.lookup(parts)          # raises _Missing -> VALUE_MISSING with row pointer
        case BinOp("/", left, right):
            divisor = _eval(right, env)
            if divisor == 0:
                raise _CalcError("DIVISION_BY_ZERO")
            return _eval(left, env) / divisor
        case Call("if", (cond, then, other)):
            return _eval(then, env) if _eval(cond, env) else _eval(other, env)
        ...
```

`match` บน AST ของ `report-definition`, ฟังก์ชันเล็ก, ไม่มี global state, error ภายในเป็น exception ส่วนตัวที่แปลงเป็น `Problem` ที่ขอบ module

## Testing Strategy

- **Fixture 3 รายงานอ้างอิงด้วย sample data:** ได้ยอดตรงกับ research
  - ใบเสนอราคา: subtotal 3,100.70, net 3,000.00, vat 210.00, grand 3,210.00
  - sales: North 2,000.00, South 400.00, grand 2,400.00, ได้ 2 กลุ่มตามลำดับ North, South; ชุด sample-empty ได้ grand 0.00 และไม่มีกลุ่ม
  - PO: PO01 350.00, PO02 0.00, grand 350.00
- **กรณีจาก specimen ของ research:** [grouped-cases.json](research/specimens/grouped-cases.json) และ [master-detail-cases.json](research/specimens/master-detail-cases.json) (rounding 1.005, ค่า null, id ซ้ำ, empty) ผลตรง expected
- **ทุกแถวในตารางกติกาการคำนวณ** มี test (รวมกิ่ง `if` ที่ไม่ถูกเลือกหารศูนย์)
- **Formatter:** ตารางกรณี `baht_text` อย่างน้อย 15 ค่า (0, 1, 11, 21, 101, 111, 1,000,001, ล้านล้าน, สตางค์, ติดลบ), `thai_date` ทุกเดือน
- **Determinism:** เรียก 2 ครั้งด้วย input เดิมได้ผลเท่ากัน และไม่แตะ decimal context global
- Coverage ≥ 90%

## Boundaries

- **Always:** `Decimal` ทุกที่ที่เป็นตัวเลข, context ของตัวเอง, คืนปัญหาพร้อม pointer, ข้อความไม่มีค่าจาก data
- **Ask first:** เพิ่ม formatter หรือภาษา; เปลี่ยนกติกาการปัด; ยอมรับ float; เปลี่ยนรูปร่าง view model (กระทบ `binder` และ template ของผู้ใช้)
- **Never:** `eval`/`exec`; ใช้เวลาปัจจุบันหรือ locale ของเครื่อง; แก้ data ของผู้เรียก (ทำสำเนา); แปลง null เป็น 0

## Success Criteria

1. Fixture ทั้ง 3 ด้วย sample ได้ยอดตามที่ระบุใน Testing Strategy ทุกตัว
2. กรณีใน specimen ของ research ได้ผลตรง expected (ยอดหรือ error ที่คาด)
3. ทุกกติกาในตารางคำนวณและ formatter มี test ผ่าน
4. Input เดิมได้ view model เดิม; decimal context global ไม่เปลี่ยนหลังเรียก
5. Coverage ≥ 90%, `ruff` สะอาด

## Open Questions

ปิดแล้วทั้งหมดจาก interview 14 พ.ย. 2026: รับตัวเลข JSON ธรรมดา (parse เป็น Decimal ที่ `public-api`), param ที่ไม่ได้ประกาศเป็น error, formatter ภาษาไทยเท่านั้น, ไม่แสดงกลุ่มที่ไม่มีแถว (ผู้เรียกส่งแถวยอด 0 เองได้)

## Out of scope

formatter ภาษาอังกฤษ, master list ของกลุ่ม (แสดงกลุ่มว่าง), การแปลง float แบบเงียบ ๆ, เวลาปัจจุบันใน module, page subtotal
