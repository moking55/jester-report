# Spec: `report-definition`

สถานะ: **อนุมัติแล้ว 14 พ.ย. 2026** (ปรับตาม interview 13 พ.ย. 2026)
Module id: `report-definition` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: — · ถูกใช้โดย: `data-prep`, `binder`, `template-store`, `public-api` (`validateDraft`)
อ้างอิง: [T13 template options](docs/research/findings/13-template-options.md), [T16 data contract](docs/research/findings/16-data-contract.md), [T10 grouping](docs/research/findings/10-grouping-totals.md), [T11 master-detail](docs/research/findings/11-master-detail.md), [spike M0 REPORT](spikes/m0/REPORT.md), [OpenAPI draft](apps/api/openapi/public-api.yaml)

## สมมติฐาน (แก้ได้ก่อนอนุมัติ)

1. **รูปแบบ = hybrid แบบเล็ก (ผู้ใช้ยืนยัน: ไม่มี band, HTML ไฟล์เดียว):** `report.json` ประกาศโครงสร้างข้อมูล (parameters, data schema, คำนวณ, กลุ่ม, ยอดรวม, หน้า, ฟอนต์) ส่วน layout เป็น `template.html` (Jinja2) ที่เขียนเอง ไม่มีแนวคิด "band" เป็นข้อมูลใน `report.json`
   - title/detail/group header/group footer/summary เกิดจากการวนลูปบน view model ที่ `data-prep` จัดกลุ่มให้แล้ว
   - page header/footer คือไฟล์ `header.html`/`footer.html`
2. **Data schema แยกไฟล์ (ผู้ใช้ยืนยัน):** `data.schema.json` (JSON Schema Draft 2020-12) ให้แก้ใน Studio ได้ตรง ๆ และใช้ซ้ำกับ validator มาตรฐาน
3. **ภาษา expression เล็กและปิด สองโหมด (ผู้ใช้ยืนยัน):** `report.json` มี `"expressionMode": "basic" | "advanced"` ค่าเริ่มต้น `basic`
   - `basic`: ตัวเลขฐานสิบ, `+ - * /`, วงเล็บ, อ้างอิงชื่อ field, `round sum count min max`
   - `advanced`: เพิ่ม `if(cond, a, b)`, `> >= < <= == !=`, `and or not` และ `abs`
   - parse เอง ไม่ใช้ `eval`; คำนวณด้วย `Decimal`; ไม่มี string หรือการต่อ string และไม่มีฟังก์ชันอื่นในทั้งสองโหมด
4. **เข้มงวด:**
   - field ที่ไม่รู้จักใน `report.json` เป็น error ไม่ทิ้งเงียบ ๆ และไม่เก็บไว้
   - มี `schemaVersion: 1` เพื่อ migrate ภายหลัง
5. **pure module:** ไม่อ่านไฟล์ ไม่เรียก network และไม่ render รับเนื้อหาไฟล์ของ draft/version เป็น input แล้วคืน definition ที่ parse แล้วพร้อมรายการปัญหา
6. **dependency ใหม่:** `jsonschema` (MIT) สำหรับตรวจ data schema และ `jinja2` (BSD-3) สำหรับตรวจ syntax ของ template ทั้งคู่ `binder`/`data-prep` ต้องใช้อยู่แล้ว

## Objective

กำหนดว่า "รายงานหนึ่งฉบับ" ประกอบด้วยอะไร และตรวจว่า definition ถูกต้องก่อนใช้ ให้ทุก module ต่อจากนี้เชื่อได้ว่า definition ที่ผ่านแล้ว**ใช้ได้จริง** ส่วนปัญหาถูกรายงานพร้อมไฟล์ บรรทัด และ JSON Pointer ให้ Studio ชี้ได้ตรงจุด

### User stories

- ในฐานะนักพัฒนาใน Studio เมื่อกด Validate หรือก่อน Publish ฉันเห็นปัญหาทั้งหมดพร้อมตำแหน่ง เช่น expression อ้าง field ที่ไม่มี, ไฟล์ asset หาย หรือ footer ใช้ฟอนต์ที่ engine ไม่มี
- ในฐานะ `data-prep` ฉันได้ parameters ที่มี type ชัด, data schema ที่ compile แล้ว และ expression ที่ parse เป็น tree พร้อมลำดับคำนวณ ไม่ต้อง parse ซ้ำ
- ในฐานะ `template-store` ฉันได้ sha256 ของ definition เพื่อผูก version ที่ publish แล้ว

