# T29 — จัดลำดับ MVP พร้อมต้นทุนและทางเลือก

วันที่: 13 พฤศจิกายน 2026  
สถานะ: **ข้อเสนอแบบมีเงื่อนไขจาก desk research** ไม่ใช่การตัดสินใจ ไม่ใช่ requirements ที่อนุมัติ และไม่ใช่ผลทดสอบ — ไม่มี Gotenberg runtime, PDF, benchmark หรือผู้ใช้จริงที่ตรวจ  
คู่กับ: [feature-traceability.md](feature-traceability.md) (ทุก capability + coverage R01–R25)  
อินพุต: findings [01](01-product-brief.md)–[28](28-quality-strategy.md), [protocol](../validation/protocol.md), [case catalog](../validation/case-catalog.md), [deferred runtime](../validation/deferred-runtime.md), [sources](../sources.md), [keyword map](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md)

> **Desk research complete ไม่เท่ากับ Runtime validated และไม่เท่ากับ Implementation ready** — ไม่มีข้อใดในเอกสารนี้ระบุว่า P0 ผ่านหรือ feasible แล้ว

## 1. สรุป

| ประเด็น | ข้อสรุป |
| --- | --- |
| แนวทางที่เทียบ | (ก) developer-first · (ข) business-author-first · (ค) ผสม: ส่ง (ก) โดยออกแบบรูปแบบ definition ให้ต่อ block editor ภายหลังได้ |
| Recommendation (conditional) | **ถ้า** persona หลักเขียนโค้ดได้ → (ก) หรือ (ค); **ถ้า** persona หลักเป็นฝ่ายธุรกิจที่ไม่เขียนโค้ด → (ข) แต่ **ห้ามลงทุน Designer ก่อน M0** ผ่านเงื่อนไข; **ถ้ายังไม่ตอบ persona** → ทำ M0 (ไม่ขึ้นกับ persona) และเตรียม (ค) |
| สิ่งที่ต้องทำก่อนทุกแนวทาง | **M0 spike runtime** (T28 SP-A/B/C) — ต้องมี environment ที่รัน Gotenberg ได้ ซึ่งผู้ใช้ **ยังไม่ได้เลือก** (E1–E4 ใน [28 §3.3](28-quality-strategy.md)) |
| จุดที่ candidate ของผู้ใช้ถูกปรับ | 11 ข้อ ดู §3 (หัวตารางซ้ำเป็นเงื่อนไข, header/footer เป็นเงื่อนไข, "definition ไฟล์" คือ hybrid ไม่ใช่ HTML-first, logic-less ไม่ใช่ sandbox, POST /render ขาด limits/failOn/ขอบเขต deployment, preview ต้องผ่าน PDF จริง ฯลฯ) |
| Effort | ทุกช่วงเป็น **inferred estimate ความเชื่อมั่นต่ำ** ไม่มีหลักฐานชั่วโมงใน findings ([13](13-template-options.md), [14](14-designer-options.md) ระบุเป็นค่าสัมพัทธ์) ดู §4 และ §9 |

## 2. ขอบเขตหลักฐาน (สิ่งที่เอกสารนี้ไม่ทำ)

- ไม่ติดตั้ง/รัน Docker, Gotenberg หรือ render ใด ๆ; ไม่มี evidence ระดับ observed-runtime
- ตัวเลข capacity ใน [23](23-performance-scenarios.md) (utilization 1.67% / 20.83% / 41.67%) เป็น **สมมติฐานเชิงคณิตศาสตร์** เท่านั้น — ไม่ใช่ throughput, SLA หรือข้อกำหนดเครื่อง และไม่ถูกนำมาใช้ในเอกสารนี้เป็นเกณฑ์ใด
- ตัวเลข fixture (3210.00, 2400.00, 350.00) เป็นข้อมูลสังเคราะห์; static check ตรงเฉพาะ arithmetic ([28 §1.9](28-quality-strategy.md)) ไม่เกี่ยวกับ PDF
- ตัวเลขแถว 50/500 และ concurrent 1/5/10 เป็น test design ไม่ใช่ขั้นต่ำผลิตภัณฑ์ ([catalog](../validation/case-catalog.md))
- ไม่เลือก license, Designer, template engine, queue, storage หรือ runtime environment แทนผู้ใช้
- ไม่มีแถว source ใหม่ (ใช้ S-IDs เดิมทั้งหมด จึงไม่ต้องเพิ่ม S110+)

## 3. ตรวจ candidate (ก) ของผู้ใช้เทียบหลักฐาน

