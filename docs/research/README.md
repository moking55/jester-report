# Research Index — ระบบออก Report PDF สำหรับธุรกิจ

วันที่: 13 พฤศจิกายน 2026  
สถานะ: **desk research เท่านั้น** — ไม่มี local/remote runtime test, ไม่มี measured benchmark  
ดัชนีนี้ลิงก์เฉพาะไฟล์ที่มีอยู่จริงใน `docs/research/` และ `research/specimens/` (ตรวจด้วย `ls` ก่อนเขียน)

> **Desk research complete ไม่เท่ากับ Runtime validated และไม่เท่ากับ Implementation ready**

## เริ่มอ่านที่นี่

| ไฟล์ | เนื้อหา |
| --- | --- |
| [REPORT_SYSTEM_FULL_RESEARCH.md](REPORT_SYSTEM_FULL_RESEARCH.md) | รายงานเต็ม T30: สรุปผู้บริหาร, documented/inferred/unknown, runtime gaps, MVP options, ความเสี่ยง, deferred-validation checklist, R01–R25 |
| [decisions/proposed-decisions.md](decisions/proposed-decisions.md) | Proposed decisions D-1..D-11 (ยังไม่ใช่ accepted ADR) |
| [findings/feature-traceability.md](findings/feature-traceability.md) | Capability × use case × evidence × R01–R25 |
| [findings/29-mvp-roadmap.md](findings/29-mvp-roadmap.md) | MVP options, milestones, decisions (T29) |
| [findings/28-quality-strategy.md](findings/28-quality-strategy.md) | Quality strategy และ runtime backlog (T28) |

## Planning และตั้งต้น

| ไฟล์ | เนื้อหา |
| --- | --- |
| [../../tasks/plan.md](../../tasks/plan.md) | แผน Research |
| [../../tasks/todo.md](../../tasks/todo.md) | Task list / checkpoints |
| [REPORT_SYSTEM_RESEARCH_KEYWORDS.md](REPORT_SYSTEM_RESEARCH_KEYWORDS.md) | Keyword map R01–R25 |
| [sources.md](sources.md) | Source register: S01–S94 และ S100–S103 (ไม่มี S95–S99; มีแถวซ้ำโดยตั้งใจ — ดู I-2 ในรายงานเต็ม) |

## Checkpoints

| ไฟล์ | ขอบเขต |
| --- | --- |
| [CHECKPOINTS_01_02.md](CHECKPOINTS_01_02.md) | T01–T06 |
| [CHECKPOINTS_03_04.md](CHECKPOINTS_03_04.md) | T07–T12 |
| [CHECKPOINTS_05_08.md](CHECKPOINTS_05_08.md) | T13–T24 |

ยังไม่มีไฟล์ checkpoint สำหรับ T25–T30 / C09–C10 ใน `docs/research/`

## Findings (`findings/`)

ไม่มี `findings/06-*` — T06 อยู่ใน `validation/` (ดูด้านล่าง)