## รูปแบบไฟล์

ไฟล์ข้อความใน draft หรือ version หนึ่งชุด:

| ไฟล์ | บังคับ | หน้าที่ |
| --- | --- | --- |
| `report.json` | ใช่ | definition (ด้านล่าง) |
| `template.html` | ใช่ | layout ของ body (Jinja2); `binder` แปลงเป็น `index.html` |
| `data.schema.json` | ใช่ | JSON Schema ของ `data` |
| `header.html`, `footer.html` | ไม่ | page header/footer ของ Gotenberg |
| `*.css`, `*.html` อื่น | ไม่ | partial/stylesheet ที่ template อ้างถึง |
| `sample*.json` | อย่างน้อย 1 ไฟล์ | ข้อมูลตัวอย่างสำหรับ validate/preview |

Asset (ภาพ/ฟอนต์) อยู่ใน object storage รับมาเป็นรายชื่อ (ชื่อ + ชนิด) ไม่ใช่เนื้อหา

### `report.json` (ตัวอย่างใบเสนอราคา)

```json
{
  "schemaVersion": 1,
  "name": "ใบเสนอราคา",
  "page": { "size": "A4", "orientation": "portrait",
            "marginsMm": { "top": 20, "bottom": 20, "left": 15, "right": 15 } },
  "fonts": { "body": ["TH Sarabun New"], "headerFooter": ["TH Sarabun New"] },
  "parameters": {
    "quoteId": { "type": "string", "required": true, "maxLength": 40 },
    "locale":  { "type": "enum", "values": ["th-TH"], "default": "th-TH" },
    "docDate": { "type": "date", "required": true }
  },
  "data": { "schema": "data.schema.json", "samples": ["sample.json"] },
  "lists": {
    "items": {
      "path": "/items",
      "id": "id",
      "computed": { "amount": "round(qty * unitPrice, 2)" }
    }
  },
  "totals": {
    "subtotal": "sum(items.amount)",
    "net": "subtotal - discount",
    "vat": "round(net * 0.07, 2)",
    "grand": "net + vat"
  }
}
```

ตัวอย่างโหมด advanced (หัก ณ ที่จ่าย 3% เมื่อลูกค้าเป็นนิติบุคคลและยอดตั้งแต่ 1,000 บาท):

```json
{
  "expressionMode": "advanced",
  "totals": {
    "withholding": "if(isJuristic == 1 and net >= 1000, round(net * 0.03, 2), 0)",
    "payable": "net + vat - withholding"
  }
}
```

### `report.json` (ส่วนที่ต่างกันในรายงานแบบกลุ่มและ master-detail)

```json
{
  "lists": {
    "records": {
      "path": "/records", "id": "id",
      "sort": ["region", "id"],
      "groupBy": { "key": "region", "totals": { "subtotal": "sum(amount)", "rows": "count()" } }
    }
  },
  "totals": { "grand": "sum(records.amount)" }
}
```

```json
{
  "lists": {
    "orders": { "path": "/orders", "id": "orderId",
                "totals": { "total": "sum(details.amount)" },
                "lists": { "details": { "path": "/details", "id": "detailId" } } }
  },
  "totals": { "grand": "sum(orders.total)" }
}
```

### กติกาของ field

