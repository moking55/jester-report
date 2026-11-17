# Spec: `binder`

สถานะ: **อนุมัติแล้ว 14 พ.ย. 2026** (ปรับตาม interview)
Module id: `binder` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: `report-definition`, `data-prep` (และชนิด `RenderFile`/`PageSetup` ของ `engine-client`) · ถูกใช้โดย: `render-service`, `public-api` (`validateDraft` ผ่าน trial bind)
อ้างอิง: [SPEC-report-definition.md](SPEC-report-definition.md), [SPEC-data-prep.md](SPEC-data-prep.md), [SPEC-engine-client.md](SPEC-engine-client.md), [spike M0 REPORT](spikes/m0/REPORT.md) (D1–D4), fixture ใน [apps/api/tests/report_definition/fixtures](apps/api/tests/report_definition/fixtures/quotation/template.html)

## สมมติฐาน (ผู้ใช้ยืนยันใน interview)

1. **ใครไว้ใจได้แค่ไหน:** ผู้เขียน template คือบัญชี Studio ที่ login แล้ว (ไว้ใจได้ระดับหนึ่ง) ส่วน data และ params มาจากระบบภายนอก ถือว่า **ไม่น่าไว้ใจ**
   - ป้องกันหลักจึงอยู่ที่ data: ค่าจาก data ต้องฉีด HTML ไม่ได้ และพาให้ engine ไปโหลด URL ภายนอกหรือในเครือข่ายภายในไม่ได้ (SSRF)
   - template ที่ตั้งใจทำลายระบบ (เช่น loop ซ้อนไม่รู้จบ) กันได้บางส่วน (sandbox, จำกัดขนาด output) ส่วนที่เหลือเป็นหน้าที่ timeout ของ `render-service`
2. **ค่าที่หายไป เน้น UX ให้ error น้อย:** ดูตาราง "กติกาค่าที่หายไป" — ไม่บังคับ = ว่างทุกชั้น, typo = error
3. **`template.html` เป็นส่วน body เท่านั้น** (ตามที่ fixture เขียน) `binder` ห่อเป็นเอกสาร HTML เต็มเอง พร้อม CSS พื้นฐานตาม D1–D4 ผู้เขียนไม่ต้องเขียน `<html>`/`<head>`
4. **asset ไม่ผ่าน `binder`:** `binder` คืนแค่ชื่อ asset ที่เอกสารอ้างถึง `render-service` ไปดึงเนื้อหาจาก object storage เอง (ไม่ส่ง asset ที่ไม่ได้ใช้ไปให้ engine)
5. **ไม่มี JavaScript ใน v1 และป้องกันสองชั้น:** ห้าม `<script>` และ attribute `on*=` ในเอกสารที่ bind แล้ว และรัน Gotenberg ด้วย `--chromium-disable-javascript` + `--chromium-allow-list` (เฉพาะไฟล์ใน request) — มีเงื่อนไข ดู "ชั้นป้องกันที่ engine"
6. **ฟอนต์ใน CSS พื้นฐาน:** ใช้แค่ `fonts.body` ตามลำดับที่ผู้เขียนประกาศ ไม่ต่อท้ายด้วย Tahoma/Noto (D2: ฟอนต์หาย = error ไม่ fallback เงียบ ๆ)

## Objective

นำ template ของรายงาน (`template.html`, `header.html`, `footer.html`, partial และ CSS) กับ view model จาก `data-prep` มารวมกันใน Jinja2 `SandboxedEnvironment` แล้วได้ไฟล์ชุดที่ส่งให้ `engine-client` ได้ทันที
- escape ค่าจาก data ทุกตัวตาม HTML (autoescape)
- ห่อ body เป็น `index.html` พร้อม CSS พื้นฐาน (D3 แถวแบ่งข้ามหน้าได้, หัวตารางซ้ำทุกหน้า) และ `@font-face` ของฟอนต์ asset
- เติม CSS ให้ header/footer ตาม D1 และผลรอบ 2 ของ spike (ฟอนต์ระบบตามชื่อ, `box-sizing: border-box`)
- ตรวจเอกสารที่ได้: ทุก resource ที่อ้าง (`src`, `href` ของ `<link>`, `url()`) ต้องเป็นไฟล์ใน draft หรือ asset; ไม่มี URL ภายนอก; ไม่มี script; ไม่มี `<tfoot>` (D4)

