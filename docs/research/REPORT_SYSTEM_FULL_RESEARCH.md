# รายงาน Research เต็ม: ระบบออก Report PDF สำหรับธุรกิจ (Gotenberg เป็น Engine)

วันที่: 13 พฤศจิกายน 2026  
งาน: T30 — รายงาน Research สุดท้ายและชุดตัดสินใจ  
ขอบเขตหลักฐาน: **desk research เท่านั้น** อ่านเอกสารเจ้าของ/มาตรฐานผ่าน [source register](sources.md) และสังเคราะห์จาก [findings 01–29](findings/) ไม่มีการรันใด ๆ  
คู่กับ: [proposed decisions](decisions/proposed-decisions.md) · [README ดัชนี](README.md) · [feature traceability](findings/feature-traceability.md) · [แผน](../../tasks/plan.md)

> **Desk research complete ไม่เท่ากับ Runtime validated และไม่เท่ากับ Implementation ready**
>
> - **ไม่มี local runtime test และไม่มี remote runtime test** — ไม่ได้ติดตั้ง/รัน Docker, Gotenberg หรือ render PDF ใด ๆ ทั้งในเครื่องนี้และบริการภายนอก
> - **ไม่มี measured benchmark** — ไม่มี latency, throughput, RAM, p50/p95 หรือ SLA; ตัวเลข utilization ใน [23](findings/23-performance-scenarios.md) เป็นสูตรคณิตศาสตร์จากสมมติฐาน ไม่ใช่ผลวัด
> - **ไม่มีหลักฐานระดับ observed-runtime แม้แต่แถวเดียว** ทุก runtime case เป็น `deferred/not-tested` ตาม [protocol](validation/protocol.md)
> - ไม่มีการเลือก license, Designer, persona, template format, architecture, queue, storage หรือ runtime environment แทนผู้ใช้
> - ไม่มี P0 ข้อใดถูกยืนยันว่า feasible เอกสารเจ้าของระบุ capability ≠ output ของโปรเจกต์ทำได้

สถานะงาน: T01–T29 review-complete (ตาม [todo](../../tasks/todo.md)); เอกสารนี้คือผลส่งมอบ T30 การปิด T30/Checkpoint C10 เป็นหน้าที่ของผู้ดูแลแผนหลังตรวจเอกสารนี้

## 1. สรุปผู้บริหาร

**เป้าหมายโปรเจกต์ (confirmed จากคำขอผู้ใช้ — [T01 §1](findings/01-product-brief.md)):** ระบบรายงาน PDF สำหรับธุรกิจ ความสามารถคล้าย JasperReports ใช้ Gotenberg เป็น Engine และตั้งใจเผยแพร่เป็นโอเพนซอร์ส (U01–U03)

**ข้อสรุปหลัก 8 ข้อ**

