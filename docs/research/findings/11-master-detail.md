# T11 — Master-detail และส่วนประกอบใช้ซ้ำ

สถานะ: desk research, synthetic fixture และตรวจ arithmetic แบบเบา; pagination/PDF ยัง deferred/not-tested

## หลักฐาน

[JasperReports 7.1.1 Subreport Sample](https://jasperreports.sourceforge.net/sample.reference/subreport/README.html) ระบุว่า master เป็นผู้จัดหา subreport design, data source และ parameters; subreport คืนค่าผ่าน variables ได้ และเอกสารระบุว่าสามารถซ้อนได้ แต่ไม่ได้กำหนดว่าโครงการนี้รองรับ recursion ไม่จำกัด

[JasperReports 7.1.1 List Sample](https://jasperreports.sourceforge.net/sample.reference/list/README.html) แสดงทางเลือก dataset run + repeated content โดยไม่ต้องสร้าง template แยกสำหรับรายการง่าย ๆ เป็น benchmark ด้าน semantics ไม่ใช่ feature ของ Gotenberg โดยตรง

## เปรียบเทียบทางเลือก

| ประเด็น | Partial / repeated section | Subreport semantics |
| --- | --- | --- |
| Scope ข้อมูล | รับ data context และ parameters ที่กำหนด | อาจมี dataset/parameters ของตนเอง |
| Lifecycle | ส่วน layout ที่ reuse ใน template หลัก | Definition แยก; อาจต้องส่งกลับค่าที่ aggregate |
| Version | ต้องอ้าง component ID และ immutable version | ต้องอ้าง report ID/version และ dependencies |
| ข้อแลกเปลี่ยน | เหมาะกับ layout ซ้ำเมื่อไม่ต้องมี execution scope แยก | ยืดหยุ่นกว่า แต่ออกแบบ data snapshot, error และ security เพิ่ม |
| Pagination | HTML/CSS flow ต้องทดลอง | ความหมายแบบ Jasper ไม่ได้เกิดอัตโนมัติจาก HTML/Gotenberg |

ตารางนี้เป็น options/inference ยังไม่เลือกสถาปัตยกรรม ต้องกำหนดว่า renderer หรือ application เป็นผู้ประมวลผล data, child execution และ return values หากมี

## Contract ที่เสนอสำหรับ fixture

1. Parent มี unique `orderId`; child มี `detailId` และ `parentId` ที่ตรงกับ parent ปัจจุบัน ตรวจ orphan และ child ซ้ำเป็น error ก่อนสรุปยอด
2. Component reference เป็นคู่ `(id, version)`; missing component หรือ version mismatch เป็น error ไม่ใช้ latest แทนโดยเงียบ
3. Parameters ส่งผ่านอย่างชัดเจน เช่น locale/currency; ห้าม implicit access ถึง credentials หรือข้อมูลของ parent อื่น
4. `details: []` เป็น empty case ที่คำนวณ 0.00 ใน fixture ไม่ยืนยันว่าอนุญาต publish เอกสารธุรกิจจริง; `details: null` เป็น invalid ในตัวอย่าง
5. ขอบเขต nesting ของ fixture คือหนึ่งระดับ; ความลึกสูงสุด, cycle detection, snapshot consistency และ return-value conflict ยังเป็น open decisions

## Cases และผลที่คาดหวัง

[master-detail-cases.json](../../../research/specimens/master-detail-cases.json): PO01/D01–D02 = 350.00; PO02 ไม่มี detail = 0.00; grand 350.00; negative adjustment แยกกรณี = -10.00; orphan/missing component/null details ต้องแจ้ง error กรณี `long-detail` มีเนื้อหายาวสำหรับออกแบบ validation ไม่ถือว่าได้ข้ามหน้าจริง

ตรวจ parent/detail IDs และตัวเลขด้วย Python Decimal แยกจาก Renderer; ไม่มีการทดสอบว่าแถวหรือส่วนย่อยข้ามหน้าอย่างไร ดู [D03/D04](../validation/case-catalog.md) และ [deferred backlog](../validation/deferred-runtime.md)
