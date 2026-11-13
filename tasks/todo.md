# Research Tasks: ระบบออก Report PDF

วันที่จัดทำ: 12 พฤศจิกายน 2026  
ปรับตามผู้ใช้: **ไม่ใช้ Docker เพราะเครื่องทรัพยากรจำกัด**  
สถานะ: **T01–T30 desk review-complete; runtime not-tested**  
แผนหลัก: [plan.md](plan.md)  
Keyword map: [R01–R25](../docs/research/REPORT_SYSTEM_RESEARCH_KEYWORDS.md)  
ผู้ดำเนินการ C03–C08: Codex subagents แบบ parallel ตามคำขอ; **ไม่ใช้ Gemini/Antigravity**
ประวัติ C01–C02: parallel researchers อ่านอย่างเดียวตามคำขอก่อนหน้า; parent ตรวจและเขียนผล ดู [review](../docs/research/CHECKPOINTS_01_02.md)

## วิธีใช้รายการงาน

- งานที่เคยเป็น runtime experiments เปลี่ยนเป็น desk research, tabletop และ validation design โดยเก็บ IDs เดิม
- ไม่ติดตั้ง/รัน Docker หรือ Gotenberg ไม่ทำ Render/load test/benchmark หนัก และไม่ย้ายไปรัน Cloud หรือบริการภายนอกเอง
- ตรวจเอกสาร ลิงก์ expected arithmetic และ JSON/OpenAPI แบบ static ได้ ใช้ script/parser เบาที่มีอยู่แล้ว ไม่ติดตั้ง dependency หนัก
- Runtime cases ใช้ deferred/not-tested งานศึกษาเอกสารเสร็จได้เมื่อ findings/gaps ครบ แต่ห้ามติ๊กว่า Render/conformance/performance ผ่าน
- Files likely touched เป็นเป้าหมายอนาคต ไม่ได้สร้างแล้ว; source register เดียวที่ `docs/research/sources.md`
- ทุกงานมี timebox ไม่เกิน 2 ชั่วโมงและ Dependencies ตามลำดับ; checkpoint ทุก 3 งาน
- T01–T06 ติ๊กตามงานเอกสารและ primary evidence ที่ตรวจจริงเท่านั้น Runtime ทุก case ยัง deferred/not-tested

## Phase 1: โจทย์ผลิตภัณฑ์และฐานหลักฐาน

### Task T01: กำหนดโจทย์ผลิตภัณฑ์และเอกสารอ้างอิง
**Review evidence:** [T01 findings/protocol](../docs/research/findings/01-product-brief.md); [Checkpoint audit](../docs/research/CHECKPOINTS_01_02.md)


- [x] T01 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** สรุปผู้สร้าง template ผู้เรียกรายงาน และผู้อ่าน แยกข้อกำหนดผู้ใช้จริงออกจากสมมติฐาน พร้อมเลือกเอกสารอ้างอิง 3 แบบด้วยข้อมูลสังเคราะห์

**Acceptance criteria:**
- [x] มี personas และเส้นทางสร้าง/เรียก/อ่านรายงานอย่างน้อย 2 กลุ่ม โดยระบุสิ่งที่ยังไม่ยืนยัน
- [x] นิยามตัวอย่างใบเสนอราคา รายงานยอดขายแบบ grouped table และ master-detail พร้อมผลลัพธ์ที่คาดหวัง
- [x] บันทึกคำถามเรื่อง Designer, JRXML, deployment และ workload พร้อมผลต่อทางเลือก โดยไม่ตัดสินใจแทนผู้ใช้

**Verification:**
- [x] เทียบทุกข้อกับคำขอและเอกสาร keywords; ติดป้าย confirmed/assumption/open
- [x] ตรวจว่าแต่ละ use case ระบุ input, output และเกณฑ์ผิดพลาดได้

**Dependencies:** ไม่มี  
**Keyword coverage:** R01  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Product brief และ reference report specifications

**Files likely touched:**
- `docs/research/findings/01-product-brief.md`
- `docs/research/sources.md`

### Task T02: จัดทำทะเบียนหลักฐานและตรึงเวอร์ชันศึกษา
**Review evidence:** [T02 findings/protocol](../docs/research/findings/02-engine-baseline.md); [Checkpoint audit](../docs/research/CHECKPOINTS_01_02.md)


- [x] T02 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ตรวจแหล่งอ้างอิงเดิมและเอกสารเจ้าของ Gotenberg ใหม่ ระบุ release/API docs ที่ศึกษาและชั้นหลักฐาน โดยไม่ติดตั้งหรือเรียก Engine

**Acceptance criteria:**
- [x] แหล่งเดิม S01–S22 มี URL วันที่เข้าถึง หัวข้อที่รองรับ และสถานะเข้าถึงได้/ย้าย/ยังตรวจไม่ได้
- [x] ระบุ release และ major version ของ API docs ที่ศึกษา พร้อมข้อจำกัดการอ่านเอกสารแทน runtime; ไม่ดึง Docker image
- [x] มีกติกาแยก documented/observed/inferred/unknown โดยรอบนี้ไม่มี observed จากการ Render Gotenberg

**Verification:**
- [x] เปิด primary sources ของ claims สำคัญและบันทึก section ที่อ้าง; ลิงก์เสียใช้เอกสารทางการทดแทนพร้อมประวัติ
- [x] ตรวจไม่อ้าง release ที่อ่านเป็น actual runtime version และไม่ยกข้อมูลเก่าเป็นผลตรวจรอบใหม่

**Dependencies:** T01  
**Keyword coverage:** R02, R13, R22  
**Estimated scope:** S; 2 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Source register และ engine baseline

**Files likely touched:**
- `docs/research/sources.md`
- `docs/research/findings/02-engine-baseline.md`

### Task T03: เปรียบเทียบความสามารถผลิตภัณฑ์อ้างอิง
**Review evidence:** [T03 findings/protocol](../docs/research/findings/03-product-comparison.md); [Checkpoint audit](../docs/research/CHECKPOINTS_01_02.md)


- [x] T03 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** เปรียบเทียบ JasperReports Library, Jaspersoft Studio, report server ที่เกี่ยวข้อง, jsreport, Carbone และ pdfme โดยแยกหน้าที่ของแต่ละผลิตภัณฑ์และ edition

**Acceptance criteria:**
- [x] มี matrix ครอบคลุม template, layout, data, authoring, API และ deployment โดยแยก library/designer/server
- [x] ทุกความสามารถที่ยืนยันระบุ primary source, version/edition และเงื่อนไข license ที่ต้องตรวจต่อ; ไม่พบหลักฐานใช้ unknown
- [x] สรุปสิ่งที่ควรเทียบเคียง สิ่งที่อยู่นอก MVP และช่องว่างที่ต้องทดลอง ไม่ใช้จำนวนฟีเจอร์ตัดสินผู้ชนะ

