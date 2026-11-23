# รูปแบบรายงาน Jester (กติกาที่ระบบตรวจจริง)

ที่มา: `SPEC-report-definition.md`, `SPEC-binder.md`, `SPEC-data-prep.md`, `SPEC-template-store.md` ใน repo jester-report

## สารบัญ
1. ไฟล์ในรายงาน
2. report.json
3. ภาษา expression (computed / totals)
4. data.schema.json และ sample.json
5. template.html — สิ่งที่ template ใช้ได้
5ก. เขียนให้ Document Designer เปิดแก้ได้ (บล็อก) และแบบอิสระ
6. fmt.* (ตัวจัดรูปแบบ)
7. header.html / footer.html
8. asset
9. ข้อห้ามที่ทำให้ validate ไม่ผ่าน
10. zip ที่ import ได้
11. ตัวอย่างครบชุด (ใบเสร็จรับเงิน)

## 1. ไฟล์ในรายงาน

| ไฟล์ | บังคับ | หน้าที่ |
| --- | --- | --- |
| `report.json` | ใช่ | definition |
| `template.html` | ใช่ | body ของเอกสาร (Jinja2) |
| `data.schema.json` | ใช่ (ชื่อตามที่ `data.schema` ระบุ) | JSON Schema 2020-12 ของ `data` |
| `sample.json` | อย่างน้อย 1 (ชื่อตาม `data.samples`) | ข้อมูลตัวอย่าง ต้องผ่าน schema |
| `report.css`, `*.html` อื่น | ไม่ | stylesheet / partial ที่ template อ้าง |
| `header.html`, `footer.html` | ไม่ | หัว/ท้ายกระดาษทุกหน้า |

ชื่อไฟล์ข้อความ: `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(html|json|css)$` และห้ามชื่อ `index.html`
ชื่อ asset: `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|gif|svg|webp|avif|bmp|ttf|otf)$`
ขนาด: ไฟล์ข้อความ ≤ 1 MB, asset ≤ 5 MB, ไฟล์ข้อความ ≤ 50, asset ≤ 50, รวมทั้ง draft ≤ 20 MB
id ของรายงาน: `^[a-z0-9][a-z0-9-]{1,62}$`

## 2. report.json

```json
{
  "schemaVersion": 1,
  "name": "ใบเสร็จรับเงิน",
  "expressionMode": "basic",
  "page": { "size": "A4", "orientation": "portrait",
            "marginsMm": { "top": 20, "bottom": 20, "left": 15, "right": 15 } },
  "fonts": { "body": ["TH Sarabun New"], "headerFooter": ["TH Sarabun New"] },
  "parameters": {
    "receiptNo": { "type": "string", "required": true, "maxLength": 40,
                   "title": "เลขที่ใบเสร็จ", "description": "เช่น RC-2026-0001" },
    "issueDate": { "type": "date", "required": true, "title": "วันที่" }
  },
  "data": { "schema": "data.schema.json", "samples": ["sample.json"] },
  "lists": {
    "items": { "path": "/items", "id": "code",
               "computed": { "amount": "round(qty * unitPrice, 2)" } }
  },
  "totals": { "subtotal": "sum(items.amount)", "vat": "round(subtotal * 0.07, 2)", "grand": "subtotal + vat" }
}
```

