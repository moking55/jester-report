# Feature Traceability — Capability × Use case × Evidence × R01–R25

วันที่: 13 พฤศจิกายน 2026  
สถานะ: **ตารางสังเคราะห์จาก desk research (T29)** ไม่ใช่ผลทดสอบและไม่ใช่ requirements ที่ผู้ใช้อนุมัติ; runtime ทุกข้อ = **deferred/not-tested**  
คู่กับ: [29-mvp-roadmap.md](29-mvp-roadmap.md) (แนวทาง MVP, milestones, decisions) · [protocol](../validation/protocol.md) (นิยาม class หลักฐาน) · [case catalog](../validation/case-catalog.md) · [deferred runtime](../validation/deferred-runtime.md) · [sources](../sources.md)

> ไม่มีไฟล์ finding สำหรับ T06 ใน `findings/` (T06 อยู่ที่ `validation/protocol.md`, `case-catalog.md`, `deferred-runtime.md`)

## 1. วิธีอ่าน

**Class (คอลัมน์ "Class")** — ใช้ **แนวทาง (ก) developer-first** เป็นฐาน เพราะเป็น candidate ที่ผู้ใช้ brainstorm ล่าสุด; คอลัมน์ "ต่างใน (ข)" ระบุเฉพาะแถวที่ business-author-first เปลี่ยน class ดู [29 §4](29-mvp-roadmap.md)

| Class | ความหมายในเอกสารนี้ |
| --- | --- |
| **must** | อยู่ใน MVP candidate; ถ้ามีเครื่องหมาย **(เงื่อนไข)** = ต้องผ่าน M0 spike ก่อนจึงจะยืนยันว่าอยู่ใน scope ได้จริง ไม่ได้แปลว่า feasible แล้ว |
| **later** | ศึกษา/ออกแบบ contract ไว้แล้ว แต่ไม่ทำใน MVP รอบแรก |
| **out** | อยู่นอก MVP; ไม่มี requirement/หลักฐานว่าจำเป็น (ตรงกับ plan §3 "อยู่นอกขอบเขต") |
| **unknown** | ข้อมูลไม่พอหรือรอผู้ใช้ตัดสิน; ระบุผลต่อ MVP |

**Use case** — T01 [A ใบเสนอราคา / B grouped sales / C master-detail PO](01-product-brief.md); `—` = ไม่ผูก use case ใดโดยตรง (ความสามารถเชิงระบบ)

**Evidence** — `doc` = documented, `inf` = inferred, `unk` = unknown, `static` = ตรวจ arithmetic/schema แบบเบา (observed-static); **RT** = runtime status; **ไม่มีแถวใดมี observed-runtime** (ไม่เคย render/ทดสอบ Gotenberg) ตาม [protocol §1](../validation/protocol.md)

**Priority (P0/P1/P2)** ที่อ้างมาจาก [keyword map §3](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md) และ [case catalog](../validation/case-catalog.md); ค่าที่ T28 "เสนอ" ติดป้าย (เสนอ)

## 2. Capability matrix