ปัญหาทั้งหมดคืนเป็น `Problem` พร้อมไฟล์และบรรทัดของ template ข้อความไม่มีค่าจาก data

### User stories

- ในฐานะ `render-service` ฉันส่ง definition, ไฟล์ template, รายชื่อ asset และ `Prepared` แล้วได้ `Bound` ที่ส่งเข้า `EngineClient.convert_html` ได้ตรง ๆ หรือรายการปัญหาที่แปลงเป็น 422 ได้
- ในฐานะผู้เขียน template ใน Studio เมื่อกด Validate ฉันเห็น `{{ item.amont }}` เป็น error ที่บรรทัดนั้น จาก trial bind ด้วย sample data
- ในฐานะระบบภายนอก ฉันไม่ส่ง field ที่ไม่บังคับ (เช่น `shipTo`) แล้วยังได้ PDF ที่ช่องนั้นว่าง ไม่ได้ error
- ในฐานะผู้ดูแลระบบ ฉันมั่นใจว่าระบบภายนอกที่ส่ง `"<img src=http://10.0.0.1/admin>"` หรือ `"http://169.254.169.254/..."` มาใน data ทำให้ engine โหลด URL นั้นไม่ได้

## Interface

```python
@dataclass(frozen=True)
class Bound:
    index_html: bytes                  # เอกสารเต็ม (UTF-8)
    header_html: bytes | None          # None ถ้า draft ไม่มี header.html
    footer_html: bytes | None
    files: tuple[RenderFile, ...]      # ไฟล์ข้อความที่เอกสารอ้างถึง (เช่น report.css) พร้อมเนื้อหา
    asset_names: tuple[str, ...]       # asset ที่เอกสารอ้างถึง เรียงตามชื่อ; render-service ดึงเนื้อหาเอง
    page: PageSetup                    # จาก report.page

@dataclass(frozen=True)
class BindResult:
    bound: Bound | None                # None เมื่อมี error
    problems: list[Problem]            # error + warning ของ report_definition (มี file + line ของ template)

def bind(definition: ReportDefinition, files: Mapping[str, str],
         assets: Mapping[str, AssetInfo], prepared: Prepared) -> BindResult: ...
```

`files` คือไฟล์ข้อความของ draft/version เดียวกับที่ใช้สร้าง `definition` (ชื่อ → เนื้อหา) และ `assets` คือรายชื่อ asset ชุดเดียวกับใน `DefinitionInput`
trial bind ไม่ใช่ฟังก์ชันแยก: `public-api` เรียก `prepare` ด้วย sample แต่ละไฟล์แล้วเรียก `bind` ตามปกติ

## กติกาค่าที่หายไป (ผู้ใช้ยืนยัน)

| กรณี | ตัวอย่าง | Validate (sample) | ใช้จริง |
| --- | --- | --- | --- |
| field ที่ schema บังคับ (`required`) ไม่ได้ส่งมา | ไม่มี `data.customer.name` | error `DATA_INVALID` (จาก `data-prep`) | error เหมือนกัน |
| field ไม่บังคับที่ไม่ได้ส่งมา | ไม่มี `data.customer.taxId` | แสดงเป็น `""` | แสดงเป็น `""` |
| object ไม่บังคับที่ไม่ได้ส่งมา | ไม่มี `data.shipTo`, template เขียน `{{ data.shipTo.address }}` | `""` (ไล่ลงไปได้ทุกชั้น) | `""` |
| array ไม่บังคับที่ไม่ได้ส่งมา | `{% for x in data.shipTo.lines %}` | วน 0 รอบ | วน 0 รอบ |
| ค่า `null` (ทั้ง scalar, object และ array) | `"taxId": null`, `"shipTo": null` | `""` / โครงว่าง / list ว่าง | เหมือนกัน |
| พิมพ์ object/list ทั้งก้อน | `{{ data.customer }}` | **warning** `TEMPLATE_PRINTS_OBJECT` + แสดง `""` | แสดง `""` (warning ติดไปกับผล ไม่ขวาง PDF) |
| ชื่อที่ schema ไม่มี (typo) | `{{ item.amont }}` | error `TEMPLATE_UNDEFINED` | error เหมือนกัน |

