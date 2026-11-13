# Checkpoints 03–04 — Desk Research Review

วันที่: 12 พฤศจิกายน 2026  
Verdict: **desk review-complete**; PDF runtime, pagination, font rendering และ scan **deferred/not-tested**

| งาน | ผลส่งมอบ | หลักฐานและข้อจำกัด |
| --- | --- | --- |
| T07 | [Gotenberg contract](findings/07-gotenberg-contract.md) | 9.x route, fields และ errors จาก official docs; ไม่ส่ง request จริง |
| T08 | [Pagination](findings/08-pagination.md) | CSS specification, versioned issue reports, cases D01–D05; ไม่ reproduce |
| T09 | [Thai และ fonts](findings/09-thai-fonts.md) | Sarabun/Noto metadata และ OFL; glyphs/embedding/locale ยังไม่ทดสอบ |
| T10 | [Grouping/totals](findings/10-grouping-totals.md), [cases](../../research/specimens/grouped-cases.json) | Decimal examples และ validation policy แบบสมมติ; page subtotal ยังไม่ทดสอบ |
| T11 | [Master-detail](findings/11-master-detail.md), [cases](../../research/specimens/master-detail-cases.json) | Data/parameter/version contracts และ parent-child expected values; ไม่ทดสอบ pagination |
| T12 | [Visual assets](findings/12-visual-assets.md) | SVG/PNG/chart/QR/Code 128 options และ deferred scans; ไม่มี benchmark |

## การทำงานร่วมกัน

ผู้ใช้อนุญาต subagents สำหรับ Checkpoints 3–4 เป็นกรณีนี้: engine_layout ดู T07–T08, font_visual ดู T09/T12 และ semantic ดู T10–T11 ทั้งสามสื่อสารข้ามสายเรื่อง header/footer, fonts และ page subtotal โดย parent ตรวจและรวมผล แยกกรรมสิทธิ์ไฟล์เพื่อไม่ทับงาน ไม่มีการเรียก Gemini/Antigravity และไม่ใช้ Docker หรือบริการ Render ภายนอก

## ข้อสรุป

- Header/footer มีบริบทและข้อกำหนด assets ของตัวเอง; การโหลด asset สำคัญผิดพลาดต้องมี policy ชัดเจน
- CSS fragmentation เป็น specification; issue เก่าที่อ้างไม่ยืนยันพฤติกรรม Chromium ของ Gotenberg 9.x
- Group subtotal เป็นผลของขอบเขตข้อมูล ส่วน page subtotal ต้องรู้ layout จริง จึงยังไม่รับรอง
- ฟอนต์มี metadata/license ที่ศึกษาได้ แต่ glyph shaping, line breaking และ PDF text extraction ของระบบยังไม่พิสูจน์
- QR decode จาก PDF กับ scan จากกระดาษเป็นคนละกรณี และ GS1-128 มีข้อกำหนดต่างจาก Code 128 ทั่วไป

## Verification

ตรวจโครงสร้าง JSON และ expected totals ด้วย Python standard library แบบ Decimal; ตรวจลิงก์ภายใน UTF-8, task dependencies และ checkpoint status หลังรวมผล ดู [validation cases](validation/case-catalog.md) และ [deferred backlog](validation/deferred-runtime.md). การตรวจข้อมูลสังเคราะห์ไม่ใช่การทดสอบรายงาน PDF จริง