Candidate: developer-first v1 — binding field/nested list/parameters; bands (title / page header-footer / group header-footer / detail / summary); group subtotal + grand total + count; master-detail 1 ระดับ; pagination (เลขหน้า, หัวตารางซ้ำ, A4 ตั้ง/นอน); ฟอนต์ไทย Sarabun + formatter พ.ศ.; local asset; CLI render + watch-preview; POST /render เดียวพร้อม error taxonomy. ตัดออก: Designer, SQL/REST, async job, schedule, multi-tenant/RBAC, PDF/A/UA, signature, JRXML, XLSX/DOCX, chart/QR/barcode, page subtotal.

| # | รายการใน candidate | หลักฐาน | ผล | การปรับที่เสนอ |
| --- | --- | --- | --- | --- |
| 1 | หัวตารางซ้ำ | [08](08-pagination.md): issue #392 ([S58](../sources.md)) รายงานบน Gotenberg 7 ปี 2021, **ไม่ reproduce**, CSS workaround ที่เสนอไม่ช่วยกรณีผู้รายงาน; [28](28-quality-strategy.md) D02-HEADER-REPEAT = P0 deferred | **ยังไม่พิสูจน์** | คงเป็น `must` แบบ **มีเงื่อนไขผ่าน M0 SP-B**; fallback = chunk แถวที่ชั้นแอป (กระทบ effort — ดู §4 ก) |
| 2 | Page header/footer band | [07](07-gotenberg-contract.md), [09 §3](09-thai-fonts.md): `header.html`/`footer.html` อยู่คนละ context, ใช้ inline `<style>` + data URI, ไม่โหลด external stylesheet; ฟอนต์ไทยใน header/footer = unknown (D05-HEADER) | **ยังไม่พิสูจน์** | `must` แบบมีเงื่อนไข; fallback = ย้ายข้อมูลสำคัญออกจาก header/footer หรือเปลี่ยนวิธีฝังฟอนต์ (data URI — ยังไม่ทดสอบ) |
| 3 | "HTML/CSS template + definition ไฟล์ (bands/group/aggregate)" | [13](13-template-options.md): สิ่งนี้คือ **Hybrid schema + bounded HTML** ไม่ใช่ HTML-first; ต้องมี schema versioning, migration และ compiler → HTML | ต้นทุนสูงกว่าที่ชื่อ "developer-first" ชวนให้คิด | นับ compiler + schema migration เป็นต้นทุน (§4 ก); "logic-less binding" หมายถึงกลุ่ม/ยอดรวมคำนวณที่แอปก่อน render ([10](10-grouping-totals.md), [13](13-template-options.md)) |
| 4 | ความปลอดภัย template engine | [04](04-threat-model.md), [S41](../sources.md), [S50](../sources.md): HTML escaping ไม่ครอบ URL/CSS/JS context; logic-less ไม่ใช่ sandbox; SEC04 = P0 ก่อน untrusted template (เสนอ) | candidate ไม่ได้ระบุ trust model | ประกาศ **trusted-author templates เท่านั้น + single-trust deployment** ใน v1; escaping ตาม context (URL/CSS); ไม่เลือก Handlebars หรือ engine ใดล่วงหน้า (M1 ตรวจ SEC04) |
| 5 | `POST /render` เดียวพร้อม error taxonomy | [18](18-api-contract.md), [19](19-job-processing.md) (sync-only ไม่ต้องมี durable job), [07](07-gotenberg-contract.md) | ขาด 3 รายการ P0 | ใช้ code จาก 18 เฉพาะ sync: `INPUT_INVALID`, `TEMPLATE_NOT_FOUND`, `RENDER_RESOURCE_FAILED` (Gotenberg 409), `RENDER_FAILED`, `SERVICE_UNAVAILABLE`, `RENDER_TIMEOUT`; **ตัด** `ARTIFACT_NOT_READY`, `IDEMPOTENCY_CONFLICT`. **เพิ่ม:** (i) limits/timeout (keyword §3 P0), (ii) เปิด `failOnResourceHttpStatusCodes` **และ** `failOnResourceLoadingFailed` (D06 P0 แม้ local asset), (iii) กติกา "bind localhost/private network เท่านั้น" — Gotenberg ไม่บังคับ credentials by default ([04](04-threat-model.md)); เปิด shared ต้องผ่าน D07 |
| 6 | CLI render + watch-preview | [15](15-authoring-lifecycle.md): preview ต้องใช้ PDF pipeline/config/fonts เดียวกับ final; HTML preview ใน browser ห้ามใช้เป็นหลักฐาน parity | **ติดสิ่งที่ผู้ใช้ยังไม่มี** | ทั้ง CLI และ preview ต้องเข้าถึง Gotenberg — ผู้ใช้ไม่รัน Docker บนเครื่อง → environment ([28 §3.3](28-quality-strategy.md) E1–E4) เป็น **blocker ของวงพัฒนารายวัน ไม่ใช่แค่ M0**; ถ้ามี HTML preview ต้องติดป้าย non-authoritative |
| 7 | Template version/provenance | keyword §3 P0 แบบพื้นฐาน; [15](15-authoring-lifecycle.md) | candidate ไม่กล่าวถึง | เพิ่ม provenance ขั้นต่ำ: template id/version/hash, renderer image digest (เมื่อทราบ), font hash; หรือระบุ `later` พร้อมเหตุผล — ไม่ปล่อยตกเงียบ |
| 8 | Master-detail ใน v1 | keyword R10 = P1; use case C ([01](01-product-brief.md)); [11](11-master-detail.md) | ผู้ใช้ **ยกระดับโดยเจตนา** | คงไว้ได้ แต่ติด policy ที่ยัง decision-open 2 ข้อ: D03 overflow (long-detail), PO02 empty-detail; และต้องมี no-data state (D02-EMPTY) |
| 9 | ฟอนต์ไทย + formatter พ.ศ. | [09](09-thai-fonts.md), [05](05-license-inventory.md), [28 §2.2](28-quality-strategy.md) | ทำได้ในหลักการ ติดข้อมูลไม่ครบ | จัด พ.ศ. / เงิน ที่ **ชั้นแอป** ด้วย Decimal (ไม่ใช้ float) ไม่พึ่ง Intl ของ browser; ICU/Intl drift = แหล่ง nondeterminism; Sarabun = OFL ตาม metadata แต่ binary/hash ยังไม่ pin → ต้อง pin ก่อน; Noto Sans Thai เป็นตัวสำรอง |
| 10 | ไม่มี page subtotal | [08](08-pagination.md), [10](10-grouping-totals.md), D04-SCOPE | **สอดคล้องหลักฐาน** | คงตัดออก; ต้องรู้ตำแหน่งหน้าจริงหลัง layout ซึ่งยังไม่มีกลไกที่มีหลักฐาน (unk) |
| 11 | A4 ตั้ง/นอน | [07](07-gotenberg-contract.md), [08](08-pagination.md) | ทำได้ตามเอกสาร; ต้องกำหนด source of truth | ตั้ง **ต่อ render** (ไม่ใช่ต่อหน้า); `@page` กับ field `landscape` อาจขัดกัน → กำหนดทางเดียว ตรวจ D02-PAPER |