วิธีทำ:
- `data-prep` เติม property ที่ประกาศใน schema แต่ไม่ได้ส่งมา **ในสำเนา** (data ของผู้เรียกไม่ถูกแก้) ทั้งใน `data` และในแถวของทุก list: object → โครงว่างตาม `properties` ของมัน (ซ้อนลงไปทุกชั้น), array → `[]`, อื่น ๆ → `None`
  - เป็นการเปลี่ยน view model ของ `data-prep` (Boundaries ของ `data-prep` ระบุว่าต้องถาม — ผู้ใช้อนุมัติใน interview นี้แล้ว) และต้องอัปเดต SPEC-data-prep.md
  - schema ที่ไม่ได้ใช้ `properties` ตรง ๆ (เช่น `oneOf`, `$ref`) ไม่เติม — ถ้า template อ้าง field ข้างในโดยไม่ได้ส่งมาจะเป็น `TEMPLATE_UNDEFINED`
- `binder` ใช้ `StrictUndefined` จึงจับได้เฉพาะชื่อที่ไม่มีจริง และใช้ `finalize` ของ Jinja แสดง `None` เป็น `""` และ object/list เป็น `""` พร้อมเก็บ warning
- ผลข้างเคียงที่ผู้ใช้ยอมรับ: `{% if data.shipTo %}` เป็นจริงเสมอเมื่อ schema ประกาศ `shipTo` ไว้ ผู้เขียนต้องเช็ก field ข้างใน เช่น `{% if data.shipTo.address %}`

## ลำดับการทำงาน

1. **Environment:** `SandboxedEnvironment(autoescape=True, undefined=StrictUndefined, finalize=…, loader=DictLoader(ไฟล์ .html ของ draft))`, ลบ global `lipsum`; context มีแค่ `params`, `data`, `lists`, `totals`, `meta`, `fmt` จาก `Prepared.template_context()`
2. **Render** `template.html`, `header.html`, `footer.html` (ถ้ามี) ด้วย context เดียวกัน แบบ streaming (`generate()`) หยุดทันทีเมื่อขนาดรวมเกิน 20 MB (`OUTPUT_TOO_LARGE`, เท่ากับขีดจำกัดของ `engine-client`)
3. **ห่อ `index.html`:**
   ```html
   <!doctype html>
   <html lang="th"><head><meta charset="utf-8">
   <style>
     /* @font-face ของ asset ที่ font_family อยู่ใน fonts.body */
     body { font-family: <fonts.body ตามลำดับที่ประกาศ>; }
     thead { display: table-header-group; }   /* หัวตารางซ้ำทุกหน้า (spike) */
     tr { break-inside: auto; }               /* D3 */
   </style>
   </head><body>…template.html ที่ render แล้ว…</body></html>
   ```
   CSS พื้นฐานอยู่ก่อน CSS ของผู้เขียน ผู้เขียน override ได้
