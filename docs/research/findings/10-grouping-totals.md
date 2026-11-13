# T10 — Grouping และกติกายอดรวม

สถานะ: desk research และตรวจค่าตัวอย่างด้วย Decimal; ไม่ได้ Render หรือทดสอบ runtime PDF

## หลักฐานและขอบเขต

[JasperReports 7.1.1: Data Grouping](https://jasperreports.sourceforge.net/sample.reference/jasper/README.html) อธิบาย group expression ที่เปลี่ยนค่าแล้วเกิด group break พร้อม header/footer และระบุว่าข้อมูลควรเรียงตาม group expressions ก่อนประมวลผล ลำดับ group ซ้อนมีผลต่อการ reset ของกลุ่มย่อย สิ่งนี้เป็นพฤติกรรม JasperReports ไม่ใช่การยืนยันว่า Gotenberg มี group engine เดียวกัน

ข้อเสนอสำหรับระบบรายงาน: กำหนด dataset snapshot, filter, sort และ group key ให้ชัดก่อน aggregate; group subtotal มี scope เฉพาะ records ของกลุ่ม ส่วน grand total รวม records หลัง filter ทั้งชุด หากใช้ running total ต้องระบุลำดับและจุด reset แยกจาก subtotal ห้ามนำยอดรวมก่อน filter ไปปะปนกับยอดหลัง filter

## ข้อตกลงตัวอย่างที่ยังต้องให้ธุรกิจยืนยัน

- ยอดเงินใน fixture แทนด้วย decimal string หน่วย THB; validation ปฏิเสธ malformed value ก่อนคำนวณ ไม่ใช้ binary floating point เป็น money contract
- ตัวอย่างใช้ทศนิยม 2 ตำแหน่งและ `ROUND_HALF_UP` เมื่อต้องปัดเป็นสกุลเงิน โดยปัดยอดรายแถวก่อนรวมเพื่อแสดงผล ทั้งวิธีปัดและจำนวนตำแหน่งเป็น **assumption** ต้องยืนยันตามธุรกิจ/สกุลเงิน ไม่ใช่กฎภาษี
- `null` หรือ field ที่หายใน amount คือ validation error ภายใต้นโยบายตัวอย่าง ไม่แปลงเป็นศูนย์เงียบ ๆ; หากธุรกิจต้องการ ignore/null-as-zero ต้องระบุแยก
- Dataset ว่าง: ไม่มี group subtotal และ grand total `0.00` สำหรับตัวอย่าง; empty named group ต้องนิยามจาก master list แยกจากกลุ่มที่เกิดจาก records เท่านั้น
- group key หายหรือ null ให้ validation error; negative amount เป็นรายการปรับยอดได้ใน fixture แต่ต้องยืนยันความหมายทางธุรกิจ
- Duplicate record ID เป็น error; ต้องป้องกันการรวมซ้ำ และเรียงตาม `(region, id)` ก่อนใช้กลยุทธ์ group break แบบเรียงลำดับ

## Expected results

[grouped-cases.json](../../../research/specimens/grouped-cases.json) เป็นข้อมูลสังเคราะห์ ไม่ใช่ PDF output:

| Case | Expected |
| --- | --- |
| `sales-basic` | North 2000.00, South 400.00, grand 2400.00; IDs S01–S04 อย่างละหนึ่งครั้ง |
| `empty-dataset` | no groups, grand 0.00 |
| `rounding` | 1.005 → 1.01 และ -0.005 → -0.01; sum 1.00 ตาม assumption HALF_UP |
| `null-amount` / `missing-group` / `duplicate-id` | validation error; ไม่สร้างยอดอัตโนมัติ |

**Page subtotal ไม่เท่ากับ group subtotal:** ต้องทราบตำแหน่ง records บนหน้าหลัง layout จริง ซึ่งขึ้นกับ fonts, ขนาดหน้า และการแตกแถว จึงยัง **deferred/not-tested** ไม่คำนวณจากจำนวนแถวสมมติ; การแสดงยอดใน PDF และ group ที่ข้ามหน้าไม่ได้ตรวจ

## Verification

ใช้ Python standard library `json` และ `decimal.Decimal` ตรวจผลรวมและ expected validation ของ fixture แยกจาก template; รายละเอียดคำสั่งและผลอยู่ในรายงานของผู้ดำเนินการ ไม่มี Engine, Docker หรือ PDF
