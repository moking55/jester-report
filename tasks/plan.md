# แผน Research เต็ม: ระบบออก Report PDF สำหรับธุรกิจ

วันที่จัดทำ: 12 พฤศจิกายน 2026  
ปรับตามข้อจำกัดเครื่อง: ไม่ใช้ Docker และไม่รัน Engine/benchmark บนเครื่องนี้  
สถานะ: T01–T30 desk review-complete  
ผู้ดำเนินการ C03–C08: **Codex subagents แบบ parallel ตามคำขอ; ไม่ใช้ Gemini/Antigravity**
ประวัติ: C01–C02 ทำ parallel research ตามคำขอก่อนหน้า แล้ว parent ตรวจและเขียนผลทั้งหมด  
Task list หลัก: [tasks/todo.md](todo.md)  
ข้อมูลตั้งต้น: [Research Keywords R01–R25](../docs/research/REPORT_SYSTEM_RESEARCH_KEYWORDS.md)

## 1. เป้าหมาย

สร้างฐานหลักฐานเพียงพอให้ตัดสินใจว่าโปรแกรมออก Report PDF สำหรับธุรกิจที่ใช้ Gotenberg ควรมีฟีเจอร์อะไร ทำได้จริงแค่ไหน และควรเริ่ม MVP แบบใด โดยเทียบความสามารถกับ JasperReports และเครื่องมือใกล้เคียง พร้อมประเมินข้อจำกัดการเปิดโอเพนซอร์ส

ผลลัพธ์ของ Research ต้องช่วยร่าง spec และแผนพัฒนาต่อได้ ประกอบด้วย product requirements, feature comparison, renderer feasibility, authoring options, data/API contracts, security/operations, license inventory และ MVP decision packet

**ข้อกำหนดเครื่องจากผู้ใช้:** ไม่ทดสอบใน Docker เพราะเครื่องทรัพยากรจำกัด จึงปรับเป็น desk research และการตรวจเอกสาร/specimens แบบเบา ไม่ติดตั้งหรือรัน Docker/Gotenberg ไม่ทำ load test หรือ Render จำนวนมาก และไม่ย้ายไปใช้ Cloud/บริการภายนอกเอง

งาน runtime เดิมเปลี่ยนเป็น documented capability study และ validation backlog ทุกข้อที่ยังไม่ได้ Render ต้องระบุ **deferred/not-tested** ไม่แปลว่ารองรับแล้ว การเปลี่ยนนี้ไม่เปลี่ยนข้อกำหนดใช้ Gotenberg เป็น Engine ของผลิตภัณฑ์

ข้อกำหนดวิธีทำงานล่าสุด: C05–C08 ใช้ Codex subagents แบบ parallel และแลกเปลี่ยนข้อมูลได้; ไม่ส่งงานให้ Gemini/Antigravity ประวัติการใช้ parallel agents ก่อนคำสั่งนี้อยู่ใน [Checkpoint review](../docs/research/CHECKPOINTS_01_02.md)

## 2. หลักฐานและข้อจำกัดปัจจุบัน

- เริ่มจาก keyword map 25 หมวด/22 แหล่ง ปัจจุบันมี findings T01–T29, รายงานสุดท้าย T30 และ source register 98 แถว (S01–S94, S100–S103; ไม่มี S95–S99; S85/S90, S86/S91, S09/S92, S88/S101, S84/S102 ซ้ำโดยตั้งใจ); ยังไม่มี application code, build command หรือ test suite
- ตรวจแล้วไม่พบ `tasks/plan.md` หรือ `tasks/todo.md` เดิม จึงสร้างใหม่โดยไม่ทับงานค้าง
- T02 ตรวจ official release reference เป็น v9.4.1 และ docs 9.x ณ วันที่ตรวจ; actual runtime/image digest/browser/font versions ยัง unknown ดู engine baseline
- ข้อค้นพบจากการอ่านเอกสารเดิมไม่เท่ากับผลทดลอง runtime โดยเฉพาะ pagination, ภาษาไทย, fonts, signatures และ PDF conformance
- ยังไม่ทราบ persona หลัก, Designer requirement, JRXML compatibility, deployment, workload และนโยบาย license จึงใช้ทางเลือกหลายสถานการณ์แทนการตัดสินใจถาวร

