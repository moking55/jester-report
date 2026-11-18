---
name: to-jester
description: Turn an existing business document or another system's report template into a Jester report (report.json, data.schema.json, sample.json, template.html, report.css, header/footer, assets) and pack it as a zip that Jester Studio imports with "นำเข้า (.zip)". Use this whenever the user hands over a PDF, Word, Excel or a photo/scan of a document (ใบเสนอราคา, ใบแจ้งหนี้, ใบกำกับภาษี, ใบเสร็จ, ใบสั่งซื้อ, ใบส่งของ, สลิปเงินเดือน, รายงานสรุป …), a JasperReports .jrxml, or an HTML/Excel template from another system and wants it in Jester, even if they only say "ทำแบบนี้ใน Jester", "แปลงเป็น template", "ย้ายรายงานนี้มา Jester" or "to-jester".
---

# to-jester: เอกสารเดิม → รายงาน Jester (zip พร้อม import)

Jester สร้าง PDF จากไฟล์ชุดหนึ่งต่อรายงาน: `report.json` บอกว่ารับ parameter อะไร ข้อมูลหน้าตาแบบไหน และคำนวณยอดอย่างไร,
`data.schema.json` ตรวจข้อมูลที่ระบบอื่นส่งมา, `template.html` (Jinja2) จัดหน้า, และ `sample.json` ให้ preview/validate ได้ทันที
งานของ skill นี้คือดูเอกสารต้นทาง แยกให้ออกว่าส่วนไหนคงที่ ส่วนไหนเป็นข้อมูล ส่วนไหนคำนวณได้ แล้วเขียนไฟล์ชุดนั้นให้ผ่านการตรวจของ
Jester ตั้งแต่ครั้งแรก แล้วแพ็กเป็น zip รูปแบบเดียวกับที่ Jester export

ก่อนเขียนไฟล์ อ่าน [references/format.md](references/format.md) (กติกาที่ Jester ตรวจจริง) และอ่าน
[references/sources.md](references/sources.md) เฉพาะหัวข้อของชนิดต้นทางที่ได้มา

## ขั้นตอน

1. **อ่านต้นทางให้ครบ** — PDF/รูป: ดูทุกหน้า; Word/Excel: อ่านเนื้อหาและสูตร; .jrxml/HTML: อ่าน field, parameter, variable
   จดเป็นสามกอง:
   - **คงที่** (หัวกระดาษ ข้อความกฎหมาย ป้ายช่อง) → เขียนตรงใน `template.html`
   - **ข้อมูลเข้า** (ชื่อลูกค้า รายการสินค้า จำนวน ราคา) → `data.schema.json`; ค่าที่ผู้ออกเอกสารใส่ต่อฉบับ (เลขที่ วันที่) → `parameters`
   - **คำนวณได้** (จำนวนเงินต่อแถว ยอดรวม ภาษี ยอดสุทธิ) → `computed`/`totals` ใน `report.json` ไม่ต้องให้ระบบอื่นส่งมา
     เพราะ Jester คำนวณด้วยทศนิยมแม่นยำและตรวจยอดได้
2. **ถามเฉพาะที่เดาไม่ได้จริง ๆ** เช่น อัตราภาษี/ส่วนลดคงที่หรือเปลี่ยนต่อฉบับ, id ของรายงาน (ถ้าผู้ใช้ไม่บอก ใช้ชื่อ kebab-case
   ภาษาอังกฤษสั้น ๆ เช่น `receipt`, `delivery-note`) สิ่งที่เดาได้จากเอกสาร ให้เดาแล้วบอกในสรุปตอนท้าย
