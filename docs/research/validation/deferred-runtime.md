# Runtime Validation ที่เลื่อนออกจากงานปัจจุบัน

วันที่: 12 พฤศจิกายน 2026  
เหตุผล: ผู้ใช้ไม่ต้องการทดสอบ Docker เพราะเครื่องทรัพยากรจำกัด  
สถานะ: **deferred/not-tested ทุกกรณี** ไม่มีการรัน Gotenberg หรือทดสอบผ่านบริการภายนอกทดแทน

## 1. สิ่งที่ยังยืนยันไม่ได้

| ประเด็น | Case IDs | ผลต่อข้อเสนอ MVP |
| --- | --- | --- |
| Layout ของ template จริง หลายหน้า/header/footer/oversized row | D01–D03 | เสนอ report types ได้แบบมีเงื่อนไข ยังไม่รับรองความถูกต้อง PDF |
| Group/detail ที่แสดงใน PDF และ page subtotal จริง | D04 | Static arithmetic ไม่รับรอง layout/evaluation ตามหน้าจริง |
| ภาษาไทย ฟอนต์ embedding การ copy/search | D05 | ยังไม่รับรอง output ไทยของ Engine/environment จริง |
| Assets/chart readiness และ QR/print quality | D06 | ต้องมี error policy และ future output checks ก่อนรับรอง |
| Network/template/file/tenant isolation | D07 | Threat model/controls ที่ documented ไม่ใช่ penetration test หรือ verified protection |
| Latency/throughput/RAM/recovery ภายใต้โหลด | D08 | ไม่มี measured performance, hardware sizing หรือ SLA ของโครงการ |
| PDF/A, PDF/UA, signature trust และ reproducibility | A01–A04 | API capability ไม่แทน validator output/cryptographic verification |

## 2. เงื่อนไขก่อนเริ่มตรวจจริงภายหลัง

1. มีคำขอให้ทำ runtime validation แยก และมี environment ที่เหมาะสมโดยรักษาข้อจำกัดเครื่องเดิม
2. กำหนด persona/report/workload และ acceptance policy ให้ชัด โดยเฉพาะ overflow, fonts, fail-on-assets และ signature profile
3. ระบุ exact engine/font/tool versions และ resource/network budget ก่อนรัน
4. ใช้ synthetic data และ endpoints ที่ควบคุมได้ ไม่เปิดเผย secrets หรือเอกสารธุรกิจจริงโดยไม่ได้รับอนุญาต
5. เก็บ inputs/output/logs/expected values และรายงาน limitations ตาม [protocol](protocol.md)

รายการนี้ไม่ใช่คำขอให้ผู้ใช้จัดหาเครื่องหรือ Cloud ตอนนี้ และไม่เป็นเงื่อนไขบังคับติดตั้ง Docker เพื่อปิดงาน desk research

## 3. สถานะการสรุปที่อนุญาต

- สรุปว่าเอกสารเจ้าของระบุ capability ได้เมื่อมี source/version ชัดเจน
- เสนอ implementation options ได้โดยระบุ uncertainty และผลกระทบ
- ตรวจเลขใน fixtures หรือโครงสร้าง contracts แบบเบาได้ตามขอบเขตจริง
- ห้ามสรุปว่า Render ผ่าน ปลอดภัย performance ถึงเป้า PDF ผ่านมาตรฐาน หรือ production ready จากผลศึกษาเอกสารเพียงอย่างเดียว

## 4. ลำดับ runtime validation และ spike แรกสุด (เพิ่ม T28)

รายละเอียดอยู่ใน [Quality Strategy T28](../findings/28-quality-strategy.md) สรุป:

- **Spike แรกสุดที่เสนอ:** render synthetic reference reports 3 แบบ (ใบเสนอราคา, grouped sales, master-detail) ผ่าน Gotenberg จริง เพื่อตรวจตารางข้ามหน้า หัวตารางซ้ำ วรรณยุกต์ไทยใน header/footer และ oversized row ครอบคลุม D01–D05 บางส่วน ส่วน D06–D08 และ A01–A04 มาทีหลัง (ลำดับใน §3.2 ของ T28)
- Spike นี้ **เป็นข้อเสนอ ยังไม่เริ่ม** และไม่ได้เปลี่ยนสถานะ deferred/not-tested ของ case ใด ผ่าน spike ไม่ได้แปลว่า production ready
- ตัวเลือก environment (CI service container, เครื่อง/VM อื่น, เลื่อนต่อ) เป็นทางเลือกให้ผู้ใช้ตัดสิน; ไม่มีการ provision หรือเลือกแทน
- ผลต่อ MVP เมื่อ case ไม่ผ่านรายข้อ และตาราง traceability ครบทุก case อยู่ที่ T28 §1

### Case IDs ที่ยังไม่ตรงกันระหว่าง catalog และ findings (รอ reconcile)

IDs ที่มีเฉพาะใน findings: D02-ONE, D05-COPY-01/WRAP-02/MIX-03/FALLBACK-04/HEADER-05, L01–L04, D06-MISSING-HTTP/-BLOCKED/-TLS, D06-SLOW-CHART, D06-JS-DISABLED, D06-QR-DIGITAL, D06-QR-PRINT, SEC01–SEC08 และ payload QR/Code 128 ที่ต่างกันระหว่าง catalog กับ [finding 12](../findings/12-visual-assets.md) รายการนี้ไม่ได้แก้ catalog

### ผลต่อ MVP (เพิ่ม)

| ประเด็น | Case IDs | ผลต่อข้อเสนอ MVP |
| --- | --- | --- |
| หัวตารางซ้ำ/header-footer ข้ามหน้า | D02, D05-HEADER, D02-HEADER-REPEAT (เสนอ) | ไม่รับรองจนกว่า spike ผ่าน; ผลไม่ผ่านอาจต้องแบ่งหน้าที่ชั้นแอป |
| Regression/reproducibility | A04 | ไม่ใช้ byte-hash เป็นเกณฑ์หลัก ดูชั้นตรวจ T28 §2 |
