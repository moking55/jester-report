# T01 — Product Brief และรายงานอ้างอิง

วันที่: 12 พฤศจิกายน 2026  
สถานะ: การกำหนดโจทย์วิจัยจากคำขอผู้ใช้ ไม่ใช่ product requirements ที่อนุมัติแล้ว  
ขอบเขต: Checkpoints 1–2; ไม่มี Docker, Render runtime, benchmark หรือ Cloud provision

## 1. ข้อกำหนดที่ยืนยันจากคำขอ

| ID | ข้อกำหนด | หลักฐาน | สถานะ |
| --- | --- | --- | --- |
| U01 | สร้างโปรแกรมรายงาน PDF สำหรับธุรกิจ คล้าย JasperReports | คำขอแรกในแชตนี้ | confirmed |
| U02 | ใช้ Gotenberg เป็น Engine เบื้องหลัง | คำขอแรก | confirmed |
| U03 | ตั้งใจเผยแพร่โอเพนซอร์ส | คำขอแรก | confirmed; ยังไม่เลือก license |
| U04 | วางแผน Research เต็มและบันทึกในโปรเจกต์ | คำขอใช้ planning-and-task-breakdown | confirmed |
| U05 | ไม่ทดสอบใน Docker เพราะเครื่องทรัพยากรจำกัด | คำขอล่าสุดเรื่องเครื่อง | confirmed |
| U06 | ให้ subagents ทำ Checkpoints 1–2 parallel และแชร์ข้อมูลที่เกี่ยวข้องได้ | เป้าหมายล่าสุดในแชต | confirmed; แทนคำขอเดิมให้ทำคนเดียวในส่วน delegation |

ผู้ดำเนินการหลักตรวจและเขียนเอกสาร ส่วน subagents วิจัยแบบอ่านอย่างเดียว การใช้ Antigravity เป็นการปรึกษาโมเดลตาม AGENTS.md ไม่ใช่การ provision Cloud เพื่อรัน PDF

## 2. Personas ที่ใช้เป็นสมมติฐานวิจัย

ยังไม่มีหลักฐานว่ากลุ่มใดเป็นกลุ่มเป้าหมายหลัก ห้ามย้ายตัวเลือกใดเป็นข้อกำหนดผลิตภัณฑ์โดยไม่มีการตัดสินใจเพิ่มเติม

| Persona | งานหลัก | เส้นทางใช้งานที่ต้องศึกษา | คำถามสำคัญ |
| --- | --- | --- | --- |
| Developer/integrator | ผูกระบบธุรกิจกับ template และ API | นิยามข้อมูล/parameters, เรียก Render, จัดการ errors, ดาวน์โหลด | ต้องการ library หรือ server? |
| Business report author | สร้าง/ปรับรายงานโดยไม่เขียนโปรแกรม | เลือก fields, จัดตาราง/กลุ่ม, preview, publish | ต้องมีลากวางในรุ่นแรกหรือไม่? |
| Operator/admin | ติดตั้ง จัดสิทธิ์ และตรวจงานผิดพลาด | จัดการ template versions, access, jobs และ retention | local หรือ shared server? หลายองค์กรหรือไม่? |
| Reader/requester | เรียกรายงานและอ่าน PDF | กรอก parameters, ขอรายงาน, อ่าน/ดาวน์โหลด | ใช้พิมพ์จริงหรืออ่านหน้าจอ? ต้องรองรับ accessibility ระดับใด? |

ใช้สอง product scenarios ควบคู่: **developer-first** กับ **business-author-first** จนกว่าจะยืนยันกลุ่มหลัก ประเมิน Designer ใน T03/T14 โดยไม่เลือกเทคโนโลยีหรือแนวทางล่วงหน้า

## 3. รายงานอ้างอิง A — ใบเสนอราคา

วัตถุประสงค์: ตรวจความครบของข้อมูล เอกสารหน้าเดียว โลโก้ ที่อยู่ไทย และยอดตัวเลข

