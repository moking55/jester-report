# Statement of Intent: Jester MCP สำหรับคนทำรายงาน

ยืนยันโดยผู้ใช้: 23 พฤศจิกายน 2026 (interview-me)
สถานะ: confirmed intent — ใช้เป็นต้นทางของ [SPEC-mcp.md](../../SPEC-mcp.md)

| หัวข้อ | ข้อสรุป |
| --- | --- |
| Outcome | Remote MCP connector ใน claude.ai: คนทำรายงานแนบเอกสารหรือสั่งด้วยข้อความ แล้ว AI สร้าง/แก้รายงานใน Jester จนได้ draft ที่ validate ผ่านและ preview ได้ |
| User | คนทำรายงานในทีม (ไม่ใช่ dev) ที่ใช้ claude.ai อยู่แล้ว |
| Identity | แต่ละคน login ด้วยบัญชี Jester ของตัวเองผ่าน OAuth ตอนเพิ่ม connector; ประวัติแสดงชื่อคนแก้; ลบบัญชีแล้วสิทธิ์ใน MCP หายทันที |
| Knowledge | กติกาของ skill `to-jester` (กระดาษ, ม้วน, layout, block, tag ฯลฯ) ไปกับ MCP เพราะ claude.ai ไม่มี skill ในเครื่องผู้ดูแล |
| Why now | ผู้ดูแลเป็นคอขวดคนเดียวที่แปลงเอกสารเป็นรายงานได้; อยากให้คนทำรายงานทำเองได้ |
| Success | แนบ PDF ใบเสนอราคาใน claude.ai → ได้ draft ใน Jester ที่ preview ตรงต้นฉบับ → คนเปิด Studio แล้วกด publish เอง |
| Constraint | MCP อยู่หลัง reverse proxy เดิมที่เปิด HTTPS ออก internet; AI ทำได้แค่ถึง draft |
| Out of scope | publish/ย้าย alias, จัดการผู้ใช้หรือ API key, retention, theme, render ให้ระบบภายนอก, งานระดับ server, stdio สำหรับ dev (อาจทำภายหลัง) |

## ทางที่เปลี่ยนระหว่าง interview

ร่างแรก (stdio บนเครื่องผู้ดูแล, username/รหัสผ่านใน env, tool ดูแลระบบ) ถูกแทนทั้งหมด: ผู้ใช้คือคนทำรายงานหลายคน ใช้ผ่าน claude.ai จึงต้องเป็น remote HTTP + OAuth และ tool เน้นงานทำรายงาน