| field | กติกา |
| --- | --- |
| `schemaVersion` | `1` เท่านั้น |
| `name` | 1–200 ตัวอักษร |
| `expressionMode` | `basic` (ค่าเริ่มต้น) หรือ `advanced` (เปิด `if`, `abs`, การเปรียบเทียบ) |
| `page` | ดู "กระดาษ" ใต้ตาราง |
| `fonts.body` | อย่างน้อย 1 family; ต้องมีใน engine (TH Sarabun New) หรือเป็น asset ฟอนต์ที่ประกาศ family นั้น |
| `fonts.headerFooter` | เฉพาะฟอนต์ใน engine (TH Sarabun New) |
| `parameters.<name>` | ชื่อ `^[A-Za-z_][A-Za-z0-9_]*$`; `type` = `string`/`integer`/`decimal`/`date`/`boolean`/`enum`; `required`, `default` (ห้ามใช้คู่กัน), `values` (เฉพาะ enum), `maxLength`, `title` (1–80), `description` (1–300) |
| `data` | `schema` = ชื่อไฟล์ schema, `samples` = รายชื่อไฟล์ตัวอย่าง (≥ 1) |
| `lists.<name>` | `path` JSON Pointer ไปยัง array ใน data (ขึ้นต้น `/`); `id` field ที่ไม่ซ้ำในแถว; `sort` รายชื่อ field; `computed` field ใหม่ต่อแถว (ห้ามชื่อซ้ำ field ใน schema); `groupBy {key, totals}`; `totals`; `lists` ซ้อนได้ลึก 3 ชั้น list → ลูก → หลาน (path สัมพัทธ์กับแถวแม่; `totals` ของลูก/หลานเป็นยอดต่อแถวแม่ คำนวณจากหลานขึ้นไป) |
| `totals` | ชื่อ → expression ระดับรายงาน อ้างชื่อ total อื่นได้แต่ห้ามวงวน |
| field อื่น | ไม่รับ (เขียน key ที่ไม่มีในตาราง = error) |

### กระดาษ (`page`)

| field | ค่า | กฎ |
| --- | --- | --- |
| `size` | `A3` `A4` `A5` `A6` `B5` `Letter` `Legal` `DL` `custom` `roll` | ค่าเริ่ม `A4` |
| `orientation` | `portrait` / `landscape` | `roll` ต้องไม่ระบุหรือเป็น `portrait` |
| `widthMm`, `heightMm` | ตัวเลข | ต้องมีเมื่อ `custom` เท่านั้น: กว้าง 25–1000, สูง 25–2000 |
| `rollWidthMm` | `58` / `80` | ต้องมีเมื่อ `roll` เท่านั้น |
| `layout` | `flow` (ค่าเริ่ม) / `free` | `free` ใช้กับ `roll` ไม่ได้ |
| `marginsMm` | `{top, bottom, left, right}` 0–50 | `free` ไม่ใช้ (พิกัดนับจากขอบกระดาษ); `roll` ค่าเริ่ม 3/3/2/2 |

- ขนาด mm (แนวตั้ง): A3 297×420 · A4 210×297 · A5 148×210 · A6 105×148 · B5 176×250 · Letter 215.9×279.4 · Legal 215.9×355.6 · DL 110×220
- หักขอบแล้วต้องเหลือเนื้อหาอย่างน้อย 20 mm ทั้งกว้างและสูง ไม่งั้น `PAGE_INVALID`
- เลือกตามต้นฉบับ: เอกสารทั่วไป A4; ใบเสร็จจากเครื่อง POS / slip เครื่องพิมพ์ความร้อน → `roll` (58 หรือ 80 ตามความกว้างกระดาษ,
  PDF ยาวเท่าเนื้อหาหน้าเดียว); แบบฟอร์มพิมพ์ทับ (เช็ค ซองจดหมาย DL ฟอร์มราชการที่ต้องลงช่องตรงตำแหน่ง) → `layout: "free"` ดูข้อ 5ก
- `roll` และ `free` ไม่มี header/footer (ไฟล์ที่ใส่มาถูกข้ามพร้อม warning `HEADER_FOOTER_IGNORED`) — อย่าใส่

กลุ่ม: `"sort": ["region", "id"], "groupBy": { "key": "region", "totals": { "subtotal": "sum(amount)" } }` (groupBy.key ต้องเป็นตัวแรกของ sort)
master-detail: `"orders": { "path": "/orders", "id": "orderId", "totals": { "total": "sum(details.amount)" },
"lists": { "details": { "path": "/details", "id": "detailId" } } }`

## 3. ภาษา expression

```
expr   := term (("+"|"-") term)*        term := factor (("*"|"/") factor)*
factor := NUMBER | ref | call | "(" expr ")" | "-" factor
ref    := NAME ("." NAME)*                # field ของแถว, ชื่อ total, field ระดับบนของ data, list.field
call   := round(expr, INT) | sum(ref) | min(ref) | max(ref) | count()
advanced: if(cond, expr, expr) | abs(expr); cond ใช้ < <= > >= == != and or not
```

