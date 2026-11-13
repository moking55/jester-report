# T16 — Draft Data Contract และ Parameters

วันที่ตรวจ: 12 พฤศจิกายน 2026  
สถานะ: ข้อเสนอเพื่อวิจัย ไม่ใช่ production contract; PDF/runtime ยังไม่ทดสอบ

## ขอบเขตและหลักฐาน

[JSON Schema object](https://json-schema.org/understanding-json-schema/reference/object) แยก `properties`, `required` และ `additionalProperties`; [schema type](https://json-schema.org/understanding-json-schema/reference/type) ใช้ตรวจชนิดข้อมูล ไม่ได้คำนวณยอดแทนระบบ การมี `default` เป็น annotation ไม่รับประกันว่า validator จะเติมค่า [JSON Schema annotations](https://json-schema.org/understanding-json-schema/reference/annotations)

ไฟล์ [report-input.schema.json](../../../research/specimens/report-input.schema.json) เป็น **specimen จำกัดเฉพาะ 3 รายงาน T01**, ใช้ JSON Schema Draft 2020-12 ไม่เลือก canonical report-definition format ใน T13 และไม่สัญญาว่าฟิลด์เหล่านี้เป็น API สุดท้าย [cases](../../../research/specimens/report-input-cases.json) ระบุ schema-valid/invalid และ semantic-valid/invalid แยกกัน

## Contract เสนอ

1. แยก `reportType`, `parameters`, `data` จาก template ID/version ที่ส่งใน API; calculated totals เป็น output จาก report logic ห้ามเชื่อยอดจาก client โดยไม่มี reconciliation policy
2. Parameters ต้องระบุ locale, calendar, timezone และ currency ชัดเจน; enum ใน specimen จำกัดตัวอย่างเท่านั้น ไม่ใช่การประกาศรองรับทุก locale/timezone ในผลิตภัณฑ์ ไม่ใส่ defaults เงียบ ๆ
3. Sales ต้องมี `from` และ `toExclusive` แบบ date: ช่วง `[from, toExclusive)` ใน timezone ที่ระบุ; semantic layer ต้องตรวจ from < toExclusive และ timezone/calendar ใช้ได้จริง
4. Owner ของ filtering ยังเป็น decision-open: หาก caller กรอง ต้องระบุ data snapshot/provenance และ service ต้องตรวจ contract ตาม policy; หาก service กรอง ให้กำหนด dataset scope ชัด ไม่ filter ซ้ำโดยไม่แจ้ง ช่วงวันที่ที่แสดงต้องตรงข้อมูลที่ใช้รวมยอด
5. `data.lines`, `data.records`, `data.orders[].details` รับ arrays รวม array ว่าง; object/data/required field ที่หายเป็น schema error, `null` ไม่เท่ากับ missing หรือ empty และไม่แปลงเป็นศูนย์ เงื่อนไขอนุญาต publish empty detail ยัง open
6. จำนวนเงินเป็น decimal string รองรับเศษสูงสุด 4 ตำแหน่งใน specimen; validation แยกจาก semantic arithmetic. T10 สมมติปัดรายแถว 2 ตำแหน่ง `ROUND_HALF_UP` ก่อนรวม แต่ต้องให้ธุรกิจยืนยันนโยบายและสกุลเงิน ไม่ใช่กฎภาษี
7. Duplicate IDs, orphan detail, การเรียงช่วงเวลา, การตรง filter และ component version reference ต้องตรวจ semantic layer; JSON Schema นี้ไม่ได้พิสูจน์ invariants เหล่านั้น

### Diagnostics และ safety

Error มี machine-readable code, message ที่ไม่เปิดเผยข้อมูลลับ และ JSON Pointer ชี้ instance เช่น `/data/lines/0/unitPrice`; missing field ชี้ parent `/data` และระบุ missing property ใน message. ตรวจ field type/length, permitted template/component และสิทธิ์ก่อน render; รักษา source reference/timezone/period เพื่อ audit โดยกำหนด retention แยก

### ตัวอย่างและผลคาดหวัง

Quotation valid ใช้ QL01, QL02 กับ discount 100.70; T01 ระบุ fixture subtotal 3100.70, total 3210.00 เมื่อใช้อัตราตัวอย่าง 7% ซึ่งยังต้องกำหนดใน business contract ไม่ได้อยู่ใน schema. Sales valid North 2000.00, South 400.00, grand 2400.00; purchase PO01 350.00, PO02 รายการว่าง 0.00 ตามนโยบาย fixture ไม่ใช่ข้ออนุมัติ publish.

Examples invalid ระบุ pointer: missing customer, null price, invalid date/currency, numeric amount; duplicate ID, orphan และช่วงวันผิดลำดับเป็น semantic errors ที่ schema อาจผ่าน ต้องตรวจเพิ่ม ใน specimen `format=date` ตรวจด้วย format checker เท่านั้น และ timezone enum ไม่ใช่การตรวจฐาน IANA แบบทั่วไป

## Verification และข้อค้าง

ตรวจ JSON Schema Draft 2020-12 พร้อม format checker และกรณี schema valid/invalid แบบ static; ตรวจ semantic cases แยกด้วย script เบา ไม่เปิด API, data connector หรือ renderer. `reportType`, currency, timezones, precision, auto-filter และ contract version เป็นข้อเสนอที่ต้องทบทวนกับ T13/T15 และผู้ใช้ก่อน implementation

ผลตรวจด้วย `python -X utf8 -` และ `jsonschema` 4.25.1: schema ผ่าน `check_schema`, cases ทั้ง 11 ตรง expected schema status/pointer และ 6 cases ที่ schema ผ่านตรง semantic expectations. Script เป็นการตรวจ specimen ไม่ใช่ implementation ของ semantic validator ในระบบจริง