4. **header/footer:** เติม `<style>` นำหน้า: `font-family` ตาม `fonts.headerFooter` (ชื่อฟอนต์ระบบเท่านั้น ไม่มี `@font-face` ตาม D1) และ `body { box-sizing: border-box; }` (ผลรอบ 2 ของ spike) `<span class="pageNumber">` และ `totalPages` ผ่านไปถึง Gotenberg ตามเดิม
5. **ตรวจเอกสารที่ได้** (index, header, footer และ CSS ที่ถูกอ้าง) แบบ allow-list ที่เข้มกว่า lint: ทุก attribute ที่ทำให้ engine โหลด (`src`, `srcset`, `poster`, `data`, `href` นอก `<a>`, `xlink:href` ฯลฯ ทั้งแบบมี/ไม่มี quote และหลังถอด entity), `url()` และ `@import` ต้องเป็นชื่อไฟล์ใน draft หรือ asset ตรงตัว:
   - resource เป็น URL ภายนอก (`http:`, `https:`, `//`, `file:` ฯลฯ) → `RESOURCE_NOT_ALLOWED`
   - resource ไม่ใช่ไฟล์ใน draft หรือ asset → `RESOURCE_NOT_ALLOWED`
   - `data:` URI ยอมให้ผ่าน (โหลดจาก memory ไม่ออกเครือข่าย)
   - `<script>` หรือ attribute `on*=` → `SCRIPT_NOT_ALLOWED`
   - `<tfoot>` → `TFOOT_FORBIDDEN` (lint จับใน template แล้ว แต่ partial หรือค่า `|safe` อาจทำให้เกิดหลัง render)
6. **รวบรวมไฟล์:** ไฟล์ข้อความและ asset ที่ถูกอ้างจริง (รวมที่อ้างจาก CSS) ใส่ใน `files`/`asset_names`; partial `.html` ไม่ส่งให้ engine

### การแปลง error ของ Jinja เป็น `Problem`

| กรณี | code | severity | ตำแหน่ง |
| --- | --- | --- | --- |
| `UndefinedError` (ชื่อที่ไม่มีจริง) | `TEMPLATE_UNDEFINED` | error | ไฟล์ + บรรทัดจาก traceback ของ template |
| `SecurityError` ของ sandbox (เช่น `__class__`) | `TEMPLATE_UNSAFE` | error | ไฟล์ + บรรทัด |
| `ValueError` จาก formatter (เช่น `fmt.money("abc")`) | `TEMPLATE_ERROR` | error | ไฟล์ + บรรทัด; ข้อความของ formatter เอง (ไม่มีค่า) |
| exception อื่นระหว่าง render | `TEMPLATE_ERROR` | error | ไฟล์ + บรรทัด; ข้อความเป็นชื่อชนิด exception เท่านั้น |
| พิมพ์ object/list ทั้งก้อน | `TEMPLATE_PRINTS_OBJECT` | warning | ไฟล์ + บรรทัดเท่าที่หาได้; เก็บครั้งเดียวต่อบรรทัด |
| ขนาดเกิน | `OUTPUT_TOO_LARGE` | error | ไฟล์ที่กำลัง render |

Render หยุดที่ error แรกของแต่ละไฟล์ (Jinja ทำต่อไม่ได้) แต่ render ทุกไฟล์ (template, header, footer) เพื่อคืน error ของทุกไฟล์ในครั้งเดียว
ข้อความของ `UndefinedError` มีแค่ชื่อ attribute ที่มาจาก template ไม่มีค่าจาก data

## ชั้นป้องกันที่ engine (ผู้ใช้ยืนยัน มีเงื่อนไข)

- เพิ่ม args ของ Gotenberg: `--chromium-disable-javascript=true` และ `--chromium-allow-list` ที่ยอมเฉพาะไฟล์ใน request (ชื่อ flag และ regex ต้องยืนยันกับ Gotenberg 9.4.1 ตอน implement)
- **เงื่อนไข:** รัน spike fixture ซ้ำด้วย args ใหม่ แล้วตรวจด้วย poppler
  - รายงาน 500 แถว 19 หน้า: เลขหน้าใน footer ครบ 1/19 … 19/19 และหัวตารางซ้ำทุกหน้า
  - SP-A/B/C ผ่านทุก check เหมือนเดิม
  - URL ภายนอกและในเครือข่ายภายในถูก engine ปฏิเสธ แม้ไม่ผ่านการตรวจของ `binder`