ข้อสังเกตเพิ่ม: "local asset only" สอดคล้อง [04](04-threat-model.md)/[22](22-security-review.md) (ลด SSRF) แต่ Gotenberg ตัด directory ออกจากชื่อไฟล์ ไฟล์ชื่อซ้ำต้องจัดการ ([07](07-gotenberg-contract.md)); และไม่ทำให้ D06 หลุด — asset หายยังเป็น P0

## 4. แนวทาง MVP

ช่วง effort ทั้งหมดเป็น **inferred estimate** (ความเชื่อมั่นต่ำ) ภายใต้ **สมมติฐาน:** นักพัฒนา JS ที่มีประสบการณ์ 1 คน ชำนาญ HTML/CSS/Node ทำเต็มเวลา; **ไม่รวม** เวลารอการตัดสินใจ/จัดหา environment/ตรวจกฎหมาย; หน่วยเป็นวันทำงาน/สัปดาห์ทำงาน; ไม่มีข้อมูลจริงในโครงการที่วัดได้ ค่าที่ตั้งไว้เพื่อเปรียบเทียบขนาดสัมพัทธ์ ไม่ใช่คำสัญญา

### 4.1 แนวทาง (ก) Developer-first (candidate ผู้ใช้ ตามที่ปรับใน §3)

**ขอบเขต:** C01–C09, C11, C13–C15, C18–C24, C38–C41 ([traceability](feature-traceability.md)); ไม่มี Designer; ไม่มี queue/multi-tenant/PDF-A/signature/SQL; เป็น single-trust, localhost