| Field | กติกา |
| --- | --- |
| `schemaVersion` | ต้องเป็น `1` |
| `expressionMode` | `basic` (ค่าเริ่มต้น) หรือ `advanced`; ใช้ syntax ของ advanced ในโหมด basic = `EXPRESSION_MODE` error |
| `page.size` | `A4` เท่านั้นใน v1; `orientation` = `portrait`/`landscape`; margin 0–50 mm |
| `fonts.body` | ชื่อ family; ต้องเป็นฟอนต์ใน image หรือมี asset ฟอนต์ที่ประกาศ family นั้น |
| `fonts.headerFooter` | ต้องเป็นฟอนต์ที่ติดตั้งใน image เท่านั้น (D1) ไม่งั้น `FONT_MISSING` |
| `parameters.*.type` | `string`, `integer`, `decimal`, `date`, `boolean`, `enum`; `default` ต้องผ่าน type ของตัวเอง; `required` กับ `default` ใช้พร้อมกันไม่ได้ |
| `data.schema` / `data.samples` | ต้องเป็นไฟล์ใน draft; sample ทุกไฟล์ต้องผ่าน data schema |
| `lists.<name>.path` | JSON Pointer ไปยัง array ใน data (สัมพัทธ์กับ parent ถ้าเป็น list ซ้อน); ซ้อนได้ **ลึก 1 ระดับ** (T11) |
| `lists.<name>.id` | field ที่ unique ภายใน list; `data-prep` ตรวจค่าซ้ำตอน runtime |
| `sort` | รายชื่อ field เรียงจากน้อยไปมาก; `groupBy.key` ต้องเป็นตัวแรกของ `sort` ถ้ามีทั้งคู่ |
| `computed` | field ใหม่ต่อแถว ห้ามชื่อซ้ำกับ field ใน schema |
| `totals` (ระดับ report, list, group) | ชื่อ → expression; อ้างได้เฉพาะชื่อที่นิยามก่อนหน้าในลำดับ topological ห้ามวงวน |

### ภาษา expression

```
expr     := term (("+" | "-") term)*
term     := factor (("*" | "/") factor)*
factor   := NUMBER | ref | call | "(" expr ")" | "-" factor
ref      := NAME ("." NAME)*            # field ของแถว, ชื่อ total, top-level data field, list.field
call     := ("round" "(" expr "," INT ")") | (("sum"|"min"|"max") "(" ref ")") | "count" "(" ")"

# advanced = basic +
call     += "if" "(" cond "," expr "," expr ")" | "abs" "(" expr ")"
cond     := cmp (("and" | "or") cmp)* | "not" cond | "(" cond ")"
cmp      := expr ("<" | "<=" | ">" | ">=" | "==" | "!=") expr
```

- เงื่อนไขเปรียบเทียบได้เฉพาะตัวเลข (ค่าใช่/ไม่ใช่ใน data แทนด้วย 0/1 ผ่าน schema; ภาษาไม่มี type boolean) และ `if` ประเมินเฉพาะกิ่งที่เลือก

- `round` ใช้ `ROUND_HALF_UP` ตาม assumption ของ T10 (ต้องให้ธุรกิจยืนยัน)
- `sum` ของ list ว่างได้ `0`; `min`/`max` ของ list ว่างเป็น error ตอน runtime
- ทุก ref ต้องตรวจได้ตอน validate ว่าชี้ field ที่มีใน data schema หรือชื่อที่นิยามไว้ และ field นั้นต้องเป็นตัวเลข (`number`/`integer` หรือ `string` ที่มี `format: decimal`)
- หารด้วยศูนย์เป็น error ตอน runtime ไม่ให้ผลเป็น infinity หรือ 0

### กติกาตรวจ template (lint แบบ static)

| ตรวจ | ระดับ | ที่มา |
| --- | --- | --- |
| Jinja2 syntax ของ `template.html`, `header.html`, `footer.html`, partial | error + บรรทัด | — |
| ตัวแปรระดับบนสุดที่ template ใช้ต้องเป็น `params`, `data`, `lists`, `totals`, `fmt`, `meta` | error | — |
| `<tfoot` ใน template ใดก็ตาม | error | D4 |
| `@font-face` ใน `header.html`/`footer.html` | error | D1 |
| `font-family` ใน header/footer ที่ไม่อยู่ใน `system_fonts` | `FONT_MISSING` (warning `FONT_UNVERIFIED` ถ้า `system_fonts` เป็น `None`) | D1/D2 |
| อ้างไฟล์ (`src`, `href`, `url()`) ที่ไม่มีใน draft/asset | error | `engine-client` failOn |
| อ้าง URL ภายนอก (`http:`, `https:`, `//`, `file:`) | error | threat model T04 |
| ไฟล์ชื่อ `index.html` | error | OpenAPI review ข้อ 1 |

การตรวจระดับ field ใน template เช่น `{{ item.amont }}` ไม่ได้ทำใน module นี้ เพราะต้องรู้ context ของลูป จะจับได้ตอน trial bind ด้วย sample data ใน `binder` (StrictUndefined) แล้ว `public-api` รวมผลใน `validateDraft`

## Interface