- ทุก ref ต้องชี้ field ที่เป็นตัวเลข: `integer`/`number` หรือ `string` + `format: decimal`
- ไม่มี string ไม่มีการต่อข้อความ ไม่มี boolean (ใช้ 0/1)
- `round` ปัดแบบ half-up; หารด้วยศูนย์ = error; `sum` ของ list ว่าง = 0
- ใน `computed` ของ list อ้าง field ของแถวนั้นตรง ๆ (`qty * unitPrice`); ใน `totals` ของรายงานอ้าง `sum(items.amount)`

## 4. data.schema.json และ sample.json

- JSON Schema Draft 2020-12 เต็มรูป แต่ให้ใช้รูปที่ฟอร์ม "ออกเอกสาร" แสดงได้: object, string (`format` `date`/`decimal`, `enum`,
  `pattern`, `minLength`/`maxLength`), integer/number, boolean, array ของ object (เป็นตารางเพิ่ม/ลบแถว), array ของ string
- **เงิน/ทศนิยม = `{"type": "string", "format": "decimal"}`** ค่าใน sample เป็น `"1250.50"` (มีเครื่องหมายคำพูด)
  JSON number ที่มีจุดทศนิยมใน data ถูกปฏิเสธ จำนวนเต็มใช้ `integer` ได้
- วันที่ = `{"type": "string", "format": "date"}` รูปแบบ `YYYY-MM-DD`
- ใส่ `title` ภาษาไทยทุก property (รวมใน `items` ของ array) และ `description` ที่ช่วยคนกรอก; `required` ตามจริง;
  `additionalProperties: false` ที่ object ที่รู้โครงแน่นอน
- array ที่ใช้เป็น list ต้องมี field ที่ใช้เป็น `id` (เช่น รหัสสินค้าหรือเลขลำดับ) และค่าไม่ซ้ำกัน

## 5. template.html — สิ่งที่ template ใช้ได้

ตัวแปรระดับบนสุดมีแค่: `params`, `data`, `lists`, `totals`, `fmt`, `meta` (`meta.templateId`, `meta.version`, `meta.renderedAt`, `meta.blank`)

**ฟอร์มเปล่า (v1.14):** ผู้ใช้ออกรายงานเป็นฟอร์มเปล่าสำหรับเขียนมือได้ทุกตัว (`meta.blank` เป็น `true`) ตอนนั้นค่าที่ไม่ได้กรอก รวมทั้ง
`totals`/`computed` ที่คำนวณไม่ได้ จะเป็น `None` — `{{ }}` และ `fmt.*` พิมพ์ว่างให้เอง แต่การเปรียบเทียบตัวเลขต้องกันไว้:
`{% if totals.discount is not none and totals.discount > 0 %}` (เขียน `totals.discount > 0` ตรง ๆ ฟอร์มเปล่าจะ error ทั้งใบ)
ตารางรายการที่เป็นบล็อก Designer ได้บรรทัดเปล่าให้เขียนจากช่อง "บรรทัดเปล่าในฟอร์มเปล่า" ไม่ต้องเขียนเอง

```html
<link rel="stylesheet" href="report.css">
<img src="logo.png" alt="">
<h1>ใบเสร็จรับเงิน</h1>
<p>เลขที่ {{ params.receiptNo }} · วันที่ {{ fmt.thai_date(params.issueDate) }}</p>
<table>
  <thead><tr><th>ลำดับ</th><th>รายการ</th><th class="n">จำนวนเงิน</th></tr></thead>
  <tbody>
  {% for item in lists.items %}
    <tr><td>{{ loop.index }}</td><td>{{ item.description }}</td><td class="n">{{ fmt.money(item.amount) }}</td></tr>
  {% endfor %}
    <tr><td colspan="2">รวมทั้งสิ้น</td><td class="n">{{ fmt.money(totals.grand) }}</td></tr>
  </tbody>
</table>
<p>({{ fmt.baht_text(totals.grand) }})</p>
```