3. **เขียนไฟล์ลงโฟลเดอร์งาน** (เช่น `jester-out/<id>/`) ตามกติกาใน format.md:
   - ป้ายภาษาไทย (`title`) ให้ **ทุก** parameter และ **ทุก** property ใน schema และ `description` ในช่องที่คนกรอกอาจงง —
     Studio สร้างฟอร์ม "ออกเอกสาร" จาก title เหล่านี้ ถ้าไม่มี คนกรอกจะเห็นชื่อ key ภาษาอังกฤษ
   - ลำดับ property ใน schema = ลำดับช่องในฟอร์ม เรียงตามที่คนอ่านเอกสาร (ผู้ขาย → ผู้ซื้อ → รายการ → ยอด/หมายเหตุ)
   - เงินเป็น `"type": "string", "format": "decimal"` เสมอ (JSON number ที่เป็นทศนิยมถูกปฏิเสธเพื่อกันเงินคลาดจาก float)
   - `sample.json` ใช้ข้อมูลสมมติที่ดูจริง ตัวเลขให้ยอดออกมาตรวจได้ด้วยมือ — **ไม่คัดลอกชื่อ เลขภาษี เบอร์โทร ของจริงจากต้นทาง**
     ลงไป เพราะไฟล์นี้ติดไปกับรายงานและใครเปิด preview ก็เห็น
   - โลโก้/รูปจากต้นทาง: ถ้าได้ไฟล์รูปมา ใส่เป็น asset (png/jpg/svg/webp) และอ้างด้วยชื่อไฟล์; ถ้าไม่มี ใช้ข้อความแทน ไม่โหลดจาก URL
4. **ตรวจและแพ็ก** ด้วยสคริปต์ที่มากับ skill:
   ```bash
   python .claude/skills/to-jester/scripts/jester_pack.py jester-out/<id> --id <id> --name "<ชื่อรายงาน>"
   ```
   สคริปต์ตรวจกติกาที่ Jester ใช้ตอน import (ชื่อไฟล์ ขนาด ไฟล์บังคับ) และถ้ารันจาก repo ของ Jester ที่ติดตั้ง dependency แล้ว
   (`cd apps/api && uv run python ../../.claude/skills/to-jester/scripts/jester_pack.py ...`) จะรันตัวตรวจจริงของ Jester ด้วย
   (validate definition → เตรียมข้อมูลจาก sample → bind template) แก้จนไม่มี error แล้วจึงได้ zip
5. **สรุปให้ผู้ใช้** (ภาษาไทย สั้น): ไฟล์ zip อยู่ไหน, วิธีนำเข้า (Studio → รายงาน → "นำเข้า (.zip)" → Publish → "ออกเอกสาร"),
   parameter ที่ต้องกรอกต่อฉบับ, ยอดที่ระบบคำนวณให้ และ **สิ่งที่เดาเอง/ทำไม่ได้เหมือนต้นฉบับ** เช่น ฟอนต์ ตำแหน่งที่ต้องปรับ
   ลายเซ็น/ตราประทับ ถ้าตรวจด้วยตัวตรวจจริงไม่ได้ บอกตรง ๆ ว่ายังไม่ผ่าน validate ของ Jester ให้ลอง Validate ใน Studio หลัง import

## หลักการจัดหน้า (ทำไมต้องแบบนี้)

- engine คือ Chromium ที่ **ปิด JavaScript** และโหลดได้เฉพาะไฟล์ใน draft — ทุกอย่างต้องเป็น HTML/CSS ล้วน
- กระดาษ A4 (แนวตั้งหรือนอน) ขอบกำหนดใน `report.json` — อย่าใช้ขนาดตายตัวเป็น px ทั้งหน้า ใช้ `mm`/`%` และ flex/table
- ตารางรายการยาวได้หลายหน้า: ใช้ `<table>` จริง (หัวตารางซ้ำทุกหน้าเอง) และห้าม `<tfoot>` (Jester ปฏิเสธ เพราะ Chromium
  ซ้ำ tfoot ทุกหน้าจนยอดรวมโผล่ผิดที่) — วางแถวยอดรวมใน `<tbody>` หรือ div หลังตาราง
- ฟอนต์ไทยที่มีใน engine คือ **TH Sarabun New** (มีตัวหนา); ฟอนต์อื่นต้องแนบไฟล์ .ttf/.otf เป็น asset และใช้ได้เฉพาะใน body
  (header/footer ใช้ได้แค่ฟอนต์ของ engine) ถ้าต้นฉบับใช้ฟอนต์อื่น ใช้ TH Sarabun New แล้วบอกผู้ใช้
- ตัวเลข/วันที่/เงินบาทเป็นตัวอักษร ใช้ `fmt.*` ของ Jester ไม่จัดรูปเองใน template — ได้รูปแบบไทยที่ถูกต้องและปัดเศษแบบเดียวกับที่คำนวณ