## 3. ขอบเขตและสมมติฐาน

### ครอบคลุม

1. รายงานแบบหน้ากระดาษและเอกสารธุรกรรม: ใบเสนอราคา/ใบแจ้งหนี้, grouped sales report และ master-detail
2. Report semantics: parameters, binding, expressions, aggregates, table/bands, reusable sections และ asset rendering
3. Gotenberg integration: version contract, HTML/CSS/assets, readiness, errors, limits และ PDF post-processing
4. Authoring: code-first, block-based และ visual canvas; preview, template versions และ lifecycle
5. ระบบรอบ Engine: API, jobs, permissions, retention, delivery, performance และ self-hosting
6. Open-source readiness: component/font licenses, distribution, governance และเอกสารชุมชน
7. PDF ขั้นสูง: capability study และวิธี validation จากเอกสาร โดยยังไม่สร้าง PDF หรือรัน validator

### สมมติฐานที่ปรับได้

- ศึกษา HTML/CSS route ของ Gotenberg เป็นแนวทาง integration แรกในเอกสาร ไม่เรียกใช้งาน Engine; Gotenberg ยังคงเป็นข้อกำหนด
- ใช้ Thai/English และ A4 เป็น baseline fixtures ตามบริบท ยังไม่ถือว่าเป็นข้อกำหนดตลาดสุดท้าย
- เปรียบเทียบ developer-first กับ business-author-first จนกว่าผู้ใช้เลือก persona หลัก; ไม่ตัด Visual Designer ออกจาก MVP โดยปริยาย
- JSON-first เป็นทางเลือกหนึ่งเท่านั้น ต้องเปรียบเทียบกับ REST/SQL data sources
- ใช้ข้อมูลสังเคราะห์สำหรับ specimens/walkthrough เท่านั้น ไม่เปิด lab ไม่ส่ง email จริง ไม่ใช้ private keys และไม่เชื่อม production
- Specimens ใช้ตรวจความหมายของ contract ได้ แต่ไม่ยืนยัน Render feasibility, usability หรือความต้องการตลาด

### อยู่นอกขอบเขตการลงมือทำ

ไม่สร้าง production report server/Designer/compiler, ไม่ deploy/publish repository, ไม่เลือกหรือเพิ่ม LICENSE สุดท้าย, ไม่ทำ full JRXML converter, BI/dashboard platform, data warehouse หรือ export XLSX/DOCX ทั้งระบบ หากพบความจำเป็นให้เสนอเป็นงานพัฒนาแยก ไม่ขยาย Research เงียบ ๆ

การศึกษา Docker/self-hosting และ Office templates ยังทำในเชิงเอกสารได้ แต่ไม่เพิ่มงานติดตั้ง ทดสอบ container หรือให้บริการภายนอกในแผนปัจจุบัน

## 4. วิธีวิจัยและรูปแบบหลักฐาน

### ชนิดหลักฐาน

| สถานะ | ความหมาย | เงื่อนไขการใช้ |
| --- | --- | --- |
| documented | เอกสารเจ้าของผลิตภัณฑ์หรือมาตรฐานระบุไว้ | มี URL, section, version/edition และวันที่เข้าถึง |
| observed | ทดลองแล้วพบผลนั้นใน environment ที่บันทึก | มี case ID, command, input, expected/actual, log และ output |
| inferred | ข้อเสนอ/ข้อสรุปจากการเชื่อมหลักฐาน | ระบุหลักฐานต้นทาง เหตุผล และสิ่งที่ยังไม่ยืนยัน |
| unknown | ข้อมูลขาด ขัดกัน หรือยังตรวจไม่ได้ | ระบุผลต่อการตัดสินใจและวิธีปิดช่องว่าง |

ทะเบียนหลักฐานใช้ `docs/research/sources.md` โดยทุกงานค้นคว้าเพิ่มหรือแก้รายการที่ใช้ ไม่มีการสร้างสำเนาทะเบียนแยกหลายที่ คำถามผลิตภัณฑ์ยึด T01; ถ้าคำตอบเปลี่ยน ต้องทบทวนงานที่ขึ้นต่อกัน