| มิติ | รายละเอียด |
| --- | --- |
| **Build** | schema + compiler (definition → HTML/CSS), semantic validator (duplicate ID, orphan, ช่วงวันที่, component), group/aggregate (Decimal) ก่อน render, formatter พ.ศ./เงิน, CLI + thin HTTP layer, error mapping, provenance, ชุด validation L0–L3 |
| **Reuse (ตัวเลือก ไม่ได้เลือก)** | Gotenberg เป็น engine (ข้อกำหนด U02); JSON Schema validator; template engine ใด ๆ **ต้อง review SEC04 ก่อนเลือก** (Handlebars เป็นแค่ candidate — [04](04-threat-model.md)); ฟอนต์ Sarabun/Noto Sans Thai (OFL) |
| **License blockers ([05](05-license-inventory.md))** | ไม่มี blocker ที่ระบุว่าห้ามสร้าง แต่ยังค้าง: เลือก license โครงการ (**ผู้ใช้**), pin font binary+hash+notice, image BOM/transitive notices ของ Gotenberg, exact version ของ template engine ที่จะเลือก; ห้ามใช้ Carbone CCL (source-available มีข้อจำกัดแข่ง), Jasper Studio CE (binary-use, ไม่แจก source), ไม่ embed JasperReports (LGPL v3, ไม่จำเป็น) |
| **Effort (inferred)** | M0 **2–5 วัน** (ไม่รวมรอ environment) · M1 แกน **3–6 สัปดาห์** · M2 master-detail+หน้าครบ **1.5–3 สัปดาห์** · M3 server+hardening **1–2 สัปดาห์** · M4 OSS readiness **1–2 สัปดาห์** → รวม **≈ 7–14 สัปดาห์** |
| **สิ่งที่ขยายช่วง** | M0 SP-B ไม่ผ่าน (หัวตารางซ้ำ) → app-level pagination **+2–6 สัปดาห์**; header/footer Thai ไม่ผ่าน → ออกแบบข้อมูลใหม่ **+0.5–1 สัปดาห์**; ได้ environment ล่าช้า → ไม่ขยาย effort แต่เลื่อนปฏิทิน; policy overflow/empty ไม่ได้เลือก → งานซ้ำ |
| **ความเสี่ยงที่ผูกกับ runtime gaps (T28 / P0)** | D02/D02-HEADER-REPEAT (ตารางยาว = หัวใจ MVP), D03 (แถวสูงเกินหน้า), D05/D05-HEADER (ไทย), D06 (asset เงียบ), D01 (ยอดใน PDF); **spike แรก = SP-B** (ถ้าพังกระทบสถาปัตยกรรมทั้งระบบ) ตามด้วย SP-A (ไทย header/footer) และ SP-C |
| **Reversal path** | เก็บ definition เป็นไฟล์ที่ version ได้ + sample data + generated HTML snapshot ([13](13-template-options.md)); ไม่ผูก Designer; เปลี่ยนไป (ค)/(ข) ทำได้โดยเพิ่ม editor บน schema เดิม ถ้าไม่ทิ้ง unknown field เงียบ ๆ; rollback = คง renderer/reader เวอร์ชันเก่า ไม่ใช่แปลงย้อน (ยังไม่พิสูจน์) |

### 4.2 แนวทาง (ข) Business-author-first (มี block/visual designer)

**ขอบเขต:** (ก) ทั้งหมด + C26 Designer + publish/rollback + ส่วนของ R15 ที่ต้องมี UI

**ต้นทุนที่เพิ่มจาก (ก)** (อ้าง [14](14-designer-options.md), [15](15-authoring-lifecycle.md)): editor shell (canvas/block), table/group editor + mapping กับ report semantics, undo/redo, round-trip source ↔ model ↔ generated HTML ไม่สูญเสียข้อมูล, keyboard alternative ของลากวาง ([WAI](../sources.md) S81), **preview จาก PDF จริง** (Canvas ไม่พิสูจน์ reflow/PDF fidelity), draft/revision conflict, ตัวช่วย binding + error location, sandbox/asset policy ของ editor