| ID | Capability | Class | ต่างใน (ข) | Use case | Evidence (ลิงก์ · class · RT) | Dependencies | หมายเหตุ / ผลต่อ MVP |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | Template + sample data: สร้าง/บันทึก/เปิดซ้ำ | must | — | A B C | [15](15-authoring-lifecycle.md) inf · [13](13-template-options.md) inf; RT n/a (ยังไม่มี implementation) | C21 | keyword §3 = P0; รูปแบบไฟล์ definition ยัง **ไม่เลือก** (R03) |
| C02 | Data binding: field / nested list / parameters + ตรวจชนิดและ error พร้อมตำแหน่ง | must | — | A B C | [16](16-data-contract.md) inf · static (schema 11 cases ตาม §Verification ของ 16) · [specimen](../../../research/specimens/report-input.schema.json); RT n/a | C20, C40 | JSON Schema ตรวจ invariant บางข้อไม่ได้ (duplicate ID, orphan, ช่วงวันที่) → ต้องมี semantic validator แยก |
| C03 | Text/table/image/line + format ตัวเลข/วันที่ | must | — | A B C | [13](13-template-options.md) inf · [09](09-thai-fonts.md) inf (L01–L04 เสนอ); RT deferred | C14 | formatter ต้องอยู่ที่ชั้นแอป ไม่พึ่ง default ของเครื่อง |
| C04 | A4 portrait/landscape + margins (ต่อ render ไม่ใช่ต่อหน้า) | must | — | A B | [07](07-gotenberg-contract.md) doc (`paperSize`, `landscape`, `margin*`, `preferCssPageSize`) · [08](08-pagination.md) doc; RT deferred (D02-PAPER) | — | `@page` อาจขัดกับ field `landscape` ต้องกำหนด source of truth (08) |
| C05 | เลข/จำนวนหน้า (`pageNumber`/`totalPages`) | must **(เงื่อนไข)** | — | A B C | [07](07-gotenberg-contract.md) doc · [08](08-pagination.md) doc; RT deferred (D01, D05-HEADER) | C07 | documented ว่ามี class; ผลกับ Thai font ใน footer = unknown |
| C06 | หัวตารางซ้ำทุกหน้า | must **(เงื่อนไข)** | — | B C | [08](08-pagination.md) inf/unk · issue [S58](../sources.md) (Gotenberg 7, ไม่ reproduce) · [28 §1.1](28-quality-strategy.md) D02-HEADER-REPEAT P0 (เสนอ); RT deferred | M0 spike (SP-B) | **ยังไม่พิสูจน์**; fallback = chunk แถวที่ชั้นแอป (กระทบ effort สูง) |
| C07 | Page header/footer band (แยก context จาก body) | must **(เงื่อนไข)** | — | A B C | [07](07-gotenberg-contract.md) doc · [09 §3](09-thai-fonts.md) unk · [28](28-quality-strategy.md) D05-HEADER P0; RT deferred | C13, C15 | inline `<style>` + data URI เท่านั้น; ฟอนต์ไทยใน header/footer = **unknown**; fallback = ย้ายข้อมูลสำคัญออกจาก header/footer |
| C08 | Title / detail / summary band | must | — | A B C | [13](13-template-options.md) inf (hybrid schema) · [R05 ใน keyword map](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md) · [02 §3](02-engine-baseline.md); RT deferred | C02, C09 | CSS flow ≠ band engine (keyword R05); band ถูกจำลองด้วย compiler/HTML — เป็นงานของเรา |
| C09 | Group header/footer, group subtotal, count, grand total | must | — | B C | [10](10-grouping-totals.md) doc(Jasper semantics)+inf · static (grouped 6/6, [specimen](../../../research/specimens/grouped-cases.json)); PDF RT deferred (D04) | C02, C40 | คำนวณที่แอปด้วย Decimal ก่อน render; rounding HALF_UP/2 ตำแหน่งเป็น **assumption** รอธุรกิจยืนยัน |
| C10 | Page subtotal / running total ต่อหน้า | **out** (v1) | — | B | [08](08-pagination.md) · [10](10-grouping-totals.md) · [28](28-quality-strategy.md) D04-SCOPE; RT deferred | ต้องรู้ตำแหน่งหน้าจริงหลัง layout | ไม่มีกลไกที่มีหลักฐาน → unk; ห้ามประมาณจากจำนวนแถว |
| C11 | Master-detail 1 ระดับ | must (ผู้ใช้ยกจาก P1) | — | C | [11](11-master-detail.md) doc(Jasper)+inf · static (6/6, [specimen](../../../research/specimens/master-detail-cases.json)); RT deferred (D03, D04-PARENT) | C02, C09, C40 | keyword §3 = P1 → ยกเป็น must โดยเจตนา (use case C); ติด policy decision-open 2 ข้อ (D03 overflow, PO02 empty) |
| C12 | Reusable component/partial พร้อม pin `(id, version)` | later | — | C | [11](11-master-detail.md) inf · [13](13-template-options.md) inf · [15](15-authoring-lifecycle.md) inf; RT n/a | C21 | v1 ใช้ header inline ได้; สงวน contract `(id, version)` ไว้ในรูปแบบ definition |
| C13 | ฟอนต์ไทยใน body (Sarabun candidate; Noto Sans Thai สำรอง) | must **(เงื่อนไข)** | — | A B C | [09](09-thai-fonts.md) doc(metadata)/unk(binary, glyph, shaping) · [05](05-license-inventory.md) OFL metadata-reviewed; RT deferred (D05*) | font artifact+hash | binary/hash ยังไม่ pin; OFL ไม่ใช่ legal approval |
| C14 | Formatter พ.ศ./ค.ศ., timezone, สกุลเงิน (ชั้นแอป) | must | — | A B | [09](09-thai-fonts.md) inf (L01–L04) · [16](16-data-contract.md) inf; RT deferred | calendar/rounding policy (decision) | ICU/Intl drift เป็น nondeterminism ([28 §2.2](28-quality-strategy.md)) |
| C15 | Local assets (โลโก้/ภาพ/ฟอนต์) + mandatory/optional + `failOn*` ทั้งสอง | must | — | A C | [07](07-gotenberg-contract.md) doc · [12](12-visual-assets.md) doc/inf · [28](28-quality-strategy.md) D06 P0; RT deferred | C07 | HTTP 200 ไม่ยืนยันว่า asset ครบ; `failOnResourceLoadingFailed` ไม่ครอบ timeout/cert |
| C16 | Dynamic chart | **out** (v1) | later | — | [12](12-visual-assets.md) doc/inf · D06-SLOW-CHART P1 (เสนอ); RT deferred | readiness contract, JS policy | ไม่มี use case T01 ต้องใช้ |
| C17 | QR / Code 128 | **out** (v1) | later | — | [12](12-visual-assets.md) doc/inf · D06-QR P1 (เสนอ); RT deferred | — | ไม่มี use case T01 ต้องใช้; ไม่เลือก library |
| C18 | Preview จาก PDF pipeline เดียวกับ final + download | must **(เงื่อนไข: environment)** | — | A B C | [15](15-authoring-lifecycle.md) inf · [28 §3.3](28-quality-strategy.md) E1–E4; RT deferred | Gotenberg ที่เข้าถึงได้ (**ยังไม่มี**) | HTML preview ในเบราว์เซอร์ = non-authoritative (15) |
| C19 | CLI render + watch-preview | must (เงื่อนไข) | — | A B C | [15](15-authoring-lifecycle.md) inf; RT n/a | C18, C20 | วงพัฒนารายวันขึ้นกับ environment (ผู้ใช้ไม่รัน Docker) |
| C20 | `POST /render` เดียว (sync) + error taxonomy | must | — | A B C | [18](18-api-contract.md) inf · static (OpenAPI parse; **ไม่ใช่** full validator) · [07](07-gotenberg-contract.md) doc (HTTP map) · [specimen](../../../research/specimens/report-api.openapi.yaml); RT n/a | C02, C21, C22 | ใช้ code เฉพาะ sync: `INPUT_INVALID`, `TEMPLATE_NOT_FOUND`, `RENDER_RESOURCE_FAILED`, `RENDER_FAILED`, `SERVICE_UNAVAILABLE`, `RENDER_TIMEOUT`; ไม่ใช้ `ARTIFACT_NOT_READY`/`IDEMPOTENCY_CONFLICT` |
| C21 | Template version + provenance ขั้นต่ำ (template id/version/hash, renderer digest, font hash) | must (basic) | + publish/rollback | A B C | [15](15-authoring-lifecycle.md) inf · [24](24-deployment-operations.md) inf; RT n/a | font/asset pin | keyword §3 = P0 แบบพื้นฐาน; ผู้ใช้ไม่ได้ระบุใน candidate — **เติมให้** (อาจลดเหลือ hash ใน response header ก็ได้) |
| C22 | Limits / timeout / quotas ฝั่งแอปและ Gotenberg | must | — | — | [04](04-threat-model.md) doc/inf · [22](22-security-review.md) SEC07 · [23](23-performance-scenarios.md) doc limits; ค่าตัวเลข **ไม่มี measured**; RT deferred | workload (decision) | keyword §3 = P0; ห้ามตั้งค่าจาก capacity assumptions เป็น requirement |
| C23 | Template trust model + contextual escaping (URL/CSS) | must | เพิ่ม: sandbox ถ้ามี untrusted author | — | [04](04-threat-model.md) doc/inf · [13](13-template-options.md) · [22](22-security-review.md) SEC04 P0 ก่อน untrusted template (เสนอ); RT deferred | template engine (ยังไม่เลือก) | logic-less ≠ sandbox; v1 ประกาศ **trusted-author เท่านั้น** |
| C24 | Deployment boundary: localhost/private network, ไม่เปิด shared service | must (เป็นข้อจำกัด) | — | — | [04](04-threat-model.md) · [24](24-deployment-operations.md) · [28](28-quality-strategy.md) D07 P0 ก่อน shared; RT deferred | — | Gotenberg ไม่บังคับ auth by default (doc); ก่อน shared ต้องผ่าน D07 |
| C25 | AuthN/Z, object-level, tenant isolation, audit | **out** (v1) → must ก่อน shared | — | — | [20](20-access-data-lifecycle.md) inf (tabletop) · D07-AUTH P0 ก่อน shared; RT deferred | persona/deployment decision | multi-tenant ยัง unknown |
| C26 | Visual Designer (block/canvas) + undo/redo + a11y | **out** (v1) (ผู้ใช้ตัดออก) → decision | **must** ถ้าเลือก persona ธุรกิจ | A B C | [14](14-designer-options.md) doc/inf · [15](15-authoring-lifecycle.md) · [13](13-template-options.md); RT n/a; effort **ไม่วัด** | C01, C18, license GrapesJS/pdfme | **ห้ามเลือกแทนผู้ใช้** (R14); ต้อง gate หลัง M0 |
| C27 | Async job / durable queue / retry / cancel / callback | **out** (v1) → later | — | — | [19](19-job-processing.md) inf (tabletop 11 scenarios) · [specimen](../../../research/specimens/job-scenarios.json) · D08 P0 เมื่อยืนยัน workload; RT deferred | workload, storage | sync-only ไม่ต้องมี durable job (19) |
| C28 | Idempotency-Key + artifact store + signed URL | **out** (v1) → later | — | — | [18](18-api-contract.md) inf · [20](20-access-data-lifecycle.md) inf | C27 | sync คืน PDF ตรง ไม่เก็บ artifact |
| C29 | Schedule / email / bursting / report catalog | **out** | — | — | [21](21-distribution-options.md) inf; RT n/a | C25, C27 | P2 (keyword R18) |
| C30 | Data connector: SQL / REST (server ดึงข้อมูลเอง) | **out** (v1) → unknown | อาจ must ถ้า author ธุรกิจต้องดึงเอง | B | [17](17-data-source-options.md) doc/inf; RT n/a | credentials/secret store, C25 | JSON-first เป็นข้อเสนอ ไม่ใช่ requirement ที่ยืนยัน (R09) |
| C31 | PDF/A, PDF/UA, tagged PDF | **out** (v1) | — | — | [25](25-pdf-capabilities.md) doc · [26](26-pdf-profile-validation.md) inf · A01/A02 P1 (เสนอ); RT deferred | use case ยืนยันก่อน | API มี ≠ รายงานเราผ่าน; ไม่ประกาศ conformance |
| C32 | Digital signature (crypto), timestamp, encryption | **out** (v1) | — | C (placeholder เท่านั้น) | [25](25-pdf-capabilities.md) doc · [27](27-signature-lifecycle.md) doc/inf/unk · A03 P2 (เสนอ); RT deferred | key custody, CA/TSA (decision) | **ช่องลายเซ็นบนหน้า (placeholder) เป็น layout ธรรมดา ไม่ใช่ crypto**; กฎหมายไทย = unknown |
| C33 | Merge/select/split, stamp/watermark, bookmarks, metadata (post-process) | **out** (v1) → later | — | — | [25](25-pdf-capabilities.md) doc (version/stage ย่อยบางส่วน unk) · A05–A07; RT deferred | C18 | ไม่มี use case T01 |
| C34 | JRXML import/compat, Jasper expressions | **out** | — | — | [03](03-product-comparison.md) doc · [keyword §5](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md); RT n/a | — | plan §3 งานแยก; ไม่ถือโดยอัตโนมัติ |
| C35 | Export XLSX/DOCX/อื่น ๆ | **out** | — | — | [plan §3](../../../tasks/plan.md) · [03](03-product-comparison.md) | — | งานแยก |
| C36 | BI / dashboard / ad hoc / data warehouse | **out** | — | — | [plan §3](../../../tasks/plan.md) · [03 §5](03-product-comparison.md) | — | ไม่ใช่ product scope |
| C37 | Plugin framework / extension API | **out** (v1) → later | — | — | [24 §Extensions](24-deployment-operations.md) inf | use case จริง | "ไม่จำเป็นต้องสร้างใน MVP โดยไม่มี use case" (24) |
| C38 | Regression/validation harness L0–L3 (ID/ยอด/ข้อความ) | must (เมื่อมี runtime) | — | A B C | [28 §2](28-quality-strategy.md) inf · [protocol](../validation/protocol.md); L0 static ทำได้แล้วบางส่วน (§1.9 ของ 28); L1–L4 RT deferred | M0 baseline | byte-hash ไม่ใช่เกณฑ์หลัก (A04) |
| C39 | No-data/empty-dataset state + validation errors ก่อน render | must | — | B C | [10](10-grouping-totals.md) static · [11](11-master-detail.md) static · D02-EMPTY P0; PDF RT deferred | policy decision (PO02 empty) | ป้องกันยอด/ตารางผิดเงียบ |
| C40 | Quickstart + ตัวอย่างรายงาน 3 แบบ (A/B/C) | must ก่อน publish | — | A B C | [keyword R25](../REPORT_SYSTEM_RESEARCH_KEYWORDS.md) · [24](24-deployment-operations.md); RT n/a | C18 | ไม่ใช่ "ก่อนเริ่ม M1" |
| C41 | OSS readiness: LICENSE (ผู้ใช้เลือก), notices, font OFL, README แยก supported/not-tested, SECURITY.md, DCO/CLA | must ก่อน publish | — | — | [05](05-license-inventory.md) doc/inf; ยังไม่เลือก license | **decision: license** | ไม่เพิ่ม LICENSE ในงานนี้ |
| C42 | Self-host ops: backup/restore, offline fonts/assets, observability | later | — | — | [24](24-deployment-operations.md) inf (ไม่เคย restore จริง) | C21 | ขึ้นกับ deployment ที่เลือก |