### หลักการเปรียบเทียบ

- ใช้ reference report เดียวกันเทียบผลิตภัณฑ์ รูปแบบ template และ Designer เพื่อลดการเทียบคนละโจทย์
- แยก library, Designer และ server รวม free/commercial edition ก่อนกล่าวอ้างความสามารถ
- อ่าน primary sources ก่อน; issue tracker ใช้หากรณีผิดปกติและต้องบันทึกว่า reproduce ได้หรือยัง
- ทุกข้อเสนอสำคัญมี options, benefit, cost, risk, confidence และ reversal path
- Research รอบนี้ยืนยันได้เฉพาะสิ่งที่เอกสารระบุและความสอดคล้องของ contracts; runtime feasibility, user validation และ compliance ยังไม่ยืนยัน

### ขอบเขตการตรวจที่เบาและรายการเลื่อนทดสอบ

ตรวจลิงก์/citations, ความสอดคล้อง definitions, expected totals และ JSON/OpenAPI แบบ static ได้ ใช้ script เล็กหรือ parser ที่มีอยู่แล้วเมื่อจำเป็น ไม่ติดตั้ง dependency หนัก ไม่เปิด server/renderer หรือ browser automation เพื่อ Render

T06 จัดทำ `docs/research/validation/protocol.md`, `case-catalog.md` และ `deferred-runtime.md` ระบุ case ID, expected result, วิธีตรวจ, priority และเหตุผลที่เลื่อน แต่ไม่สร้าง scripts/fixtures สำหรับรันทดสอบจริงในรอบนี้

งานตรวจ PDF pagination/fonts/text extraction, QR scan, security probes, performance, PDF/A และ PDF/UA อยู่ใน deferred-runtime backlog ทั้งหมด ไม่มี evidence bundle/PDF/log วัดผลที่สร้างขึ้นจริงในแผน execution นี้

สถานะ `observed` ใช้เฉพาะหลักฐานที่เห็นจริงตาม scope เช่นผลตรวจ schema เบา ไม่ใช้กับพฤติกรรม Gotenberg ที่ยังไม่ทดสอบ งานเอกสารเสร็จได้เมื่อ findings/gaps ครบ โดยไม่ติ๊กว่า runtime validation ผ่าน

## 5. ลำดับงานและ Effort

C03–C08 ทำโดย Codex subagents ตามคำขอแต่ละรอบ โดย parent ตรวจ Dependencies และรวมผล เก็บ IDs T01–T30 เดิม; C01–C02 ก่อนหน้าใช้ parallel preliminary research และ parent review dependency ตอนรวมผล งาน runtime ปรับเป็น desk studies

ประมาณ effort สุทธิ **28.5–41.25 ชั่วโมง** หรือ **ประมาณ 29–42 ชั่วโมง** เผื่อค้นหลักฐานเพิ่มเติม 25% เป็น **ประมาณ 36–52 ชั่วโมง** ไม่รวมเวลารอคำตอบผู้ใช้ ตัวเลขนี้เป็น estimate ใหม่สำหรับการศึกษาเอกสาร ไม่มีเวลารัน Docker, runtime tests หรือ benchmark รวมอยู่

แต่ละงาน timebox 0.5–2 ชั่วโมง หากข้อมูลไม่พอบันทึก unknown พร้อมผลต่อการตัดสินใจ ไม่ติดตั้งเครื่องมือหนักเพื่อปิด gap โดยขัดข้อจำกัดผู้ใช้