| มิติ | รายละเอียด |
| --- | --- |
| **Build** | semantics ของ report (group/aggregate/pagination) ยังเป็นของเราไม่ว่าจะ reuse editor ใด; model → HTML compiler; history/round-trip |
| **Reuse (ตัวเลือก ไม่ได้เลือก)** | **GrapesJS core** (HTML/JSON components, storage, undo API มี; แต่ต้องออกแบบ report semantics เอง, license ที่อ่านมาจาก mutable branch, แยก Studio SDK เชิงพาณิชย์); **pdfme Designer** (MIT metadata แต่ schema → HTML/Gotenberg, group semantics, pagination parity, round-trip = **unknown**; dynamic reflow ต้อง blank basePdf) |
| **License blockers** | exact artifact/plugin/dependency ของ GrapesJS/pdfme ยังไม่ตรวจ (S68, S39 mutable); Carbone CCL และ Jasper Studio CE ใช้ reuse ไม่ได้ (ดู 4.1); ต้องตรวจ transitive notices ของ editor |
| **Effort (inferred)** | เพิ่มจาก (ก) **≈ +8–20 สัปดาห์ ช่วงกว้างมาก** (editor, group/table editor, round-trip, a11y, PDF preview integration); ไม่มีหลักฐานชั่วโมงใน findings ([14](14-designer-options.md) ระบุ "สูงเชิงสัมพัทธ์ ยังไม่วัด") → ความเชื่อมั่นต่ำสุดในสามแนวทาง; รวม ≈ **15–34 สัปดาห์** |
| **สิ่งที่ขยายช่วง** | M0 ล้ม (ต้อง chunk แถวเอง) ทำให้ editor ต้องรู้ pagination model ของเรา; round-trip ไม่พิสูจน์ → ต้องจำกัด node ที่รองรับ/reject unsupported edits; a11y/usability ไม่เคยทดสอบกับผู้ใช้จริง |
| **ความเสี่ยงที่ผูกกับ runtime gaps** | ทุกข้อของ (ก) + preview parity (ต้องผ่าน PDF จริงทุกครั้ง → ต้องมี environment ตลอด) + canvas ที่ promise layout ที่ Chromium อาจแตกหน้าต่างออกไป (D02/D03) |
| **Reversal path** | ถ้า editor ใช้ไม่ได้ → ถอยเป็น (ก) ได้เมื่อ schema ถูกออกแบบเป็นแหล่งความจริง (ไม่ใช่ editor state); ถ้า editor เก็บ state เป็นของตัวเอง (เช่น GrapesJS project data) การถอยทำให้ต้อง export/แปลง — **ยังไม่พิสูจน์** |

**เมื่อ (ข) สมเหตุสมผล:** persona หลักเป็นฝ่ายธุรกิจที่ไม่เขียนโค้ด ([keyword R14](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md): "อาจต้องเลื่อนเป็น P0") — แต่ [keyword §6](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md) ระบุให้ทดลอง layout ก่อนลงทุน editor จึงให้ gate ด้วย M0

### 4.3 แนวทาง (ค) ผสม — ส่ง (ก) แล้วเปิดทางให้ block editor

**แนวคิด:** ทำ (ก) แต่ออกแบบ definition schema ให้ (1) เป็นแหล่งความจริงเดียว (2) มี block/field ระบุชนิดและ id ที่ editor อ้างได้ (3) เก็บ unknown field แทนการทิ้ง (4) มี extension node ที่ระบุขอบเขต ([13](13-template-options.md) hybrid) — แล้วเพิ่ม block editor เป็น milestone แยก (M5) หลัง M0–M3 ผ่านและมีผู้ใช้ธุรกิจจริงให้ validate

| มิติ | รายละเอียด |
| --- | --- |
| **Build / Reuse** | ตาม (ก) + งานออกแบบ schema เผื่อ editor |
| **License blockers** | ตาม (ก); ภาระ editor license เลื่อนไปจนถึง M5 |
| **Effort (inferred)** | (ก) + **≈ 1–2 สัปดาห์** ออกแบบ schema/extension; M5 editor แยกประเมินใหม่หลังรู้ผลจริง (ช่วงเดียวกับ (ข) +8–20 สัปดาห์ แต่ตัดสินใจบนหลักฐานที่ดีกว่า) → ถึง M4 ≈ **8–16 สัปดาห์** |
| **ความเสี่ยง** | เหมือน (ก); เพิ่ม: schema ที่ออกแบบเผื่อ editor อาจ over-design ถ้าไม่มีผู้ใช้ธุรกิจจริง (YAGNI) → จำกัดแค่ "คง id + เก็บ unknown field" ใน M1 |
| **Reversal path** | ถอยเป็น (ก) ล้วน = ไม่ใช้ส่วนเผื่อ (ค่าใช้จ่ายจมต่ำ); ต่อเป็น (ข) = ต่อ editor บน schema |

### 4.4 ตารางเปรียบเทียบ