- ใช้ `lists.items` (แถวที่มี computed แล้ว) ไม่ใช่ `data.items` เมื่อต้องการ field ที่คำนวณ
- group: `{% for g in lists.records.groups %}{{ g.key }} … {% for r in g.rows %}…{% endfor %} {{ fmt.money(g.totals.subtotal) }}{% endfor %}`
- master-detail: `{% for o in lists.orders %}{% for d in o.details %}…{% endfor %}{{ fmt.money(o.total) }}{% endfor %}`
- field ที่ไม่บังคับ: `{% if data.buyer.taxId %}…{% endif %}` (อ้าง key ที่ไม่มีโดยไม่ตรวจก่อน = error ตอน bind)
- Jinja ทำงานใน sandbox + autoescape: ห้ามพยายามใส่ HTML จาก data; macro (`{% macro %}`) และ `{% set %}` ใช้ได้
- ห้ามใส่ `<script>` (engine ปิด JS อยู่แล้ว) และห้ามอ้าง URL ภายนอก

## 5ก. เขียนให้ Document Designer เปิดแก้ได้ (บล็อก) และแบบอิสระ

Studio มี **Document Designer** (ปุ่มบนหัว code editor) ที่อ่าน `template.html` เป็นบล็อกให้ลากวางแก้ได้โดยไม่ต้องเขียน HTML
HTML ที่ไม่ตรงรูปแบบข้างล่างยังใช้ได้ แต่ขึ้นเป็นก้อน "Custom Code" ที่แก้ได้แค่ในกล่อง code — เขียนให้ตรงบล็อกให้มากที่สุด
เพื่อให้ผู้ใช้ปรับหน้าต่อเองได้ starter ทุกตัวใน repo เขียนแบบนี้ (ดูข้อ 11)

| บล็อก | HTML |
| --- | --- |
| ข้อความ | `<p>`, `<h1>`–`<h3>`, `<div>` ที่มีแต่ข้อความ, `<b>`/`<i>`/`<br>` และ `{{ expr }}`; `{% if c %}ข้อความ{% endif %}` กลางข้อความได้ |
| ค่าช่องข้อมูล | `<div>{{ expr }}</div>` (expression เดียว) |
| รูป / โลโก้ | `<img src="logo.png">` |
| แถวแบ่งคอลัมน์ | `<div data-jd="row" style="display:flex; gap:6mm">` ที่มี `<div data-jd="col" style="flex:1">` 2–4 ตัว (flex ใส่ใน `style` หรือ class ใน report.css แบบ starter ก็ได้); คอลัมน์ใส่บล็อกอื่นได้ |
| ตารางรายการ | `<table>` + `<thead>` หนึ่งแถว + `<tbody>{% for v in lists.X %}<tr>…</tr>{% else %}<tr>…</tr>{% endfor %}` ตามด้วยแถวรวมได้ |
| สรุปยอด | `<table data-jd="summary">` แถวละ `<tr><td>ป้าย</td><td>{{ expr }}</td></tr>` |
| QR / PromptPay / บาร์โค้ด | `<div>{{ fmt.qr(...) }}</div>` / `fmt.promptpay` / `fmt.barcode` |
| เส้นคั่น | `<hr>` |
| ช่องว่าง | `<div data-jd="space" style="height:6mm"></div>` |
| ขึ้นหน้าใหม่ | `<div data-jd="page-break" style="break-after:page"></div>` |
| เงื่อนไข | `{% if c %}…{% elif c2 %}…{% else %}…{% endif %}` ครอบบล็อกทั้งก้อน |
| วนซ้ำ | `{% for v in lists.X %}…{% else %}…{% endfor %}` ครอบบล็อกทั้งก้อน (list ลูกของตัวแปร loop ได้ เช่น `order.details`) |
| ตั้งค่าตัวแปร | `{% set name = expr %}` บรรทัดเดียว |

- สไตล์ที่ designer แก้ได้เขียนใน `style=` : `font-size` (pt), `font-weight`, `text-align`, `color`, `margin-top`/`margin-bottom` (mm),
  `width`, `border` ของตาราง — สไตล์ส่วนรวมที่เหลือ (ฟอนต์ ขนาดพื้นฐาน เส้นตาราง) ไว้ใน `report.css` ได้ตามเดิม