| Phase | เป้าหมาย | งาน | ชั่วโมงสุทธิ | จุดผ่าน |
| --- | --- | --- | --- | --- |
| 1 | โจทย์ผลิตภัณฑ์และฐานหลักฐาน | T01–T03 | 3.25–4.5 | มี use cases และ benchmark ที่แยกข้อเท็จจริงจากสมมติฐาน |
| 2 | ความปลอดภัยและเกณฑ์ Validation | T04–T06 | 2.75–4 | มี threat model และ validation backlog โดยไม่เปิด lab |
| 3 | ศึกษาข้อจำกัด Engine Layout และภาษาไทย | T07–T09 | 2.5–3.75 | ทราบ documented constraints และ gaps ที่ยังต้องพิสูจน์ |
| 4 | ศึกษาความหมายของรายงาน | T10–T12 | 2.25–3 | มี semantic contracts และ expected specimens จากการตรวจแบบเบา |
| 5 | ประเมิน Template และ Authoring | T13–T15 | 3–4.5 | มีทางเลือก authoring ที่เข้ากับข้อจำกัด Engine และผู้ใช้ |
| 6 | Contracts ของข้อมูลและการเรียกใช้งาน | T16–T18 | 3–4.5 | มี draft contracts ที่สอดคล้องกันโดยยังไม่สร้าง production API |
| 7 | Jobs สิทธิ์ และการส่งรายงาน | T19–T21 | 2.75–4 | ความล้มเหลวและสิทธิ์ข้ามขอบเขตได้รับการวิเคราะห์ |
| 8 | ศึกษา Security Performance และ Operations | T22–T24 | 2.75–4 | มี documented controls และ capacity assumptions ที่แยกจากผลวัด |
| 9 | ศึกษามาตรฐาน PDF และ Signature | T25–T27 | 3–4.5 | ทราบ capability/validation requirements และยังไม่อ้าง conformance |
| 10 | สังเคราะห์ผลและเตรียมตัดสินใจ | T28–T30 | 3.25–4.5 | Research report ตรวจย้อนกลับได้และระบุ readiness อย่างซื่อตรง |

## 6. Dependency Graph และ Task Index

ตารางเป็น adjacency list ของงานค้นคว้า ไม่ใช่ prerequisites ที่ต้องติดตั้งหรือทดลอง runtime รายละเอียดและสถานะอยู่ใน `todo.md` ที่เดียว

| ID | งาน | ต้องมีผลจาก | ชั่วโมง |
| --- | --- | --- | --- |
| T01 | กำหนดโจทย์ผลิตภัณฑ์และเอกสารอ้างอิง | ไม่มี | 1–1.5 |
| T02 | จัดทำทะเบียนหลักฐานและตรึงเวอร์ชันศึกษา | T01 | 0.75–1 |
| T03 | เปรียบเทียบความสามารถผลิตภัณฑ์อ้างอิง | T01, T02 | 1.5–2 |
| T04 | วิเคราะห์ขอบเขตความปลอดภัยจากเอกสาร | T01, T02 | 1–1.5 |
| T05 | ตรวจเงื่อนไขโอเพนซอร์สเบื้องต้น | T02, T03 | 1–1.5 |
| T06 | กำหนดเกณฑ์ตรวจและรายการ Validation ที่เลื่อนออกไป | T01, T02, T04, T05 | 0.75–1 |
| T07 | ศึกษา Gotenberg Request/Response โดยไม่เปิด Engine | T02, T04, T05, T06 | 0.5–0.75 |
| T08 | ศึกษาข้อจำกัด Pagination และ Header/Footer | T06, T07 | 1–1.5 |
| T09 | ศึกษาภาษาไทยและการจัดการ Fonts | T05, T06, T07, T08 | 1–1.5 |
| T10 | กำหนด Grouping และกติกายอดรวม | T01, T06, T08 | 0.75–1 |
| T11 | ศึกษา Master-detail และส่วนประกอบใช้ซ้ำ | T08, T10 | 0.75–1 |
| T12 | ศึกษา Charts Images QR และ Barcodes | T05, T07, T09 | 0.75–1 |
| T13 | เปรียบเทียบรูปแบบ Report Definition | T03, T05, T08, T09, T10, T11 | 1–1.5 |
| T14 | ประเมิน Designer โดยใช้ Report เดียวกัน | T01, T03, T05, T13 | 1–1.5 |
| T15 | ออกแบบเส้นทาง Preview และ Template Lifecycle | T13, T14 | 1–1.5 |
| T16 | กำหนด Data Contract และ Parameters | T01, T10, T13 | 1–1.5 |
| T17 | ประเมิน Data Connectors และ Snapshot Consistency | T04, T16 | 1–1.5 |
| T18 | ร่าง Public API Contract | T13, T15, T16, T17 | 1–1.5 |
| T19 | กำหนด Job Lifecycle และ Recovery | T04, T18 | 1–1.5 |
| T20 | กำหนดสิทธิ์และ Data Lifecycle | T04, T15, T18, T19 | 1–1.5 |
| T21 | ประเมิน Scheduling และ Distribution | T19, T20 | 0.75–1 |
| T22 | ทบทวน Security Controls แบบ Tabletop | T04, T07, T13, T19, T20 | 1–1.5 |
| T23 | ศึกษา Performance และทำ Capacity Scenarios | T06, T07, T08, T09, T19, T22 | 0.75–1 |
| T24 | ประเมิน Self-hosting และ Operations | T05, T07, T19, T20, T23 | 1–1.5 |
| T25 | ทำ Matrix ความสามารถ PDF ขั้นสูง | T02, T03, T07, T12 | 1–1.5 |
| T26 | ศึกษาวิธีตรวจ Archival และ Accessibility | T09, T25 | 1–1.5 |
| T27 | ศึกษา Digital Signature และ Key Lifecycle | T04, T20, T25 | 1–1.5 |
| T28 | สรุป Quality Strategy และช่องว่าง Runtime | T08, T09, T10, T11, T12, T22, T23, T26 | 0.75–1 |
| T29 | จัดลำดับ MVP พร้อมต้นทุนและทางเลือก | T03, T05, T14, T15, T16, T17, T18, T19, T20, T21, T24, T25, T27, T28 | 1–1.5 |
| T30 | จัดทำรายงาน Research และชุดตัดสินใจสุดท้าย | T28, T29 | 1.5–2 |