| มิติ | (ก) developer-first | (ข) business-author-first | (ค) ผสม |
| --- | --- | --- | --- |
| Persona ที่ตอบ | developer/integrator | business author (ไม่เขียนโค้ด) | developer ก่อน; business ภายหลังถ้า validate |
| Designer | ไม่มี (code + CLI + PDF preview) | มี (block/canvas) | เลื่อนเป็น M5 |
| ต้นทุนเด่น | compiler + validator + semantic | + editor/round-trip/a11y/preview | (ก) + ออกแบบ schema |
| Effort inferred (ถึง OSS readiness) | ≈ 7–14 สัปดาห์ | ≈ 15–34 สัปดาห์ | ≈ 8–16 สัปดาห์ (ก่อน M5) |
| ความเชื่อมั่นของ estimate | ต่ำ–กลาง | ต่ำสุด | ต่ำ–กลาง |
| ความเสี่ยง runtime เด่น | หัวตารางซ้ำ, Thai header/footer | เดียวกัน + preview parity | เดียวกับ (ก) |
| License ที่ต้องตรวจเพิ่ม | font, engine, notices | + editor (GrapesJS/pdfme) | เลื่อนไป M5 |
| ผู้ใช้ตัดสินก่อนเริ่ม | persona, license, environment | + เลือก/สร้าง editor | เหมือน (ก) |
| Reversal | ง่ายเมื่อ schema เป็นแหล่งความจริง | ยากถ้า editor เก็บ state เอง | ง่าย |

## 5. Milestones (สำหรับแนวทาง (ก)/(ค); (ข) เพิ่ม M-Designer หลัง M0)

ลำดับ: **M0 ก่อน** เพราะ R04/R05/R12 ถ้าพังเปลี่ยนสถาปัตยกรรม template ทั้งระบบ ([28 §3.1](28-quality-strategy.md)). Exit criteria ด้านล่างเป็น **ผ่าน/ไม่ผ่านเชิงคุณภาพ ไม่มีค่าตัวเลขแต่งขึ้น**; ผ่านที่ milestone ใด **ไม่แปลว่า production ready**

| Milestone | เป้าหมาย | Exit criteria | Explicit exclusions |
| --- | --- | --- | --- |
| **Precondition** | ผู้ใช้เลือก environment spike (E1 CI container / E2 เครื่องอื่น / E3 ไม่ใช้ Docker=unknown ไม่ใช่หลักฐาน Gotenberg / E4 เลื่อน) และ persona | มีคำตอบผู้ใช้ในแชต; **ไม่ถือการรอเป็นการอนุมัติ** | ห้าม provision เอง |
| **M0 Spike runtime** | ตอบ gap P0 ของ R04/R05/R12 ด้วยการ render synthetic A/B/C ผ่าน Gotenberg ที่ pin: SP-A ใบเสนอราคา+ไทย header/footer, SP-B ตาราง 0/1/50(+500)/portrait+landscape+หัวตารางซ้ำ, SP-C long-detail + PO02 empty | ใช้ตาราง exit ใน [28 §3.1](28-quality-strategy.md): ID ครบ/ไม่ซ้ำ, ไม่ทับ footer, หัวตารางซ้ำทุกหน้า, วรรณยุกต์/ฟอนต์ฝัง/copy-search ใน body+header/footer, ยอด D01 extract ได้, oversized row ไม่หาย, รันซ้ำนิ่ง; บันทึก image digest/Chromium/ฟอนต์+hash/options/log ต่อรอบ; ผลไม่ผ่าน → ตัดสิน: chunk ที่แอป / จำกัดรูปแบบตาราง / เปลี่ยน approach — **กลับมาทบทวนแผนนี้** | ไม่วัดเวลา/RAM; ไม่ทำ concurrency; ไม่ครอบ security/PDF-A/QR/recovery; ผ่าน ≠ production |
| **M1 แกน definition → HTML → PDF** | C01–C03, C08, C09, C14, C15, C39: schema, semantic validator, group/aggregate Decimal, formatter, asset pin, `failOn*` ทั้งสอง, trust model + escaping, provenance ขั้นต่ำ, เลือก template engine หลังตรวจ SEC04 | specimens ([grouped](../../../research/specimens/grouped-cases.json), [master-detail](../../../research/specimens/master-detail-cases.json), [input cases](../../../research/specimens/report-input-cases.json)) ผ่านเป็น fixture L0; ระยะ runtime ใช้ L1–L3 ตาม [28 §2](28-quality-strategy.md) บน environment ที่เลือก; รายงาน A และ B (หน้าเดียว+grouped) ผ่านตามเกณฑ์ที่ M0 บันทึก | ไม่มี master-detail, ไม่มี HTTP server, ไม่มี Designer |
| **M2 Pagination + master-detail** | C04–C07, C11 ตามผล M0 (หรือ fallback), policy overflow/empty ที่ผู้ใช้เลือก | D02*, D03*, D04* ผ่านตามเกณฑ์ที่กำหนด; long-detail ไม่ทำข้อความหาย; PO01/PO02 ตรง expected | ไม่มี page subtotal, ไม่มี component library เกิน header inline |
| **M3 CLI + watch-preview + `POST /render`** | C18–C20, C22, C24 | preview ผ่าน pipeline เดียวกับ final; error taxonomy ตรง [18](18-api-contract.md) subset sync; limits/timeout ตั้งแบบอนุรักษ์ (ไม่มาจาก capacity assumptions); bind localhost/private; SEC03/D06 policy ทำงานในกรณีสังเคราะห์ | ไม่มี async/idempotency/artifact store, ไม่มี auth, ไม่มี shared deployment |
| **M4 OSS readiness** | C40, C41 | LICENSE ที่ **ผู้ใช้เลือก**, third-party notices, font OFL notice + pinned hash, README แยก supported/limited/not-tested, SECURITY.md, CONTRIBUTING + ตัดสิน DCO/CLA ก่อนรับ contribution, quickstart + 3 ตัวอย่าง (ผู้ใช้ clone แล้ว render ได้) | ไม่ publish repository จนกว่าผู้ใช้สั่ง |
| **M5 (ทางเลือก) Designer หรือ shared-service hardening** | ตามที่ผู้ใช้เลือกหลัง M0–M3: block editor บน schema (ค/ข) **หรือ** D07/auth/tenant (ก่อนเปิด shared) | ประเมิน effort ใหม่จากผล M0–M3; D07 ผ่านใน isolated environment ก่อน shared; ผู้ใช้ธุรกิจจริง validate editor | ตัดสินใจแยก ไม่รวมใน MVP |