**Verification:**
- [x] สุ่มตรวจ claims สำคัญอย่างน้อย 2 ข้อต่อกลุ่มผลิตภัณฑ์จากเอกสารเจ้าของ
- [x] เทียบ matrix กับ use cases T01 เพื่อไม่กลายเป็นการคัดลอกทุกฟีเจอร์

**Dependencies:** T01, T02  
**Keyword coverage:** R02, R05, R14  
**Estimated scope:** S; 2 file targets; 1.5–2 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Product capability matrix

**Files likely touched:**
- `docs/research/findings/03-product-comparison.md`
- `docs/research/sources.md`

### Checkpoint C01: หลัง T01–T03

- [x] T01–T03 มีเอกสารและ citations ที่ตรวจย้อนกลับได้
- [x] แยก library/designer/server และ version/edition ชัดเจน
- [x] สรุปคำถามผู้ใช้ที่มีผลต่อ MVP; ยังไม่บังคับเลือกแนวทางเพื่อค้นเอกสารต่อ
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** มี use cases และ benchmark ที่แยกข้อเท็จจริงจากสมมติฐาน  
**Verdict:** review-complete / continue desk research; runtime not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_01_02.md); persona/license/architecture ยังไม่เลือก และ runtime ทั้งหมดเลื่อนตามข้อจำกัดเครื่อง

## Phase 2: ความปลอดภัยและเกณฑ์ Validation

### Task T04: วิเคราะห์ขอบเขตความปลอดภัยจากเอกสาร
**Review evidence:** [T04 findings/protocol](../docs/research/findings/04-threat-model.md); [Checkpoint audit](../docs/research/CHECKPOINTS_01_02.md)


- [x] T04 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ระบุ trust boundaries ระหว่าง input, template engine, browser renderer, assets, webhooks และ output จากเอกสารและ tabletop scenarios โดยไม่เปิด lab

**Acceptance criteria:**
- [x] มี data flow และ attack surfaces ครอบคลุม template injection, SSRF, file access และ resource exhaustion
- [x] มีข้อกำหนดแยกสิทธิ์และจำกัด CPU/memory/time/network สำหรับ deployment ในอนาคต ไม่เริ่มบริการบนเครื่องนี้
- [x] มี security verification backlog ที่เชื่อม T22 และแยกความรับผิดชอบของแอปกับ Gotenberg

**Verification:**
- [x] ตรวจทุกเส้นทางรับ URL/ไฟล์/expressions ว่ามี policy หรือ open issue
- [x] ทบทวน scenarios ด้วยเอกสารเท่านั้น ไม่สแกน endpoint ไม่เรียก cloud metadata หรือ production

**Dependencies:** T01, T02  
**Keyword coverage:** R19, R20  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Documented threat model และ security requirements

**Files likely touched:**
- `docs/research/findings/04-threat-model.md`
- `docs/research/sources.md`

### Task T05: ตรวจเงื่อนไขโอเพนซอร์สเบื้องต้น
**Review evidence:** [T05 findings/protocol](../docs/research/findings/05-license-inventory.md); [Checkpoint audit](../docs/research/CHECKPOINTS_01_02.md)


- [x] T05 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** สร้าง inventory ของ renderer, candidate editor และฟอนต์ที่อาจใช้ พร้อมจำแนกประเด็นแจกจ่ายจาก LICENSE/NOTICE โดยไม่ติดตั้ง dependency

**Acceptance criteria:**
- [x] มีชื่อ component/version, license source, วิธีใช้งานในโครงการ และสถานะ redistributable/ต้องตรวจเพิ่ม สำหรับ shortlist รอบแรก
- [x] เปรียบเทียบเป้าหมาย license โครงการอย่างน้อย MIT, Apache-2.0 และ AGPL โดยอ้างข้อความเจ้าของ license; ไม่เลือกแทนผู้ใช้
- [x] กำหนดกติกาตรวจ dependency ใหม่ ฟอนต์ และ assets รวมรายการเอกสารชุมชนที่ต้องมีเมื่อเผยแพร่

**Verification:**
- [x] อ่าน LICENSE/NOTICE ของ shortlisted components และ fonts จากเจ้าของโดยไม่ดาวน์โหลด image หรือติดตั้งระบบ
- [x] ข้อสรุปที่ยังตีความไม่ได้ระบุ unresolved พร้อมผลกระทบ ไม่รับรอง legal compatibility โดยไม่มีหลักฐาน

**Dependencies:** T02, T03  
**Keyword coverage:** R24  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** License inventory และ dependency admission checklist

**Files likely touched:**
- `docs/research/findings/05-license-inventory.md`
- `docs/research/sources.md`

### Task T06: กำหนดเกณฑ์ตรวจและรายการ Validation ที่เลื่อนออกไป
**Review evidence:** [T06 findings/protocol](../docs/research/validation/protocol.md); [Checkpoint audit](../docs/research/CHECKPOINTS_01_02.md)


- [x] T06 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** กำหนด case IDs, expected results และวิธีตรวจที่ต้องใช้ภายหลัง โดยแยก static review ที่เบาออกจาก runtime validation ที่อยู่นอกแผน execution ปัจจุบัน

**Acceptance criteria:**
- [x] Case catalog ครอบคลุม 8 กลุ่มทดลองเดิม รวม empty data, long row, grouped totals, missing assets และ recovery
- [x] แต่ละ case ระบุ expected result, วิธีตรวจ และสถานะ deferred/not-tested สำหรับงานที่ต้อง Render หรือใช้ Docker
- [x] มีเกณฑ์หลักฐานด้าน version/fonts/environment สำหรับการทดสอบในอนาคต โดยไม่สร้าง scripts หรือ provision เครื่อง

**Verification:**
- [x] Trace ทุกกรณีจากเอกสาร keywords ส่วน 7 มายัง case ID
- [x] ตรวจไม่มี runtime validation เป็น prerequisite ของงานค้นเอกสาร และไม่มีคำสั่งรัน Docker ใน checklist

**Dependencies:** T01, T02, T04, T05  
**Keyword coverage:** R04, R12, R13, R21, R22  
**Estimated scope:** M; 4 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Validation design และ deferred-runtime backlog

**Files likely touched:**
- `docs/research/validation/protocol.md`
- `docs/research/validation/case-catalog.md`
- `docs/research/validation/deferred-runtime.md`
- `docs/research/sources.md`

### Checkpoint C02: หลัง T04–T06

