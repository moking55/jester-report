# T21 — Scheduling และ Distribution Options

ตรวจเอกสาร: 12 พฤศจิกายน 2026  
สถานะ: options/tabletop; ไม่มี scheduler, การส่ง email, API call หรือการสร้างบริการภายนอก

## 1. ขอบเขตและการจัดลำดับ

T01 ระบุ requester ต้องเข้าถึง output แต่ยังไม่ยืนยันการส่งรายเวลา, email หรือ bursting ดังนั้น **local/download สำหรับผู้มีสิทธิ์เป็น MVP candidate**, object storage links เป็น **unknown ตาม deployment**, scheduling/email/bursting เป็น **later เว้นแต่ผู้ใช้ยืนยัน**. การมี use case ไม่ใช่คำอนุมัติใช้ cloud provider

## 2. Scheduling Semantics ที่ต้องตัดสินใจก่อนทำ

| ประเด็น | Options / ข้อเสนอ |
| --- | --- |
| Timezone/calendar | เก็บ IANA timezone กับ schedule, scheduled instant และ data-window boundaries; ไม่ใช้ timezone ของเครื่องโดยปริยาย |
| DST gap/overlap | กำหนด skip/shift เมื่อเวลาท้องถิ่นไม่มี และ once/twice เมื่อเวลาซ้ำ; ต้องทดสอบเขตที่มี DST ไม่สรุปจาก Bangkok ที่ไม่มีการเปลี่ยนนาฬิกาในตัวอย่าง |
| Missed runs | เลือก skip, run latest หรือ backfill ภายใน window; บันทึก missed occurrence และ timezone database version เมื่อมี requirement |
| Overlap | เลือก skip/queue/allow concurrency ต่อ schedule; ต้องมี resource quota และ job IDs อิสระ |
| Deduplication | Idempotency scope ครอบคลุม schedule ID, scheduled instant, tenant และ revision; ไม่ใช้เวลาที่ worker เริ่มจริงเป็น occurrence ID |
| Retry | Render retry ตาม T19; delivery retry แยก state/budget/deadline เพื่อไม่ Render ซ้ำเมื่อส่งไม่สำเร็จ |
| Trigger/permission | Recheck schedule owner/service, template/version และ data scope ก่อนรัน; ไม่ยกระดับ service identity เงียบ ๆ |

[AWS EventBridge Scheduler documentation](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html) เป็นตัวอย่างว่าพฤติกรรม timezone/DST ขึ้นกับ scheduler ที่เลือก ไม่ใช่การกำหนดให้ใช้ AWS หรือยืนยันพฤติกรรมของระบบเรา

## 3. Delivery Options และ Tradeoffs

| วิธี | ประโยชน์ | เงื่อนไข/ความเสี่ยง |
| --- | --- | --- |
| Authenticated local/application download | Object authorization ณ เวลาดาวน์โหลด; เหมาะเริ่มต้นเมื่อมี app | งานใหญ่/retention ต้องกำหนด; browser cache หรือไฟล์ที่ดาวน์โหลดแล้วเพิกถอนไม่ได้ |
| Object storage signed URL | ลดภาระ proxy; ใช้ expiry ควบคุมช่วงเข้าถึง | เป็น bearer link ใช้ซ้ำได้จนหมดอายุ; ไม่รับประกันเพิกถอนรายบุคคลทันที ดู [T20](20-access-data-lifecycle.md) |
| Email attachment | ผู้รับใช้ง่ายและเก็บ offline ได้ | หลังส่งไม่สามารถบังคับลบ/เพิกถอนจาก mailbox ผู้รับได้; attachment leak, retry/duplicate และ size limits ต้องออกแบบ |
| Email/link notification | ลดการกระจายไฟล์เมื่อใช้ authenticated gateway | ตรวจสิทธิ์ทั้งก่อนส่งและตอนเปิด gateway; ไม่ใส่ secret หรือ data ใน subject/URL |

## 4. ตัวอย่าง Report Bursting และสิทธิ์ผู้รับ

สมมติหนึ่ง schedule สร้าง PDF แยกลูกค้า A/B: data selection กรอง tenant/customer ก่อน Render, แต่ละ artifact ผูก tenant + customer + output ID, ผู้รับ A ต้องไม่มีสิทธิ์ artifact B. Snapshot รายชื่อผู้รับเพียงอย่างเดียวไม่เพียงพอ: recheck permission ก่อนส่งแต่ละราย และบันทึก recipient ID แบบจำกัดข้อมูล, artifact reference, delivery attempt/outcome/correlation ID โดยไม่เก็บ URL หรือ payload อ่อนไหวใน log

สำหรับ authenticated gateway ให้ตรวจสิทธิ์อีกครั้งเมื่อเปิดไฟล์; หากใช้ presigned URL ให้ policy ชัดเรื่อง bearer link และ revocation window. ก่อนส่ง email จริงต้องมี opt-in/ผู้รับที่ยืนยันและ policy ของผู้ใช้; งานนี้ไม่ส่งข้อความหรือเชื่อมบัญชี

## 5. Tabletop Walkthrough

| Scenario | ผลที่ต้องออกแบบ |
| --- | --- |
| Schedule 00:15 Asia/Bangkok แต่ data ใช้ UTC | แปลงช่วงข้อมูลตาม timezone/calendar ที่ระบุและบันทึก scheduled instant; ไม่ใช้วันที่เครื่อง worker |
| DST gap / repeated local time ใน zone ที่มี DST | ใช้ policy skip/shift และ once/twice ที่เลือก; occurrence IDs ต้องแยก repeated instants หากรันสองครั้ง |
| Recipient ถูก revoke ก่อนส่ง | ไม่ส่งและบันทึก denied โดยไม่สร้าง recipient-specific link |
| Recipient ถูก revoke หลังรับ signed URL | URL อาจยังใช้ได้ตาม TTL/provider; gateway recheck หรือยอมรับ window นี้อย่างชัดเจน |
| Delivery timeout หลังผู้รับอาจได้รับ | ผลส่งไม่แน่นอน; reconcile/deduplicate ด้วย delivery attempt/recipient key เท่าที่ช่องทางรองรับ ไม่อ้าง exactly-once delivery |
| Artifact หมด retention ก่อนส่ง | ไม่ส่ง stale link; ระบุ failed/expired และ policy ให้สร้าง job ใหม่เมื่อได้รับอนุญาต |

ไม่มีการทดสอบ scheduler/mail/storage จริง ค่า retention, retry, link TTL และ SLO ทั้งหมดเป็น decision-open