- `data-jd` ไม่มีผลต่อ PDF; `<link rel="stylesheet" href="report.css">` ไว้บรรทัดแรก
- `{% macro %}`, ตารางแบ่งกลุ่ม (loop ซ้อนของ `groups`), `{% set %}` หลายบรรทัด = Custom Code (ใช้ได้ แค่แก้ในกล่อง code)

**แบบอิสระ (`page.layout = "free"`)** — หน้าเดียว วางกล่องตามพิกัด mm จากขอบกระดาษ เหมาะกับแบบฟอร์มที่ต้องพิมพ์ลงช่องตรงตำแหน่ง:

```html
<div data-jd="page" style="position: relative; width: 210mm; height: 148mm">
  <img data-jd="guide" src="form-scan.png" alt="" style="position: absolute; left: 0mm; top: 0mm; width: 210mm; height: 148mm; opacity: 0.3">
  <div data-jd="box" style="position: absolute; left: 32mm; top: 18.5mm; width: 60mm; height: 6mm">
    {{ data.payee }}
  </div>
</div>
```

- ขนาด `data-jd="page"` = กระดาษหลังหมุนแนว (ตัวอย่าง: A5 แนวนอน 210×148); ของที่ล้นถูกตัด
- `data-jd="guide"` = รูปสแกนต้นฉบับไว้เทียบตำแหน่งใน designer **ไม่ถูกพิมพ์เสมอ** — ถ้าต้นทางเป็นสแกนแบบฟอร์ม ใส่ไว้ช่วยผู้ใช้จัดต่อ
- ข้อมูลที่ยาวไม่แน่นอน (ตารางหลายแถว) ไม่เหมาะกับแบบอิสระ ใช้ `flow`

## 6. fmt.* (ตัวจัดรูปแบบ)

| ฟังก์ชัน | ผล |
| --- | --- |
| `fmt.money(x, places=2)` | `1,234.50` |
| `fmt.number(x, places=0)` | `1,235` |
| `fmt.thai_date(d)` | `18 พฤศจิกายน 2569` (พ.ศ.) |
| `fmt.thai_date_short(d)` | `18 พ.ย. 69` |
| `fmt.baht_text(x)` | `หนึ่งพันบาทถ้วน` |
| `fmt.qr(text, size_mm=30, error="M")` | QR เป็น SVG inline |
| `fmt.barcode(text, kind="code128"\|"ean13", height_mm=12, module_mm=0.3)` | barcode เป็น SVG (ไม่มีตัวอักษรใต้แท่ง พิมพ์ค่าเองด้วย HTML) |
| `fmt.promptpay(target, amount=None)` | payload PromptPay (เบอร์มือถือ/เลขผู้เสียภาษี/e-Wallet) ส่งต่อให้ `fmt.qr` |

ตัวอย่าง: `{{ fmt.qr(fmt.promptpay(data.promptpay, totals.grand), size_mm=28) }}`

## 7. header.html / footer.html

- พิมพ์ซ้ำทุกหน้าในขอบกระดาษบน/ล่าง (ต้องตั้ง margin ให้พอ เช่น 20 mm)
- ต้องมี `<style>` ของตัวเองครบ (ไม่เห็น report.css) และห้าม `@font-face`; ใช้ `font-family: "TH Sarabun New"` เท่านั้น
- ขนาดตัวอักษรเล็ก (12px) เพราะ Chromium ย่อ header/footer
- เลขหน้า: `<span class="pageNumber"></span>/<span class="totalPages"></span>`
- ใช้ `params`/`data`/`fmt` ได้เหมือน template
- รูปใน header/footer: `<img src="logo.png">` ได้ (Jester ฝังเป็น data URI ให้) แต่ไฟล์รูปต้อง ≤ 1 MB (`HEADER_IMAGE_TOO_LARGE`)
- ไม่ใช้กับ `page.size = "roll"` หรือ `page.layout = "free"` (ถูกข้าม)

```html
<style>body { font-family: "TH Sarabun New"; font-size: 12px; padding: 0 15mm; box-sizing: border-box; width: 100%; }
.r { width: 100%; text-align: right; }</style>
<div class="r">หน้า <span class="pageNumber"></span>/<span class="totalPages"></span></div>
```