## 6. Explicit exclusions (v1)

ไม่อยู่ใน MVP และไม่เป็น `must` ในเอกสารนี้: Visual Designer (ยกเว้นผู้ใช้เลือก (ข)), SQL/REST connectors, async job/queue/idempotency/artifact store/signed URL, schedule/email/bursting/catalog, multi-tenant/RBAC/auth (ก่อน shared), PDF/A/PDF/UA, encryption, digital signature/timestamp, merge/stamp/bookmarks, **JRXML import/compat**, **XLSX/DOCX export**, **BI/dashboard/ad hoc**, dynamic chart, QR/barcode, **page subtotal**, plugin framework — ตรงกับ [plan §3](../../../tasks/plan.md) และ [keyword §3 P2](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md)

## 7. Trace P0 ไป use case และหลักฐาน (สรุป)

รายละเอียดเต็มอยู่ใน [feature-traceability §4](feature-traceability.md) — ทุก P0 ผูก use case (A/B/C) และ documented evidence หรือ runtime gap; **ไม่มี P0 ใดที่เอกสารนี้อ้างว่าผ่าน/feasible** P0 ที่เป็น runtime gap: D01–D03, D04 (การแสดงใน PDF), D05, D06, D07 (ก่อน shared), D08 (เมื่อยืนยัน workload)

## 8. Decisions ที่ผู้ใช้ต้องเลือก (ผมไม่เลือกแทน)