```python
@dataclass(frozen=True)
class Problem:
    severity: Literal["error", "warning"]
    code: str                       # เช่น DEFINITION_INVALID, EXPRESSION_INVALID, FONT_MISSING, FILE_MISSING
    message: str                    # ไม่มีค่าจาก data จริง
    file: str | None = None
    line: int | None = None
    column: int | None = None
    pointer: str | None = None      # JSON Pointer ภายในไฟล์ เช่น /totals/vat

@dataclass(frozen=True)
class DefinitionInput:
    files: Mapping[str, str]                 # ชื่อไฟล์ข้อความ → เนื้อหา
    assets: Mapping[str, AssetInfo]          # ชื่อ asset → (content_type, sha256, font_family | None)
    system_fonts: frozenset[str] | None      # family ที่ยืนยันแล้วว่ามีใน engine; None = ตรวจไม่ได้ (engine ล่ม)

@dataclass(frozen=True)
class DefinitionResult:
    definition: ReportDefinition | None      # None เมื่อมี error ระดับ error
    problems: list[Problem]
    sha256: str                              # hash เหนือไฟล์ทั้งหมด + asset hashes เรียงตามชื่อ

def load_definition(inp: DefinitionInput) -> DefinitionResult: ...
```

`ReportDefinition` เป็น immutable object ที่มี page, fonts, parameters (typed), data schema ที่ compile แล้ว, lists (tree), expression ที่ parse แล้วพร้อมลำดับคำนวณ และชื่อไฟล์ template ทั้งหมด

กติกาสำคัญ: **คืนปัญหาทั้งหมดในครั้งเดียว** ไม่หยุดที่ error แรก เว้นแต่ `report.json` parse ไม่ได้เลย

### ที่มาของ `system_fonts` (ผู้ใช้ยืนยัน)

Gotenberg ไม่มี API บอกรายชื่อฟอนต์ (route `/debug` มีแค่เวอร์ชันและ flags — ทดสอบจริง 13 พ.ย. 2026) จึงให้ `render-service` **probe** ตอนต้องใช้:
- render หน้าเปล่าที่มี `header.html` ตั้ง `font-family: "<family>"` 1 ครั้งต่อ family ที่ยังไม่เคยเช็ก แล้วอ่านชื่อฟอนต์ที่ฝังใน PDF
- มี family เมื่อชื่อฟอนต์ที่ฝัง (ตัด subset prefix, ช่องว่าง และ `-`, ตัวพิมพ์เล็ก) ขึ้นต้นด้วยชื่อ family แบบเดียวกัน — ทดสอบแล้วถูกทั้ง `TH Sarabun New`, `Noto Sans Thai` (มี) และ `Tahoma`, `Sarabun`, ชื่อที่ไม่มีจริง (ไม่มี; ได้ fallback Noto)
- เทียบกับ fallback อย่างเดียวใช้ไม่ได้ เพราะ fallback ของ image คือ Noto Sans Thai เอง
- เก็บผลใน memory ของ API จน restart; engine ล่ม → ส่ง `None` ให้ module นี้ (ได้ warning ไม่ใช่ error)
- ข้อจำกัด: ฟอนต์ที่ชื่อภายในไฟล์ต่างจากชื่อ family จะถูกรายงานว่าไม่มี — แก้ได้ด้วยการตั้งชื่อให้ตรงกันใน image ของเรา

การ probe เป็นงานของ `render-service` ไม่ใช่ module นี้ (module นี้ไม่เรียก network)

## Tech Stack

Python ≥3.11, `pydantic` v2 (มีแล้ว), `jsonschema` ≥4.23, `jinja2` ≥3.1 · test: `pytest`

## Commands

```bash
cd apps/api
uv add jsonschema jinja2
uv run ruff check . && uv run ruff format --check .
uv run pytest tests/report_definition -q --cov=jester_api.report_definition --cov-report=term-missing
```

## Project Structure

```
apps/api/src/jester_api/report_definition/
  __init__.py        → load_definition, ReportDefinition, Problem, DefinitionInput, DefinitionResult
  model.py           → pydantic models ของ report.json (strict, extra="forbid")
  expressions.py     → tokenizer + parser + ref resolution + topological order
  lint.py            → ตรวจ template/header/footer (syntax, tfoot, font-face, refs, URL)
  loader.py          → load_definition: รวมทุกขั้นและคืน problems
apps/api/tests/report_definition/
  fixtures/quotation|sales|purchase-order/   → definition ของรายงานอ้างอิง 3 แบบ (ต่อจาก spike)
  test_model.py  test_expressions.py  test_lint.py  test_loader.py
```

