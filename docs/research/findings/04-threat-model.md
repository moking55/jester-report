# T04 — Threat Model จากเอกสาร

ตรวจวันที่: 12 พฤศจิกายน 2026  
สถานะ: documented controls และข้อกำหนดเสนอ ไม่ใช่ security test/penetration test  
ไม่มี Docker, running application, probes หรือการเรียก network targets เพื่อทดสอบช่องโหว่

## 1. ขอบเขตระบบเชิงแนวคิด

ผู้เรียกส่ง data/parameters และ template reference ให้ **application** ตรวจสิทธิ์และความถูกต้อง จากนั้น template layer สร้าง HTML/assets ส่ง **Gotenberg** เพื่อแปลงเอกสาร แล้ว application จัดการ output/download/storage

นี่เป็นการแบ่งหน้าที่เพื่อวิเคราะห์ trust boundaries ไม่ใช่การเลือกบริการ โครงสร้างโค้ด ฐานข้อมูล หรือ deployment จริง Input templates/assets/output ต้องถือเป็นข้อมูลที่อาจไม่ไว้วางใจตามแหล่งที่มา

## 2. Boundary / Attack Surface Matrix

| Boundary | ความเสี่ยง | ข้อกำหนดที่เสนอ | Gap / วิธีตรวจภายหลัง |
| --- | --- | --- | --- |
| Caller → template/job/artifact | อ่าน/แก้งานผู้อื่น ข้าม tenant | Object-level authorization ทุกการเรียกและ download; ownership/tenant scope | D07-AUTH; ยังไม่มีแอปทดสอบ |
| Data → HTML/URL/CSS | HTML injection หรือ URL อันตราย | Data schema, contextual encoding และ URL policy; ไม่ต่อ untrusted data เป็น template source | D06/D07; input validation ไม่แทน sandbox |
| Template/helpers → host | SSTI, อ่านไฟล์/secrets, arbitrary code, loops มากเกิน | Minimal context, allowlisted helpers/partials, no arbitrary eval/host access และจำกัดทรัพยากร | D07; template engine ยังไม่เลือก |
| HTML/assets/download/webhook → network | SSRF, redirect/private endpoint access | Egress policy แยกแต่ละ family และปิด capability ที่ไม่ใช้ | D07-EGRESS; documented controls ยังไม่ทดสอบ |
| Browser → filesystem/context | Local-file access, cookies/cache/storage ข้ามงาน | รักษา isolation defaults และทบทวน flags ที่ลด protection | D07; ยังไม่ตรวจ runtime |
| Request/archive → resources | Large body, ZIP expansion, nesting/output growth, queue exhaustion | App quotas กับ Engine body/time/queue/download/PDF limits ร่วมกัน | D08; ไม่มี load/resource probes |
| Engine → PDF | ตอบสำเร็จแต่โลโก้/ฟอนต์/กราฟสำคัญหาย | Mandatory-resource policy, readiness และการแจ้ง failure ที่เจาะจง | D06; HTTP success ไม่ยืนยันครบ |
| PDF/storage/cache → reader | File disclosure, URL ใช้เกินสิทธิ์, path/filename abuse | Safe storage references, expiry, retention/deletion และ tenant-safe cache keys | D07-AUTH; storage ยังไม่เลือก |
| Logs/debug → operator | Payload, cookies, headers หรือ credentials รั่ว | จำกัด debug/protocol logs, redaction, access และ retention | Static log policy; runtime log leakage ไม่ทดสอบ |