| # | Decision | ตัวเลือก | Recommendation (conditional) | Blast radius / Reversal |
| --- | --- | --- | --- | --- |
| D-1 | **Persona หลัก** | developer / business author / ทั้งสองเป็นระยะ | ถ้า developer → (ก)/(ค); ถ้า business → (ข) gate ด้วย M0; ถ้ายังไม่ชัด → (ค) | สูง: กำหนดว่ามี Designer (R14) หรือไม่ — เปลี่ยนภายหลังแพง แต่ (ค) ลดต้นทุนเปลี่ยน |
| D-2 | **รูปแบบแจกจ่าย** | library + CLI, library + thin HTTP server, shared server | ถ้า single-user/ระบบในองค์กร → library + thin server (localhost) ; shared → เพิ่ม D07/auth ก่อน | กลาง–สูง: ผูก auth/jobs/ops; ถอยจาก server เป็น library ง่ายถ้า core แยกจาก HTTP |
| D-3 | **License โครงการ** | MIT / Apache-2.0 / AGPL-3.0 / อื่นที่ OSI รับรอง ([05](05-license-inventory.md)) | ไม่เสนอ — ตัดสินก่อนรับ contribution (เปลี่ยนภายหลังเมื่อมีผู้ร่วมต้องจัดการสิทธิ์) | สูง/ย้อนยาก |
| D-4 | **Runtime environment สำหรับ spike** | E1 CI container / E2 เครื่องอื่น / E3 / E4 เลื่อน | ถ้ายอมให้ fixture สังเคราะห์ออกนอกเครื่องและมี repo/CI → E1; ถ้ามีเครื่องอื่น → E2; E4 ได้แต่ทุกข้อเสนอเป็นแบบมีเงื่อนไขและวงพัฒนารายวันทำไม่ได้ | ไม่ทำ = R04/R05/R12 ไม่ปิด ก่อนลงทุน |
| D-5 | **Overflow policy** (แถวสูงเกินหน้า) | reject / split / truncate+สัญญาณ | ตัดสินหลัง SP-C ใน M0 | กระทบ M2 และ data contract |
| D-6 | **Empty-detail / no-data policy** (PO02, D02-EMPTY) | อนุญาตเอกสารว่าง / error / ข้ามกลุ่ม | ตัดสินก่อน M2 | กระทบ validator |
| D-7 | **ฟอนต์ไทย** | Sarabun / Noto Sans Thai / อื่น | Sarabun เป็นตัวตั้ง Noto เป็นตัวสำรอง ตามที่ผู้ใช้ตั้งต้น; pin binary+hash ใน M0/M1 | เปลี่ยนฟอนต์เปลี่ยน page count ([09](09-thai-fonts.md)) |
| D-8 | **Rounding และ calendar default** | HALF_UP/2 ตำแหน่ง (assumption) vs นโยบายธุรกิจ; พ.ศ./ค.ศ. | ธุรกิจยืนยัน — ตอนนี้เป็น assumption | กระทบยอดเงิน |
| D-9 | **Trust model ของ template author** | trusted-only / untrusted ภายนอก | ถ้า trusted-only → v1 ได้; untrusted → ต้อง sandbox + SEC04 ก่อน | untrusted ย้ายเป็นงานใหญ่ |
| D-10 | **Provenance ขั้นต่ำ** | hash ใน response/metadata / ตารางประวัติ / later | เสนอ minimal: template id/version/hash + digest + font hash | ต่ำ |
| D-11 | **ขอบเขตที่เหลือ** | workload/async, connector, PDF profile, signature, distribution | รอข้อมูลผู้ใช้; ตั้งเป็น `later`/`out` ในตอนนี้ | แต่ละข้อเป็น milestone แยก |

## 9. ความไม่แน่นอนที่ควรรู้ก่อนอ่านตัวเลข effort

1. ไม่มีโค้ดหรือการวัดใด ๆ ในโครงการ — ช่วงตัวเลขมาจากวิจารณญาณเชิงขนาดงาน (compiler, validator, formatters, error mapping, OSS docs) ไม่ใช่ข้อมูลเชิงประจักษ์
2. ปัจจัยที่เปลี่ยนช่วงมากที่สุดคือผล M0: หัวตารางซ้ำและ Thai header/footer
3. ตัวเลข (ข) กว้างที่สุดเพราะ [14](14-designer-options.md) บอกว่า usability/a11y/undo ทุก action/round-trip ยังไม่ทดสอบ
4. effort ไม่รวมงานเรียนรู้ Gotenberg ถ้าผู้ใช้ไม่เคยใช้ และไม่รวมงานกฎหมาย/license review

## 10. ผลตรวจที่ทำก่อนส่งมอบ

13 พ.ย. 2026 ตรวจแบบเบา (observed-static ขอบเขตแคบ ไม่เกี่ยวกับ runtime):

- สคริปต์ `python -I` (stdlib `re`/`os`) resolve relative link ทุกอันในไฟล์นี้และ [feature-traceability.md](feature-traceability.md) จาก `docs/research/findings/`: ตรวจ 224 ลิงก์ ไม่พบลิงก์เสีย (ไม่ได้ตรวจ anchor `#`/ลิงก์ http)
- grep แถว `must` ใน traceability ไม่พบ JRXML/XLSX/DOCX/BI/dashboard/chart/QR/barcode
- grep ตัวเลข capacity (1.67/20.83/41.67%) พบเฉพาะที่ระบุเป็นสมมติฐาน (§2 และ R21)
- grep "feasible/ผ่านแล้ว" พบเฉพาะประโยคปฏิเสธการอ้างผ่าน
- ไม่ได้แก้ไฟล์อื่น (sources.md/todo.md/plan.md)

## 11. Source ที่ใช้

ใช้ S-IDs เดิมใน [sources.md](../sources.md) เท่านั้น (เช่น S58 issue #392, S41/S50 template security, S68/S39 editor license, S81 keyboard) — **ไม่มีแถว source ใหม่**
