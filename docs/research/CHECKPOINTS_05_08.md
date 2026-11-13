# Checkpoints 05–08 — Desk Research Review

วันที่: 12 พฤศจิกายน 2026  
Verdict: **desk review-complete**; Engine/PDF/security/benchmark/deployment runtime **deferred/not-tested**

| งาน | ผลส่งมอบ | ขอบเขตหลัก |
| --- | --- | --- |
| T13 | [Template options](findings/13-template-options.md), [specimen](../../research/specimens/template-options.json) | HTML/schema/hybrid; round-trip และ runtime gaps |
| T14 | [Designer options](findings/14-designer-options.md), [evaluation](../../research/specimens/designer-evaluation.json) | GrapesJS/pdfme เทียบจากเอกสาร; ไม่เลือก dependency |
| T15 | [Authoring lifecycle](findings/15-authoring-lifecycle.md) | Draft/preview/publish/rollback และ immutable version |
| T16 | [Data contract](findings/16-data-contract.md), [schema](../../research/specimens/report-input.schema.json), [cases](../../research/specimens/report-input-cases.json) | Typed parameters, validation และ semantic gaps |
| T17 | [Data source options](findings/17-data-source-options.md) | JSON/REST/SQL, snapshot และ credentials; ไม่เลือก database |
| T18 | [API contract](findings/18-api-contract.md), [OpenAPI specimen](../../research/specimens/report-api.openapi.yaml) | Sync/async, errors, idempotency และ access; ยังไม่มี endpoints |
| T19 | [Jobs](findings/19-job-processing.md), [scenarios](../../research/specimens/job-scenarios.json) | States, retry, callback, cancellation และ recovery |
| T20 | [Access/data lifecycle](findings/20-access-data-lifecycle.md) | Object/tenant permissions, retention และ signed URL caveat |
| T21 | [Scheduling/distribution](findings/21-distribution-options.md) | Timezone, delivery retry และ recipient recheck; optional scope |
| T22 | [Security tabletop](findings/22-security-review.md), [scenarios](../../research/specimens/security-scenarios.json) | URL/template/callback/tenant risks; ไม่มี probes |
| T23 | [Capacity scenarios](findings/23-performance-scenarios.md), [assumptions](../../research/specimens/capacity-assumptions.json) | สูตรและ sensitivity จากสมมติฐาน ไม่ใช่ measured benchmark |
| T24 | [Deployment/operations](findings/24-deployment-operations.md) | Offline/health/backup/restore/upgrade options; ไม่ deploy |

## การประสานงาน

ผู้ใช้อนุญาต Codex subagents สำหรับ Checkpoints 5–8: `authoring` ดู T13–T15, `contracts` ดู T16–T18, `jobs_security` ดู T19–T21; parent ทำ T22–T24 และรวมผล ทั้งสามทีมแชร์ immutable version, preview, idempotency, job states และ authorization ก่อน finalize. `authoring` ตรวจ T22–T24 เพิ่มและ parent เพิ่ม alias/job provenance ใน backup/restore. ไม่มี Gemini/Antigravity, Docker, Render engine, Cloud provision หรือการส่งข้อความภายนอก

## ผลและข้อค้างสำคัญ

- ยังไม่เลือก canonical template format หรือ Designer; round-trip, Thai layout และ preview parity เป็น runtime gaps
- Published version และ assets ต้อง resolve เป็น snapshot ต่อ job; rollback alias ไม่เปลี่ยน job ที่ submit ไปแล้ว
- Proposed job states มี `queued`, `running`, `retry_wait`, `succeeded`, `failed`, `canceled`; `succeeded` ต้องมี committed artifact reference และ callback ซ้ำต้องไม่ย้อน terminal state
- Idempotency scope, TTL, data retention, persona, authentication scheme และ license โครงการยังเป็น decisions ที่เปิดอยู่
- Signed URL เป็น bearer ที่อาจใช้ได้ต่อจนหมดอายุ; การตรวจสิทธิ์ตอนออก URL ไม่เท่ากับตรวจทุกครั้งที่ดาวน์โหลด
- Capacity examples เป็น assumptions ไม่ใช่ throughput/RAM/SLA; controls และ restore เป็น tabletop/runbook outline ไม่ใช่ผล runtime

## Verification

ใช้ Python standard library, `jsonschema` Draft 2020-12 พร้อม format checker และ parser YAML ที่มีอยู่แล้ว ตรวจ input 11 cases, OpenAPI syntax/3 paths/local references, job scenario transitions และ capacity arithmetic. ไม่มี full OpenAPI validator ใน environment: parse และ reference checks **ไม่ใช่ full OpenAPI conformance validation**. ไม่มีการเรียก API server หรือ Engine จริง

ตรวจ local links, task dependencies และสถานะ checklists หลังรวมผล; ดู [source register](sources.md) และ [deferred runtime backlog](validation/deferred-runtime.md). การปิด Checkpoints 5–8 หมายถึงเอกสารตามขอบเขตที่ปรับแล้วครบ ไม่รับรอง production readiness