- **ผู้สร้าง/เรียก/อ่าน:** Author สร้าง template; ระบบธุรกิจหรือ requester เรียกด้วย `quoteId`; ลูกค้าอ่านผล
- **Input สมมติ:** บริษัท/ลูกค้า, `quoteId=Q-DEMO-001`, วันที่คงที่, สกุล THB, รายการสินค้า 2 แถว และข้อความเงื่อนไข ทั้งหมดสังเคราะห์
- **Parameters:** `locale=th-TH`, วันที่เอกสาร explicit, template version explicit; ไม่ใช้เวลาปัจจุบันโดยไม่ส่งค่า
- **Output ที่ต้องการ:** PDF A4 แนวตั้ง ชื่อเอกสาร เลขที่ รายการ จำนวน ราคาต่อหน่วย ยอดรายแถว ส่วนลด ยอดรวม และเงื่อนไข ไม่มีการยืนยันว่า Render ได้แล้ว

| Line ID | จำนวน | ราคาต่อหน่วย | Expected amount |
| --- | --- | --- | --- |
| QL01 | 2 | 1250.50 | 2501.00 |
| QL02 | 3 | 199.90 | 599.70 |

Expected subtotal = 3100.70; ส่วนลดตัวอย่าง = 100.70; net = 3000.00; อัตราคำนวณตัวอย่าง 7% = 210.00; grand total = **3210.00** ตัวเลขอัตราเป็น fixture สำหรับตรวจสูตรเท่านั้น ไม่ใช่คำแนะนำภาษีหรือข้อกำหนดใบกำกับภาษีตามกฎหมาย

**Acceptance target:** IDs QL01–QL02 ปรากฏอย่างละหนึ่งครั้ง ยอดตรงค่าข้างต้น fields บังคับไม่หาย ข้อความไทยไม่ถูกตัด และ output ไม่ทับกัน; ยอดตรวจ arithmetic แบบเบาได้ ส่วน layout/fonts/PDF text extraction เป็น deferred/not-tested

**Failure scenarios:** missing company/customer, currency/type ไม่ตรง contract, `quantity=null`, คำอธิบายยาว และโลโก้หาไม่พบ ต้องมี error policy ก่อนพัฒนา ไม่ปล่อย output ที่ข้อมูลไม่ครบโดยไม่ระบุ

## 4. รายงานอ้างอิง B — สรุปยอดขายแบบ Grouped Table

วัตถุประสงค์: แยก data grouping/aggregate correctness จากการแบ่งหน้าจริง

- **ผู้สร้าง/เรียก/อ่าน:** Author นิยามกลุ่ม; requester กำหนดช่วงเวลา; ผู้จัดการอ่าน subtotal/grand total
- **Input:** records มี unique row ID, region, transaction date และ amount; sorting คงที่ตาม region แล้ว row ID
- **Parameters:** `from=2026-11-01`, `toExclusive=2026-12-01`, timezone explicit; ระบบต้นทางหรือ report server ใครกรองข้อมูลยังเป็น open decision
- **Output ที่ต้องการ:** ตาราง detail แบ่งกลุ่ม North/South, group subtotals, grand total, page numbers และหัวตารางซ้ำเมื่อหลายหน้า

| Row ID | Region | Amount |
| --- | --- | --- |
| S01 | North | 1200.25 |
| S02 | North | 799.75 |
| S03 | South | 500.10 |
| S04 | South | -100.10 |

Expected North = **2000.00**; South = **400.00**; grand total = **2400.00**; detail count = **4** ค่าติดลบใช้ทดสอบการปรับยอด ไม่กำหนดความหมายบัญชีจริง

**Acceptance target:** unique IDs ไม่หาย/ซ้ำ กลุ่มและยอดถูกต้อง empty dataset มี state ชัดเจน ไม่อ้าง page subtotal ว่าคำนวณได้จาก group subtotal; cases 0/1/50/500 แถวเป็นแบบออกแบบไว้ ไม่ได้ Render

**Failure scenarios:** date boundaries/timezone ไม่ตรง, duplicate IDs, missing region, amount เป็น string ที่ไม่อนุญาต, group ตัดข้ามหน้า และแถวสูงเกินหน้า ต้องกำหนด behavior/validation ก่อนรับรอง output