## 3. Coverage R01–R25 (ชี้ไปที่ finding จริง)

"Desk coverage" = มี finding ตอบคำถามระดับเอกสารแล้ว ไม่ใช่ตอบครบหรือพิสูจน์แล้ว (ตาม [plan §9](../../../tasks/plan.md)); คอลัมน์ Gap ระบุชนิด: **G-RT** = รอ runtime, **G-DEC** = รอผู้ใช้ตัดสิน, **G-EVID** = หลักฐานเอกสารยังไม่พอ

| R | หัวข้อ | Findings | Capability ที่เกี่ยว | Evidence class | Gap (ยังเป็น gap?) |
| --- | --- | --- | --- | --- | --- |
| R01 | ผู้ใช้และงานรายงาน | [01](01-product-brief.md) | ทั้งหมด (use case A/B/C) | inf (สมมติฐาน persona) | **G-DEC**: persona หลักยังไม่เลือก; ไม่มีเอกสารจริงจากผู้ใช้ (ใช้ข้อมูลสังเคราะห์) |
| R02 | Benchmark Jasper และใกล้เคียง | [03](03-product-comparison.md), [05](05-license-inventory.md), [14](14-designer-options.md) | C08, C09, C11, C26 | doc | G-EVID เล็กน้อย: เทียบจากเอกสาร ไม่ได้ติดตั้ง/ทดสอบผลิตภัณฑ์ใด; docs rolling/unpinned |
| R03 | Template/Report definition | [13](13-template-options.md) | C01, C08, C23 | inf | **G-DEC + G-RT**: ยังไม่มี canonical format; round-trip/ความสามารถ hybrid ไม่ถูกทดลอง |
| R04 | Pagination / print layout | [07](07-gotenberg-contract.md), [08](08-pagination.md) | C04–C07, C10 | doc/spec + issue unreproduced | **G-RT (P0)**: หัวตารางซ้ำ, oversized row, header/footer — D02, D03, D05-HEADER |
| R05 | Report bands | [08](08-pagination.md), [10](10-grouping-totals.md), [13](13-template-options.md) | C06–C09 | inf | **G-RT**: band semantics จำลองด้วย HTML/CSS ยังไม่ทดลอง; page subtotal = unk |
| R06 | Data binding / dataset contract | [16](16-data-contract.md) | C02, C39 | inf + static | G-DEC เล็กน้อย: canonical field naming/`reportType`; semantic validator ยังไม่มี |
| R07 | Parameters | [16](16-data-contract.md) | C02, C14 | inf + static | **G-DEC**: ใครกรองข้อมูล (caller vs service), timezone/calendar default |
| R08 | Expressions / grouping / totals | [10](10-grouping-totals.md), [11](11-master-detail.md) | C09, C10, C11 | doc(Jasper)+static | **G-DEC**: rounding policy; **G-RT**: การแสดงใน PDF; page subtotal = unk |
| R09 | Data sources | [17](17-data-source-options.md) | C30 | doc/inf | **G-DEC**: connector/snapshot ownership ยังไม่เลือก |
| R10 | Reusable components / master-detail | [11](11-master-detail.md) | C11, C12 | doc(Jasper)+static | **G-RT**: long-detail ข้ามหน้า; **G-DEC**: PO02 empty, nesting depth/cycle |
| R11 | Charts/images/QR/barcode | [12](12-visual-assets.md) | C15–C17 | doc/inf | **G-RT** (D06*); G-DEC: chart/QR อยู่ใน MVP หรือไม่ (ก = out) |
| R12 | ไทย / localization / fonts | [09](09-thai-fonts.md) | C07, C13, C14 | doc(metadata)/spec + unk | **G-RT (P0)**: วรรณยุกต์, ตัดคำ, header/footer font, copy/search, fallback; binary/hash ยังไม่ pin |
| R13 | Gotenberg integration / version contract | [02](02-engine-baseline.md), [07](07-gotenberg-contract.md) | C04, C05, C15, C20 | doc (9.x rolling; v9.4.1 reference) | **G-RT**: actual image digest/Chromium/fonts = unknown; docs drift (S07 vs S24) |
| R14 | Designer / authoring experience | [14](14-designer-options.md), [15](15-authoring-lifecycle.md) | C26 | doc/inf | **G-DEC (สำคัญ)**: ยังไม่เลือก Designer; effort ไม่วัด; usability/a11y ไม่ทดสอบ |
| R15 | Template lifecycle / ทำซ้ำเอกสาร | [15](15-authoring-lifecycle.md), [24](24-deployment-operations.md) | C21, C42 | inf | **G-DEC**: เก็บ PDF vs re-render, retention/PII |
| R16 | Public API / DX | [18](18-api-contract.md) | C20, C28 | inf + static (parse) | G-EVID: ไม่ผ่าน full OpenAPI validator; endpoints ไม่ใช่ public contract |
| R17 | Jobs / retry / batch | [19](19-job-processing.md) | C27 | inf (tabletop) | **G-DEC**: workload ยังไม่ยืนยัน → P0 หรือ P1 ไม่ตัดสินใจได้; D08 deferred |
| R18 | Catalog / schedule / distribution | [21](21-distribution-options.md) | C29 | inf | **G-DEC**: ต้องการหรือไม่ (ก = out) |
| R19 | Template/renderer security | [04](04-threat-model.md), [22](22-security-review.md) | C23, C24 | doc/inf (tabletop) | **G-RT (P0 ก่อน shared/untrusted)**: SEC01–SEC08 ไม่เคย probe; template engine ยังไม่เลือก |
| R20 | สิทธิ์ / tenant / PII | [04](04-threat-model.md), [20](20-access-data-lifecycle.md) | C25 | inf (tabletop) | **G-DEC + G-RT**: multi-tenant, retention, compliance; D07-AUTH deferred |
| R21 | Performance / deployment / observability | [23](23-performance-scenarios.md), [24](24-deployment-operations.md) | C22, C42 | doc (limits) + **capacity = assumptions ไม่ใช่ measured** | **G-RT**: ไม่มี throughput/latency/RAM วัดจริง; ไม่ใช้ 1.67/20.83/41.67% เป็นเกณฑ์ |
| R22 | คุณภาพ PDF / regression | [28](28-quality-strategy.md), [protocol](../validation/protocol.md), [case-catalog](../validation/case-catalog.md) | C38 | inf (strategy) + static (arithmetic) | **G-RT (P0)**: ไม่มี baseline/PDF; tolerance ภาพกำหนดไม่ได้ก่อนเก็บ baseline |
| R23 | PDF ขั้นสูง | [25](25-pdf-capabilities.md), [26](26-pdf-profile-validation.md), [27](27-signature-lifecycle.md) | C31–C33 | doc (API) + inf; กฎหมายไทย = unk | **G-DEC + G-RT**: ต้องการ profile ใดหรือไม่; PAdES level/OCSP/HSM unk |
| R24 | OSS license / governance | [05](05-license-inventory.md) | C41 | doc (metadata-reviewed) | **G-DEC**: license โครงการ; transitive notices/image BOM/font binary hash ยังไม่ตรวจ |
| R25 | Self-hosting / packaging / extension | [24](24-deployment-operations.md) | C37, C40, C42 | inf | **G-EVID + G-RT**: quickstart ไม่เคยพิสูจน์, offline/restore ไม่ทดสอบ, ไม่มี finding เฉพาะเรื่อง quickstart/ตัวอย่าง |