- [x] Threat model ครบ input/template/browser/assets/webhooks/output
- [x] มี license inventory จากเอกสารโดยไม่ติดตั้ง dependencies
- [x] Case catalog ครอบคลุมกรณีหลักและ runtime cases ติดป้าย deferred/not-tested
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** มี threat model และ validation backlog โดยไม่เปิด lab  
**Verdict:** review-complete / continue desk research; runtime not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_01_02.md); persona/license/architecture ยังไม่เลือก และ runtime ทั้งหมดเลื่อนตามข้อจำกัดเครื่อง

## Phase 3: ศึกษาข้อจำกัด Engine Layout และภาษาไทย

### Task T07: ศึกษา Gotenberg Request/Response โดยไม่เปิด Engine

- [x] T07 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** อ่านตัวอย่าง HTML conversion, fields, responses และ error policies ตาม API docs ที่ตรึง โดยไม่ติดตั้ง Docker, Gotenberg หรือสร้าง PDF

**Acceptance criteria:**
- [x] ระบุ HTML/CSS/fonts/images inputs และ request options จาก official docs พร้อม version
- [x] มีตัวอย่าง request/response เป็นเอกสารและอธิบาย readiness, missing resources และ error handling โดยไม่ execute
- [x] บันทึก actual rendering, environment manifest และ output checks เป็น deferred/not-tested

**Verification:**
- [x] ตรวจชื่อ route/field/status กับ primary source เดียวกันตาม major version
- [x] ตรวจทุกข้อเป็น documented/inferred/unknown และไม่มีการอ้าง baseline PDF ที่ยังไม่สร้าง

**Dependencies:** T02, T04, T05, T06  
**Keyword coverage:** R13, R25  
**Estimated scope:** S; 2 file targets; 0.5–0.75 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Documented Gotenberg integration contract

**Files likely touched:**
- `docs/research/findings/07-gotenberg-contract.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md)

### Task T08: ศึกษาข้อจำกัด Pagination และ Header/Footer

- [x] T08 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** วิเคราะห์ตารางหลายหน้า หัวตารางซ้ำ oversized row และ header/footer ด้วยเอกสารเจ้าของและ issue reports พร้อมออกแบบกรณีตรวจ ไม่ Render บนเครื่องนี้

**Acceptance criteria:**
- [x] ครอบคลุม A4 แนวตั้ง/นอน เลขหน้า margins, 0/1/50/500 แถว และ oversized row ใน case design
- [x] แยกพฤติกรรมที่ official docs ระบุออกจาก issue reports และข้อกำหนด CSS; ไม่รับรองผล Chromium จริง
- [x] ระบุ layout risks, documented workarounds และ case IDs ที่ต้องพิสูจน์ภายหลัง

**Verification:**
- [x] ตรวจ primary sources ของ layout claims; issue reports ต้องระบุ version และ reproduced locally = no
- [x] ตรวจ row completeness/overlap checks อยู่ใน deferred backlog ไม่มี PDF output ที่แต่งขึ้น

**Dependencies:** T06, T07  
**Keyword coverage:** R04, R05, R13  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Pagination desk study และ runtime evidence gaps

**Files likely touched:**
- `docs/research/findings/08-pagination.md`
- `docs/research/validation/case-catalog.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md)

### Task T09: ศึกษาภาษาไทยและการจัดการ Fonts

- [x] T09 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ศึกษาฟอนต์ไทย วรรณยุกต์ การตัดบรรทัด Unicode และ locale จากเอกสารโดยไม่เปิด container หรือ Render PDF

**Acceptance criteria:**
- [x] เปรียบเทียบฟอนต์อย่างน้อย 2 ตัวเลือกด้าน coverage และสิทธิ์แจกจ่าย พร้อมแหล่งข้อมูล
- [x] ระบุความเสี่ยง body/header/footer, fallback, embedding และ copy/search เป็นรายการที่ต้องตรวจจริงภายหลัง
- [x] มี expected strings ไทย/อังกฤษและ locale/calendar cases โดยไม่อ้างคุณภาพ PDF ว่าผ่านแล้ว

**Verification:**
- [x] ตรวจ font licenses และเอกสาร font/i18n ที่อ้างโดยไม่ติดตั้งฟอนต์เพื่อทดสอบ
- [x] ตรวจทุกข้อเรื่อง layout/embedding/text extraction ติดป้าย runtime not-tested

**Dependencies:** T05, T06, T07, T08  
**Keyword coverage:** R12, R22  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Thai/font research และ deferred checks

**Files likely touched:**
- `docs/research/findings/09-thai-fonts.md`
- `docs/research/validation/case-catalog.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md)

### Checkpoint C03: หลัง T07–T09

- [x] Gotenberg request/response contract อ้าง major version ตรงกัน
- [x] Pagination/Thai/font findings แยก docs, issue reports และ unknown
- [x] ไม่มี baseline PDF หรือคำอ้างว่า Render ผ่าน; runtime feasibility ยังไม่ยืนยัน
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** ทราบ documented constraints และ gaps ที่ยังต้องพิสูจน์  
**Verdict:** desk review-complete; runtime deferred/not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md); runtime PDF, fonts และ scan ยังไม่ทดสอบ

## Phase 4: ศึกษาความหมายของรายงาน

### Task T10: กำหนด Grouping และกติกายอดรวม

- [x] T10 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** กำหนด evaluation scope, subtotal/grand total และ expected decimal values จากข้อมูลสังเคราะห์ ใช้การตรวจตัวเลขแบบเบา ไม่ Render

**Acceptance criteria:**
- [x] นิยามสูตรและ rounding policy ที่ต้องให้ธุรกิจยืนยัน พร้อม case ทศนิยม ติดลบ null และกลุ่มว่าง
- [x] มี expected totals ที่ตรวจได้ด้วยมือหรือ script เล็ก และแยกการตรวจสูตรจากการตรวจยอดที่แสดงใน PDF
- [x] ระบุ page subtotal เป็น runtime/layout gap แยกจาก group subtotal

**Verification:**
- [x] ตรวจ expected arithmetic แยกจาก template โดยไม่ติดตั้ง Engine หรือ dependencies หนัก
- [x] ตรวจนิยาม group membership และจัดหน้าข้ามกลุ่มเป็น not-tested

**Dependencies:** T01, T06, T08  
**Keyword coverage:** R05, R08  
**Estimated scope:** M; 3 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Aggregation contract และ expected-value specimens

**Files likely touched:**
- `docs/research/findings/10-grouping-totals.md`
- `research/specimens/grouped-cases.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md)

### Task T11: ศึกษา Master-detail และส่วนประกอบใช้ซ้ำ

