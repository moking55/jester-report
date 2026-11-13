# T18 — Proposed Public API Contract

วันที่ตรวจ: 12 พฤศจิกายน 2026  
สถานะ: design specimen เท่านั้น ยังไม่มี endpoints, server, job queue หรือ PDF runtime

[OpenAPI specimen](../../../research/specimens/report-api.openapi.yaml) เป็น OpenAPI 3.1 JSON syntax ซึ่งเป็น subset ของ YAML; request input อ้าง [Draft 2020-12 schema](../../../research/specimens/report-input.schema.json) ใน directory เดียวกัน ข้อกำหนดนี้เป็นชื่อ paths เพื่ออภิปราย ไม่ใช่ public contract ที่อนุมัติแล้ว [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0)

## รายงานและ lifecycle

| เส้นทางเสนอ | ผลลัพธ์ | ขอบเขต |
| --- | --- | --- |
| `POST /reports/render` `mode=sync` | 200 `application/pdf`, `Content-Disposition` | Input + published `template.id/version`, snapshot assets ก่อน render; preview ต้อง pipeline/options/fonts/version เดียวกับ final |
| `POST /reports/render` `mode=async` | 202 JSON job + `Location` | Job state และการเก็บผลเป็น application responsibility; ไม่ถือว่า Engine webhook แทน durable queue |
| `GET /jobs/{jobId}` | JSON job/state | ตรวจ tenant/principal/object authorization ทุกครั้ง |
| `GET /jobs/{jobId}/artifact` | 200 PDF เมื่อ artifact commit แล้ว | ตรวจสิทธิ์อีกครั้ง; ยังไม่พร้อมตอบ `ARTIFACT_NOT_READY`; ไม่เปิด URL สาธารณะโดยปริยาย |

ตัวอย่าง sync request: `{ "mode":"sync", "template":{"id":"quote", "version":"1.0.0"}, "input":{...} }`; 200 response เป็น PDF bytes. Async request ใช้ `mode=async`; 202 body ตัวอย่าง `{"id":"job-123","status":"queued","template":{"id":"quote","version":"1.0.0"}}`. ทั้งหมดเป็น illustrative examples ไม่ได้เรียกใช้งานจริง

States ประสาน T19: `queued`, `running`, `retry_wait`, `succeeded`, `failed`, `canceled`; `cancelRequested` เป็น flag ไม่รับประกันหยุด renderer. `succeeded` ต้องมี artifact reference ที่ commit แล้ว; authorization ใช้กับ sync/async/status/download รวม replay. Artifact URI เป็น reference ภายใน มิใช่สิทธิ์ดาวน์โหลด

## Idempotency และ errors

`Idempotency-Key` จำเป็นใน specimen; scope `(tenant, principal, key)` ภายใน TTL ซึ่งยังต้องกำหนด. เก็บ request fingerprint ครอบคลุม mode, immutable template version, input และ relevant options; key เดิม+fingerprint ต่างตอบ `409 IDEMPOTENCY_CONFLICT`, key เดิม+fingerprint เดิมส่งผลเดิม/อ้าง job เดิมตาม state. ต้อง reauthorize ก่อน replay ทุกครั้งและไม่รับรอง exactly-once หลัง TTL หรือ worker crash

| สถานการณ์ | HTTP เสนอ / `code` | รายละเอียด |
| --- | --- | --- |
| Missing customer หรือ parameter/date ผิด | 422 `INPUT_INVALID` | `details[].pointer` เช่น `/data` หรือ `/parameters/from`; ห้ามบันทึก payload ลับ |
| ไม่มีสิทธิ์ | 401/403 `ACCESS_DENIED` | Tenant/object check; นโยบาย 404 เพื่อปิด existence ยังเปิด |
| Template/version ไม่พบ | 404 `TEMPLATE_NOT_FOUND` | ห้าม fallback ไป latest โดยเงียบ |
| key ซ้ำแต่ input ต่าง | 409 `IDEMPOTENCY_CONFLICT` | แยกจาก renderer resource error |
| Gotenberg resource check 409 | 502 `RENDER_RESOURCE_FAILED` | Mapping เป็นข้อเสนอระดับ app, preserve sanitized upstream detail/trace; ไม่สับสนกับ app 409 |
| Engine ล้มเหลว/ไม่พร้อม | 502 `RENDER_FAILED`, 503 `SERVICE_UNAVAILABLE` | Retry policy แยก failure category/idempotency |
| เกินเวลารอ | 504 `RENDER_TIMEOUT` | Timeout ไม่พิสูจน์ว่า worker หยุดหรือ output ไม่ถูกสร้าง |
| ขอ artifact ก่อนพร้อม | 409 `ARTIFACT_NOT_READY` | recheck job state/authorization |

`X-Correlation-ID` คือ trace ID ที่รับหรือสร้าง server-side ตาม policy ไม่ใส่ secrets; `Content-Disposition` ต้อง sanitize filename และรองรับชื่อ Unicode โดย client ที่เกี่ยวข้อง [RFC 6266](https://www.rfc-editor.org/rfc/rfc6266), [RFC 8187](https://www.rfc-editor.org/rfc/rfc8187). HTTP error codes/mappings และ TTL เป็นข้อเสนอ ไม่อ้างว่า Gotenberg ใช้ status เหล่านี้เหมือน API ของเรา [Gotenberg errors](https://gotenberg.dev/docs/reference/errors)

## Verification และข้อค้าง

Static parse OpenAPI/JSON references และ walk through sync, async, missing field, asset failure, timeout และ duplicate key; ไม่มีการเริ่ม server, ทดสอบ authentication หรือ PDF. ยังต้องตัดสิน TTL, artifact retention, HTTP auth scheme, error redaction, time budgets และการยกเลิกงานกับ T19/T20; งาน C05 ชี้ immutable published version/asset snapshot และ format ของ report definition ยังคงเป็นทางเลือก

ผลตรวจด้วย `python -X utf8 -`: JSON parser และ PyYAML parse ได้เนื้อหาตรงกัน, พบ 3 paths และ local references resolve ครบ; **ยังไม่ได้ตรวจด้วย full OpenAPI validator** เพราะไม่มีใน environment จึงไม่อ้างว่า spec ผ่าน conformance validation ทั้งหมด