- Template/Designer ใช้ T08–T11 เป็น documented constraints พร้อม unknowns ก่อน T13–T15 ไม่รอ PDF ที่ไม่ได้สร้าง
- API/Jobs ใช้ contracts T16–T21 ก่อน tabletop security และ capacity scenarios T22–T24
- PDF standards ใช้ documented capability matrix T25 ก่อน validation design/signature study T26–T27
- T28 รวม runtime gaps, T29 เสนอ MVP แบบมีเงื่อนไข และ T30 สรุป desk research package

## 7. การแบ่งงานเป็น Vertical Research Slices

แต่ละงานจบครบ **คำถาม, primary evidence/specimen, การวิเคราะห์, ข้อเสนอ และข้อจำกัด** เช่น T08 ศึกษา pagination แล้วส่งทั้ง documented behavior และรายการที่ยังต้องตรวจจริง แทนการอ้างว่าพิสูจน์ output แล้ว

Files likely touched เป็นเป้าหมายในอนาคต ไม่ใช่ไฟล์ที่มีอยู่แล้ว แต่ละงานไม่เกิน 5 targets ไม่มี `compose.yaml`, render scripts, benchmark scripts หรือ PDF evidence ที่บังคับสร้างในแผนปัจจุบัน

## 8. Checkpoints และเงื่อนไขตัดสินใจ

มี checkpoint ทุก 3 งานใน `todo.md` รวม 10 จุด ผู้ดำเนินการตรวจหลักฐานและบันทึก continue/revise/blocked พร้อมเหตุผล ไม่บังคับขออนุมัติผู้ใช้ทุก checkpoint

ใช้การทบทวนกับผู้ใช้เมื่อเกิด **การตัดสินใจลงทุนสูง** เช่น เลือก canonical template format, สร้าง Designer เต็มรูปแบบ, รับข้อจำกัด layout ที่กระทบ use case หลัก หรือเลือก license โครงการ ก่อนถึงจุดนั้นให้เตรียมผลเปรียบเทียบและข้อเสนอที่ตรวจได้ก่อน ไม่ถามคำถามกว้างโดยยังไม่มีหลักฐาน

เมื่อยังไม่ได้คำตอบเรื่อง persona/workload ให้เดินงานที่ไม่ขึ้นกับคำตอบ และรักษาทางเลือกแบบมีเงื่อนไข ห้ามใช้เวลาที่รอเป็นการอนุมัติ

