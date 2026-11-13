# T17 — Data Source และ Snapshot Options

วันที่ตรวจ: 12 พฤศจิกายน 2026  
สถานะ: comparison จากเอกสาร; ไม่เชื่อมฐานข้อมูลจริง ไม่เลือก connector

## การเปรียบเทียบสำหรับ sales summary เดียวกัน

สมมติรายงาน S01–S04 ต้องใช้ `[2026-11-01, 2026-12-01)` และ timezone Asia/Bangkok พร้อม total 2400.00 จาก [T01](01-product-brief.md). ตัวอย่างนี้ไม่ยืนยันว่าผู้ใช้ยอมรับ JSON-first หรือ data snapshot แบบใด

| ประเด็น | JSON จาก caller | REST connector ของ report server | SQL connector ของ report server |
| --- | --- | --- | --- |
| Filter/snapshot owner | Caller กรองและส่ง snapshot/reference; service ตรวจ metadata ตาม policy | Server ดึงจาก API ตาม contract; multi-request pagination ต้องมี snapshot token หรือเปิดเผยความเสี่ยงข้อมูลเปลี่ยน | Server ใช้ parameterized query/read-only role; transaction snapshot ขึ้นกับ database และ isolation จริง |
| Credentials | Caller ไม่ส่ง database credential ให้ renderer | เก็บ secret ใน secret manager/config ที่ควบคุมสิทธิ์; ไม่อยู่ใน template/log | Database credential แบบ least privilege แยกต่อ connection/tenant; ไม่ฝังใน template |
| Limits | จำกัด payload/rows ก่อน enqueue และ reject พร้อม error | จำกัด HTTP timeouts, pagination/rows, response bytes, retry และ allowed hosts | จำกัด statement time, rows, query budget; bind ค่าพารามิเตอร์และ allowlist identifiers |
| Network | Caller ถึง application; renderer ไม่ต้องเข้าถึงแหล่งข้อมูลภายนอกหาก assets local | Application egress allowlist และ redirect policy; แยกจาก browser ของ Gotenberg | Network policy เฉพาะ database host/port; credentials และ privileges จำกัดตาม tenant |
| Consistency | Caller ยืนยันเวลาตัดข้อมูลและภาระ audit; stale data ยังเป็นไปได้ | Dataset ที่เปลี่ยนระหว่าง pages อาจซ้ำ/ขาด; API snapshot support ต้องตรวจจริง | Single query และหลาย queries ไม่รับประกัน snapshot เหมือนกันทุกระบบ; isolation และ transaction scope ต้องกำหนด |
| ต้นทุน | เริ่ม integration น้อยเมื่อ upstream จัดข้อมูลแล้ว; payload ใหญ่เป็นภาระ | เพิ่ม adapter, auth, egress และ source availability | เพิ่ม driver, SQL authorization, schema drift, transaction/load และปฏิบัติการ credential |

## ข้อเสนอแบบมีเงื่อนไข

ถ้าระบบต้นทางสามารถส่งข้อมูลและ snapshot metadata ครบ ให้เริ่ม JSON input เป็น candidate ลดจำนวน connector ที่ต้องดูแล; หากต้องให้ผู้ใช้ธุรกิจสร้างรายงานจาก database/API เอง ต้องประเมิน connector ที่จำเป็นต่อ use case ก่อนเลือก MVP. ไม่ถือว่า JSON-first ได้รับอนุมัติหรือ connector แรกต้องเป็นชนิดใด

HTTP retries ใช้เฉพาะ operation ที่ semantics อนุญาตและต้องไม่ซ่อน partial fetch; slow SQL/API ต้อง timeout ด้วย structured failure ไม่มี PDF ที่ข้อมูลบางส่วน เว้น policy อนุญาตและระบุชัด. การอ่านหลายแหล่งในเวลาต่างกันต้องบันทึก `source`, `asOf`, version/snapshot id และรายงาน missing/unknown แทนการอ้าง atomic consistency

## Failure walkthrough

- API pagination เจอข้อมูลแทรกระหว่างหน้า: เกิด record ซ้ำ/ขาด; ใช้ stable cursor/snapshot เมื่อ provider รองรับ หรือ reject/report inconsistency; ไม่อ้างว่าทุก provider รองรับ
- SQL ช้า/rows เกิน: ยกเลิกเมื่อถึง limit แล้วรายงาน error ไม่ถือ PDF บางส่วนว่าสำเร็จ
- Account มี write privilege เกินจำเป็น: read-only role และแยก credentials/tenant; query parameterization ไม่แทน authorization
- ตัวกรองวันที่ 1–30 พ.ย. กับ `toExclusive=1 ธ.ค.`: ต้องกำหนด timezone และ semantics เหมือนกันทุกแหล่งก่อนรวมยอด

[OWASP query parameterization](https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html) รองรับ parameterized queries; [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) ใช้ประกอบ egress/redirect policy. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) เป็นตัวอย่าง vendor-specific ว่า isolation มีผลต่อ snapshots ไม่ใช่ข้อกำหนดให้เลือก PostgreSQL หรือรับประกัน database อื่น

ยังไม่เชื่อมแหล่งข้อมูลจริง ไม่มีผลวัด query speed, consistency หรือการป้องกันช่องโหว่; connector/tenant/storage/deployment เป็น open decisions