## 5. รายงานอ้างอิง C — Master-detail Purchase Order

วัตถุประสงค์: ศึกษา parent-child binding และ reusable sections โดยไม่ผูกกับ subreport implementation ใด

- **ผู้สร้าง/เรียก/อ่าน:** Author ใช้ header/company section ซ้ำ; ระบบธุรกิจส่ง parent/detail; ฝ่ายจัดซื้ออ่านเอกสาร
- **Input:** orders 2 ใบ มี `orderId`, supplier และรายการ child; template component reference/version explicit
- **Parameters:** selected order IDs, locale, currency; ทดสอบ master ที่ไม่มี children เป็น case ไม่ใช่ยืนยันว่าจะเป็นเอกสารธุรกิจที่อนุญาตให้ publish
- **Output ที่ต้องการ:** หัวเอกสารแยกแต่ละ order, detail ที่ผูกถูก parent, summary ต่อ order และส่วน signature placeholder ตามการออกแบบ

| Parent | Detail ID | จำนวน | ราคา | Expected amount |
| --- | --- | --- | --- | --- |
| PO01 | D01 | 2 | 100.00 | 200.00 |
| PO01 | D02 | 3 | 50.00 | 150.00 |
| PO02 | ไม่มี detail | — | — | 0.00 |

Expected PO01 = **350.00**; PO02 = **0.00** สำหรับ empty-data case; overall = **350.00**; parent count = 2; detail count = 2

**Acceptance target:** parent/detail IDs ไม่สลับกัน ส่วน reusable มี version reference ชัดเจน ส่วนย่อยหายต้องแจ้ง error และกำหนด empty-detail policy; nesting หนึ่งระดับเป็นฐานศึกษา ไม่รับปาก recursion ไม่จำกัด

**Failure scenarios:** orphan detail, component missing/version mismatch, nested list ว่าง, รายละเอียดข้ามหน้า และแหล่งข้อมูลเปลี่ยนระหว่างดึง; การตรวจ layout ทั้งหมด deferred/not-tested

## 6. Decisions ที่ยังเปิดและผลต่อแผน

| Decision | ทางเลือกที่ต้องศึกษา | ผลกระทบถ้าเลือก |
| --- | --- | --- |
| Persona หลัก | Developer / business author / ทั้งสองระยะ | Designer P0 และต้นทุน authoring เปลี่ยน |
| Jasper similarity | output semantics / banded designer / JRXML compatibility | ต้องทำ compiler/translator หรือไม่ |
| Deployment | library / local app / shared server | auth, durable jobs, ops และ tenant isolation |
| Data source | JSON ready-to-render / REST / SQL | credentials, query policy และ snapshot consistency |
| Workload | จำนวนหน้า/งาน/ผู้ใช้พร้อมกันยังไม่กำหนด | ยังตั้ง SLA/hardware requirements ไม่ได้ |
| PDF requirements | ordinary PDF / archival / accessibility / signature | ต้องมี validation/keys/trust requirements เพิ่ม |
| License | permissive / network copyleft / อื่นที่ OSI รับรอง | การรับใช้/แจกจ่ายและภาระผู้ใช้เปลี่ยน |

การจัดทำ Checkpoints 1–2 เดินหน้าด้วย documented options ได้ ไม่ต้องรอคำตอบทุกข้อ และไม่เปลี่ยน open decision เป็น assumed approval

## 7. การตรวจ T01

- เทียบ U01–U06 กับคำขอในแชต; confirmed แยก assumptions และ open decisions แล้ว
- Personas ครอบคลุม author, caller, operator และ reader; ยังไม่ยืนยันกลุ่มตลาดหลัก
- รายงาน 3 แบบมี input/parameters/output/expected values และ failure scenarios ที่ตรวจย้อนกลับได้
- ตรวจ expected arithmetic แบบเบาแยกจาก renderer; ไม่มีการสร้าง PDF หรือทดสอบ Docker