### ถ้าเอกสารชี้ข้อจำกัดหรือยังพิสูจน์กรณีสำคัญไม่ได้

1. ตรวจ primary source, version, issue report และ minimal example ที่เจ้าของเผยแพร่
2. บันทึก documented limitation แยกจาก unverified issue และระบุ workaround เป็น documented/unverified ตามจริง
3. แสดงผลต่อ report types และ MVP พร้อมสถานะ runtime not-tested ไม่รับรองว่าแก้ได้
4. หากจำเป็นต้องทดสอบจริง ให้เก็บไว้ใน deferred backlog สำหรับ environment ที่เหมาะสมเมื่อมีคำขอแยก ไม่เปิด Docker หรือ provision Cloud ทดแทนเอง

## 9. Coverage กลับไปยัง Keywords R01–R25

| Keyword topic | งานที่รับผิดชอบ |
| --- | --- |
| R01 | T01, T29, T30 |
| R02 | T02, T03, T14, T29 |
| R03 | T13, T30 |
| R04 | T06, T08 |
| R05 | T03, T08, T10, T11 |
| R06 | T13, T16 |
| R07 | T16 |
| R08 | T10, T13, T16 |
| R09 | T17 |
| R10 | T11 |
| R11 | T12 |
| R12 | T06, T09, T26, T28 |
| R13 | T02, T06, T07, T08, T12, T18, T22, T25, T30 |
| R14 | T03, T14, T15, T29, T30 |
| R15 | T15, T20, T24, T28 |
| R16 | T18, T19 |
| R17 | T19, T21, T23 |
| R18 | T15, T21, T29 |
| R19 | T04, T13, T22, T27 |
| R20 | T04, T17, T20, T21, T22, T27 |
| R21 | T06, T23, T24 |
| R22 | T02, T06, T09, T23, T26, T28 |
| R23 | T25, T26, T27, T29 |
| R24 | T05, T14, T29, T30 |
| R25 | T07, T24, T29, T30 |

Coverage หมายถึงมีงานรับผิดชอบคำถามนั้น ไม่ใช่ยืนยันว่าทุกคำถามตอบแล้ว ผลสุดท้ายต้องระบุ evidence gaps เพิ่มใน feature traceability

## 10. โครงสร้างผลส่งมอบเมื่อดำเนิน Research

- `docs/research/sources.md`: source register และ evidence status
- `docs/research/findings/`: desk studies, feature traceability และ option comparisons
- `docs/research/validation/`: protocol, case catalog และ deferred-runtime backlog; ไม่ใช่ test results
- `research/specimens/`: ตัวอย่างข้อมูล/definition/contracts ที่ตรวจแบบเบาได้ ไม่ใช่ running application
- `docs/research/REPORT_SYSTEM_FULL_RESEARCH.md`: full desk-research report ใน T30
- `docs/research/decisions/proposed-decisions.md`: ทางเลือกที่ต้องตัดสินใจ ยังไม่ใช่ accepted ADR
- `docs/research/README.md`: ดัชนีเฉพาะไฟล์ที่มีอยู่จริง

ผล T01–T30 และ checkpoint reviews มีแล้ว (T25–T30: findings 25–29, feature-traceability, REPORT_SYSTEM_FULL_RESEARCH, decisions/proposed-decisions, README) ไม่อ้าง runtime ผ่านเพื่อปิด checklist

หลักฐานผลรอบนี้: [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md), [Checkpoint 03–04 review](../docs/research/CHECKPOINTS_03_04.md) และ [Checkpoint 01–02 review](../docs/research/CHECKPOINTS_01_02.md) และ [source register](../docs/research/sources.md)