## Code Style

```python
def _check_header_footer_fonts(name: str, html: str, system_fonts: frozenset[str]) -> list[Problem]:
    problems = []
    if FONT_FACE.search(html):
        problems.append(Problem("error", "HEADER_FONT_FACE", "@font-face is ignored in header/footer; "
                                "use a font installed in the engine image", file=name, line=_line_of(html, "@font-face")))
    for family, line in _font_families(html):
        if family not in system_fonts:
            problems.append(Problem("error", "FONT_MISSING", f"font {family!r} is not installed in the engine",
                                    file=name, line=line))
    return problems
```

ฟังก์ชันเล็กที่คืน list ของ `Problem`, ไม่มี exception สำหรับปัญหาของผู้ใช้, ไม่มี global state, type hints ครบ, `ruff` ตาม `apps/api/pyproject.toml`

## Testing Strategy

- **Unit ต่อกติกา:** ทุกแถวในตาราง "กติกาของ field", "ภาษา expression" และ "lint" มี test ที่ fail เมื่อกติกาหาย อย่างละอย่างน้อย 1 กรณีผ่าน + 1 กรณีไม่ผ่าน และตรวจตำแหน่ง (file/line/pointer) ที่รายงาน
- **Expression mode:** syntax ของ advanced ในโหมด basic ได้ `EXPRESSION_MODE`; `if` ที่กิ่งไม่ถูกเลือกหารศูนย์ไม่ error
- **Expression:** parse ถูก, ลำดับ topological, ตรวจวงวน (`a = b + 1`, `b = a`), ref ไม่มีจริง, ref ไม่ใช่ตัวเลข, ห้าม syntax นอก grammar (เช่น `__import__`, `a.b()`, `a if b else c`) โดยต้องไม่ใช้ `eval`/`exec`
- **Fixture 3 รายงานอ้างอิง:** quotation, sales grouped, purchase order ผ่านโดยไม่มีปัญหา และแต่ละไฟล์ทำให้เสียแบบเจาะจงแล้วได้ปัญหาที่คาด
- **รวมปัญหา:** definition ที่ผิด 5 จุดคืนปัญหาครบ 5 รายการในการเรียกครั้งเดียว
- Coverage ≥ 90% line ของ `report_definition`

## Boundaries

- **Always:** คืนปัญหาทั้งหมดพร้อมตำแหน่ง; ตรวจ expression ด้วย parser ของเราเอง; ใช้ `Decimal`; message ไม่ใส่ค่าจาก data จริง
- **Ask first:** เพิ่มฟังก์ชันหรือ operator ใน expression ทั้งสองโหมด; ยอม field ที่ไม่รู้จักใน `report.json`; เพิ่ม page size; เปลี่ยน `schemaVersion`; dependency นอกจาก `jsonschema`/`jinja2`
- **Never:** `eval`/`exec`/`ast.literal_eval` หรือ Jinja expression เป็นภาษาคำนวณยอด; อ่านไฟล์/เรียก network ใน module นี้; เดา fallback (เช่น ใช้ default ที่ไม่ได้ประกาศ)

## Success Criteria

1. Definition ของรายงานอ้างอิงทั้ง 3 แบบ (quotation, sales grouped, purchase order) ผ่าน `load_definition` โดยไม่มีปัญหา
2. ทุกกติกาในตาราง field/expression/lint มี test ผ่าน และรายงานตำแหน่งถูกต้อง
3. Expression ที่อยู่นอก grammar ทั้งหมดถูกปฏิเสธเป็น `EXPRESSION_INVALID` โดยไม่มีการ execute code
4. `sha256` เหมือนเดิมเมื่อเนื้อหาเหมือนเดิม (ลำดับ key ใน dict ไม่มีผล) และเปลี่ยนเมื่อไฟล์หรือ asset ใดเปลี่ยน
5. Coverage ≥ 90%, `ruff` สะอาด

## Open Questions

