# T06 — วิธีวิจัยและ Validation Protocol

วันที่: 12 พฤศจิกายน 2026  
ขอบเขตที่ดำเนินได้: desk research, static review และ arithmetic แบบเบา  
ข้อห้ามปัจจุบัน: ไม่ใช้ Docker/Gotenberg runtime, ไม่ Render PDF, ไม่ load test/probes และไม่ provision Cloud

## 1. การจำแนกหลักฐาน

| Class | เกณฑ์รับเข้า | ตัวอย่าง | สิ่งที่ห้ามอนุมาน |
| --- | --- | --- | --- |
| documented | Primary source พร้อม URL/section/version หรือระบุ rolling/unpinned และวันที่เข้าถึง | API route ที่เจ้าของระบุ | ไม่เท่ากับ input ของเราทำงานจริง |
| observed-static | ผลตรวจที่ทำจริงและเบา พร้อมคำสั่ง/ผล | ตรวจยอดด้วย Decimal หรือตรวจ links | ไม่ใช่ผล Render/benchmark |
| observed-runtime | ต้องมี input/output/environment/log ของการรันจริง | PDF และรายงานตรวจ | รอบนี้ไม่มีหลักฐานชนิดนี้ |
| inferred | เหตุผลที่อ้างหลักฐานต้นทางและ assumptions ชัดเจน | ควรแยก template layer จาก renderer | ไม่ใช่การตัดสินใจ architecture ที่อนุมัติแล้ว |
| unknown | เอกสารไม่พอ ข้อมูลขัดกัน หรือยังตรวจไม่ได้ | header/footer ภาษาไทยของ fixture จริง | ห้ามเปลี่ยนเป็น supported โดยปริยาย |

Source register อยู่ [sources.md](../sources.md) การขัดกันของ source ต่างเวอร์ชันหรือ cache ต้องบันทึกทั้งสองด้าน ห้ามเลือกตัวที่สะดวกกว่าโดยไม่ระบุ การอ่าน URL branch `main/master` ไม่ถือว่า pin release

## 2. กติกาการตรวจใน Checkpoints 1–2

1. อ่านเอกสารเจ้าของและกติกา license ที่สัมพันธ์กับ component/distribution จริง
2. เทียบคำอ้างใน matrix กับ source ไม่ใช้คำว่า free/community เป็นตัวแทน OSI license
3. ใช้ข้อมูลสังเคราะห์และ deterministic IDs; ตรวจ arithmetic ด้วยฐานสิบและ explicit rounding policy
4. ตรวจไฟล์ Markdown, relative links, task dependencies และความครบของ case catalog แบบ local lightweight เท่านั้น
5. หากเครื่องมือเบาที่จำเป็นไม่มี ให้ตรวจด้วยมือและระบุ limitation ไม่ติดตั้ง dependency หนักเพื่อปิด checklist

ไม่มี repository build/test command ในช่วงนี้ จึงไม่อ้าง build pass การเรียก agy เป็นการปรึกษาอ่านอย่างเดียว ไม่ใช่การทดสอบ Engine; parent ต้องตรวจคำตอบกับ primary sources ก่อนรับเป็น documented finding

## 3. รูปแบบ Case Record

แต่ละกรณีใน [case catalog](case-catalog.md) ต้องระบุ:

- Case ID, report/reference และหัวข้อ Rxx ที่เกี่ยวข้อง
- คำถาม/hypothesis ที่ต้องตรวจ และสิ่งที่เอกสารกล่าวไว้แล้ว
- Input: record IDs, parameters, texts, assets และ semantic expected values
- Expected behavior และวิธีตัดสิน fail; ถ้า policy ยังไม่เลือกให้ใช้ `decision-open`
- วิธีตรวจ: static/tabletop หรือ runtime ที่เลื่อนออกไป
- Source references, documented version และ confidence
- Outcome จริงและ limitations; runtime ทุกกรณีในรอบนี้ใช้ `deferred/not-tested`

## 4. วิธีตรวจในอนาคตที่ออกแบบไว้ แต่ยังไม่รัน

| ประเภท | หลักฐานที่จะต้องใช้ | หลักเกณฑ์ |
| --- | --- | --- |
| Data/text | Expected IDs/text เทียบ extracted text/semantic checks | ไม่มี ID หาย/ซ้ำ ไม่หายทั้ง section; extraction limitations ต้องแยกจาก data loss |
| Numeric | Expected decimal values เทียบตัวเลขที่แสดง | ผลคำนวณตรง scope/rounding policy; ไม่ใช้ binary float เทียบเงินแบบไม่มี tolerance policy |
| Layout | ภาพหน้ากระดาษและ PDF จริง | ไม่ทับ/ตัดเนื้อหา หัวตาราง/เลขหน้าตรง behavior ที่กำหนด; ไม่กำหนด page count เดาจาก HTML |
| Fonts/Thai | Font metadata/embedding, ภาพและ copy/search | ไม่มี glyph หาย/วรรณยุกต์ถูกตัด; ค้นข้อความได้ตามข้อกำหนด |
| Security | Controlled endpoints/expected allow-deny/logs | Runtime controls กับ app authorization ต้องพิสูจน์แยกกัน; tabletop ไม่เท่ากับ verified protection |
| Performance | Environment, raw samples, limits, timings และ errors | รายงาน N และความไม่แน่นอน; assumptions ไม่กลายเป็น measured SLA |
| PDF conformance | Exact profile, validator/version/report และ manual checks | HTTP 200 หรือ API ว่ารองรับไม่ยืนยัน PDF/A/PDF/UA ผ่าน |

เมื่อมีคำขอใหม่ให้ทดลองจริง ต้องเลือก environment ที่เหมาะสมและรักษาข้อห้าม Docker บนเครื่องนี้ ไม่ใช้บริการ Cloud แทนเอง

## 5. Outcome และ Checkpoint Semantics

- `review-complete`: งานศึกษาเอกสารมี findings, sources และ gaps ครบ ไม่หมายถึง runtime ผ่าน
- `static-pass/static-fail`: ใช้กับการตรวจแบบเบาที่รันจริงเท่านั้น
- `deferred/not-tested`: runtime อยู่นอก execution scope ปัจจุบัน
- `unknown/source-gap`: หลักฐานเอกสารยังไม่พอ พร้อมระบุผลต่อการตัดสินใจ
- `decision-open`: ต้องให้ผู้ใช้เลือกทางผลิตภัณฑ์หรือรับข้อจำกัดก่อนลงทุนสูง

Checkpoint 01 ผ่านเมื่อ product scenarios และ source-backed comparison ครบตามงาน T01–T03; Checkpoint 02 ผ่านเมื่อ threat model, license inventory และ validation backlog ครบตาม T04–T06 ทั้งสอง checkpoint ไม่ใช่การรับรองพร้อม production

## 6. Reproducibility Requirements สำหรับ Deferred Runtime

เก็บ engine release/image digest, actual renderer version, fonts/version/hash, OS/resource limits, options, inputs, commands, raw logs, output hashes และ expected/actual results ถ้าได้รันในอนาคต รอบนี้ไม่สร้าง manifest สมมติ และไม่รายงานค่า memory/latency/throughput ที่ไม่ได้วัด

การ Render ซ้ำมีได้หลายระดับ: semantic equivalence, visual equivalence และ byte-identical ต้องเลือกเกณฑ์ล่วงหน้า; metadata/time/font/version drift อาจทำให้ bytes ต่างกัน จึงไม่ถือว่ารายงานผิดเพราะ hash ต่างโดยไม่มีการตรวจระดับอื่น
