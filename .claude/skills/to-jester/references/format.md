# รูปแบบรายงาน Jester (กติกาที่ระบบตรวจจริง)

ที่มา: `SPEC-report-definition.md`, `SPEC-binder.md`, `SPEC-data-prep.md`, `SPEC-template-store.md` ใน repo jester-report

## สารบัญ
1. ไฟล์ในรายงาน
2. report.json
3. ภาษา expression (computed / totals)
4. data.schema.json และ sample.json
5. template.html — สิ่งที่ template ใช้ได้
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
ชื่อ asset: `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|svg|webp|avif|bmp|ttf|otf)$` (ไม่รับ gif)
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
| `page` | `size` = `A4` เท่านั้น; `orientation` = `portrait`/`landscape`; margin 0–50 mm |
| `fonts.body` | อย่างน้อย 1 family; ต้องมีใน engine (TH Sarabun New) หรือเป็น asset ฟอนต์ที่ประกาศ family นั้น |
| `fonts.headerFooter` | เฉพาะฟอนต์ใน engine (TH Sarabun New) |
| `parameters.<name>` | ชื่อ `^[A-Za-z_][A-Za-z0-9_]*$`; `type` = `string`/`integer`/`decimal`/`date`/`boolean`/`enum`; `required`, `default` (ห้ามใช้คู่กัน), `values` (เฉพาะ enum), `maxLength`, `title` (1–80), `description` (1–300) |
| `data` | `schema` = ชื่อไฟล์ schema, `samples` = รายชื่อไฟล์ตัวอย่าง (≥ 1) |
| `lists.<name>` | `path` JSON Pointer ไปยัง array ใน data (ขึ้นต้น `/`); `id` field ที่ไม่ซ้ำในแถว; `sort` รายชื่อ field; `computed` field ใหม่ต่อแถว (ห้ามชื่อซ้ำ field ใน schema); `groupBy {key, totals}`; `totals`; `lists` ซ้อนได้ 1 ระดับ (path สัมพัทธ์กับแถวแม่) |
| `totals` | ชื่อ → expression ระดับรายงาน อ้างชื่อ total อื่นได้แต่ห้ามวงวน |
| field อื่น | ไม่รับ (เขียน key ที่ไม่มีในตาราง = error) |

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

ตัวแปรระดับบนสุดมีแค่: `params`, `data`, `lists`, `totals`, `fmt`, `meta` (`meta.templateId`, `meta.version`, `meta.renderedAt`)

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
  "assets": [{ "name": "logo.png", "sha256": "<sha256 hex ของไบต์ไฟล์>" }]
}
```

entry ใน zip ต้องตรงกับ `files` + `assets` พอดี ไม่มีเกิน ไม่มีขาด; zip ≤ 25 MB; ไฟล์ข้อความเป็น UTF-8
ใช้ `scripts/jester_pack.py` ทำ zip แทนการเขียนเอง — sha256 และรายชื่อไฟล์ตรงเสมอ

## 11. ตัวอย่างครบชุด

starter ใน repo เป็นตัวอย่างที่ผ่านการตรวจแล้ว: `apps/api/src/jester_api/template_store/starters/`
(`quotation` ใบเสนอราคา, `tax-invoice` ใบกำกับภาษีเต็มรูปพร้อม QR/barcode, `sales-grouped` รายงานแบ่งกลุ่ม,
`purchase-order` master-detail) — ถ้าเอกสารต้นทางคล้ายตัวไหน เปิดตัวนั้นดูเป็นแบบ