## 8. asset

- รูปและฟอนต์อยู่ข้างไฟล์ข้อความในโฟลเดอร์เดียวกัน อ้างด้วยชื่อไฟล์ตรง ๆ (`<img src="logo.png">`, `url(stamp.png)`)
- ระบบตรวจไบต์ว่าตรงนามสกุล (png ต้องเป็น PNG จริง)
- ฟอนต์อื่นนอกจาก TH Sarabun New: แนบ .ttf/.otf แล้วใส่ชื่อ family ใน `fonts.body` (ใช้ได้เฉพาะ body)

## 9. ข้อห้ามที่ทำให้ validate ไม่ผ่าน

- `<tfoot>` ในทุก template
- URL ภายนอก (`http:`, `https:`, `//`, `file:`) ใน `src`/`href`/`url()`
- อ้างไฟล์ที่ไม่มีใน draft/asset
- ตัวแปรระดับบนอื่นนอกจากรายการในข้อ 5, field ที่ไม่มีใน data หรือพิมพ์ผิด (StrictUndefined)
- พิมพ์ object/list หรือ `fmt.money` ที่ไม่ได้เรียก (`{{ fmt.money }}`) — แสดงว่างและเตือน
- ref ใน expression ที่ไม่ใช่ตัวเลข, ใช้ `if`/การเปรียบเทียบในโหมด basic
- sample ที่ไม่ผ่าน schema, parameter `required` ที่มี `default`

## 10. zip ที่ import ได้

zip แบบแบน (ไม่มีโฟลเดอร์ย่อย) ทุกไฟล์อยู่ที่ราก + `jester.json`:

```json
{
  "formatVersion": 1,
  "id": "receipt",
  "name": "ใบเสร็จรับเงิน",
  "source": { "kind": "draft", "revision": 1 },
  "exportedAt": "2026-11-18T10:00:00Z",
  "files": ["data.schema.json", "report.css", "report.json", "sample.json", "template.html"],
  "assets": [{ "name": "logo.png", "sha256": "<sha256 hex ของไบต์ไฟล์>" }],
  "tags": ["ขาย", "ใบเสร็จ"]
}
```

`tags` ไม่บังคับ: ป้ายจัดกลุ่มรายงานใน catalog ของ Studio (ไม่ใช่ส่วนของรายงาน) ใช้เฉพาะตอน import เป็นรายงานใหม่ —
import ทับรายงานเดิม tag เดิมอยู่เหมือนเดิม กติกา: ≤ 10 ตัว, ตัวละ 1–30 ตัวอักษร, ไม่มี `,` และอักขระควบคุม,
ตัดช่องว่างหัวท้าย/ยุบช่องว่างซ้ำ, ตัวซ้ำถูกรวม, เทียบตรงตัว (`VIP` ≠ `vip`)

entry ใน zip ต้องตรงกับ `files` + `assets` พอดี ไม่มีเกิน ไม่มีขาด; zip ≤ 25 MB; ไฟล์ข้อความเป็น UTF-8
ใช้ `scripts/jester_pack.py` ทำ zip แทนการเขียนเอง — sha256 และรายชื่อไฟล์ตรงเสมอ

## 11. ตัวอย่างครบชุด

starter ใน repo เป็นตัวอย่างที่ผ่านการตรวจแล้ว: `apps/api/src/jester_api/template_store/starters/`
(`quotation` ใบเสนอราคา, `tax-invoice` ใบกำกับภาษีเต็มรูปพร้อม QR/barcode, `sales-grouped` รายงานแบ่งกลุ่ม,
`purchase-order` master-detail, `blank` ว่าง) — ถ้าเอกสารต้นทางคล้ายตัวไหน เปิดตัวนั้นดูเป็นแบบ
ทุกตัวเขียนเป็นบล็อกของ Document Designer (ข้อ 5ก) และเป็น A4 แบบ `flow`; ใบเสร็จม้วนกับแบบอิสระไม่มี starter ใช้ข้อ 2 และ 5ก