ปิดแล้วทั้งหมดจาก interview 13 พ.ย. 2026: ไม่มี band (HTML ไฟล์เดียว), expression สองโหมด basic/advanced, data schema แยกไฟล์, รายชื่อฟอนต์จากการ probe engine

## Out of scope

band ใน `report.json`, block editor, การรันโค้ดของผู้ใช้, string และการต่อ string ในภาษาคำนวณ, config รายชื่อฟอนต์, list ซ้อนเกิน 1 ระดับ, page size อื่นนอกจาก A4

# v1.4: ป้ายของ parameter (F0)

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.4

## การเปลี่ยนแปลง

`Parameter` ใน `report.json` รับเพิ่มสองช่อง (เลือกใส่ได้, ไม่กระทบการตรวจค่าและการ render):

```json
"parameters": {
  "invoiceNo": { "type": "string", "required": true, "maxLength": 40,
                 "title": "เลขที่ใบกำกับภาษี", "description": "เช่น INV-2026-0001" }
}
```

| ช่อง | กติกา | ผิดกติกา |
| --- | --- | --- |
| `title` | string 1–80 ตัวอักษร | `DEFINITION_INVALID` ที่ pointer ของช่องนั้น (แบบเดียวกับช่องอื่นของ `Parameter`) |
| `description` | string 1–300 ตัวอักษร | `DEFINITION_INVALID` |

`data.schema.json` ใช้ `title`/`description`/`default` ของ JSON Schema ได้อยู่แล้ว (Draft 2020-12 เป็น annotation) — ไม่มีการเปลี่ยนแปลง

## Testing Strategy v1.4

- `report.json` ที่มี `title`/`description` ผ่าน `load_definition`; ยาวเกินหรือไม่ใช่ string → `DEFINITION_INVALID`
- report เดิมที่ไม่มีสองช่องนี้ผ่านเหมือนเดิม (test เดิมผ่านโดยไม่แก้)

## Success Criteria v1.4

1. parameter มีป้ายภาษาไทยได้โดย report เดิมไม่ต้องแก้
2. test เดิมผ่าน, coverage และ `ruff` เท่าเดิม

# v1.8: การจัดหน้า (L1)

สถานะ: **อนุมัติ 20 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.8 · `schemaVersion` คง `1` (ทุก field ใหม่มีค่าเริ่มต้น = แบบเดิม)

## `page`

| field | ค่า | กฎ |
| --- | --- | --- |
| `size` | `A3` `A4` `A5` `A6` `B5` `Letter` `Legal` `DL` `custom` `roll` | ค่าเริ่ม `A4` |
| `orientation` | `portrait` / `landscape` | ใช้กับขนาดสำเร็จรูปและ `custom`; `roll` ต้องไม่ระบุหรือเป็น `portrait` |
| `widthMm`, `heightMm` | ตัวเลข | ต้องมีเมื่อ `custom` เท่านั้น: กว้าง 25–1000, สูง 25–2000 |
| `rollWidthMm` | `58` / `80` | ต้องมีเมื่อ `roll` เท่านั้น |
| `layout` | `flow` (ค่าเริ่ม) / `free` | `free` ใช้กับ `roll` ไม่ได้ |
| `marginsMm` | เดิม (0–50) | `free` → ไม่ใช้ (พิกัดนับจากขอบกระดาษ); `roll` ค่าเริ่ม บน 3 ล่าง 3 ซ้าย 2 ขวา 2 |

- ขนาดสำเร็จรูป (mm, แนวตั้ง): A3 297×420 · A4 210×297 · A5 148×210 · A6 105×148 · B5 176×250 · Letter 215.9×279.4 · Legal 215.9×355.6 · DL 110×220
- หลังหักขอบต้องเหลือพื้นที่เนื้อหาอย่างน้อย 20 mm ทั้งกว้างและสูง ไม่งั้น `PAGE_INVALID`
- error ใหม่: `PAGE_INVALID` (ขนาด/ค่าไม่เข้ากัน ชี้ pointer ใน `report.json`)

## list ซ้อน

- `lists.<name>.lists` ซ้อนได้ **ลึก 3 ชั้น** (list → ลูก → หลาน); ลึกกว่านั้น = error เดิม (ข้อความเป็น "3 levels")
- `totals` ของ list ลูก/หลาน = ยอดต่อแถวแม่ (ดู SPEC-data-prep v1.8)