- [x] T11 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** เปรียบเทียบ partial และ subreport semantics ผ่านเอกสารและตัวอย่างข้อมูลหนึ่งระดับ โดยไม่พัฒนา compiler หรือ Render

**Acceptance criteria:**
- [x] มี input cases master ไม่มี detail, หลาย detail และส่วนย่อยยาวข้ามหน้า
- [x] ระบุ data/parameter/version contracts และข้อจำกัด nesting/recursion จากเอกสาร
- [x] เสนอ partial/subreport options พร้อม gaps โดยไม่อ้างผลทดลอง PDF

**Verification:**
- [x] Walk through parent/detail IDs และ expected totals ด้วยข้อมูลสังเคราะห์
- [x] ตรวจ pagination ของส่วนย่อยเป็น deferred/not-tested และ references ใช้ version ที่ระบุ

**Dependencies:** T08, T10  
**Keyword coverage:** R10, R05  
**Estimated scope:** M; 3 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Reusable-component desk study

**Files likely touched:**
- `docs/research/findings/11-master-detail.md`
- `research/specimens/master-detail-cases.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md)

### Task T12: ศึกษา Charts Images QR และ Barcodes

- [x] T12 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** เปรียบเทียบ SVG/PNG, chart readiness และเงื่อนไข QR/Code 128 จากเอกสาร รวมวิธีตรวจภายหลัง โดยไม่ Render หรือสร้าง scan benchmark

**Acceptance criteria:**
- [x] มีตารางทางเลือก assets ด้านความคมชัด readiness และ license โดยแยก documented จาก inferred
- [x] กำหนด case ภาพหาย โหลดช้า และวิธีตรวจ payload ของ QR/barcode
- [x] ระบุ PDF decode และ physical print-scan เป็น not-tested ไม่คาดเดาความสำเร็จ

**Verification:**
- [x] ตรวจคำแนะนำ assets/readiness กับ primary sources ที่ตรง Engine version
- [x] ตรวจไม่มีค่าความคมชัด/scan rate/file size ที่อ้างเป็นผลวัดของโครงการ

**Dependencies:** T05, T07, T09  
**Keyword coverage:** R11, R13  
**Estimated scope:** M; 3 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Visual asset options และ validation requirements

**Files likely touched:**
- `docs/research/findings/12-visual-assets.md`
- `docs/research/validation/case-catalog.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md)

### Checkpoint C04: หลัง T10–T12

- [x] Subtotal/grand total มี expected values; PDF display และ page subtotal ยังไม่ทดสอบ
- [x] Master-detail data/parameter contracts มีตัวอย่างครบ
- [x] Assets/QR/barcode findings ไม่อ้าง scan/print/Render success
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** มี semantic contracts และ expected specimens จากการตรวจแบบเบา  
**Verdict:** desk review-complete; runtime deferred/not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_03_04.md); runtime PDF, fonts และ scan ยังไม่ทดสอบ

## Phase 5: ประเมิน Template และ Authoring

### Task T13: เปรียบเทียบรูปแบบ Report Definition

- [x] T13 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** เปรียบเทียบ HTML-first, declarative schema และแนวทางผสมด้วย report specimen เดียวกันจากเอกสารและ walkthrough ไม่สร้าง compiler หรือรัน Render

**Acceptance criteria:**
- [x] เปรียบเทียบ 3 ทางเลือกด้วย grouping, long text และ reusable section พร้อม documented constraints และ unresolved runtime gaps
- [x] ระบุ round-trip loss, schema migration, expression restrictions และความสัมพันธ์กับ editor/renderer
- [x] ให้ข้อเสนอพร้อมต้นทุนและ reversal path เป็น proposed decision ไม่เลือกรูปแบบถาวร

**Verification:**
- [x] Walk through specimen กับ input/output ที่ต้องการใน T01 และ desk studies T08–T11
- [x] ตรวจว่าไม่มีผล runtime รองรับข้อเสนอ ต้องแสดง conditional feasibility และ license precheck

**Dependencies:** T03, T05, T08, T09, T10, T11  
**Keyword coverage:** R03, R06, R08, R19  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Template format options และ specimen

**Files likely touched:**
- `docs/research/findings/13-template-options.md`
- `research/specimens/template-options.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T14: ประเมิน Designer โดยใช้ Report เดียวกัน

- [x] T14 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ประเมิน code editor, block editor และ visual canvas ผ่านเอกสารและตัวอย่าง workflow ไม่ติดตั้ง candidate หรือสร้าง UI runtime

**Acceptance criteria:**
- [x] มีเกณฑ์เพิ่ม field/แก้ table/preview/undo จาก persona พร้อม documented capabilities ที่อ้างได้
- [x] ระบุเส้นทาง export definition ไป HTML/Gotenberg และ conversion work ที่ยังไม่พิสูจน์
- [x] สรุป build/reuse/defer พร้อมต้นทุนและ license blockers โดยไม่รับรองว่าเสียบ Engine ได้ทันที

**Verification:**
- [x] ตรวจ candidate ที่ลงลึกไม่เกิน 2 กับ official docs และ sample definitions แทนการรัน demo ที่กินทรัพยากร
- [x] เปรียบเทียบกับ T01/T13 และระบุ authoring usability/round-trip runtime not-tested

**Dependencies:** T01, T03, T05, T13  
**Keyword coverage:** R14, R02, R24  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Designer feasibility และ build/reuse/defer options

**Files likely touched:**
- `docs/research/findings/14-designer-options.md`
- `research/specimens/designer-evaluation.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T15: ออกแบบเส้นทาง Preview และ Template Lifecycle

- [x] T15 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** เขียน user flows และ state tables สำหรับ draft, preview, publish, version rollback และ report catalog ขั้นต่ำ โดยยังไม่พัฒนา UI

**Acceptance criteria:**
- [x] มี flow ผู้สร้างแก้ draft แล้ว preview ด้วย PDF pipeline เดียวกับ output พร้อมการแสดง error และ empty state
- [x] ระบุ immutable published version, asset dependency และพฤติกรรมเอกสารย้อนหลังว่าดึงไฟล์เดิมหรือ Render ใหม่
- [x] แยกขั้นต่ำ MVP จาก approvals/catalog ขั้นสูง พร้อม accessibility และ keyboard considerations สำหรับ authoring

**Verification:**
- [x] Walk through สถานการณ์แก้ template ระหว่างมีงาน Render และ rollback เวอร์ชัน
- [x] ตรวจสิทธิ์ที่แต่ละขั้นต้องใช้เพื่อส่งต่อ T20 และไม่ผูกกับ database schema ที่ยังไม่เลือก

**Dependencies:** T13, T14  
**Keyword coverage:** R14, R15, R18  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Authoring/lifecycle flow specification

