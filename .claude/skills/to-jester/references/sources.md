# อ่านต้นทางแต่ละชนิด

อ่านเฉพาะหัวข้อของต้นทางที่ได้มา

## PDF

- อ่านข้อความทุกหน้า (skill `pdf` หรือ `pdftotext -layout`) และดูภาพหน้าแรกเพื่อเห็น layout จริง (ตาราง กรอบ ตำแหน่งโลโก้)
- เอกสารหลายฉบับใน PDF เดียว (เช่น ใบแจ้งหนี้ 10 ใบ) = แบบเดียวกัน ข้อมูลต่างกัน — ดู 2–3 ใบเพื่อแยกว่าอะไรคงที่ อะไรเปลี่ยน
- ตัวเลขในตาราง: ตรวจว่าจำนวน × ราคา = จำนวนเงินจริงไหม และยอดรวม/ภาษีคิดแบบไหน (ภาษีจากยอดหลังหักส่วนลด? ปัดตรงไหน?)
  เพื่อเขียน `computed`/`totals` ให้ได้ยอดตรงกับต้นฉบับ
- PDF สแกน (เป็นรูป): ใช้การอ่านภาพ แล้วบอกผู้ใช้ว่าข้อความบางส่วนอาจอ่านผิด

## รูปถ่าย/สแกนเอกสาร

- ดูภาพโดยตรง; ข้อความที่อ่านไม่ชัดให้ใส่เป็นตัวยึด (`…`) แล้วระบุในสรุป
- ลายเซ็นและตราประทับ ไม่ทำซ้ำเป็นรูป — เว้นช่องลงชื่อเป็นเส้นจุดแทน

## Word (.docx)

- อ่านเนื้อหาด้วย skill `docx` หรือแปลงเป็นข้อความ/HTML (`pandoc file.docx -t html`) ดูตารางและข้อความคงที่
- MERGEFIELD / ตัวยึดอย่าง `«CustomerName»` `[ชื่อลูกค้า]` `{{name}}` = ข้อมูลเข้า → แปลงเป็น field ใน schema
- ตารางรายการที่ทำซ้ำแถว → `lists`

## Excel (.xlsx)

- อ่านเซลล์และ **สูตร** (openpyxl `data_only=False` หรือ skill `xlsx`) — สูตรคือ `computed`/`totals` ที่ต้องแปลง:
  `=C5*D5` → `computed: {"amount": "round(qty * unitPrice, 2)"}`, `=SUM(E5:E20)` → `totals: {"subtotal": "sum(items.amount)"}`,
  `=ROUND(E21*7%,2)` → `"vat": "round(subtotal * 0.07, 2)"`, `=IF(...)` → `expressionMode: "advanced"` + `if(...)`
- สูตรที่ภาษา expression ทำไม่ได้ (VLOOKUP, ข้อความ, วันที่) → ให้ระบบต้นทางส่งค่ามาใน data แล้วบอกผู้ใช้
- ช่วงแถวรายการ (เช่นแถว 5–20) = list; เซลล์หัวกระดาษ = parameter หรือ field ระดับบน

## JasperReports (.jrxml)

| jrxml | Jester |
| --- | --- |
| `<parameter name="X" class="java.lang.String">` | `parameters.X` type `string` (Date → `date`, BigDecimal → `decimal`, Integer → `integer`, Boolean → `boolean`) |
| `<field name="X">` ของ detail band | property ของ item ใน array ของ `data` + `lists.<name>` |
| `<variable calculation="Sum">` | `totals` (`sum(list.field)`); `resetType="Group"` → `groupBy.totals` |
| `<group>` + `groupHeader`/`groupFooter` | `sort` + `groupBy` และวนลูป `lists.x.groups` |
| `<subreport>` | list ซ้อน (`lists.<name>.lists`) ลึกได้ 1 ระดับ |
| `title`/`pageHeader`/`columnHeader` | ส่วนบนของ `template.html` / `header.html` |
| `pageFooter` (`$V{PAGE_NUMBER}`) | `footer.html` + `pageNumber`/`totalPages` |
| `columnFooter`/`summary` | แถวยอดรวมใน `<tbody>` หรือ div หลังตาราง (ไม่ใช้ `<tfoot>`) |
| `textFieldExpression` ที่จัดรูป (`new DecimalFormat`) | `fmt.money`/`fmt.number`/`fmt.thai_date` |
| `<image>` จาก classpath/URL | asset ในรายงาน (ขอไฟล์จากผู้ใช้) |
| `queryString` (SQL) | Jester ไม่ต่อฐานข้อมูล — ระบบต้นทางส่งผล query มาเป็น `data`; schema ต้องตรงกับคอลัมน์ที่ query คืน |

ตำแหน่ง x/y แบบตายตัวของ jrxml ไม่ต้องลอกเป็น px — จัดด้วย table/flex ให้ได้หน้าตาใกล้เคียง

## HTML template จากระบบอื่น (Handlebars, Mustache, Twig, ERB, …)

- `{{name}}`/`{{{name}}}`/`<%= name %>` → `{{ data.name }}` หรือ `{{ params.name }}`
- `{{#each items}}`/`{% for %}` → `{% for item in lists.items %}`
- ลบ `<script>`, CDN, Google Fonts, รูปจาก URL — ย้ายสิ่งที่จำเป็นเข้ามาเป็นไฟล์/asset
- CSS ที่อ้าง URL ภายนอก หรือ `@import` ภายนอก ใช้ไม่ได้
- ตัวเลขที่ template เดิมจัดรูปเองหรือคำนวณใน helper → `fmt.*` และ `computed`/`totals`