- ถ้าเลขหน้าหายเมื่อปิด JS: เปิด JS ไว้ และใช้แค่ allow-list
- **ผลจริง (14 พ.ย. 2026, spike รอบ 3):** ผ่านทุกเงื่อนไข เลขหน้า 19/19 จึงปิด JS ได้ ข้อควรรู้: URL ที่ engine บล็อกไม่ทำให้ render fail (ได้ PDF ที่รูปหาย) จึงต้องมีการตรวจของ `binder` เป็นด่านแรกเสมอ; ต้องเพิ่ม `--api-start-timeout=90s` ไม่งั้น container หยุดเองตอนเปิด
- กระทบ `infra/` (args ของ container) และ SPEC-engine-client.md (บันทึก args); การแบ่งหน้าทั้งหมดใน v1 ยังเป็น CSS + Chromium (หัวตารางซ้ำ, `break-*`, เลขหน้า) ไม่ใช้ JS ของ template

## Tech Stack

Python ≥3.11, `jinja2` (มีแล้ว, ใช้ `jinja2.sandbox.SandboxedEnvironment`) — ไม่มี dependency ใหม่ (ไม่ใช้ HTML parser/sanitizer ภายนอก)

## Commands

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check .
uv run pytest tests/binder tests/data_prep -q --cov=jester_api.binder --cov-report=term-missing
uv run pytest tests/binder -q -m engine   # live: bind fixture แล้ว render กับ jester/gotenberg จริง (ต้องมี GOTENBERG_URL)
```

## Project Structure

```
apps/api/src/jester_api/binder/
  __init__.py      → bind, Bound, BindResult
  environment.py   → SandboxedEnvironment, finalize, แปลง exception เป็น Problem (ไฟล์/บรรทัด)
  document.py      → ห่อ index.html, CSS พื้นฐาน, @font-face ของ asset, CSS ของ header/footer
  resources.py     → ตรวจ resource/script/tfoot หลัง render และรวบรวมไฟล์ที่ถูกอ้าง
  bind.py          → bind: รวมทุกขั้น
apps/api/src/jester_api/data_prep/   → เติม property ที่ประกาศแต่ไม่ได้ส่งมา (ในสำเนา)
apps/api/tests/binder/
  test_environment.py  test_document.py  test_resources.py  test_bind.py  test_bind_engine.py (live)
infra/gotenberg/   → args ใหม่ของ engine (หลัง spike ผ่าน)
```

`EXTERNAL` และ `mask` ใน `report_definition/lint.py` เปลี่ยนเป็น public เพื่อใช้ร่วมกัน (ไม่เปลี่ยนพฤติกรรมของ lint)

## Code Style

```python
def _render(env: SandboxedEnvironment, name: str, context: dict[str, Any]) -> tuple[str | None, list[Problem]]:
    out, size = [], 0
    try:
        for chunk in env.get_template(name).generate(context):
            size += len(chunk.encode())
            if size > MAX_OUTPUT_BYTES:
                return None, [error("OUTPUT_TOO_LARGE", f"{name} is larger than 20 MB", file=name)]
            out.append(chunk)
    except UndefinedError as exc:
        return None, [error("TEMPLATE_UNDEFINED", exc.message or "undefined value", file=name, line=_line(exc))]
    ...
    return "".join(out), []
