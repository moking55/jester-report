# T20 — สิทธิ์และ Data Lifecycle

ตรวจเอกสาร: 12 พฤศจิกายน 2026  
สถานะ: proposed design/tabletop ไม่ใช่ผลทดสอบ security, กฎหมาย หรือข้อกำหนดที่ผู้ใช้อนุมัติ

## 1. หลักการและขอบเขต

Gotenberg authentication ตรวจผู้เรียก engine ไม่แทน authorization ระดับ template/job/artifact ของระบบรายงาน [T04](04-threat-model.md). Application ต้องตรวจ **principal + action + resource + tenant/context** ทุกครั้ง รวม idempotent replay และ download; random ID ไม่แทน access control [OWASP IDOR](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html). Single-tenant ไม่ยกเลิก object-level authorization; multi-tenant เป็นทางเลือกที่ยังไม่ยืนยัน

## 2. Role × Action × Resource Matrix

`A` = อนุญาตเมื่อ policy/ownership/tenant ผ่าน, `—` = ไม่ให้โดย default; ตารางนี้เป็นข้อเสนอ deny-by-default ไม่ใช่สิทธิ์ที่ deploy แล้ว. Owner เป็นความสัมพันธ์กับ object ไม่ใช่ role สากล; admin มีสิทธิ์เท่าที่กำหนดและไม่สมมติอ่าน business data ทุกชิ้น

| Resource/action | Owner/requester | Author | Viewer | API principal | Operator/admin |
| --- | --- | --- | --- | --- | --- |
| Template draft read/edit | A หากมี author grant | A ใน scope | — | — โดย default | A ตาม grant |
| Draft preview ด้วยข้อมูลทดสอบ | A หากมี preview grant | A ใน scope | — | A หากได้รับ grant | A ตาม grant |
| Publish/rollback published pointer | A หากมี publish grant | A เฉพาะผู้ได้รับ publish grant | — | A เฉพาะ grant | A ตาม grant |
| Published template อ่าน metadata/run | A | A | A ตาม grant | A ตาม grant | A ตาม grant |
| Job status/cancel | A เฉพาะงานที่ได้รับสิทธิ์ | A เฉพาะงานที่ได้รับสิทธิ์ | A เฉพาะ status ที่ได้รับสิทธิ์ | A เฉพาะ service scope | A ตาม operational scope |
| Asset read/edit | A ตาม object grant | A ตาม object grant | A เฉพาะ read grant | A ตาม service scope | A ตาม grant |
| Artifact download | A เฉพาะ output ที่ได้รับสิทธิ์ | A หากมี output grant | A หากมี output grant | A หากได้รับ artifact grant | A หากมี business-data grant |
| Secrets/config/audit | — | — | — | เฉพาะ service secret ที่จำเป็น | A เฉพาะ admin/audit grant |

Published version และ asset snapshot ที่ job resolve เป็น immutable references ตาม [T15](15-authoring-lifecycle.md) และ [T19](19-job-processing.md). การมีสิทธิ์ run template ไม่ให้สิทธิ์อ่านข้อมูลทุก dataset; ตรวจ data scope และ recipient scope แยก

## 3. Tenant, Cache, Secrets และ Logs