**Files likely touched:**
- `docs/research/findings/15-authoring-lifecycle.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Checkpoint C05: หลัง T13–T15

- [x] Template formats เปรียบเทียบด้วย specimen และระบุ runtime uncertainty
- [x] Designer options อ้างเอกสาร ไม่ติดตั้ง candidate หรือรัน demo ที่กินทรัพยากร
- [x] Flows ครบ preview/error/version/publish และการตัดสินใจลงทุนสูงยังเป็น proposed
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** มีทางเลือก authoring ที่เข้ากับข้อจำกัด Engine และผู้ใช้  
**Verdict:** desk review-complete; runtime deferred/not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_05_08.md); PDF runtime, security probes และ full OpenAPI conformance ยังไม่ทดสอบ

## Phase 6: Contracts ของข้อมูลและการเรียกใช้งาน

### Task T16: กำหนด Data Contract และ Parameters

- [x] T16 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ร่าง contract ของ JSON input, typed parameters และ diagnostics สำหรับ reference reports โดยระบุ fields/parameters/calculated values แยกชัด

**Acceptance criteria:**
- [x] รองรับ list/nested data และนิยาม missing/null/empty/default ตามกรณีใช้งาน
- [x] Parameters มี type, required/default, enum/date/timezone และ semantics ของ filtering ที่ชัดเจน
- [x] มีตัวอย่าง valid/invalid พร้อม error location และขอบเขตสูตร/การปัดเศษที่อ้าง T10

**Verification:**
- [x] ตรวจ schema และ valid/invalid samples แบบ static; ใช้ validator เบาที่มีอยู่แล้วได้โดยไม่ติดตั้ง dependencies หนัก
- [x] ตรวจไม่ให้ defaults/filtering เปลี่ยนยอดหรือช่วงเวลารายงานโดยไม่มีคำอธิบาย

**Dependencies:** T01, T10, T13  
**Keyword coverage:** R06, R07, R08  
**Estimated scope:** M; 4 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Draft input schema และ validation cases

**Files likely touched:**
- `docs/research/findings/16-data-contract.md`
- `research/specimens/report-input.schema.json`
- `research/specimens/report-input-cases.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T17: ประเมิน Data Connectors และ Snapshot Consistency

- [x] T17 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** เทียบให้ระบบต้นทางส่ง JSON กับ report server ดึง REST/SQL เอง โดยศึกษา read-only access, credentials และความสอดคล้องข้อมูลข้ามแหล่ง

**Acceptance criteria:**
- [x] เปรียบเทียบ JSON-first, REST และ SQL connector ด้วย use cases เดียวกัน พร้อมขอบเขตและต้นทุน
- [x] ระบุ parameterized query, credential storage, timeout/row limit, snapshot และ egress policy ของแต่ละทางเลือก
- [x] เสนอ connector ที่จำเป็นต่อ MVP แบบมีเงื่อนไข โดยไม่เชื่อม production database หรือสร้าง connector framework

**Verification:**
- [x] ตรวจ failure scenarios เช่น data เปลี่ยนระหว่างดึงหลายแหล่ง query ช้า และสิทธิ์เกินจำเป็น
- [x] อ้างเอกสารเจ้าของ connector/database เฉพาะ candidate ที่พิจารณา หากยังไม่เลือกใช้ option-level evidence

**Dependencies:** T04, T16  
**Keyword coverage:** R09, R20  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Data-source decision matrix

**Files likely touched:**
- `docs/research/findings/17-data-source-options.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T18: ร่าง Public API Contract

- [x] T18 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ร่าง API ขั้นต่ำสำหรับเรียก Render, ติดตาม job และดาวน์โหลดผล โดยกำหนด versioning, error taxonomy และ idempotency ไม่พัฒนา endpoints

**Acceptance criteria:**
- [x] มีตัวอย่าง sync response และ async job reference พร้อม template version และ validation errors
- [x] แยก input/template/renderer/authorization/timeout errors พร้อม correlation ID และขอบเขต idempotency
- [x] ระบุ content type, filename, file access และ preview parity โดยผูก Gotenberg API ผ่าน adapter concept ที่ยังไม่เลือก implementation

**Verification:**
- [x] ตรวจ OpenAPI syntax/references แบบ static หรือ parser เบาที่มีอยู่แล้ว ไม่เริ่ม API server
- [x] Walk through success, missing field, missing asset, timeout และ duplicate request เชื่อม T19/T20

**Dependencies:** T13, T15, T16, T17  
**Keyword coverage:** R16, R13  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Draft API specification

**Files likely touched:**
- `docs/research/findings/18-api-contract.md`
- `research/specimens/report-api.openapi.yaml`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Checkpoint C06: หลัง T16–T18

- [x] Input/schema/parameters มี valid และ invalid cases
- [x] Data-source options ระบุ snapshot, credentials และ read-only policy
- [x] Draft API ผูก error taxonomy, template version และ sync/async semantics ชัดเจน
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** มี draft contracts ที่สอดคล้องกันโดยยังไม่สร้าง production API  
**Verdict:** desk review-complete; runtime deferred/not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_05_08.md); PDF runtime, security probes และ full OpenAPI conformance ยังไม่ทดสอบ

## Phase 7: Jobs สิทธิ์ และการส่งรายงาน

### Task T19: กำหนด Job Lifecycle และ Recovery

- [x] T19 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** กำหนด states และ invariants ของงาน Render รวม retry, duplicate callbacks, crash recovery และ cancellation โดยไม่เลือกระบบ queue ก่อนมี workload

**Acceptance criteria:**
- [x] แยก engine in-memory queue จาก durable application jobs พร้อม state transitions และ ownership
- [x] ระบุ retryable/non-retryable failures, attempt limits, backoff, deduplication และผลต่อไฟล์ซ้ำ
- [x] มี recovery scenarios สำหรับ timeout หลัง output เสร็จ, worker restart และ cancel; ระบุ best-effort cancellation เมื่อหยุด Engine ไม่ได้

**Verification:**
- [x] Tabletop test ทุก transition ด้วย scenario IDs และตรวจว่าไม่มีสถานะสำเร็จที่ไม่มี artifact reference
- [x] เทียบ callback behavior กับ primary docs เวอร์ชันที่ตรึงและไม่สัญญา exactly-once โดยไม่มีหลักฐาน

**Dependencies:** T04, T18  
**Keyword coverage:** R17, R16  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Job model และ recovery scenarios

**Files likely touched:**
- `docs/research/findings/19-job-processing.md`
- `research/specimens/job-scenarios.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T20: กำหนดสิทธิ์และ Data Lifecycle