### R ที่ยังเป็น gap — สรุป

- **G-RT ที่เป็น P0 และกำหนดทิศทาง MVP:** R04, R05, R12, R22 (และส่วนที่ R13, R10, R08, R11) — ทั้งหมดอยู่ใน M0 spike ([28 §3.1](28-quality-strategy.md))
- **G-DEC ที่เปลี่ยนรูป MVP:** R01 (persona), R03 (format), R14 (Designer), R09 (connector), R17/R18/R20/R23 (ขอบเขต), R24 (license)
- **G-EVID:** R16 (full OpenAPI validation), R25 (quickstart/extension แทบไม่มีหลักฐาน), R02 (docs rolling/unpinned)
- ไม่มี R ใดที่ "ปิดแล้วด้วย runtime" — **ไม่มี R ใดมีหลักฐานระดับ observed-runtime**

## 4. P0 trace: P0 → use case → evidence หรือ runtime gap

| P0 (keyword §3 / catalog) | Use case | Documented evidence | สิ่งที่ต้องพิสูจน์ (gap) | Case |
| --- | --- | --- | --- | --- |
| Pagination, หัวตารางซ้ำ, page number | B, C (A: เลขหน้า) | [08](08-pagination.md), [07](07-gotenberg-contract.md) | หัวตารางซ้ำไม่ทับ; footer ไม่ทับ; 0/1/50/500 แถว portrait/landscape | D02*, D01 |
| Oversized row | B, C | [08](08-pagination.md) (CSS ผ่อน `break-inside`) | ไม่มีข้อความหาย; policy overflow (decision-open) | D03* |
| ภาษาไทย + fonts | A B C | [09](09-thai-fonts.md) | วรรณยุกต์ครบ, copy/search, header/footer font, fallback | D05* |
| Grouping/subtotal/grand total | B, C | [10](10-grouping-totals.md), [11](11-master-detail.md) | static arithmetic ตรงแล้วเฉพาะ fixture; PDF ยอดไม่ตรวจ | D01-NUM, D04* |
| Preview ใช้ pipeline เดียวกับ final | A B C | [15](15-authoring-lifecycle.md) | ต้องมี environment ที่ run Gotenberg ได้ | — (env E1–E4) |
| API + validation + error | A B C | [18](18-api-contract.md), [16](16-data-contract.md) | semantic validator ยังไม่มี; mapping เป็นข้อเสนอระดับแอป | — |
| Limits/timeout/ไม่โหลด URL อำเภอใจ | — | [04](04-threat-model.md), [22](22-security-review.md) | ค่า limit ยังไม่มีการวัด; egress ไม่ทดสอบ | D07*, SEC01–08 |
| Assets ครบ/ไม่ปล่อยเงียบ | A C | [07](07-gotenberg-contract.md), [12](12-visual-assets.md) | `failOn*` ครอบแค่บางสาเหตุ | D06* |
| Template version/provenance | A B C | [15](15-authoring-lifecycle.md) | ออกแบบ metadata ใน M1 | — |
| Authn/authz (เมื่อ shared) | — | [20](20-access-data-lifecycle.md) | v1 ไม่ใช่ shared → ไม่อยู่ใน MVP; ก่อน shared ต้องผ่าน D07 | D07-AUTH |

ทุกแถว: **ยังไม่ได้พิสูจน์ว่า feasible** — "documented" แปลว่าเอกสารเจ้าของระบุความสามารถ ไม่ใช่ว่า output ของโครงการทำได้

## 5. การตรวจ traceability (ที่ทำจริง)

ดูหัวข้อ "ผลตรวจ" ใน [29 §10](29-mvp-roadmap.md) — ตรวจ relative links ด้วย script `python -I` stdlib; grep ว่าแถว `must` ไม่มี JRXML/XLSX/DOCX/BI/chart/QR; grep ว่าไม่มีตัวเลข capacity assumption ถูกใช้เป็น measured