- ระบุ tenant ใน authenticated context ไม่เชื่อ tenant ID จาก payload เพียงอย่างเดียว; query/filter ต้องบังคับ tenant และ resource grant ฝั่ง server รวม storage object keys, callback mapping และ async workers
- Cache identity ต้องรวม tenant, immutable template/asset version, renderer version/options, principal/data authorization scope และ data fingerprint ที่ไม่เปิดเผย payload; หากจำลอง permission scope ไม่ได้ ให้ปิด cross-user sharing แทน
- Secret references เก็บใน secret manager ตาม deployment ที่เลือก, least privilege/rotation; ไม่ใส่ credentials ใน templates, source control, job logs หรือ URL ที่ log ได้
- Audit ระบุ actor, action, tenant, opaque resource ID, timestamp, outcome, correlation/attempt ID; หลีกเลี่ยง report input, PDF contents, bearer tokens, signed URLs และ secrets. แยก operational error จากข้อความที่ผู้ใช้เห็น [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- Presigned URL เป็น **bearer token**: ผู้ถือสามารถใช้ภายในช่วงอายุที่มีผล; ตรวจสิทธิ์ตอนสร้างอย่างเดียวไม่รองรับ revoke รายบุคคลทันทีหลังแจก link. หากต้องเพิกถอนทันที ใช้ authenticated download gateway ที่ตรวจทุกครั้ง หรือระบบ revocation ที่พิสูจน์ได้; กรณีเลือก signed URL ต้องยอมรับ revocation window พร้อม TTL และ audit. URL หมดอายุอาจเร็วกว่ากำหนดเมื่อ credentials ผู้เซ็นหมดอายุ [S3 presigned URL example](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html); ไม่ได้เลือก AWS

## 4. Data Lifecycle และ Policy Options

| Data/store เชิงแนวคิด | Owner/access | Retention option | Delete/backup |
| --- | --- | --- | --- |
| Template draft, published version และ assets | Author/publisher ภายใต้ tenant/grants | Immutable published versions ตาม policy และ references ของ jobs | ลบ draft เมื่อ policy อนุญาต; published ที่ยังถูกอ้างถึงต้องป้องกัน orphan; backup/restore รักษา versions |
| Request parameters/input snapshot หรือ reference | Job owner/service; หลีกเลี่ยง copy หากไม่จำเป็น | กำหนด TTL หรือเก็บเพียง reference/hash ตาม reproducibility/privacy tradeoff | ลบเมื่อหมด TTL; backup อาจเก็บต่อจนหมดวงรอบ ต้องระบุแยก |
| Temporary HTML/assets/partial uploads | เฉพาะ worker/engine attempt | สั้นที่สุดตาม job/timeout | Cleanup success/failure/cancel/crash และ orphan sweeper; ไม่พึ่ง request completion อย่างเดียว |
| Job metadata/attempt IDs/idempotency keys | Owner/service และ operator ตาม scope | กำหนด job history และ key TTL แยกจาก artifact | Expiry/delete ตาม policy; replay หลัง TTL เป็น request ใหม่ถ้า contract ระบุ |
| PDF artifact และ download links | ผู้ได้รับสิทธิ์ต่อ artifact | ตาม retention ที่ธุรกิจกำหนด; URL TTL แยกจาก PDF retention | Delete artifact, revoke gateway links; signed URL อาจยังใช้ได้จน expiry หาก object/credentials ยัง valid |
| Logs/audit | Operators/auditors ตาม grant | Operational logs กับ audit อาจต่าง retention; ระบุค่าเมื่อมี requirement | Redaction ก่อนบันทึก; backup/log export และ deletion ต้องกำหนด separately |
| Secrets/credentials | เฉพาะ service/admin grant | Rotate/expire ตาม policy | Revoke และลบ references; backup key lifecycle ต้องกำหนด |

ไม่มีระยะ retention เป็นตัวเลขที่ยืนยันแล้ว; compliance, legal hold, backup retention และ secure erasure เป็น open decisions ตาม deployment/ตลาดจริง

## 5. Tabletop Authorization Walkthrough

1. Tenant B รู้ job ID ของ tenant A: request status/cancel ต้องถูก deny ด้วย server-side tenant + object grant แม้ ID ถูกต้อง; error ไม่เผยข้อมูลที่ไม่ควรรู้
2. Author A ใช้ template ID ของ B preview: deny ก่อนโหลด template/assets หรือข้อมูล; correlation log ไม่ใส่ payload
3. Viewer A เดา artifact ของผู้อื่น: deny ทั้ง metadata/download; storage ไม่เปิด direct public access โดยปริยาย
4. Caller เคยมีสิทธิ์แล้วถูก revoke ก่อน idempotent retry: ตรวจสิทธิ์อีกครั้งก่อนคืน job/artifact แม้ key เดิม
5. User ถูก revoke หลังได้รับ signed URL: URL อาจยังใช้ได้จน expiration หรือถูก revoke ด้วยกลไกที่ provider รองรับ; **recheck ตอนส่ง URL ไม่ใช่ recheck ทุกครั้งที่ใช้ URL**
6. Preview draft ใช้ permission แยกจาก publish/run; rollback เปลี่ยน active pointer ไม่เขียนทับ immutable version หรือ artifacts เดิม

ทั้งหมดเป็นการ walk through policy เท่านั้น ไม่มีระบบจริงหรือ access-control test; D07-AUTH ยัง deferred/not-tested