- [x] T20 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** กำหนด access matrix ของ template, jobs, assets และ PDF พร้อม single-tenant/multi-tenant options และการเก็บข้อมูลอ่อนไหว

**Acceptance criteria:**
- [x] มี role/action/resource matrix รวม owner, viewer, author และผู้เรียก API พร้อม object-level checks
- [x] กำหนด tenant boundaries, cache keys, secrets, audit events และ log redaction ตาม deployment options
- [x] มี retention/delete/backup policy options ครอบคลุม input, temporary files, outputs และ logs โดยไม่อ้าง compliance ที่ยังไม่ประเมิน

**Verification:**
- [x] Walk through ผู้ใช้ข้ามสิทธิ์/tenant ขอ job ID, template และ download URL ของผู้อื่น
- [x] ตรวจทุก data store เชิงแนวคิดมี owner, access, retention และ deletion behavior หรือ open issue

**Dependencies:** T04, T15, T18, T19  
**Keyword coverage:** R20, R15  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Access matrix และ data lifecycle

**Files likely touched:**
- `docs/research/findings/20-access-data-lifecycle.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T21: ประเมิน Scheduling และ Distribution

- [x] T21 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ศึกษางานตามเวลา report bursting และ delivery พร้อมสิทธิ์ผู้รับ โดยรักษาเป็น optional scope จนกว่าจะยืนยัน use case

**Acceptance criteria:**
- [x] นิยาม schedule timezone, missed runs, overlap และ retry ของการส่ง แยกจาก retry การ Render
- [x] มีตัวอย่าง burst รายลูกค้าและ permission recheck ณ เวลาส่ง พร้อม link expiry และ audit
- [x] ประเมิน local download, object storage link และ email ในระดับ options; ไม่ส่งข้อความจริงหรือเชื่อมบัญชีผู้รับ

**Verification:**
- [x] Walk through timezone boundary, ผู้รับถูกถอนสิทธิ์, ส่งซ้ำ และ artifact หมดอายุ
- [x] จัดหมวดแต่ละ capability เป็น MVP/later/unknown พร้อมเหตุผลจาก T01

**Dependencies:** T19, T20  
**Keyword coverage:** R18, R17, R20  
**Estimated scope:** S; 2 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Scheduling/delivery option study

**Files likely touched:**
- `docs/research/findings/21-distribution-options.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Checkpoint C07: หลัง T19–T21

- [x] Job scenarios ครอบคลุม timeout/crash/duplicates/cancel
- [x] Access matrix ครบ template/job/asset/artifact พร้อม retention
- [x] Schedule/delivery เป็น optional ตาม use case และไม่มีการส่งข้อความจริง
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** ความล้มเหลวและสิทธิ์ข้ามขอบเขตได้รับการวิเคราะห์  
**Verdict:** desk review-complete; runtime deferred/not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_05_08.md); PDF runtime, security probes และ full OpenAPI conformance ยังไม่ทดสอบ

## Phase 8: ศึกษา Security Performance และ Operations

### Task T22: ทบทวน Security Controls แบบ Tabletop

- [x] T22 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** วิเคราะห์ allow/deny policies และ failure scenarios เทียบเอกสาร โดยไม่เปิด lab ไม่ส่ง security probes และไม่ทดสอบใช้ทรัพยากรจนหมด

**Acceptance criteria:**
- [x] มี scenario matrix สำหรับ URLs, redirects, assets, callbacks และ expression execution พร้อม documented controls
- [x] ทบทวน unauthorized object access และ tenant boundaries เชิง contract โดยระบุ application checks not-tested
- [x] ระบุ residual risks และรายการ future probes โดยไม่อ้างผล penetration test หรือ runtime verification

**Verification:**
- [x] Trace scenarios ไปยัง threat model และเอกสาร controls ที่ตรง version
- [x] ตรวจแยก documented protection จาก verified protection และไม่มีคำสั่ง probes/บริการให้รันในแผนปัจจุบัน

**Dependencies:** T04, T07, T13, T19, T20  
**Keyword coverage:** R19, R20, R13  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Security desk review และ deferred verification

