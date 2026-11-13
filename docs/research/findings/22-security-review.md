# T22 — Security Controls: Tabletop Review

วันที่: 12 พฤศจิกายน 2026  
สถานะ: เอกสารและการวิเคราะห์ scenario; **ไม่มี security probe, runtime verification หรือ penetration test**

ขอบเขตต่อจาก [T04 threat model](04-threat-model.md): caller, template definition/expression, application rendering, Gotenberg, external assets/callbacks และ artifact storage เป็น trust boundaries แยกกัน การเลือก implementation ยังเปิดอยู่

## Scenario matrix

| ID | Input/เหตุการณ์ | Documented controls และข้อเสนอ | Expected policy / หลักฐานที่ยังขาด |
| --- | --- | --- | --- |
| SEC01 | HTML อ้าง image/font หรือ redirect ไป private host | Gotenberg 9.x มี outbound policy แยกตาม family; application ต้องจำกัดสิทธิ์ส่ง URLs ด้วย | Deny ตาม policy รวม redirect/DNS; ยังไม่ส่งคำขอจริง |
| SEC02 | `downloadFrom` หรือ webhook ชี้ปลายทางที่ไม่ไว้ใจ | ปิด capability ที่ไม่ใช้และกำหนด allowlist อย่างรัดกุม [Secure deployment](https://gotenberg.dev/docs/operate/secure) | ตรวจปลายทาง/credentials/redirect ทุก family; runtime unknown |
| SEC03 | Asset ถูกบล็อกหรือ timeout | `failOn` fields แยก resource HTTP errors/network failures; ไม่ครอบคลุมทุกกรณี [HTML conversion](https://gotenberg.dev/docs/chromium/convert-html) | Critical asset ไม่หายเงียบตาม policy; ยังไม่ได้ทดสอบ |
| SEC04 | Template/helper พยายามอ่าน secrets, file หรือ execute expression | Treat untrusted template as code; minimal context, safe helpers และ isolation [OWASP SSTI](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Template_Injection_Prevention_Cheat_Sheet.html) | แยก application sandbox จาก browser settings; ไม่มี implementation ให้ตรวจ |
| SEC05 | User A ใช้ job/template/artifact ID ของ user B หรือ tenant B | Deny by default, ตรวจ authorization ต่อ object และทุก request [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Engine authentication ไม่แทน app authorization; ยังไม่ทดสอบ |
| SEC06 | Callback ซ้ำหรือปลอม / job timeout แล้วมี output ภายหลัง | Authenticate callback, correlate job/attempt, deduplicate, ตรวจ transition ก่อนเผยแพร่ | ไม่มีหลักฐานว่าระบบรับประกัน exactly-once; ผูก contract กับ T19/T20 |
| SEC07 | Nested template, ZIP, data หรือ output โตเกิน budget | Body/archive/queue/timeout limits ตาม [Gotenberg 9.x](https://gotenberg.dev/docs/operate/limits); app กำหนด quotas เพิ่ม | Limits ต้องกำหนดจาก workload; ยังไม่ได้วัดหรือ probe |
| SEC08 | Logs/debug เปิดเผย token, request data, credentials | Redaction, restricted access, retention; ระวัง debug/telemetry [Telemetry](https://gotenberg.dev/docs/telemetry) | ทบทวน effective logs ใน deployment จริงภายหลัง |

[Outbound controls](https://gotenberg.dev/docs/operate/outbound) ระบุ deny-list ชนะ; allow-list เป็น exclusive และ URL ที่ match ข้าม private/public IP-class checks จึงต้องตรวจ pattern และผลของ proxy โดยตรง ข้อเท็จจริงนี้เป็น documented policy ไม่ใช่ผล exploit หรือหลักฐานว่าระบบถูกเจาะ

## Residual risk / deferred verification

การจำกัด browser JavaScript ไม่แก้ SSTI ใน application template layer; การเชื่อมต่อ engine ที่ authenticated ไม่ยืนยันสิทธิ์ผู้อ่าน PDF; HTTP success ไม่รับรอง asset completeness การทดสอบ SEC01–SEC08 ต้องทำใน controlled environment เมื่อมีขอบเขต/ทรัพยากรเหมาะสม ไม่ใช้บริการภายนอกหรือ probe เครือข่ายจริงในรอบนี้ ดู [validation backlog](../validation/deferred-runtime.md)

Scenario values และ policies เป็นข้อเสนอให้ทบทวนร่วมกับ API/job/access contracts ยังไม่ใช่ controls ที่มีอยู่จริง