1. **Gotenberg เป็นเพียง Engine แปลง HTML→PDF** (route `POST /forms/chromium/convert/html`, docs 9.x, release reference v9.4.1) การผูกข้อมูล, grouping, ยอดรวม, band semantics, template format, Designer และ job/authorization ทั้งหมด **เป็นงานของระบบรายงานเอง** ([07](findings/07-gotenberg-contract.md), [13](findings/13-template-options.md), [19](findings/19-job-processing.md))
2. **ความเสี่ยงที่ใหญ่ที่สุดและกำหนดทิศทางสถาปัตยกรรมคือ runtime ที่ยังไม่เคยพิสูจน์:** หัวตารางซ้ำข้ามหน้า, แถวสูงเกินหน้า, ฟอนต์ไทยใน header/footer ([08](findings/08-pagination.md), [09](findings/09-thai-fonts.md), [28 §3.1](findings/28-quality-strategy.md)) ถ้าพังต้องเปลี่ยนวิธีแบ่งหน้า/ฝังฟอนต์ทั้งระบบ จึงเสนอ **M0 spike ก่อนลงทุน** ทุกแนวทาง
3. **MVP มี 3 แนวทางที่เทียบได้:** (ก) developer-first, (ข) business-author-first, (ค) ผสม — ช่วง effort เป็น **inferred estimate ความเชื่อมั่นต่ำ** จาก [29 §4](findings/29-mvp-roadmap.md) (ดู §6) ไม่ใช่ผลวัด
4. **การตัดสินใจที่ผู้ใช้ต้องเลือกก่อนลงทุนสูง** (ดู [proposed decisions](decisions/proposed-decisions.md) D-1..D-11): ลำดับแรกคือ **environment สำหรับ spike (D-4)** และ **persona หลัก (D-1)**; license โครงการ (D-3) ต้องเลือกก่อนรับ contribution/เผยแพร่ ไม่เกี่ยวกับการเริ่ม M0
5. **ผู้ใช้ไม่รัน Docker บนเครื่องนี้** ดังนั้น environment ที่รัน Gotenberg ได้ (E1–E4 ใน [28 §3.3](findings/28-quality-strategy.md)) เป็น blocker ของ M0 **และ** ของวงพัฒนา/preview รายวัน ([29 §3 #6](findings/29-mvp-roadmap.md)) — ยังไม่มีใครเลือก
6. **v1 ที่ข้อมูลรองรับ** คือ single-trust, trusted-author templates, localhost/private network, sync `POST /render` ไม่มี queue/auth/tenant/Designer/PDF-A/signature ([29 §3, §6](findings/29-mvp-roadmap.md)) — เป็นข้อเสนอแบบมีเงื่อนไข ยังไม่ได้รับอนุมัติ
7. **ตัวเลขใน fixture** (3100.70/3210.00, 2000.00/400.00/2400.00, 350.00) ตรวจ arithmetic แบบ static แล้วเท่านั้น ([28 §1.9](findings/28-quality-strategy.md)) ไม่เกี่ยวกับตัวเลขที่จะพิมพ์ใน PDF
8. **ยังไม่ปิด:** R01–R25 มี desk coverage ครบ แต่ **ไม่มี R ใดปิดด้วย runtime** (ดู §9) และยังมี open inconsistency ภายใน findings (ดู §10)

## 2. ข้อค้นพบหลัก แยกตามระดับหลักฐาน

นิยามระดับหลักฐานตาม [protocol §1](validation/protocol.md) และ [plan §4](../../tasks/plan.md)

### 2.1 Documented (เอกสารเจ้าของ/มาตรฐานระบุ — ไม่ใช่ว่าโปรเจกต์ทำได้แล้ว)

| ประเด็น | สิ่งที่เอกสารระบุ | Finding / source |
| --- | --- | --- |
| Engine baseline | Official `releases/latest` ชี้ v9.4.1 ขณะตรวจ; docs เป็น 9.x rolling; 8.x→9.x เปลี่ยน route `/forms/pdfengines/*`→`/forms/pdf/*` และใช้ ordered `stages` | [02](findings/02-engine-baseline.md); S06, S07, S23 |
| HTML route | `files` ต้องมี `index.html`; แนบ CSS/images/fonts/scripts ได้; Gotenberg ตัด directory ออกจากชื่อไฟล์ (ชื่อซ้ำต้องจัดการ) | [07](findings/07-gotenberg-contract.md); S05 |
| Page setup | `paperSize` (A4), `landscape`, `margin*`, `preferCssPageSize`; default Letter และ margin 0.39 นิ้ว; `@page` อาจขัดกับ field | [07](findings/07-gotenberg-contract.md), [08](findings/08-pagination.md) |
| Header/footer | แยก rendering context; `<style>` ในไฟล์เอง, ภาพเป็น data URI, ไม่โหลด external stylesheet; มี class `pageNumber`/`totalPages` | [07](findings/07-gotenberg-contract.md), [09 §3](findings/09-thai-fonts.md) |
| Resource failure | `failOnResourceHttpStatusCodes` (ตอบ 409) กับ `failOnResourceLoadingFailed` (default false; **ไม่ครอบ timeout/certificate error**) เป็นคนละตัว; HTTP 200 ไม่ยืนยันว่า PDF ครบ | [07](findings/07-gotenberg-contract.md), [12 §2](findings/12-visual-assets.md); S09 |
| Readiness | `waitForSelector/Expression/WindowStatus/waitDelay` อยู่ใต้ API timeout; fixed delay ไม่พิสูจน์ chart/font เสร็จ | [12](findings/12-visual-assets.md) |
| Security controls | default ไม่บังคับ credentials (มี Basic/OIDC); outbound policy: deny ชนะ, allow-list เป็น exclusive และ URL ที่ match ข้าม IP-class checks; limits ไม่ทุกตัวมี default cap | [04 §3](findings/04-threat-model.md); S09, S19, S21, S49 |
| Webhook/queue | queue ของ Engine ไม่ใช่ durable job; webhook mode ต้องมี URL สองตัว; `204` = รับคำขอ ไม่ใช่ PDF สำเร็จ | [19 §1](findings/19-job-processing.md); S19, S20 |
| PDF post-processing | `/forms/pdf/pipe` + stages, `remediate` (PDF/A, PDF/UA, Factur-X), `validate`, `sign`, `timestamp`, `encrypt`; กฎลำดับ stage; PDF ที่ signed ปฏิเสธ stage ที่ rewrite (400) | [25](findings/25-pdf-capabilities.md); S82–S87 |
| Jasper semantics (benchmark) | group break/subtotal/reset, subreport ผ่าน parameters/data source/return variables — เป็นพฤติกรรมของ JasperReports 7.1.1 **ไม่ใช่** ของ Gotenberg | [10](findings/10-grouping-totals.md), [11](findings/11-master-detail.md); S01–S03 |
| License (metadata-reviewed) | Gotenberg MIT; JasperReports Library LGPL v3; Studio CE 6.21.2 binary-use (ไม่แจก source); jsreport core LGPL v3 (free-plan limits แยกจาก source license); Carbone CCL = source-available มีข้อจำกัดแข่งขัน; pdfme MIT; Handlebars MIT; Sarabun/Noto Sans Thai = SIL OFL 1.1 | [05](findings/05-license-inventory.md); S25, S28, S31, S34, S36–S43 |

### 2.2 Inferred (ข้อสรุปของเรา มี assumptions — ไม่ใช่การตัดสินใจ)

| ข้อสรุป | เหตุผล/ต้นทาง | Finding |
| --- | --- | --- |
| งานที่เรียก "developer-first + definition ไฟล์ (bands/group/aggregate)" คือ **Hybrid schema + bounded HTML** ไม่ใช่ HTML-first จึงต้องมี schema versioning, migration และ compiler | เทียบ 3 ทางเลือกด้วย specimen เดียวกัน | [13](findings/13-template-options.md), [29 §3 #3](findings/29-mvp-roadmap.md) |
| Group subtotal/grand total ควรคำนวณที่ชั้นแอปด้วย Decimal ก่อน render; page subtotal ต้องรู้ตำแหน่งหน้าจริงหลัง layout จึงไม่มีกลไกที่มีหลักฐาน → out ใน v1 | Gotenberg ไม่มี group engine; Jasper semantics ไม่ถูกยกมาอัตโนมัติ | [10](findings/10-grouping-totals.md), [08](findings/08-pagination.md) |
| Preview ต้องผ่าน PDF pipeline/config/fonts เดียวกับ final; HTML preview ในเบราว์เซอร์ = non-authoritative | ป้องกัน parity ผิดพลาด | [15](findings/15-authoring-lifecycle.md) |
| Published version + asset snapshot เป็น immutable ต่อ job; rollback เปลี่ยน alias ไม่แตะ job ที่ submit แล้ว | ลด ambiguity ของ job เก่า | [15](findings/15-authoring-lifecycle.md), [19](findings/19-job-processing.md) |
| Sync-only ไม่ต้องมี durable job; ถ้า async ต้องมี state `queued/running/retry_wait/succeeded/failed/canceled`, fencing token, idempotency scope `(tenant, principal, key)` | tabletop 11 scenarios (ไม่ใช่ execution log) | [19](findings/19-job-processing.md), [18](findings/18-api-contract.md) |
| ประกาศ trusted-author templates + single-trust deployment ใน v1; logic-less ไม่ใช่ sandbox; escaping ตาม context (URL/CSS) | OWASP SSTI/Handlebars guidance | [04](findings/04-threat-model.md), [22](findings/22-security-review.md); S41, S50 |
| Engine authentication ไม่ใช่ template/job/artifact authorization; signed URL เป็น bearer (recheck ตอนออก URL ≠ ตอนใช้) | OWASP IDOR/Authorization; S3 presigned example | [20](findings/20-access-data-lifecycle.md); S62, S63, S65 |
| ช่องลายเซ็นบนหน้า (placeholder) เป็น layout ธรรมดา ไม่ใช่ crypto; signing ต้อง key custody + CA/TSA | แยกภาพกับ cryptographic signature | [27](findings/27-signature-lifecycle.md) |
| JSON จาก caller เป็น candidate ลดจำนวน connector ถ้าต้นทางส่ง snapshot metadata ครบ | เปรียบเทียบ JSON/REST/SQL | [17](findings/17-data-source-options.md) |
| Format วันที่/เงินควรอยู่ที่ชั้นแอป ไม่พึ่ง ICU/Intl ของ browser | ICU/Intl drift = nondeterminism | [28 §2.2](findings/28-quality-strategy.md), [09](findings/09-thai-fonts.md) |

### 2.3 Unknown (ผลต่อการตัดสินใจ — ห้ามเปลี่ยนเป็น supported โดยปริยาย)

| ประเด็น | ทำไมสำคัญ | วิธีปิด gap |
| --- | --- | --- |
| หัวตารางซ้ำ/ไม่ทับข้อมูลบน Gotenberg 9.x (issue [S58](sources.md) รายงานบน v7 ปี 2021, ไม่ reproduce) | ตารางยาวคือหัวใจ MVP | M0 SP-B |
| ฟอนต์ไทยใน header/footer (D05-HEADER) และวรรณยุกต์/ตัดคำ/copy-search | เงื่อนไขหลักของผลิตภัณฑ์ภาษาไทย | M0 SP-A |
| แถวสูงเกินหน้า split/หายหรือไม่ (D03) | ข้อมูลหายเงียบ = ผิดความหมายธุรกิจ | M0 SP-C |
| Font binary/version/hash ที่จะ pin, glyph coverage, shaping | เปลี่ยนฟอนต์ = เปลี่ยน page count | M0/M1 |
| Actual image digest, Chromium build, OS/fonts ของ runtime | baseline ต้องผูก digest | ตอน spike |
| กลไก page subtotal | ไม่มีหลักฐานว่าทำได้ | ศึกษา/ทดลองแยก (out ใน v1) |
| Gotenberg `pades=true`+`timestampUrl` ได้ PAdES ระดับใด, OCSP/CRL, HSM/external signer | ห้ามอ้างระดับใดใน MVP | ทดลองแยกใน environment ที่ผู้ใช้อนุมัติ |
| สถานะลายเซ็นตามกฎหมายไทย, ความสัมพันธ์กับ e-tax/e-invoice | ไม่ได้ศึกษา ไม่ใช่คำแนะนำทางกฎหมาย | ผู้เชี่ยวชาญด้านกฎหมาย |
| Engine ของ `/forms/pdf/validate` (ใช่ veraPDF หรือไม่) | ห้ามเรียกผลสองเครื่องมือว่า independent | ตอนทดลอง |
| Image BOM/transitive notices, Studio EULA artifact, การตีความ Carbone CCL | ก่อนแจกจ่าย/reuse | ตรวจ artifact จริง |
| Release ที่เริ่มมีแต่ละ PDF stage (ยกเว้น stamp `position` = v9.4.0) | pin version | ตรวจ release notes |
| Throughput/latency/RAM/recovery | ไม่มี sizing/SLA | D08 ภายหลัง |

### 2.4 Observed-static (ตรวจเบา ไม่ใช่ runtime — ตามที่ findings บันทึก, T30 ไม่ได้รันซ้ำ)

- fixture arithmetic: grouped 6/6, master-detail 6/6, D01 = 3210.00 ([28 §1.9](findings/28-quality-strategy.md))
- JSON Schema Draft 2020-12 ผ่าน `check_schema`, input cases 11/11 ตรง expected ([16](findings/16-data-contract.md)) — ใช้ `jsonschema` 4.25.1
- OpenAPI specimen: parse ได้ 3 paths, local `$ref` resolve ครบ **ไม่ใช่ full OpenAPI validation** ([18](findings/18-api-contract.md))
- capacity arithmetic ([23](findings/23-performance-scenarios.md)) — สูตรเท่านั้น

## 3. Runtime gaps (P0 ที่ยังต้องพิสูจน์)

ทั้งหมด **deferred/not-tested** รายละเอียดครบอยู่ที่ [28 §1](findings/28-quality-strategy.md), [case catalog](validation/case-catalog.md), [deferred-runtime](validation/deferred-runtime.md)

| กลุ่ม | Case | Pri | ผลต่อ MVP ถ้าไม่ผ่าน (inferred) |
| --- | --- | --- | --- |
| เอกสารหน้าเดียว/ยอด | D01, D01-NUM | P0 | ไม่มีรายงานอ้างอิงหน้าเดียวที่เชื่อถือได้ ต้องทบทวน margin/template model |
| ตารางหลายหน้า + หัวตารางซ้ำ | D02*, D02-HEADER-REPEAT (เสนอ) | P0 | chunk แถวที่ชั้นแอป / จำกัดรูปแบบตาราง / เปลี่ยน approach |
| แถวสูงเกินหน้า | D03* | P0 | ต้องเลือก reject/split/truncate+สัญญาณ (D-5) |
| ยอดใน PDF / group / master-detail | D04*, D01-NUM | P0 | ยอดบน PDF ไม่รับรอง; page subtotal ตัดออก |
| ภาษาไทย/ฟอนต์/locale | D05* (รวม D05-HEADER) | P0 | เปลี่ยนวิธีฝังฟอนต์/ย้ายข้อมูลออกจาก header/footer/เปลี่ยนฟอนต์ |
| Assets/readiness | D06* | P0 | ต้องมี fail policy; โลโก้หายเงียบใน HTTP 200 |
| Security/egress/authz | D07*, SEC01–SEC08 | P0 ก่อน shared service | จำกัดเป็น single-trust; ปิด URL/callback ภายนอก |
| Load/recovery | D08* | P0 เมื่อยืนยัน workload | ห้ามสัญญา throughput/SLA |
| PDF profile/signature/determinism | A01–A09 | P1–P2 (เสนอ) | ไม่ประกาศ conformance/signing |

**หมายเหตุเรื่อง priority:** priority ของ catalog D01–D08 มาจาก T06; ค่าที่ T28 ติด "เสนอ" ยังไม่ใช่ที่ผู้ใช้ยืนยัน

## 4. Architecture options (เชิงแนวคิด — ไม่เลือกแทนผู้ใช้)

Gotenberg เป็น **ข้อกำหนด U02** ไม่ใช่ตัวเลือก ภาพรวมการแบ่งหน้าที่เพื่อวิเคราะห์ trust boundary ([04 §1](findings/04-threat-model.md)):

`ผู้เรียก → application (validate + authorization) → template layer (สร้าง HTML/assets) → Gotenberg (HTML→PDF) → application (output/download/storage)`

ไม่เลือกภาษาโปรแกรม ฐานข้อมูล queue storage หรือ frontend framework ([keyword §1](REPORT_SYSTEM_RESEARCH_KEYWORDS.md))

### 4.1 แกนที่ต้องเลือก (แต่ละแกน = decision แยก)

| แกน | ตัวเลือกที่ศึกษา | อ้างอิง | Decision |
| --- | --- | --- | --- |
| รูปแบบแจกจ่าย | library + CLI · library + thin HTTP server (localhost/private) · shared report server | [24](findings/24-deployment-operations.md), [29 §8](findings/29-mvp-roadmap.md) | D-2 |
| การประมวลผล | sync-only (คืน PDF ตรง ไม่มี durable job) · async + durable job/artifact store/idempotency | [18](findings/18-api-contract.md), [19](findings/19-job-processing.md) | D-11 (workload) |
| Template layer | HTML-first · declarative schema · hybrid schema + bounded HTML | [13](findings/13-template-options.md) | 29 §8 ไม่มี decision ID เฉพาะ — ผูกกับ D-1 (persona) และ M1 |
| Authoring | code editor + PDF preview · block editor · visual canvas | [14](findings/14-designer-options.md), [15](findings/15-authoring-lifecycle.md) | D-1 |
| แหล่งข้อมูล | JSON จาก caller · REST connector · SQL connector | [17](findings/17-data-source-options.md) | D-11 |
| Trust model | trusted-author เท่านั้น · untrusted author (ต้อง sandbox) | [04](findings/04-threat-model.md), [22](findings/22-security-review.md) | D-9 |
| PDF post-processing | ไม่ใช้ (PDF ธรรมดา) · pipe/stamp/metadata · remediate PDF/A/UA · sign/timestamp/encrypt | [25](findings/25-pdf-capabilities.md), [26](findings/26-pdf-profile-validation.md), [27](findings/27-signature-lifecycle.md) | D-11 |

### 4.2 สามรูปแบบรวมที่สอดคล้องกับ findings (ตัวอย่างการประกอบ ไม่ใช่ข้อเสนอให้เลือก)

| รูปแบบ | ประกอบจาก | สิ่งที่ต้องมีเพิ่ม | ข้อจำกัดที่ findings ระบุ |
| --- | --- | --- | --- |
| **A. Library/CLI + Gotenberg ที่ผู้ใช้เข้าถึงได้** | library + sync + JSON + trusted-author | semantic validator, compiler, error mapping, provenance | วงพัฒนาขึ้นกับ environment ที่รัน Gotenberg (D-4) |
| **B. Thin HTTP server บน localhost/private** | A + `POST /render` sync | limits/timeout, `failOn*` ทั้งสอง, bind private network | Gotenberg ไม่บังคับ auth by default; ห้ามเปิด shared ก่อนผ่าน D07 |
| **C. Shared report server** | B + auth + tenant + durable job + artifact store + signed-URL/gateway + retention | D07-AUTH, SEC05, D08, object-level authz ([20](findings/20-access-data-lifecycle.md)) | ใหญ่ที่สุด; ไม่อยู่ใน MVP v1; multi-tenant ยัง unknown |

## 5. ขอบเขต MVP candidate และสิ่งที่ตัดออก (จาก [29](findings/29-mvp-roadmap.md) และ [feature traceability](findings/feature-traceability.md))

- **must (บางข้อ "เงื่อนไข" = ต้องผ่าน M0 ก่อนยืนยัน scope):** template+sample data, binding/parameters, text/table/image/line + formatter, A4 portrait/landscape, เลข/จำนวนหน้า (เงื่อนไข), หัวตารางซ้ำ (เงื่อนไข), header/footer band (เงื่อนไข), title/detail/summary band, group subtotal/grand total/count, master-detail 1 ระดับ (ผู้ใช้ยกจาก P1), ฟอนต์ไทย (เงื่อนไข), formatter พ.ศ./เงินที่ชั้นแอป, local assets + `failOn*` ทั้งสอง, preview/CLI (เงื่อนไข: environment), `POST /render` sync + error taxonomy, provenance ขั้นต่ำ, limits/timeout, trust model + escaping, deployment boundary localhost/private, regression harness L0–L3, no-data state, quickstart + 3 ตัวอย่าง และ OSS readiness ก่อน publish
- **out/later (v1):** page subtotal, Visual Designer (ยกเว้นเลือกแนวทาง (ข)), chart/QR/barcode, async/queue/idempotency/artifact store, schedule/email/bursting, auth/tenant (ก่อน shared), SQL/REST connector, PDF/A/UA, signature/encryption, merge/stamp/bookmarks, plugin framework
- **out (งานแยก):** JRXML import/compat, XLSX/DOCX export, BI/dashboard/ad hoc ([plan §3](../../tasks/plan.md))

## 6. MVP options และ effort (ตัวเลขทั้งหมดจาก [29 §4](findings/29-mvp-roadmap.md) — ไม่เปลี่ยนค่า)

> **ทุกช่วงเป็น inferred estimate ความเชื่อมั่นต่ำ ไม่ใช่ผลวัด และไม่ใช่คำสัญญา** สมมติฐาน: นักพัฒนา JS ประสบการณ์ 1 คน ชำนาญ HTML/CSS/Node ทำเต็มเวลา **ไม่รวม** เวลารอการตัดสินใจ/จัดหา environment/ตรวจกฎหมาย/license review และไม่รวมการเรียนรู้ Gotenberg ถ้าไม่เคยใช้ ([29 §9](findings/29-mvp-roadmap.md)); หน่วยเป็นวัน/สัปดาห์ทำงาน ไม่มีข้อมูลจริงในโปรเจกต์ที่วัดได้

| มิติ | (ก) developer-first | (ข) business-author-first | (ค) ผสม |
| --- | --- | --- | --- |
| Persona ที่ตอบ | developer/integrator | business author (ไม่เขียนโค้ด) | developer ก่อน; business ภายหลังถ้า validate |
| Designer | ไม่มี (code + CLI + PDF preview) | มี (block/canvas) | เลื่อนเป็น M5 |
| ต้นทุนเด่น | compiler + semantic validator + formatter + error mapping | + editor, round-trip, a11y, PDF preview integration | (ก) + ออกแบบ schema ให้ต่อ editor |
| **Effort (inferred) ถึง OSS readiness** | **≈ 7–14 สัปดาห์** (M0 2–5 วัน · M1 3–6 · M2 1.5–3 · M3 1–2 · M4 1–2 สัปดาห์) | **≈ 15–34 สัปดาห์** (= (ก) + ≈ 8–20 ช่วงกว้างมาก) | **≈ 8–16 สัปดาห์ ก่อน M5** (= (ก) + ≈ 1–2); M5 ประเมินใหม่หลังรู้ผลจริง |
| ความเชื่อมั่นของ estimate | ต่ำ–กลาง | ต่ำสุด | ต่ำ–กลาง |
| ตัวขยายช่วง | M0 SP-B ไม่ผ่าน → app-level pagination **+2–6 สัปดาห์**; header/footer ไทยไม่ผ่าน **+0.5–1 สัปดาห์**; ได้ environment ล่าช้า = เลื่อนปฏิทิน ไม่ใช่ effort; policy overflow/empty ไม่เลือก → งานซ้ำ | เหมือน (ก) + editor ต้องรู้ pagination model + round-trip ไม่พิสูจน์ | เหมือน (ก); เสี่ยง over-design schema ถ้าไม่มีผู้ใช้ธุรกิจจริง |
| License ที่ต้องตรวจเพิ่ม | font, engine notices, template engine (หลัง review SEC04) | + GrapesJS/pdfme exact artifact/dependencies (S68, S39 เป็น mutable) | เลื่อนไป M5 |
| Reversal | ง่ายถ้า schema เป็นแหล่งความจริง | ยากถ้า editor เก็บ state เอง (**ยังไม่พิสูจน์**) | ง่าย (ไม่ใช้ส่วนเผื่อ = ค่าใช้จ่ายจมต่ำ) |
| ผู้ใช้ตัดสินก่อนเริ่ม | persona, license, environment | + เลือก/สร้าง editor | เหมือน (ก) |

ตรวจผลรวม (inferred): (ก) ต่ำสุด ≈ 0.4+3+1.5+1+1 ≈ 6.9, สูงสุด 1+6+3+2+2 = 14 สัปดาห์; (ข) = (ก)+8..20 = 15–34; (ค) = (ก)+1..2 = 8–16 — สอดคล้องกับ [29 §4.4](findings/29-mvp-roadmap.md)

**Recommendation แบบมีเงื่อนไข ([29 §1](findings/29-mvp-roadmap.md)):** ถ้า persona หลักเขียนโค้ดได้ → (ก) หรือ (ค); ถ้าเป็นฝ่ายธุรกิจที่ไม่เขียนโค้ด → (ข) แต่ห้ามลงทุน Designer ก่อน M0; ถ้ายังไม่ตอบ persona → ทำ M0 (ไม่ขึ้นกับ persona) และเตรียม (ค) — **รายงานนี้ไม่เลือกแทนผู้ใช้**

### Milestones (จาก [29 §5](findings/29-mvp-roadmap.md); exit criteria เป็นเชิงคุณภาพ ไม่มีค่าตัวเลขแต่งขึ้น; ผ่านไม่แปลว่า production ready)

| Milestone | เป้าหมาย | หมายเหตุ |
| --- | --- | --- |
| Precondition | ผู้ใช้เลือก environment (E1–E4) และ persona | ไม่ถือการรอเป็นการอนุมัติ; ห้าม provision เอง |
| **M0 Spike runtime** | SP-B (ตาราง/หัวตารางซ้ำ) → SP-A (ใบเสนอราคา+ไทย header/footer) → SP-C (long-detail, PO02 empty) บน Gotenberg ที่ pin | ไม่วัดเวลา/RAM; ผลไม่ผ่าน → กลับมาทบทวนแผน |
| M1 | schema → HTML → PDF, validator, Decimal, formatter, asset pin, `failOn*`, trust model, provenance, เลือก template engine หลังตรวจ SEC04 | ไม่มี master-detail/HTTP/Designer |
| M2 | pagination + master-detail ตามผล M0, policy overflow/empty | ไม่มี page subtotal |
| M3 | CLI + watch-preview + `POST /render` sync | ไม่มี async/auth/shared |
| M4 | OSS readiness (LICENSE ที่ผู้ใช้เลือก, notices, README, SECURITY, CONTRIBUTING/DCO-CLA, quickstart) | ไม่ publish จนกว่าผู้ใช้สั่ง |
| M5 (ทางเลือก) | block editor **หรือ** shared-service hardening | ตัดสินใจแยก ประเมิน effort ใหม่ |

## 7. ความเสี่ยง

จาก [plan §11](../../tasks/plan.md) และ [29](findings/29-mvp-roadmap.md)/[28](findings/28-quality-strategy.md):

| ความเสี่ยง | ผลกระทบ | การรับมือ / สถานะ |
| --- | --- | --- |
| ไม่มี runtime validation | pagination/ไทย/fonts/conformance ยืนยันไม่ได้ | ติดป้าย not-tested ทุกข้อ; M0 spike; **ยังไม่มี environment** (D-4) |
| หัวตารางซ้ำ/oversized row ไม่ทำงานตามที่ CSS spec ชวนให้คิด | ต้อง chunk แถวที่ชั้นแอป (+2–6 สัปดาห์ inferred) | SP-B ก่อน; อย่าอ้าง CSS spec เป็น Chromium proof ([08](findings/08-pagination.md)) |
| ฟอนต์ไทยใน header/footer | ข้อมูลบน header/footer ผิด/หาย | SP-A; fallback: data URI, ย้ายข้อมูล, เปลี่ยนฟอนต์ |
| ฟอนต์ไม่ pin / เปลี่ยน | page count และ baseline เปลี่ยน | pin binary+hash+notice; เปลี่ยนฟอนต์ = baseline ใหม่ ([28 §2.2](findings/28-quality-strategy.md)) |
| HTTP 200 แต่ asset หาย | เอกสารไม่ครบเงียบ ๆ | เปิด `failOn*` ทั้งสอง + readiness + validation แยก (D06) |
| ใช้ docs/issue เก่าแทนผลทดลอง | แนะนำวิธีที่ใช้ไม่ได้ | ระบุ source/version/confidence; recommendation แบบมีเงื่อนไข |
| Engine/version drift | API/limits ต่างจากที่อ้างอิง | pin image digest; docs 9.x rolling ([02](findings/02-engine-baseline.md)) |
| เปิด shared โดยไม่มี authz | ข้ามผู้ใช้/tenant, SSRF | D07/SEC ต้องผ่านก่อน; v1 = single-trust localhost |
| Template engine ไม่ใช่ sandbox | SSTI/อ่านไฟล์/secrets | trusted-author เท่านั้นใน v1; SEC04 ก่อน untrusted |
| License/font/editor ไม่เข้ากัน | แจกจ่ายติดเงื่อนไข | หลีกเลี่ยง Carbone CCL/Studio CE; ตรวจ artifact จริงก่อน reuse; ผู้ใช้เลือก license |
| Capacity assumptions ถูกอ่านเป็น benchmark | เลือก hardware/SLA ผิด | ห้ามใช้ 1.67/20.83/41.67% เป็นเกณฑ์ ([23](findings/23-performance-scenarios.md)) |
| Scope drift (Designer/JRXML/BI/XLSX) | งานบาน | ระบุ exclusions §5 |
| Effort estimate ต่ำกว่าจริง | วางแผน/งบผิด | ค่าเป็น inferred ความเชื่อมั่นต่ำ; ประเมินใหม่หลัง M0 |
| ไม่มีผู้ใช้จริง/certificate | usability และ signature trust ยืนยันไม่ได้ | pending; ผู้ใช้ตัดสิน D-1, D-11 |
| ลายเซ็น/กฎหมายไทย | อ้างความถูกต้องทางกฎหมายผิด | unknown; ต้องผู้เชี่ยวชาญ ([27 §7](findings/27-signature-lifecycle.md)) |

## 8. Deferred-validation checklist ก่อน Implementation readiness

รายการนี้ **ยังไม่ได้ทำทั้งหมด** (`[ ]` = ยังไม่ทำ) การทำครบ M0 ไม่เท่ากับ production ready ตาม [28 §3.1 ข้อจำกัด](findings/28-quality-strategy.md)

### 8.1 เงื่อนไขก่อนเริ่ม ([deferred-runtime §2](validation/deferred-runtime.md))

- [ ] มีคำขอให้ทำ runtime validation แยก และมี environment ที่เหมาะสมโดยรักษาข้อจำกัดเครื่องเดิม (D-4)
- [ ] ผู้ใช้เลือก persona/report/workload และ acceptance policy: overflow (D-5), empty/no-data (D-6), fonts (D-7), rounding/calendar (D-8), `failOn*`, signature profile
- [ ] ระบุ exact engine image digest / Chromium / fonts+hash / tool versions และ resource/network budget
- [ ] ใช้ข้อมูลสังเคราะห์และ endpoint ที่ควบคุมได้ ไม่เปิดเผย secrets/เอกสารจริง
- [ ] เก็บ inputs/output/logs/expected values ตาม [protocol §6](validation/protocol.md)
- [ ] reconcile case ID/payload ระหว่าง catalog กับ findings (ดู §10) และเลือกชุดข้อมูลทดสอบชุดเดียว

### 8.2 M0 spike ([28 §3.1](findings/28-quality-strategy.md); ลำดับ SP-B → SP-A → SP-C ตาม [29 §4.1](findings/29-mvp-roadmap.md))

- [ ] **SP-B** (D02*, D04-SCOPE): ตาราง 0/1/50 (+500 ถ้าทรัพยากรพอ) portrait/landscape — ID ครบ/ไม่ซ้ำ, ไม่ทับ footer, หัวตารางซ้ำทุกหน้าไม่ทับข้อมูล (L1+L4)
- [ ] **SP-A** (D01, D01-NUM, D05-HEADER, D05-THAI): ใบเสนอราคา — วรรณยุกต์ใน body+header/footer, ฟอนต์ฝัง, copy/search (L3+L4), ยอด D01 extract ได้ (L2)
- [ ] **SP-C** (D03*, D04-PARENT): long-detail และ PO02 ไม่มี detail — ข้อความไม่หายและตรง policy ใดสักข้อ (L1)
- [ ] รันซ้ำ input เดิม 2–3 รอบ (ตามทรัพยากร) เพื่อดูความนิ่ง และบันทึก image digest/Chromium/fonts+hash/options/log ต่อรอบ **ห้ามตัดสินจาก HTTP 200**
- [ ] ผลไม่ผ่าน → ผู้ใช้เลือก: chunk ที่ชั้นแอป / จำกัดรูปแบบตาราง / เปลี่ยน approach / ทางแก้ฟอนต์ที่ระบุใน 28 §3.1 แล้วทบทวน [29](findings/29-mvp-roadmap.md)

### 8.3 Backlog หลัง spike ([28 §3.2](findings/28-quality-strategy.md))

- [ ] (2) Assets/readiness + QR/barcode decode — D06*, D06-QR*, D06-CODE128 (หลังเลือกว่า chart/QR อยู่ใน MVP หรือไม่)
- [ ] (3) Security probes ใน isolated environment — D07*, SEC01–SEC08 (**ก่อนเปิด shared service**; อาจมาก่อน (2) ถ้าต้องการ shared ตั้งแต่แรก)
- [ ] (4) Concurrency/timeout/recovery + performance — D08* (หลังผู้ใช้ยืนยัน workload; บันทึก N/warm-up/limits)
- [ ] (5) PDF/A, PDF/UA, signature — A01–A09, [26](findings/26-pdf-profile-validation.md), [27](findings/27-signature-lifecycle.md) (หลังยืนยันว่า use case ต้องการ profile ใด; ไม่ใช้ key จริง)
- [ ] (6) Reproducibility/regression harness — A04, [28 §2](findings/28-quality-strategy.md) (หลังมี baseline จาก spike; tolerance ภาพกำหนดหลังเก็บ baseline ซ้ำเท่านั้น)

### 8.4 ก่อนอ้างว่า "Implementation ready"

- [ ] ผู้ใช้เลือก persona/MVP/authoring/license direction ([plan §12](../../tasks/plan.md))
- [ ] P0 runtime ทุกข้อใน §3 มีผลตรวจจริงหรือถูกลดขอบเขตอย่างชัดเจน
- [ ] pin font binary+hash+notice, template engine หลัง SEC04, image BOM/notices
- [ ] ทบทวน effort estimate ใหม่จากผล M0

## 9. R01–R25 → finding และสถานะ

สถานะ "desk-covered" = มี finding ตอบระดับเอกสารแล้ว ไม่ใช่ตอบครบหรือพิสูจน์แล้ว ([plan §9](../../tasks/plan.md)); Gap: **G-RT** รอ runtime · **G-DEC** รอผู้ใช้ตัดสิน · **G-EVID** หลักฐานเอกสารยังไม่พอ; **ไม่มีแถวใดเป็น observed-runtime** ข้อมูลจาก [feature traceability §3](findings/feature-traceability.md); ชื่อหัวข้อจาก [keyword map](REPORT_SYSTEM_RESEARCH_KEYWORDS.md)

| R | หัวข้อ | Findings | Evidence class | Gap | สถานะ |
| --- | --- | --- | --- | --- | --- |
| R01 | ผู้ใช้และงานรายงานธุรกิจ | [01](findings/01-product-brief.md) | inferred | G-DEC: persona หลักยังไม่เลือก; ไม่มีเอกสารจริงจากผู้ใช้ | desk-covered / gap เปิด |
| R02 | Benchmark JasperReports และใกล้เคียง | [03](findings/03-product-comparison.md), [05](findings/05-license-inventory.md), [14](findings/14-designer-options.md) | documented | G-EVID เล็กน้อย: ไม่ได้ติดตั้ง/ทดสอบผลิตภัณฑ์; docs rolling | desk-covered |
| R03 | รูปแบบ Template/Report Definition | [13](findings/13-template-options.md) | inferred | G-DEC + G-RT: ยังไม่มี canonical format; round-trip ไม่ถูกทดลอง | desk-covered / gap เปิด |
| R04 | การแบ่งหน้าและ Print Layout | [07](findings/07-gotenberg-contract.md), [08](findings/08-pagination.md) | documented + issue ไม่ reproduce | **G-RT (P0)**: D02, D03, D05-HEADER | desk-covered / **runtime gap** |
| R05 | Report Bands และองค์ประกอบพื้นฐาน | [08](findings/08-pagination.md), [10](findings/10-grouping-totals.md), [13](findings/13-template-options.md) | inferred | G-RT: band จำลองด้วย HTML/CSS ไม่ทดลอง; page subtotal unknown | desk-covered / **runtime gap** |
| R06 | Data Binding และ Dataset Contract | [16](findings/16-data-contract.md) | inferred + static | G-DEC เล็กน้อย: field naming/`reportType`; ยังไม่มี semantic validator | desk-covered |
| R07 | Parameters และตัวกรอง | [16](findings/16-data-contract.md) | inferred + static | G-DEC: ใครกรอง, timezone/calendar default | desk-covered / gap เปิด |
| R08 | Expressions, Grouping และการคำนวณ | [10](findings/10-grouping-totals.md), [11](findings/11-master-detail.md) | documented (Jasper) + static | G-DEC: rounding; G-RT: การแสดงใน PDF | desk-covered / gap เปิด |
| R09 | Data Sources และการเตรียมข้อมูล | [17](findings/17-data-source-options.md) | documented/inferred | G-DEC: connector/snapshot owner ยังไม่เลือก | desk-covered / gap เปิด |
| R10 | Reusable Components และ Master-detail | [11](findings/11-master-detail.md) | documented (Jasper) + static | G-RT: long-detail ข้ามหน้า; G-DEC: PO02 empty, nesting | desk-covered / gap เปิด |
| R11 | Charts, Images, QR และ Barcodes | [12](findings/12-visual-assets.md) | documented/inferred | G-RT (D06*); G-DEC: อยู่ใน MVP หรือไม่ (ก = out) | desk-covered / gap เปิด |
| R12 | ภาษาไทย, Localization และ Fonts | [09](findings/09-thai-fonts.md) | documented (metadata) + unknown | **G-RT (P0)**: วรรณยุกต์, ตัดคำ, header/footer font, copy/search; font binary/hash ไม่ pin | desk-covered / **runtime gap** |
| R13 | Gotenberg Integration และ Version Contract | [02](findings/02-engine-baseline.md), [07](findings/07-gotenberg-contract.md) | documented (9.x; v9.4.1 reference) | G-RT: image digest/Chromium/fonts unknown; docs drift (S07 vs S24) | desk-covered / gap เปิด |
| R14 | Report Designer และประสบการณ์สร้างรายงาน | [14](findings/14-designer-options.md), [15](findings/15-authoring-lifecycle.md) | documented/inferred | **G-DEC (สำคัญ)**: ยังไม่เลือก Designer; effort ไม่วัด; usability/a11y ไม่ทดสอบ | desk-covered / gap เปิด |
| R15 | Template Lifecycle และการทำซ้ำเอกสาร | [15](findings/15-authoring-lifecycle.md), [24](findings/24-deployment-operations.md) | inferred | G-DEC: เก็บ PDF vs re-render, retention/PII | desk-covered / gap เปิด |
| R16 | Public API และ Developer Experience | [18](findings/18-api-contract.md) | inferred + static (parse) | G-EVID: ไม่ผ่าน full OpenAPI validator; endpoints ไม่ใช่ public contract | desk-covered / gap เปิด |
| R17 | งานเบื้องหลัง, Retry และ Batch | [19](findings/19-job-processing.md) | inferred (tabletop) | G-DEC: workload ยังไม่ยืนยัน; D08 deferred | desk-covered / gap เปิด |
| R18 | Report Catalog, Scheduling, Distribution | [21](findings/21-distribution-options.md) | inferred | G-DEC: ต้องการหรือไม่ (ก = out) | desk-covered |
| R19 | ความปลอดภัยของ Template และ Renderer | [04](findings/04-threat-model.md), [22](findings/22-security-review.md) | documented/inferred (tabletop) | **G-RT (P0 ก่อน shared/untrusted)**: SEC01–SEC08 ไม่เคย probe; template engine ยังไม่เลือก | desk-covered / **runtime gap** |
| R20 | สิทธิ์, Multi-tenancy และข้อมูลอ่อนไหว | [04](findings/04-threat-model.md), [20](findings/20-access-data-lifecycle.md) | inferred (tabletop) | G-DEC + G-RT: multi-tenant, retention, compliance; D07-AUTH | desk-covered / gap เปิด |
| R21 | Performance, Deployment และ Observability | [23](findings/23-performance-scenarios.md), [24](findings/24-deployment-operations.md) | documented (limits) + **capacity = สมมติฐาน ไม่ใช่ผลวัด** | G-RT: ไม่มี throughput/latency/RAM วัดจริง | desk-covered / **runtime gap** |
| R22 | การทดสอบคุณภาพ PDF และ Regression | [28](findings/28-quality-strategy.md), [protocol](validation/protocol.md), [case catalog](validation/case-catalog.md) | inferred (strategy) + static (arithmetic) | **G-RT (P0)**: ไม่มี baseline/PDF; tolerance ภาพกำหนดไม่ได้ก่อนเก็บ baseline | desk-covered / **runtime gap** |
| R23 | ความสามารถและมาตรฐาน PDF ขั้นสูง | [25](findings/25-pdf-capabilities.md), [26](findings/26-pdf-profile-validation.md), [27](findings/27-signature-lifecycle.md) | documented (API) + inferred; กฎหมายไทย unknown | G-DEC + G-RT: profile ที่ต้องการ; PAdES level/OCSP/HSM unknown | desk-covered / gap เปิด |
| R24 | Open-source License, Dependencies, Governance | [05](findings/05-license-inventory.md) | documented (metadata-reviewed) | G-DEC: license โครงการ; transitive notices/image BOM/font hash ยังไม่ตรวจ | desk-covered / gap เปิด |
| R25 | Self-hosting, Packaging, Extension Model | [24](findings/24-deployment-operations.md) | inferred | G-EVID + G-RT: quickstart ไม่เคยพิสูจน์; offline/restore ไม่ทดสอบ; ไม่มี finding เฉพาะ quickstart/ตัวอย่าง | desk-covered (อ่อน) / gap เปิด |

**สรุป:** G-RT ที่กำหนดทิศทาง MVP = R04, R05, R12, R22 (และส่วนของ R13, R10, R08, R11); G-DEC ที่เปลี่ยนรูป MVP = R01, R03, R14, R09, R17/R18/R20/R23, R24; G-EVID = R16, R25, R02 ไม่มี R ใดมีหลักฐาน observed-runtime

## 10. Open inconsistencies (บันทึกไว้ — ไม่ได้แก้ findings/เอกสารอื่น)

เรียงตามผลต่อการตัดสินใจ ตรวจจากการอ่านเอกสารในรอบ T30

| # | พบที่ | ความขัดแย้ง | ผลต่อการตัดสินใจ / ผู้ควรจัดการ |
| --- | --- | --- | --- |
| I-1 | [OpenAPI specimen](../../research/specimens/report-api.openapi.yaml) (`Idempotency-Key` `required: true` ทั้ง sync/async) เทียบ [29 §3 #5](findings/29-mvp-roadmap.md) (sync-only v1 ตัด `IDEMPOTENCY_CONFLICT`) | specimen บังคับ idempotency ทุกโหมด ขณะ 29 เสนอ MVP sync ไม่ใช้ | ต้องตัดสินว่า contract sync จะผ่อนคลายหรือไม่ก่อนใช้ specimen เป็นฐาน M3 (เชื่อมกับ D-11) |
| I-2 | [sources.md](sources.md) | **ไม่มี S95–S99** (มี S01–S94 และ S100–S103 รวม 98 แถว); header ระบุ "S82–S103" และโจทย์ T30 ระบุ "S01–S103 ครบ"; มีแถวซ้ำโดยตั้งใจ: S85/S90, S86/S91, S09/S92, S88/S101, S84/S102 | ช่องว่างเลขลำดับ — ไม่พบข้อความที่อ้าง S95–S99 ในเอกสารที่อ่าน; ควรยืนยันว่าตั้งใจข้าม **(parent บันทึกใน sources.md header แล้วว่าไม่มี S95–S99; ปิดแล้ว)** |
| I-3 | [28 §1.8](findings/28-quality-strategy.md) ติดป้ายหมวด PDF profile เป็น **R15** | ใน [keyword map](REPORT_SYSTEM_RESEARCH_KEYWORDS.md) R15 = Template Lifecycle ส่วน PDF ขั้นสูง = **R23** ([plan §9](../../tasks/plan.md) ก็ map T28 → R15) | เฉพาะการติดป้าย ไม่กระทบข้อสรุป; รายงานนี้ใช้ R23 สำหรับ PDF ขั้นสูง |
| I-4 | [case catalog §3](validation/case-catalog.md) มี A05–A09 | [28 §1.8](findings/28-quality-strategy.md) และ [deferred-runtime §1](validation/deferred-runtime.md) ครอบคลุมเฉพาะ A01–A04 | A05–A09 (bookmarks, merge/split, stamp, stage-order matrix, PDF/A-2b+UA-1 ไทย) ไม่มีแถว traceability ใน 28 — ต้องเพิ่มก่อนใช้เป็น backlog ครบ |
| I-5 | catalog vs [finding 12](findings/12-visual-assets.md) (ตามที่ [28 §1.10](findings/28-quality-strategy.md) บันทึกไว้ และ [deferred-runtime §4](validation/deferred-runtime.md) ว่า "รอ reconcile") | payload QR `REPORT:Q-DEMO-001` vs `INV-2026-001`; Code 128 `PO01-D01` vs `INV-2026-001`; ข้อความไทย D05-THAI vs D05-COPY-01; ID † ที่มีเฉพาะใน findings; ID ชื่อไม่ตรงกัน (D05-COPY↔D05-COPY-01 ฯลฯ) | ยังไม่ reconcile ต้องเลือกชุดเดียวก่อนทำ fixture |
| I-6 | [catalog D04](validation/case-catalog.md) (PO02 empty = decision-open) vs [master-detail specimen](../../research/specimens/master-detail-cases.json)/[11](findings/11-master-detail.md) (0.00) | specimen เป็น assumption ของ fixture ไม่ใช่ policy | ต้องเป็น D-6 ก่อนเชื่อว่า PO02 = 0.00 เป็นพฤติกรรมที่ต้องการ |
| I-7 | [plan §2](../../tasks/plan.md) ("T01–T24 และ source register 81 รายการ"), [plan §10](../../tasks/plan.md) ("T25–T30 ยังไม่มีผล"), [sources.md](sources.md) header ("Checkpoints 1–8"), [CHECKPOINTS_01_02](CHECKPOINTS_01_02.md) ("51 แหล่ง"); [26](findings/26-pdf-profile-validation.md) ลงวันที่ 12 พ.ย. แต่ cite source ที่เปิดอ่าน 13 พ.ย. | ข้อความสถานะ/จำนวนล้าสมัย (ทะเบียนปัจจุบันมี 98 แถว = S01–S94 + S100–S103) | ผู้ดูแลแผนควรอัปเดต; ไม่กระทบ conclusions **(plan §2/§10 และ sources.md header อัปเดตแล้ว; CHECKPOINTS_01_02 "51 แหล่ง" คงไว้เพราะเป็นประวัติ ณ checkpoint นั้น)** |
| I-8 | [feature-traceability](findings/feature-traceability.md) ใช้ capability ID `C01–C42` ซ้ำกับชื่อ Checkpoint `C01–C10` และ use case `A/B/C`; case ID `D01–D08` ซ้ำรูปแบบกับ decision `D-1..D-11` | namespace ชนกัน อาจสับสน | รายงานนี้ใช้ `D-n` (มีขีด) สำหรับ decision และระบุ "Checkpoint C10" เต็ม |

**การตรวจความสอดคล้อง conclusions กับ findings 28/29 (รอบ T30):**
- ลำดับ spike: 28 §3.1 ไม่กำหนดลำดับ SP-A/B/C ชัด (แต่เน้น R04/R05 ก่อน) ส่วน 29 §4.1 ระบุ **SP-B ก่อน แล้ว SP-A, SP-C** — เป็นการขยายความ ไม่ใช่ความขัดแย้ง; รายงานนี้ใช้ลำดับของ 29
- Effort: ผลรวม milestone ใน 29 §4.1 ตรงกับช่วงรวม (≈ 7–14 สัปดาห์) และ (ข)/(ค) = ผลบวกตามที่ระบุ (ดู §6)
- 29 §8 D-1..D-11 ตรงกับเรื่องที่ 28 §3.3 (environment), 28 §1 (D03 overflow, PO02) และ 05/13/14 (license/Designer/template) — ไม่พบความขัดแย้ง
- 28 §5 (สถานะความพร้อม) และ 29 (ไม่มี P0 feasible) สอดคล้องกับ banner ของรายงานนี้
- ไม่พบแถวที่ claim ว่า runtime ผ่านหรือ measured ใน findings 28/29, traceability, validation/*

## 11. ผลตรวจก่อนส่งมอบ (T30)

13 พ.ย. 2026 — ตรวจแบบเบา (observed-static ขอบเขตแคบ ไม่เกี่ยวกับ runtime):

- ลิงก์: เป้าหมาย relative 40 รายการที่ใช้ในเอกสารนี้ resolve จาก `docs/research/` ด้วย `python -I -X utf8` (`os.path.exists`) พบครบทุกไฟล์; ลิงก์ไป `decisions/proposed-decisions.md` และ `README.md` ชี้ไฟล์ที่สร้างพร้อมกันใน T30 ไม่ได้ตรวจ anchor `#` และลิงก์ http
- R01–R25 ครบ 25 แถวใน §9; decisions D-1..D-11 ครบ 11 หัวข้อในไฟล์ proposed-decisions
- ข้อความที่เกี่ยวกับ runtime: อ่านทบทวนทั้งเอกสารแล้ว คำว่าผ่าน/feasible/measured/p95 และตัวเลข 1.67/20.83/41.67 ปรากฏเฉพาะในรูปปฏิเสธหรือป้ายสมมติฐาน
- ข้อจำกัด: claim เทียบกับ findings และ source register เท่านั้น ไม่ได้เปิด URL ภายนอกซ้ำ; ตัวเลข static ใน §2.4 ยกมาจาก findings ไม่ได้รันซ้ำ; ไม่ได้แก้ findings/sources/plan/todo

## 12. ขอบเขตและข้อจำกัดของรายงานนี้

- สังเคราะห์จากเอกสารใน repository เท่านั้น ผู้เขียน findings ระบุว่าเปิดอ่านแหล่งหลักแล้ว ณ 12–13 พ.ย. 2026
- ไม่มีผลทดลองจากผู้ใช้จริง ไม่มี PDF ไม่มี validator report ไม่มี security probe ไม่มี benchmark
- ไม่ใช่คำแนะนำทางกฎหมาย (license, ลายเซ็น, e-tax) และไม่ใช่คำแนะนำภาษี/บัญชี (อัตรา 7% และ rounding ใน fixture เป็นข้อมูลทดสอบ)
- ข้อเสนอทั้งหมดเป็น "ข้อเสนอแบบมีเงื่อนไข" ไม่ใช่ accepted ADR ดู [proposed decisions](decisions/proposed-decisions.md)