**Files likely touched:**
- `docs/research/findings/22-security-review.md`
- `research/specimens/security-scenarios.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T23: ศึกษา Performance และทำ Capacity Scenarios

- [x] T23 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ศึกษา documented concurrency/queue/timeout และทำ sizing scenarios แบบสมมติฐาน ไม่รัน load test benchmark หรือวัดทรัพยากรบนเครื่องนี้

**Acceptance criteria:**
- [x] ระบุ documented limits และ version ของ Engine โดยไม่ใช้ตัวเลขผู้อื่นเป็นผลของโครงการ
- [x] มี small/medium workload scenarios พร้อม inputs/formulas/assumptions ที่ไม่อ้าง measured latency หรือ RAM
- [x] ระบุ throughput, p50/p95, memory peak และ scaling efficiency เป็น unknown/not-tested พร้อมวิธีตรวจเมื่อมี environment ในอนาคต

**Verification:**
- [x] ตรวจสูตร sizing ด้วยมือหรือ script เบา พร้อม sensitivity ต่อเวลาต่อรายงานที่สมมติ
- [x] ตรวจไม่มีการรายงานตัวเลขสมมติเป็น benchmark, SLA หรือ hardware requirement ที่วัดจริง

**Dependencies:** T06, T07, T08, T09, T19, T22  
**Keyword coverage:** R21, R17, R22  
**Estimated scope:** M; 3 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Capacity assumptions และ documented performance constraints

**Files likely touched:**
- `docs/research/findings/23-performance-scenarios.md`
- `research/specimens/capacity-assumptions.json`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Task T24: ประเมิน Self-hosting และ Operations

- [x] T24 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ศึกษา deployment options รวม Docker/self-hosting ในเชิงเอกสารเท่านั้น พร้อม offline assets, observability, backup/restore และ upgrades ไม่ติดตั้งหรือ deploy

**Acceptance criteria:**
- [x] มี deployment options ที่อ้าง assumptions T23 พร้อม documented health/resource/observability controls
- [x] มี outline quickstart/offline/backup/restore/upgrade โดยระบุ unexecuted และไม่ใส่การรัน Docker เป็น task
- [x] ประเมิน formatter/component/data adapter extension points โดยไม่เลือก infrastructure เกินหลักฐาน

**Verification:**
- [x] เทียบ options กับ contract T07 และ scenario T23; ทุก runbook เป็น documentation-only
- [x] Walk through restore template/assets และเอกสารย้อนหลังพร้อม dependencies ที่ต้องเก็บ โดยไม่อ้าง restore สำเร็จ

**Dependencies:** T05, T07, T19, T20, T23  
**Keyword coverage:** R25, R21, R15  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Deployment/operations options

**Files likely touched:**
- `docs/research/findings/24-deployment-operations.md`
- `docs/research/sources.md`

**Review evidence:** [Checkpoint 05–08 review](../docs/research/CHECKPOINTS_05_08.md)

### Checkpoint C08: หลัง T22–T24

- [x] Security review เป็น tabletop ไม่ส่ง probes
- [x] Performance เป็น assumptions/scenarios ไม่มี measured latency/RAM/throughput
- [x] Deployment options เป็นเอกสาร ไม่ติดตั้ง Docker/Gotenberg/Cloud
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** มี documented controls และ capacity assumptions ที่แยกจากผลวัด  
**Verdict:** desk review-complete; runtime deferred/not-tested  
**Evidence / gaps / next action:** [Checkpoint review](../docs/research/CHECKPOINTS_05_08.md); PDF runtime, security probes และ full OpenAPI conformance ยังไม่ทดสอบ

## Phase 9: ศึกษามาตรฐาน PDF และ Signature

### Task T25: ทำ Matrix ความสามารถ PDF ขั้นสูง
**Review evidence:** [T25 findings](../docs/research/findings/25-pdf-capabilities.md); runtime not-tested


- [x] T25 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** จัดหมวด PDF/A, PDF/UA, bookmarks, merge/stamp, encryption, forms และ embedded invoice data จากเอกสารตามเวอร์ชัน ไม่เลือก profile เพื่อรันในรอบนี้

**Acceptance criteria:**
- [x] ทุก capability ระบุ route/options, version, prerequisite, validator และ documented/unknown status จาก primary sources
- [x] ระบุ order constraints และความเสี่ยงต่อ tags, metadata และ signatures หลัง post-processing
- [x] เลือกตัวอย่าง profiles สำหรับศึกษาวิธี validate ใน T26 โดยไม่สร้าง output หรืออ้างมาตรฐานภาษีครบถ้วนจาก PDF profile

**Verification:**
- [x] ตรวจ route/options กับ official docs ของ version ที่ศึกษาใน T02/T07
- [x] ตรวจ use case แต่ละข้อกับ T01; ไม่จำเป็นให้คง later scope และ runtime not-tested

**Dependencies:** T02, T03, T07, T12  
**Keyword coverage:** R23, R13  
**Estimated scope:** S; 2 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Versioned PDF capability matrix

**Files likely touched:**
- `docs/research/findings/25-pdf-capabilities.md`
- `docs/research/sources.md`

### Task T26: ศึกษาวิธีตรวจ Archival และ Accessibility
**Review evidence:** [T26 findings](../docs/research/findings/26-pdf-profile-validation.md); [cases A05–A09](../docs/research/validation/case-catalog.md); runtime not-tested


- [x] T26 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ศึกษากติกาและวิธี validate ตัวอย่าง PDF/A หนึ่ง profile และ PDF/UA หนึ่ง profile จากเอกสาร ไม่รัน conversion หรือ validator บน PDF

**Acceptance criteria:**
- [x] ระบุ profile, validator options และชนิดผลที่ต้องเก็บ โดยไม่รายงาน conformance pass/fail ที่ยังไม่รัน
- [x] มี checklist text/fonts/tags/reading order/table semantics/page count ที่ผูก use cases ไทย
- [x] แยก automated conformance จาก manual accessibility review และระบุทั้งสองอย่างเป็น deferred/not-tested

**Verification:**
- [x] ตรวจวิธี validation กับเอกสารเจ้าของมาตรฐานและเครื่องมือ
- [x] ตรวจไม่มีการใช้ API capability หรือ HTTP success แทนหลักฐานว่า output ผ่านมาตรฐาน

**Dependencies:** T09, T25  
**Keyword coverage:** R23, R22, R12  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** PDF conformance validation design

**Files likely touched:**
- `docs/research/findings/26-pdf-profile-validation.md`
- `docs/research/validation/case-catalog.md`
- `docs/research/sources.md`

### Task T27: ศึกษา Digital Signature และ Key Lifecycle
**Review evidence:** [T27 findings](../docs/research/findings/27-signature-lifecycle.md); [specimen](../research/specimens/signature-scenarios.json); runtime not-tested


- [x] T27 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** ศึกษาความต่างระหว่างภาพลายเซ็นกับ cryptographic signature พร้อม key custody, certificate chain, timestamp และการแก้เอกสารหลังเซ็นในระดับ design

**Acceptance criteria:**
- [x] นิยามข้อกำหนด signature, verification และ trust chain ตาม use cases โดยไม่ขอหรือเก็บ private keys จริง
- [x] เปรียบเทียบแนวทาง local test key กับ external signer/HSM ในระดับ contract พร้อมต้นทุน/ความเสี่ยง
- [x] ระบุ effects ของ merge/stamp/encryption หลังเซ็น และงานทดลองต่อที่ต้องใช้ environment/certificates โดยไม่อ้างผล sign จริง

**Verification:**
- [x] ตรวจ claims จาก Gotenberg และเอกสารมาตรฐาน/ผู้ให้บริการที่พิจารณา
- [x] Walk through key rotation, expired/revoked certificate และ validation failure; แยก documented จาก tested

**Dependencies:** T04, T20, T25  
**Keyword coverage:** R23, R19, R20  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Signature integration study; live signing explicitly untested

**Files likely touched:**
- `docs/research/findings/27-signature-lifecycle.md`
- `research/specimens/signature-scenarios.json`
- `docs/research/sources.md`

### Checkpoint C09: หลัง T25–T27

- [x] Capability matrix มี version/profile/validator จาก primary sources
- [x] PDF/A/PDF/UA เป็น validation design; ไม่มี output ที่ผ่าน validator
- [x] Signature study ไม่ใช้ keys จริงและ live signing not-tested
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** ทราบ capability/validation requirements และยังไม่อ้าง conformance  
**Verdict:** desk review-complete; runtime deferred/not-tested  
**Evidence / gaps / next action:** T25/T26 ตรวจกับ docs 9.x แล้ว (pdfa.org 403 = unknown); T27 อ่าน ETSI clause ไม่ได้ (PAdES levels = inferred); validator engine ของ Gotenberg, per-release stage availability, signature validity ใน verifier ยัง unknown

## Phase 10: สังเคราะห์ผลและเตรียมตัดสินใจ

### Task T28: สรุป Quality Strategy และช่องว่าง Runtime
**Review evidence:** [T28 findings](../docs/research/findings/28-quality-strategy.md); [deferred backlog §4](../docs/research/validation/deferred-runtime.md); runtime not-tested


- [x] T28 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** รวบรวม documented findings และ validation cases เป็นแผนตรวจภายหลัง โดยไม่ replay fixtures หรือสร้าง regression pipeline ในเครื่องนี้

**Acceptance criteria:**
- [x] ทุก planned validation case มี ID, expected result, priority และสถานะ deferred/not-tested พร้อมผลต่อ MVP
- [x] กำหนด semantic/text/numeric/visual checks และ nondeterminism ที่ต้องควบคุมจากเอกสาร
- [x] มี runtime validation backlog แยกชัด และไม่ทำให้ research desk study complete เท่ากับ implementation ready

**Verification:**
- [x] ตรวจ traceability ของ pagination, ไทย และยอดรวมกลับไปแหล่งข้อมูล/expected specimens
- [x] ตรวจทุก claim observed ว่ามีหลักฐานจริง; รอบนี้ไม่มี Gotenberg runtime evidence และไม่อ้างผลวัด

**Dependencies:** T08, T09, T10, T11, T12, T22, T23, T26  
**Keyword coverage:** R22, R12, R15  
**Estimated scope:** M; 3 file targets; 0.75–1 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Quality strategy และ explicit validation gaps

**Files likely touched:**
- `docs/research/findings/28-quality-strategy.md`
- `docs/research/validation/deferred-runtime.md`
- `docs/research/sources.md`

### Task T29: จัดลำดับ MVP พร้อมต้นทุนและทางเลือก
**Review evidence:** [T29 roadmap](../docs/research/findings/29-mvp-roadmap.md); [feature traceability](../docs/research/findings/feature-traceability.md); effort ranges = inferred estimate ไม่ใช่ measured


- [x] T29 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** สังเคราะห์ backlog ตามคุณค่า documented evidence ความเสี่ยง และต้นทุน โดยแสดง runtime uncertainty แยกและรักษาทางเลือก developer-first/business-author-first

**Acceptance criteria:**
- [x] ทุก capability ระบุ must/later/out/unknown, use case, evidence และ dependency รวมความครอบคลุม R01–R25
- [x] เปรียบเทียบ MVP อย่างน้อย 2 แนวทาง พร้อม build/reuse choices, license blockers และ effort ranges ที่ระบุความไม่แน่นอน
- [x] มี milestones และ explicit exclusions; ไม่เปลี่ยนตัวเลขทดลองเป็น requirement หรือเลือก license/Designer แทนผู้ใช้

**Verification:**
- [x] Trace P0 ทุกข้อไป use case และ documented evidence หรือ runtime gap ที่ต้องพิสูจน์ ไม่อ้าง P0 feasibility ผ่านแล้ว
- [x] ตรวจไม่มี BI/JRXML/export อื่นหลุดเป็น must-have และไม่ใช้ capacity assumptions เป็น measured results

**Dependencies:** T03, T05, T14, T15, T16, T17, T18, T19, T20, T21, T24, T25, T27, T28  
**Keyword coverage:** R01, R02, R14, R18, R23, R24, R25  
**Estimated scope:** M; 3 file targets; 1–1.5 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Evidence-backed MVP options และ roadmap

**Files likely touched:**
- `docs/research/findings/29-mvp-roadmap.md`
- `docs/research/findings/feature-traceability.md`
- `docs/research/sources.md`

### Task T30: จัดทำรายงาน Research และชุดตัดสินใจสุดท้าย
**Review evidence:** [Full report](../docs/research/REPORT_SYSTEM_FULL_RESEARCH.md); [proposed decisions](../docs/research/decisions/proposed-decisions.md); [README](../docs/research/README.md)


- [x] T30 เสร็จพร้อมหลักฐานและข้อจำกัด

**Description:** จัดทำ narrative report ที่นำไปวาง spec ได้ พร้อม architecture options เชิงแนวคิดและ proposed decisions โดยไม่เริ่ม production implementation

**Acceptance criteria:**
- [x] รายงานสรุป documented findings, runtime gaps, MVP options และ costs พร้อมลิงก์เอกสารจริง โดยไม่อ้างทดลองสำเร็จ
- [x] Proposed decisions ระบุ options/rationale/blast radius/reversal path และสิ่งที่ผู้ใช้ต้องเลือกก่อนลงทุนสูง
- [x] มี deferred-validation checklist ก่อน implementation readiness; update task/checkpoint เฉพาะงานเอกสารที่มีหลักฐานครบ

**Verification:**
- [x] ตรวจ R01–R25 และความสอดคล้องระหว่าง findings, feature matrix, gaps และ conclusions
- [x] ตรวจ claims กับ primary sources และลิงก์ไฟล์มีจริง; ระบุไม่มี local/remote runtime test และไม่มี measured benchmark

**Dependencies:** T28, T29  
**Keyword coverage:** R01, R03, R13, R14, R24, R25  
**Estimated scope:** M; 4 file targets; 1.5–2 ชั่วโมงสุทธิ  
**ผลส่งมอบ:** Full desk-research report และ decision packet พร้อม runtime gaps

**Files likely touched:**
- `docs/research/REPORT_SYSTEM_FULL_RESEARCH.md`
- `docs/research/decisions/proposed-decisions.md`
- `docs/research/README.md`
- `tasks/todo.md`

### Checkpoint C10: หลัง T28–T30

- [x] R01–R25 มี findings หรือ explicit gaps และผลต่อการตัดสินใจ
- [x] MVP มี use case, documented evidence, dependencies และ effort
- [x] รายงานระบุ desk research complete ต่างจาก runtime validated/implementation ready
- [x] บันทึก checkpoint verdict และ evidence/gaps ด้านล่าง

**จุดผ่าน:** Research report ตรวจย้อนกลับได้และระบุ readiness อย่างซื่อตรง  
**Verdict:** desk research complete; runtime NOT validated; NOT implementation-ready  
**Evidence / gaps / next action:** ไม่มี R ใดปิดด้วย runtime; open inconsistencies I-1..I-8 ใน report §10; ต้องให้ผู้ใช้เลือก D-4 (environment spike) และ D-1 (persona) ก่อน M0

## สถานะเมื่อปรับแผน

- Desk research tasks complete: 30/30
- Checkpoints reviewed: 10/10
- Docker/Engine execution: อยู่นอก scope ตามข้อจำกัดผู้ใช้
- Runtime validation และ benchmarks: deferred/not-tested
- Production implementation: ยังไม่เริ่ม
- Plan reviewed by user: ยังไม่บันทึกอนุมัติ architecture/implementation

C05–C08 ใช้ Codex subagents ตามคำขอล่าสุด; ไม่ใช้ Gemini/Antigravity อัปเดต checklist จากเอกสารและหลักฐานจริงเท่านั้น Runtime validation เป็นรายการแยก ไม่บังคับรัน Docker เพื่อปิด desk research