```

ฟังก์ชันเล็ก ไม่มี global state; exception ของ Jinja แปลงเป็น `Problem` ที่ขอบ module

## Testing Strategy

- **Fixture 3 รายงานอ้างอิง** (quotation, sales-grouped, purchase-order) กับ sample data: bind ผ่านไม่มี problem
  - `index.html` มีข้อความยอดที่ format แล้ว เช่น `3,210.00` และ `สามพันสองร้อยสิบบาทถ้วน`
  - header มีชื่อบริษัท, footer มี `<span class="pageNumber">`
  - `files` มี `report.css`; `asset_names` ของ quotation มี `logo.png`
- **ค่าที่หายไป:** ทุกแถวของตาราง "กติกาค่าที่หายไป" มี test (รวม object ไม่บังคับซ้อน 2 ชั้น, array ที่หาย, `null`, ฟิลด์ไม่บังคับในแถวของ list และ list ลูก) และ data ของผู้เรียกไม่ถูกแก้
- **Escape:** data `"<b>x</b>"` และ `"\" onerror=\"..."` ออกมาเป็น text ที่ escape แล้ว ไม่กลายเป็น tag หรือ attribute
- **SSRF:** template `<img src="{{ data.logo }}">` กับ data `http://10.0.0.1/x`, `//evil`, `file:///etc/passwd` → `RESOURCE_NOT_ALLOWED`; ค่า `|safe` ที่มี `<img src=http://...>` หรือ `<script>` ก็ถูกจับ
- **Typo:** `{{ item.amont }}` → `TEMPLATE_UNDEFINED` บรรทัดถูกต้อง ทั้งใน template และ partial ที่ `include`
- **Sandbox:** `{{ fmt.__class__ }}`, `{{ ''.__class__.__mro__ }}` → `TEMPLATE_UNSAFE`
- **Formatter error:** `fmt.money("abc")` → `TEMPLATE_ERROR` ที่บรรทัดนั้น
- **ขนาด:** loop ที่สร้าง output เกิน 20 MB หยุดด้วย `OUTPUT_TOO_LARGE` โดยไม่สร้างสตริงเต็มก่อน
- **Determinism:** bind ซ้ำด้วย input เดิมได้ bytes เท่ากัน
- **Live (marker `engine`):** bind fixture ใบเสนอราคาแล้วส่งเข้า engine จริง ตรวจด้วย poppler ว่าได้ยอดและข้อความไทยครบ, ฟอนต์ TH Sarabun New ทั้ง body และ header/footer
- **Spike ซ้ำด้วย args ใหม่ของ engine** ตามเงื่อนไขใน "ชั้นป้องกันที่ engine"
- Coverage ≥ 90%

## Boundaries

- **Always:** autoescape เปิด, `SandboxedEnvironment`, `StrictUndefined` สำหรับชื่อที่ไม่มีใน schema, ตรวจ resource หลัง render ทุกครั้ง, ข้อความ error ไม่มีค่าจาก data, เติมค่าที่หายในสำเนาเท่านั้น
- **Ask first:** เปิดให้ใช้ JavaScript, อนุญาต URL ภายนอก (แม้แค่บาง domain), เพิ่ม global/filter ใน environment, เปลี่ยน CSS พื้นฐาน (กระทบหน้าตาเอกสารของผู้ใช้ทุกคน), เพิ่ม dependency (เช่น HTML sanitizer), ถอย args ของ engine ถ้า spike ไม่ผ่านนอกเหนือจากทางถอยที่ตกลงไว้
- **Never:** `Environment` ธรรมดา (ไม่ sandbox), ปิด autoescape, ส่งไฟล์หรือ asset ที่ไม่ถูกอ้างไปให้ engine, เรียก engine หรือ object storage จาก module นี้, แสดง repr ของ object (`{'name': …}`) ลงในเอกสาร

## Success Criteria

1. Fixture ทั้ง 3 bind ผ่านด้วย sample data และ live test ได้ PDF ที่ยอดและข้อความไทยถูกต้อง ฟอนต์ TH Sarabun New ทั้ง body และ header/footer
2. ทุกแถวของ "กติกาค่าที่หายไป" ให้ผลตามตาราง
3. ค่า data ที่เป็น HTML, attribute injection หรือ URL ภายนอก/ภายใน ไม่ถูกส่งเป็น resource หรือ tag ให้ engine ในทุก test
4. ทุก code ในตาราง error มี test และชี้ไฟล์/บรรทัดถูกต้อง
5. Engine รันด้วย args ป้องกันที่ตกลงไว้ (หรือทางถอย) และ spike ซ้ำผ่านตามเงื่อนไข
6. bind ซ้ำได้ bytes เดิม; coverage ≥ 90%, `ruff` สะอาด