## 11. Risks และการรับมือ

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
| --- | --- | --- |
| ไม่มี runtime validation ตามข้อจำกัดเครื่อง | ยังยืนยัน pagination/fonts/throughput/conformance ไม่ได้ | ติดป้าย not-tested ทุกข้อและมี deferred backlog |
| ใช้ docs/issue report แทนผลทดลอง | อาจแนะนำวิธีที่ใช้ไม่ได้กับ input จริง | ระบุ source/version/confidence และ conditional recommendation |
| ความหมาย “คล้าย Jasper” ไม่ชัด | Designer/JRXML scope บาน | T01–T03 แยก persona และระดับ compatibility |
| Engine/version drift | API/limits ต่างจากข้อมูลอ้างอิง | T02/T07 ระบุ docs version ไม่อ้าง actual runtime version |
| ความปลอดภัยยังตรวจไม่ได้จริง | Tabletop ไม่เท่ากับ verified protection | T04/T22 แยก controls กับ verification gaps |
| License/font/editor ไม่เข้ากัน | แจกจ่ายติดเงื่อนไข | T05 ตรวจ primary LICENSE/NOTICE และรักษา unresolved issues |
| Capacity assumptions ถูกเข้าใจว่า benchmark | เลือก hardware/SLA ผิด | T23 แสดงสูตร/สมมติฐาน ไม่มี measured latency/RAM/throughput |
| Research กลายเป็นสร้างระบบ/ย้ายไปรัน Cloud | ใช้ทรัพยากรหรือเกิดค่าใช้จ่ายเกินโจทย์ | ไม่ติดตั้ง Docker/Engine และไม่ provision บริการเอง |
| ไม่มีผู้ใช้จริงหรือ certificates | ยืนยัน usability/signature trust ไม่ได้ | ระบุ pending/not-tested และเสนอทางเลือกให้ผู้ใช้ตัดสินใจ |

## 12. Definition of Done สำหรับ Desk Research

1. T01–T30 และ checkpoints มีเอกสารรองรับครบตาม scope ที่ปรับ ไม่ติ๊กงานที่ยังไม่ทำ
2. R01–R25 trace ไป findings พร้อม documented/inferred/unknown และ source version/date
3. ทุก runtime case มีสถานะ deferred/not-tested, expected result และผลต่อ MVP ใน validation backlog
4. ข้อเสนอมีทางเลือก effort/risk/reversal path และไม่อ้างว่า PDF/Engine ทดสอบผ่าน
5. Contracts/security/operations/OSS studies สอดคล้องกันโดยไม่เลือก architecture หรือ license แทนผู้ใช้
6. Final report เปิดอ่านได้และระบุชัดว่า **Desk research complete ไม่เท่ากับ Runtime validated หรือ Implementation ready**

Core P0 ที่ต้องยืนยัน runtime ยังคงเป็น evidence gaps ก่อนรับรองพร้อมใช้งาน ไม่ใช้การเลื่อนทดสอบเป็นหลักฐานว่าผ่าน ก่อนเริ่มลงทุนพัฒนาต้องมีการทบทวน persona/MVP/authoring/license direction และจัดการความเสี่ยงที่ยังไม่พิสูจน์

โครงการยังไม่มี build/test commands ใช้การตรวจ citations, local links, task dependencies, schema/specimen consistency และ expected arithmetic ตามความเหมาะสม ไม่ใช้ Docker, Engine execution หรือ load tests เป็นเกณฑ์ปิดงานเอกสาร

## 13. คำถามที่รอทิศทาง

- ผู้สร้างรายงานหลัก: นักพัฒนาหรือฝ่ายธุรกิจ?
- เป้าหมายเหมือน Jasper ในระดับ output, bands, Designer หรือใช้ JRXML เดิม?
- เอกสารสำคัญ 3 แบบแรกและตัวอย่างที่ใช้ตรวจคุณภาพ?
- Library/local app/shared report server และต้องหลาย tenant หรือไม่?
- ข้อมูลเข้าจาก JSON หรือจำเป็นต้องดึงฐานข้อมูลเอง?
- ขนาดงาน จำนวนผู้ใช้พร้อมกัน และเวลารอที่ยอมรับได้?
- Standards/signature/schedule ใดเป็นเงื่อนไขรุ่นแรก?
- เป้าหมาย license และรูปแบบการดูแลโอเพนซอร์ส?

ยังไม่ต้องตอบทุกข้อเพื่อให้แผนนี้สมบูรณ์ แต่ต้องตอบประเด็นที่มีผลต่อการลงทุนก่อนตัดสินใจในรอบพัฒนา