| ไฟล์ | งาน |
| --- | --- |
| [01-product-brief.md](findings/01-product-brief.md) | T01 โจทย์ผลิตภัณฑ์ + รายงานอ้างอิง A/B/C |
| [02-engine-baseline.md](findings/02-engine-baseline.md) | T02 Engine/source baseline |
| [03-product-comparison.md](findings/03-product-comparison.md) | T03 เปรียบเทียบผลิตภัณฑ์ |
| [04-threat-model.md](findings/04-threat-model.md) | T04 Threat model |
| [05-license-inventory.md](findings/05-license-inventory.md) | T05 License inventory |
| [07-gotenberg-contract.md](findings/07-gotenberg-contract.md) | T07 Gotenberg HTML→PDF contract |
| [08-pagination.md](findings/08-pagination.md) | T08 Pagination/header/footer |
| [09-thai-fonts.md](findings/09-thai-fonts.md) | T09 ภาษาไทย/fonts |
| [10-grouping-totals.md](findings/10-grouping-totals.md) | T10 Grouping/ยอดรวม |
| [11-master-detail.md](findings/11-master-detail.md) | T11 Master-detail |
| [12-visual-assets.md](findings/12-visual-assets.md) | T12 Assets/chart/QR/barcode |
| [13-template-options.md](findings/13-template-options.md) | T13 Template options |
| [14-designer-options.md](findings/14-designer-options.md) | T14 Designer options |
| [15-authoring-lifecycle.md](findings/15-authoring-lifecycle.md) | T15 Authoring/lifecycle |
| [16-data-contract.md](findings/16-data-contract.md) | T16 Data contract |
| [17-data-source-options.md](findings/17-data-source-options.md) | T17 Data sources |
| [18-api-contract.md](findings/18-api-contract.md) | T18 API contract |
| [19-job-processing.md](findings/19-job-processing.md) | T19 Jobs |
| [20-access-data-lifecycle.md](findings/20-access-data-lifecycle.md) | T20 สิทธิ์/data lifecycle |
| [21-distribution-options.md](findings/21-distribution-options.md) | T21 Distribution |
| [22-security-review.md](findings/22-security-review.md) | T22 Security tabletop |
| [23-performance-scenarios.md](findings/23-performance-scenarios.md) | T23 Capacity scenarios (สมมติฐาน ไม่ใช่ benchmark) |
| [24-deployment-operations.md](findings/24-deployment-operations.md) | T24 Deployment/operations |
| [25-pdf-capabilities.md](findings/25-pdf-capabilities.md) | T25 PDF capabilities |
| [26-pdf-profile-validation.md](findings/26-pdf-profile-validation.md) | T26 PDF/A, PDF/UA validation design |
| [27-signature-lifecycle.md](findings/27-signature-lifecycle.md) | T27 Signature/key lifecycle |
| [28-quality-strategy.md](findings/28-quality-strategy.md) | T28 Quality strategy |
| [29-mvp-roadmap.md](findings/29-mvp-roadmap.md) | T29 MVP roadmap |

## Validation (`validation/`) — T06; ไม่ใช่ผลทดสอบ

| ไฟล์ | เนื้อหา |
| --- | --- |
| [protocol.md](validation/protocol.md) | วิธีวิจัยและ evidence classes |
| [case-catalog.md](validation/case-catalog.md) | Case catalog D01–D08, A01–A09 (ทุกกรณี deferred/not-tested) |
| [deferred-runtime.md](validation/deferred-runtime.md) | Runtime backlog ที่เลื่อน + ผลต่อ MVP |

## Specimens (`../../research/specimens/`) — ข้อมูลสังเคราะห์ ไม่ใช่ running application

| ไฟล์ | ใช้กับ |
| --- | --- |
| [grouped-cases.json](../../research/specimens/grouped-cases.json) | T10 grouping/totals |
| [master-detail-cases.json](../../research/specimens/master-detail-cases.json) | T11 master-detail |
| [template-options.json](../../research/specimens/template-options.json) | T13 |
| [designer-evaluation.json](../../research/specimens/designer-evaluation.json) | T14 |
| [report-input.schema.json](../../research/specimens/report-input.schema.json) | T16 JSON Schema |
| [report-input-cases.json](../../research/specimens/report-input-cases.json) | T16 cases |
| [report-api.openapi.yaml](../../research/specimens/report-api.openapi.yaml) | T18 (parse เท่านั้น ไม่ใช่ full OpenAPI validation) |
| [job-scenarios.json](../../research/specimens/job-scenarios.json) | T19 |
| [security-scenarios.json](../../research/specimens/security-scenarios.json) | T22 (`verified_runtime:false`) |
| [capacity-assumptions.json](../../research/specimens/capacity-assumptions.json) | T23 (สมมติฐาน ไม่ใช่ measured) |
| [signature-scenarios.json](../../research/specimens/signature-scenarios.json) | T27 SIG-01..SIG-10 (not-tested) |
