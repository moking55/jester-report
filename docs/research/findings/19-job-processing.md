# T19 — Job Lifecycle, Retry และ Recovery

ตรวจเอกสาร: 12 พฤศจิกายน 2026  
สถานะ: **ข้อเสนอเชิง contract และ tabletop**, ไม่ใช่ implementation หรือผล runtime; ไม่ได้รัน Gotenberg หรือจัดเตรียมบริการ

## 1. ขอบเขตความรับผิดชอบ

Gotenberg 9.x จัดการ conversion และรอคิวของ engine แต่เก็บสถานะระหว่าง requests ไม่ได้ จึงไม่ถือว่าคิว engine เป็น durable application queue [Gotenberg production](https://gotenberg.dev/docs/operate/production). Application ที่เลือกทำ async ต้องรับผิดชอบ durable job, authorization, idempotency, artifact lifecycle และ recovery; ยังไม่เลือก queue, database หรือ deployment

ใน webhook mode ของ Gotenberg 9.x ต้องส่งทั้ง `Gotenberg-Webhook-Url` และ `Gotenberg-Webhook-Events-Url`; `204` หมายถึงยอมรับคำขอ ไม่ใช่ PDF สำเร็จ จากนั้น engine ส่งผลลัพธ์ไป upload URL และส่ง success/error ไป events URL [webhooks 9.x](https://gotenberg.dev/docs/webhook-download). `Gotenberg-Trace` ใช้ correlation ไม่ใช่หลักฐานว่า event เป็นของแท้; webhook receiver ต้อง authenticate และผูก attempt ที่อนุญาต

ข้อเสนอจาก T15/T18: เมื่อรับ job ต้อง resolve **published immutable template version และ asset snapshot** พร้อม scope ของ caller/tenant เพื่อไม่ให้การ publish หรือ rollback ภายหลังเปลี่ยนความหมาย job เก่า; input snapshot/reference และ retention ยังคงเป็นตัวเลือกที่ต้องกำหนดตามข้อมูลจริง Preview draft ต้องตรวจสิทธิ์ author แยกจาก published report

## 2. State Model ที่เสนอ

| State | ความหมาย | การเปลี่ยนที่อนุญาต |
| --- | --- | --- |
| `queued` | คำขอผ่าน validation/auth แล้วบันทึก durable job | `running`, `canceled` |
| `running` | worker ถือ lease/attempt และกำลังเรียกหรือรอผล renderer | `succeeded`, `retry_wait`, `failed`, `canceled` |
| `retry_wait` | ล้มเหลวชั่วคราว กำหนด `nextAttemptAt` | `queued`, `canceled`, `failed` เมื่อหมด budget |
| `succeeded` | commit artifact reference แล้วและตรวจ owner/job/attempt ผ่าน | terminal |
| `failed` | permanent error หรือ attempts หมด พร้อม error ที่ไม่เปิดเผยข้อมูลลับ | terminal |
| `canceled` | ระบบตัดสินใจไม่เผยแพร่ผลจาก job อีก | terminal |

`cancel_requested` เป็น flag ไม่ใช่ terminal state: worker พยายามหยุดงาน แต่ Engine อาจทำต่อได้แบบ **best effort**. หาก output มาถึงหลัง job canceled ต้อง quarantine/ลบทิ้งตาม policy ไม่เปลี่ยน terminal state; หาก success ถูก commit ก่อน cancel ให้ตอบสถานะจริงแทนการกล่าวว่ายกเลิกสำเร็จ

Invariants: (1) `succeeded` ต้องมี committed artifact reference ที่อ่านได้ตาม storage policy พร้อม tenant/job ownership, (2) terminal state ไม่ถูก event เก่าหรือ duplicate เขียนทับ, (3) attempt แยกจาก job ด้วย attempt ID และ lease/fencing token, (4) ทุก transition เขียน audit ที่ไม่เก็บ payload/secrets, (5) state transition กับ artifact publication ต้องมี atomicity หรือ reconciliation protocol ที่ออกแบบชัด ไม่สมมติ distributed transaction ฟรี

## 3. Retry, Idempotency และ Callback

| Trigger | การจัดการเสนอ | หมายเหตุ |
| --- | --- | --- |
| Input/template validation, auth, unsupported configuration | Permanent `failed`; แก้คำขอ/สิทธิ์ก่อนสร้างงานใหม่ | 400/401/403 ไม่ retry อัตโนมัติ |
| 429, 503, network interruption | Retry ภายใต้ attempt limit, deadline และ exponential backoff + jitter | จำกัดความแออัด ไม่สมมติทุก 500 transient; [backoff guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html) |
| Renderer 409 resource failure | แยก error code/รายละเอียด; retry เฉพาะสาเหตุ transient ที่ policy อนุญาต | ไม่สับสนกับ application 409 idempotency conflict |
| Timeout หลัง Engine อาจทำงานสำเร็จ | สถานะผลไม่แน่นอน; reconcile attempt/artifact ก่อน retry, dedupe committed output | ไม่มี exactly-once guarantee |
| Duplicate/out-of-order callback | Authenticate, ตรวจ tenant/job/attempt และ idempotent upsert, ignore stale terminal updates | `Gotenberg-Trace` อย่างเดียวไม่ใช่ auth |
| Worker restart/lease expiry | Worker ใหม่ claim ด้วย fencing token ใหม่; attempt เก่าไม่มีสิทธิ์ commit ทับ | แยก crash ก่อน commit/หลัง commit |

Application idempotency เสนอ scope `(tenant, principal, key)` + request fingerprint ของ mode, template version, input/parameters, data reference และ options ภายใน TTL ที่ต้องตัดสินใจ; payload เดิมได้ผลเดิมหลังตรวจสิทธิ์อีกครั้ง payload ต่างใน scope เดียวกันคืน conflict โดยไม่เปิดเผยข้อมูลข้าม tenant. การรับ key ไม่แทน durable storage หรือ artifact commit

Docs 9.x ระบุ upload retries สำหรับ connection error, 429 และ 5xx ตาม configuration; อย่านำ exception หรือจำนวน retry จาก 8.x มาเหมารวม [webhook retries](https://gotenberg.dev/docs/webhook-download). Upload กับ event เป็นคนละ delivery; ต้องออกแบบรับทั้ง upload สำเร็จแต่ event หาย และ event ซ้ำ โดยไม่ถือ `204` เป็นหลักฐานงานสำเร็จ

## 4. Tabletop Scenarios

[job-scenarios.json](../../../research/specimens/job-scenarios.json) เป็น synthetic scenarios ไม่ใช่ execution log:

| ID | เหตุการณ์ | Expected invariant |
| --- | --- | --- |
| J01 | `queued→running→succeeded` | success มี artifact ref ถูก owner/tenant |
| J02 | 429 แล้ว retry สำเร็จ | `running→retry_wait→queued→running→succeeded`; attempt เปลี่ยน |
| J03 | permanent invalid input | `running→failed`; ไม่มี artifact published |
| J04 | ยกเลิกขณะ queued | `queued→canceled`; terminal |
| J05 | ยกเลิกขณะ running แล้ว output มาช้า | best effort; `canceled` ไม่ถูก late success เขียนทับ |
| J06 | timeout หลัง upload อาจสำเร็จ | reconcile ก่อน retry; commit ได้อย่างมากหนึ่ง visible artifact ต่อ job |
| J07 | worker crash และ lease หมด | attempt ใหม่ใช้ fencing; attempt เก่า commit ทับไม่ได้ |
| J08 | duplicate callback และ terminal race | idempotent processing, terminal ไม่ย้อนกลับ |
| J09 | retry budget หมด | `retry_wait→failed`; ระบุสาเหตุ ไม่วนตลอด |
| J10 | ยกเลิกระหว่าง retry wait | `retry_wait→canceled` |
| J11 | retryable failure เกิดพร้อม cancel | `running→canceled` หรือ `retry_wait→canceled` ตามลำดับ atomic commit; ไม่เผยแพร่ late output |

Scenarios ครอบคลุม transitions ในตารางเชิงแนวคิด ไม่ได้พิสูจน์ crash safety ของ implementation จริง; sync response ต้องผ่าน validation/auth/version semantics เดียวกัน แต่ไม่จำเป็นต้องมี durable job หาก product เลือก synchronous-only