ฐานวิเคราะห์ SSTI: [OWASP template injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Template_Injection_Prevention_Cheat_Sheet.html) และ [Handlebars security guidance](https://handlebarsjs.com/guide/security.html) Handlebars เป็นเพียง candidate: HTML escaping ไม่ครอบคลุม URL/CSS/JS contexts และตัวมันเองไม่ใช่ sandbox จึงยังไม่เลือกหรือรับรองว่าปลอดภัยสำหรับ user-authored templates

## 3. Gotenberg Controls ที่ documented

- [Secure deployment](https://gotenberg.dev/docs/operate/secure) ระบุค่าเริ่มต้นไม่บังคับ credentials; มี Basic/OIDC สำหรับผู้เรียก Engine การตรวจสิทธิ์ template/job/artifact ยังเป็นหน้าที่ application ตามข้อเสนอของโปรเจกต์
- [Outbound policy](https://gotenberg.dev/docs/operate/outbound) ครอบคลุมหลายเส้นทางและมี precedence: deny-list ชนะ, allow-list เป็น exclusive และ matched URLs ข้าม IP-class checks ต้องเขียน policy โดยเข้าใจผลนี้ ไม่ใช่ถือว่า allow-list เพิ่มข้อยกเว้นบน top ของ internet access เสมอ
- พฤติกรรม allow-list ดังกล่าวเป็น documented operator policy ไม่ใช่หลักฐานว่ามี DNS-rebinding vulnerability; ยังไม่มี exploit/probe ที่ดำเนินการในงานนี้
- [Resource limits](https://gotenberg.dev/docs/operate/limits) มี body/time/queue/archive/download/PDF controls บางอย่างไม่มี default cap การตั้งค่าต้องอิง deployment จริง ไม่แปลงค่าจากคู่มือเป็น measured capacity
- [Telemetry](https://gotenberg.dev/docs/telemetry) เป็นข้อพิจารณาด้านข้อมูลใน logs; การเปิด debug ต้องพิจารณา sensitive content

คำแนะนำนี้ไม่ใช่ config ที่ทดลองแล้ว การปิด JavaScript ใน browser ไม่แก้ SSTI ใน application template layer และการมี Engine authentication ไม่ทำให้ download URL หรือ app resources มี authorization โดยอัตโนมัติ

## 4. Security Requirements ที่ยังต้องตัดสินใจ

1. ใครมีสิทธิ์ author/publish templates และต้องแยก trusted/untrusted authors หรือไม่?
2. อนุญาต remote assets, callbacks, data connectors หรือ script/helper ประเภทใด?
3. มี tenant isolation/PII/retention requirements ใดตาม deployment ที่เลือก?
4. เมื่อ critical resource โหลดไม่ครบ ควร fail, warn หรือมี explicit optional flag?
5. Resource budget และ timeout ควรเป็นเท่าใดเมื่อทราบ workload? ยังไม่มีตัวเลขแนะนำจากการวัด

## 5. Verification Backlog

ดู [D07/D08 และกรณีที่เกี่ยวข้อง](../validation/case-catalog.md) ต้องตรวจ URL/redirect/file/helper/object boundaries ใน environment ที่ควบคุมได้ภายใต้คำขอแยก ไม่ probe LAN/cloud metadata จริง ไม่ส่ง secrets ให้ templates และไม่เปิด lab เพื่อปิด checkpoint นี้

Residual risk รอบนี้: ยังไม่มี implementation, config หรือ enforcement ที่พิสูจน์แล้ว Threat model ช่วยกำหนดงานได้ แต่ไม่รับรองว่า runtime ปลอดภัย

## 6. Review

security_license แชร์ boundary/licensing caveats กับอีกสอง subagents และรับ egress/readiness findings กลับมา ใช้ agy `gemini-3.8-flash-high` แบบ no-tools/no-writes; initial 90s และ follow-up 60s รายงาน exit 0 / SUCCESS, conversation `d44e2bff-0a43-4518-92e3-21c30e31bca2`

Parent ตรวจ primary sources แล้วรับ separation ของ app authorization/template sandbox/browser controls และ resource-failure policy ปฏิเสธการอนุมานว่า allow-list trust exception แสดง DNS flaw เพราะหลักฐานไม่สนับสนุน และไม่มีการใช้ผล critique เป็น security assurance
