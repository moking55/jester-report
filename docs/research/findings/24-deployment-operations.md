# T24 — Self-hosting และ Operations Options

วันที่: 12 พฤศจิกายน 2026  
สถานะ: options และ runbook outline จากเอกสาร; **ไม่ได้ติดตั้ง deploy ทดสอบ offline หรือ restore**

## Deployment options

| ทางเลือก | เหมาะเมื่อ | ขอบเขตที่ต้องออกแบบ |
| --- | --- | --- |
| Local/single-host application + private Gotenberg | ผู้ใช้/ปริมาณงานจำกัด และยอมรับ single-host failure | Restrict access, limits, local storage/backup, reproducible font/assets |
| Shared application + private Gotenberg instances | หลายผู้ใช้/ระบบต้องเรียกรายงาน | App authentication/authorization, tenant isolation, durable jobs, quotas, load balancing |
| External managed environment ในอนาคต | ผู้ใช้เลือกเองและมีข้อกำหนด/งบชัด | Data residency, secrets, network controls และ operational ownership; ยังไม่ provision |

รูปแบบ packaging รวม container เป็นเรื่องที่ศึกษาได้ แต่ผู้ใช้ห้ามทดสอบ Docker บนเครื่องนี้ จึงไม่มีคำสั่งติดตั้งหรือ deployment ในงานนี้ ไม่มี infrastructure ที่เลือกถาวร

## Operations outline

1. **ติดตั้ง:** เลือก release/digest ของ Engine และ application ที่ตรวจแล้ว กำหนด internal network, authentication/TLS ตาม trust boundary และ resource/queue/time limits ก่อนเปิดใช้ [Secure](https://gotenberg.dev/docs/operate/secure), [Limits](https://gotenberg.dev/docs/operate/limits)
2. **Offline:** เก็บ template versions, styles, fonts/licenses, images และ dependencies ที่อนุญาตแจกจ่าย พร้อมตรวจ external asset references; ไม่อ้างว่า offline ทำงานแล้ว
3. **Observe:** health/readiness, queue depth, request failures, timeouts และ trace IDs; แยก logs ที่มีข้อมูลอ่อนไหวและกำหนด retention [Production](https://gotenberg.dev/docs/operate/production), [Telemetry](https://gotenberg.dev/docs/telemetry)
4. **Backup/restore:** สำรอง immutable templates, active alias mapping, pinned components/assets/fonts, renderer release/digest และ metadata ของแต่ละ job ที่ระบุ resolved version/provenance รวม artifacts และ input snapshot reference เฉพาะตาม retention/privacy policy; secrets เก็บผ่านวิธีที่เลือกแยก ตรวจ access และ retention เมื่อ restore
5. **Upgrade/rollback:** ระบุ version compatibility ของ definition/API/assets และ dependencies; ใช้ deferred fixture corpus ตรวจผลก่อน rollout เมื่อมี environment เหมาะสม การ rollback ต้องระบุว่า data/schema/template versions ย้อนกลับได้เพียงใด

Restore walkthrough: เลือก snapshot ที่สอดคล้องกันของ template/version/assets, active alias และ job/artifact references, restore secrets ผ่านช่องทางที่อนุมัติ, ตรวจ ID/hash/permissions และ alias ว่าอ้าง version ที่มีอยู่ โดยไม่เปลี่ยน resolved version ของ job เดิม แล้วพิจารณาเปิดใช้งานอีกครั้ง หากขาด artifact เดิม การสร้างใหม่อาจไม่เหมือนเดิมเมื่อ fonts/renderer/data เปลี่ยน ทั้งหมดเป็นขั้นตอนเสนอ **ยังไม่เคย restore จริง**

## Extensions และ capacity

จุดขยายที่เป็นไปได้: formatter ที่ควบคุม input/output, reusable component และ data adapter ที่มีสิทธิ์/timeout จำกัด ต้องกำหนด contract/version/sandbox ก่อนเปิดให้ plugin ภายนอก ไม่จำเป็นต้องสร้าง plugin framework ใน MVP โดยไม่มี use case

ใช้ [T23 capacity scenarios](23-performance-scenarios.md) เป็น sensitivity examples เท่านั้น ไม่เลือกจำนวน instances หรือ hardware จากตัวเลขสมมติ การวัดจริง, offline proof, failover และ backup/restore เป็น deferred/not-tested