## Open Questions

ปิดแล้วทั้งหมดจาก interview 14 พ.ย. 2026: ไม่บังคับ = ว่างทุกชั้น (เติมโครงว่างตาม schema), พิมพ์ object ทั้งก้อน = warning + ว่าง, typo = error, ปิด JS + allow-list ที่ engine โดยมี spike เป็นเงื่อนไข, ฟอนต์พื้นฐานไม่มี fallback

## Out of scope

JavaScript/QR/chart, URL ภายนอก, HTML sanitizer แบบเต็ม (ป้องกันด้วย autoescape + ตรวจ resource/script หลัง render + allow-list ที่ engine), timeout ของการ render (หน้าที่ `render-service`), การดึง asset จาก object storage, ภาษาอื่นนอกจากไทย, page subtotal (ยอดยกมา/ยกไป)

---

# v1.1: Foundations (C1 — SVG จาก `fmt`)

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** · ที่มา: [SPEC-data-prep.md](SPEC-data-prep.md) หัวข้อ v1.1
หัวข้อ v1 ด้านบนยังใช้ทั้งหมด; "QR" ใน Out of scope ของ v1 หมายถึง QR ที่รัน JavaScript ซึ่งยังไม่ทำ — QR แบบ SVG ที่สร้างฝั่ง server ทำในรอบนี้ที่ `data-prep`

## สมมติฐาน v1.1

1. **ไม่ต้องแก้โค้ดของ binder:** `fmt.qr`/`fmt.barcode` คืน `Markup` ซึ่ง `_finalize` ปล่อยผ่านอยู่แล้ว (`Markup` เป็น `str`) และ autoescape ไม่ escape ซ้ำ
2. **ตรวจหลัง render ยังทำเหมือนเดิม:** SVG ผ่าน `check_resources` ทุกครั้ง — ถ้าวันหนึ่ง formatter ผลิต `href` หรือ `<script>` ออกมา จะถูกจับเป็น `RESOURCE_NOT_ALLOWED`/`SCRIPT_NOT_ALLOWED` ไม่ใช่หลุดไปถึง engine
3. `<svg xmlns="http://www.w3.org/2000/svg">` ไม่ใช่ resource ที่โหลด (`xmlns` ไม่อยู่ใน `_LOADS`) จึงไม่ถูกปฏิเสธ — ต้องมี test ยืนยัน

## Testing Strategy v1.1

- template ที่ใช้ `fmt.qr(fmt.promptpay(...))` และ `fmt.barcode(...)` bind แล้วไม่มี problem และ `index.html` มี `<svg` ตามจำนวนที่เรียก
- data ที่มี `</svg><script>alert(1)</script>` ส่งเข้า `fmt.qr` และ `fmt.barcode` code128 → ผลไม่มี `<script>` และไม่มี problem
- `ValueError` จาก formatter ใหม่ (เช่น ean13 ผิด) → `TEMPLATE_ERROR` ที่บรรทัดนั้น และข้อความไม่มีค่าจาก data (ตามกติกา v1)
- SVG ที่ถูกแก้ให้มี `xlink:href="http://x"` (สร้างใน test ด้วย `Markup` ตรง ๆ) → `RESOURCE_NOT_ALLOWED` — ยืนยันว่าตาข่ายชั้นที่สองยังทำงาน

## Success Criteria v1.1

1. QR และ barcode แสดงใน PDF ได้โดยไม่แก้โค้ดของ binder
2. test ด้านบนผ่าน, coverage และ `ruff` เท่าเดิม

## Open Questions v1.1

ไม่มี
