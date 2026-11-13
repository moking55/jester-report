# Proposed Decisions D-1..D-11 (ยังไม่ใช่ accepted ADR)

วันที่: 13 พฤศจิกายน 2026  
สถานะ: **ข้อเสนอแบบมีเงื่อนไขจาก desk research** — ไม่ใช่ accepted ADR ไม่ใช่ requirements ที่อนุมัติ และไม่ใช่ผลทดสอบ ไม่มี local/remote runtime test และไม่มี measured benchmark  
ต้นทาง: [29 §8](../findings/29-mvp-roadmap.md) (D-1..D-11) ขยายความด้วย [28 §3.3](../findings/28-quality-strategy.md), [feature traceability](../findings/feature-traceability.md) และ findings ที่อ้างในแต่ละข้อ  
คู่กับ: [รายงาน Research เต็ม](../REPORT_SYSTEM_FULL_RESEARCH.md) · [README](../README.md)

> **ผู้เขียนไม่ได้เลือก license, Designer, persona หรือ architecture แทนผู้ใช้** คอลัมน์ "Recommendation" เป็นเงื่อนไข "ถ้า X → Y" ที่มาจากหลักฐาน ไม่ใช่การตัดสิน; ทุกข้อที่ระบุ "ผู้ใช้ต้องเลือก" รอคำตอบจากผู้ใช้ในแชต และ **การรอไม่ถือเป็นการอนุมัติ**
>
> Desk research complete ไม่เท่ากับ Runtime validated และไม่เท่ากับ Implementation ready

**วิธีอ่าน:** blast radius/reversal ที่มาจาก 29 ระบุว่า "(29)"; ส่วนที่ผู้เขียนเพิ่มจากการอ่าน findings ติดป้าย **inferred** ชื่อ `D-n` (มีขีด) คือ decision ต่างจาก case ID `D01–D08` ใน [case catalog](../validation/case-catalog.md) ที่เป็นกรณีทดสอบ

**หมายเหตุช่องว่าง:** 29 §8 ไม่มี decision ID แยกสำหรับ **canonical template format** (R03; [13](../findings/13-template-options.md)) — ผูกกับ D-1 (persona) และเลือกใน M1 หลังเห็นผล M0; ไม่ได้เพิ่มเป็น D-12 เพื่อไม่เกินขอบเขต 11 ข้อที่กำหนด

## ลำดับการตัดสินใจที่เสนอ

| ลำดับ | Decision | ต้องตอบก่อนอะไร | เหตุผล |
| --- | --- | --- | --- |
| 1 | **D-4** environment สำหรับ spike | M0 และวงพัฒนา/preview รายวัน | ไม่มี environment ที่รัน Gotenberg → R04/R05/R12 ไม่ปิด และ CLI/preview ทำไม่ได้ ([29 §3 #6](../findings/29-mvp-roadmap.md)) |
| 1 | **D-1** persona หลัก | การลงทุน Designer / canonical template format / เลือก (ก)(ข)(ค) | กำหนด effort ≈7–14 vs ≈15–34 vs ≈8–16 สัปดาห์ (inferred) — M0 ทำได้ก่อนโดยไม่ต้องรอ |
| 2 | D-9 trust model | เลือก template engine (M1) | untrusted ต้อง sandbox + SEC04 |
| 2 | D-2 รูปแบบแจกจ่าย | M3 (server/CLI) | ผูก auth/jobs/ops |
| 3 | D-5, D-6, D-7 | หลังผล M0 / ก่อน M2 | policy ที่ M0 ให้ข้อมูล |
| 3 | D-8 rounding/calendar | M1 (formatter, Decimal) | กระทบยอดเงิน |
| 4 | D-10 provenance | M1 | ต่ำ |
| 5 | **D-3** license | **ก่อนรับ contribution / ก่อน publish (M4)** — ไม่กั้น M0–M3 | เปลี่ยนภายหลังยากเมื่อมีผู้ร่วมพัฒนา |
| 5 | D-11 ขอบเขตที่เหลือ | เมื่อมีข้อมูลผู้ใช้ | แต่ละข้อเป็น milestone แยก |

---

## D-1 — Persona หลัก (ผู้สร้างรายงาน)

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่** (ก่อนลงทุน Designer, เลือก canonical template format หรือผูกแนวทาง (ก)/(ข)/(ค)); M0 ไม่ขึ้นกับข้อนี้
- **Options:** (1) developer/integrator · (2) business author ที่ไม่เขียนโค้ด · (3) ทั้งสองเป็นระยะ
- **Rationale:** [T01 §2, §6](../findings/01-product-brief.md) ยังไม่มีหลักฐานว่ากลุ่มใดเป็นกลุ่มหลัก; keyword R14 ระบุว่าถ้าเป็นฝ่ายธุรกิจ Designer อาจเลื่อนเป็น P0; ต้นทุนต่างกันมาก ([29 §4.4](../findings/29-mvp-roadmap.md)): (ก) ≈7–14, (ข) ≈15–34 (ความเชื่อมั่นต่ำสุด), (ค) ≈8–16 สัปดาห์ก่อน M5 — ทั้งหมด inferred ไม่ใช่ผลวัด
- **Blast radius (29):** สูง — กำหนดว่ามี Designer (R14) หรือไม่; เปลี่ยนภายหลังแพง แต่ (ค) ลดต้นทุนเปลี่ยน
- **Reversal path (29 + inferred):** ถอย (ข)→(ก) ได้ถ้า schema เป็นแหล่งความจริง ไม่ใช่ editor state; ถ้า editor เก็บ state เอง (เช่น GrapesJS project data) ต้อง export/แปลง — **ยังไม่พิสูจน์** ([29 §4.2](../findings/29-mvp-roadmap.md))
- **Recommendation (conditional):** ถ้า persona เขียนโค้ดได้ → (ก) หรือ (ค); ถ้าเป็นฝ่ายธุรกิจที่ไม่เขียนโค้ด → (ข) แต่ห้ามลงทุน Designer ก่อน M0 ผ่านเงื่อนไข; ถ้ายังไม่ตอบ → ทำ M0 และเตรียม (ค)
- **สิ่งที่ยังไม่ทราบ:** ไม่มีผู้ใช้จริง/เอกสารจริงมายืนยัน; usability/a11y ของ Designer ไม่เคยทดสอบ ([14](../findings/14-designer-options.md))

## D-2 — รูปแบบแจกจ่าย

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่** (ก่อน M3; shared server ต้องเลือกก่อนลงทุน auth/jobs/tenant)
- **Options:** (1) library + CLI · (2) library + thin HTTP server (localhost/private) · (3) shared report server
- **Rationale:** [24](../findings/24-deployment-operations.md) (local/single-host, shared, external managed), [04](../findings/04-threat-model.md) (Gotenberg ไม่บังคับ auth by default), [20](../findings/20-access-data-lifecycle.md) (shared ต้อง object-level authz)
- **Blast radius (29):** กลาง–สูง — ผูก auth/jobs/ops
- **Reversal path (29 + inferred):** ถอยจาก server เป็น library ง่ายถ้า core แยกจาก HTTP layer; เปิดเป็น shared ภายหลังต้องผ่าน D07/SEC และเพิ่ม auth/tenant/durable job
- **Recommendation (conditional, 29):** ถ้า single-user/ระบบภายในองค์กร → library + thin server (localhost); ถ้า shared → เพิ่ม D07/auth ก่อนเปิด
- **ข้อควรระวัง (inferred):** OpenAPI specimen ยังบังคับ `Idempotency-Key` ทุกโหมด ขัดกับ MVP sync-only (I-1 ใน [รายงาน §10](../REPORT_SYSTEM_FULL_RESEARCH.md)) — ต้องตัดสินคู่กับ D-11

## D-3 — License โครงการ

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่ แต่เฉพาะก่อนรับ contribution/เผยแพร่ (M4)** ไม่กั้น M0–M3
- **Options ([05 §3](../findings/05-license-inventory.md)):** MIT · Apache-2.0 · AGPL-3.0 · อื่นที่ OSI รับรอง
- **Rationale:** ต้องเลือกตามเป้าหมายการนำไปใช้และการมีส่วนร่วม ไม่เลือกจาก Engine license (Gotenberg MIT) เพียงตัวเดียว; MIT = permissive สั้น ไม่มี patent grant แบบ Apache; Apache-2.0 = patent grant/termination + notices; AGPL-3.0 = copyleft รวม section 13 สำหรับ network use ของ modified version (ไม่เหมารวมว่าข้อมูล PDF ต้องเปิด) — ทั้งหมด **ไม่ใช่คำแนะนำทางกฎหมาย**
- **Blast radius (29):** สูง/ย้อนยาก — เปลี่ยนเมื่อมี contributions แล้วอาจต้องจัดการสิทธิ์ผู้ร่วมพัฒนา ([05 §3](../findings/05-license-inventory.md))
- **Reversal path:** ก่อนมี contribution เปลี่ยนได้ง่าย; หลังมี contribution ต้องขอสิทธิ์จากผู้ร่วมพัฒนา (inferred จาก 05) จึงควรตั้งนโยบายก่อนเปิดรับโค้ด รวมเลือก DCO หรือ CLA ([S48](../sources.md))
- **Recommendation: ไม่เสนอ** (ตามที่ 29 กำหนด) — เป็นสิทธิ์ของผู้ใช้
- **ข้อจำกัดที่ไม่ขึ้นกับตัวเลือก (documented/metadata-reviewed):** ห้าม reuse Carbone CCL (source-available มีข้อจำกัดแข่งขัน), Jasper Studio CE (binary-use ไม่แจก source), ไม่ embed JasperReports (LGPL v3 และไม่จำเป็น); ต้อง pin font binary+hash+OFL notice, ตรวจ image BOM/transitive notices ก่อนแจกจ่าย ([29 §4.1](../findings/29-mvp-roadmap.md))

## D-4 — Runtime environment สำหรับ spike M0

- **ผู้ใช้เลือกแล้ว (13 พ.ย. 2026, ในแชต): E2 เครื่อง/VM อื่น** — เครื่อง Ubuntu 24.04.5 x86_64, 4 vCPU, 4 GB RAM (Proxmox VM) ติดตั้ง docker.io 29.1.3 และรัน container `gotenberg` จาก `gotenberg/gotenberg:9.4.1` digest `sha256:7d790c081a944f4d30cacb59a2cdccbe71569532af691b93c36551f6a877b4fc` จำกัด 2 GB/2 CPU, bind `127.0.0.1:3000`, args `--chromium-auto-start=true --chromium-start-timeout=60s`; `/health` ตอบ chromium/libreoffice up (13 พ.ย. 2026) — spike M0 รันแล้ว (ดู [spikes/m0/REPORT.md](../../../spikes/m0/REPORT.md)); ตั้งแต่ 13 พ.ย. 2026 container ใช้ image `jester/gotenberg:9.4.1-th1` (`sha256:ab7478a2…`) ที่ build บน VM ถอนออก: `docker rm -f gotenberg && apt remove docker.io`
- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่ — เป็นประตูแรก** ไม่เลือก = R04/R05/R12 ไม่ปิด และวงพัฒนา/preview รายวันทำไม่ได้
- **Options ([28 §3.3](../findings/28-quality-strategy.md)):** E1 CI service container (Linux runner, [S100](../sources.md)) · E2 เครื่อง/VM อื่นที่ผู้ใช้เข้าถึง · E3 เครื่องผู้ใช้โดยไม่ใช้ Docker (วิธีรัน Gotenberg แบบไม่ใช้ container = unknown ผลไม่ใช่หลักฐาน Gotenberg) · E4 เลื่อนไปก่อน
- **Rationale:** 28 ตั้งใจ **ไม่จัดอันดับ** ตัวเลือกใด เพราะขึ้นกับข้อมูลที่มีแต่ผู้ใช้ (ความยินยอมส่ง fixture ออกนอกเครื่อง, เครื่องที่มี, งบ); ปัจจุบันโปรเจกต์ยังไม่ใช่ git repository (ข้อจำกัดของ E1)
- **Blast radius (29):** ไม่ทำ = R04/R05/R12 ไม่ปิดก่อนลงทุน ทุกข้อเสนอ MVP เป็นแบบมีเงื่อนไข
- **Reversal path (inferred):** เลือกแล้วเปลี่ยนได้ (ผลผูกกับ image digest/fonts ที่บันทึกต่อรอบ จึงต้องเก็บ baseline ใหม่เมื่อย้าย environment — [28 §2.2](../findings/28-quality-strategy.md)); E4 → เลือกภายหลังได้ แต่เลื่อนปฏิทินและทิ้งความเสี่ยง
- **Recommendation (conditional, 29 §8):** ถ้ายอมให้ fixture สังเคราะห์ออกนอกเครื่องและมี repo/CI → E1; ถ้ามีเครื่องอื่น → E2; E4 ได้ แต่ทุกข้อเสนอเป็นแบบมีเงื่อนไขและวงพัฒนารายวันทำไม่ได้ — **ผู้เขียนไม่ได้เลือกและไม่ได้ provision**

## D-5 — Overflow policy (แถวสูงเกินหน้า)

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่ — หลังผล SP-C ใน M0 และก่อน M2**
- **Options:** (1) reject (2) split ที่ชั้นแอปก่อน render (3) truncate + สัญญาณชัดเจน
- **Rationale:** CSS `break-inside: avoid` ไม่ใช่คำรับประกันว่าแถวสูงเกินหน้าจะไม่ split ([08](../findings/08-pagination.md), [S16](../sources.md)); ข้อความหายเงียบ = ผิดความหมายธุรกิจ ([28 D03](../findings/28-quality-strategy.md)); ถ้า SP-C พบข้อความหาย → ต้อง reject/แบ่ง row ที่ชั้นแอป
- **Blast radius (29 + inferred):** กระทบ M2 และ data contract (ความยาวฟิลด์/validation) และ UX ผู้เขียนรายงาน
- **Reversal path (inferred):** ผ่อนจาก reject→split ภายหลังทำได้ (เพิ่ม capability); เข้มจาก truncate→reject ทำให้ข้อมูลที่เคยรับถูกปฏิเสธ (breaking)
- **Recommendation (29):** ตัดสินหลัง SP-C — ยังไม่เสนอก่อนมีผล

## D-6 — Empty-detail / no-data policy (PO02, D02-EMPTY)

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่ — ก่อน M2** (ไม่ถึงขั้นลงทุนสูง แต่กระทบ validator)
- **Options:** (1) อนุญาตเอกสารว่าง/แสดง no-data state (2) error (3) ข้ามกลุ่ม/ข้าม master ที่ไม่มี detail
- **Rationale:** [11](../findings/11-master-detail.md) ระบุ `details: []` = 0.00 ใน fixture ไม่ยืนยันว่าอนุญาต publish เอกสารธุรกิจจริง; catalog ระบุ PO02 empty policy = decision-open; D02-EMPTY (P0) ต้องไม่แสดงยอดค้างจากรอบก่อน ([28 §1.1](../findings/28-quality-strategy.md)); มี open inconsistency I-6 (specimen 0.00 vs decision-open)
- **Blast radius (29):** กระทบ validator และผลลัพธ์ของรายงาน
- **Reversal path (inferred):** เปลี่ยน policy ได้โดยแก้ validator แต่รายงานที่เคย publish อาจเปลี่ยนพฤติกรรม ควรผูกกับ template version
- **Recommendation (29):** ตัดสินก่อน M2 — ยังไม่เสนอ

## D-7 — ฟอนต์ไทย

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ไม่ใช่ข้อบังคับ — แต่ต้องเลือกก่อน pin ฟอนต์/baseline ใน M0–M1**
- **Options:** Sarabun · Noto Sans Thai · อื่น (ทั้งสองแรกเป็น SIL OFL 1.1 ตาม metadata)
- **Rationale:** [09](../findings/09-thai-fonts.md), [05](../findings/05-license-inventory.md): Sarabun metadata ครอบคลุม Thai/Latin; binary/version/hash ยังไม่ pin; glyph coverage, shaping, การฝังใน PDF และการใช้ใน header/footer ยังไม่ทดสอบ; การเปลี่ยนฟอนต์เปลี่ยนความกว้าง/จำนวนหน้า
- **Blast radius (29):** เปลี่ยนฟอนต์เปลี่ยน page count และ baseline ทั้งหมด
- **Reversal path (inferred):** เปลี่ยนได้ แต่ต้องเก็บ baseline ใหม่และอนุมัติใหม่ ([28 §2.2](../findings/28-quality-strategy.md): เปลี่ยน hash = baseline ใหม่ ไม่ใช่ fail อัตโนมัติ)
- **Recommendation (29):** Sarabun เป็นตัวตั้ง Noto Sans Thai เป็นตัวสำรอง (ตามที่ผู้ใช้ตั้งต้น); pin binary+hash ใน M0/M1 — OFL ไม่ใช่ legal approval

## D-8 — Rounding และ calendar default

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ธุรกิจต้องยืนยันก่อน M1** (ไม่ใช่ลงทุนสูง แต่กระทบความถูกต้องของยอดเงิน)
- **Options:** rounding: HALF_UP / 2 ตำแหน่ง (assumption ปัจจุบัน) vs นโยบายธุรกิจ/สกุลเงินอื่น; calendar: พ.ศ. / ค.ศ.; timezone default
- **Rationale:** [10](../findings/10-grouping-totals.md) ระบุว่า HALF_UP/2 ตำแหน่ง/ปัดรายแถวก่อนรวมเป็น **assumption** ไม่ใช่กฎภาษี; [09 L01–L04](../findings/09-thai-fonts.md) และ D05-LOCALE ต้องระบุ calendar/timezone ใน contract ไม่พึ่ง default เครื่อง
- **Blast radius (29):** กระทบยอดเงินและวันที่ในเอกสารทางการ
- **Reversal path (inferred):** เปลี่ยนค่าที่ชั้นแอปได้ แต่เอกสารที่ออกไปแล้วไม่ย้อนเปลี่ยน; ควรผูกกับ template/contract version
- **Recommendation (29):** ธุรกิจยืนยัน — ตอนนี้เป็น assumption; ใช้ Decimal ไม่ใช้ float; format ที่ชั้นแอป

## D-9 — Trust model ของ template author

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่ — ก่อนเลือก template engine (M1)**
- **Options:** (1) trusted-author เท่านั้น (2) untrusted/ภายนอก (ต้อง sandbox)
- **Rationale:** [04](../findings/04-threat-model.md), [22 SEC04](../findings/22-security-review.md): logic-less/escaping ไม่ใช่ sandbox ([S41](../sources.md), [S50](../sources.md)); การจำกัด JavaScript ของ browser ไม่แก้ SSTI ในชั้นแอป; SEC04 = P0 ก่อน untrusted template (เสนอ)
- **Blast radius (29):** untrusted ย้ายเป็นงานใหญ่ (sandbox + SEC04 + resource limits + author permissions)
- **Reversal path (inferred):** trusted→untrusted ภายหลังต้องออกแบบ sandbox เพิ่ม (ไม่ใช่เพียงเปลี่ยน flag); untrusted→trusted ง่ายกว่า (ผ่อน)
- **Recommendation (conditional, 29):** ถ้า trusted-only → v1 ได้; ถ้า untrusted → ต้อง sandbox + SEC04 ก่อน — ยังไม่เลือก template engine ใด (Handlebars เป็นแค่ candidate)

## D-10 — Provenance ขั้นต่ำ

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ไม่ใช่** (ต้นทุนต่ำ แต่ keyword §3 จัดเป็น P0 แบบพื้นฐาน จึงไม่ควรปล่อยเงียบ)
- **Options:** (1) hash ใน response/metadata (2) ตารางประวัติ (3) later
- **Rationale:** [15](../findings/15-authoring-lifecycle.md), [24](../findings/24-deployment-operations.md): ระบุได้ว่า PDF ใช้ template และ renderer รุ่นใด; ถ้าเลือก (3) ต้องเขียนเหตุผลให้ชัด
- **Blast radius (29):** ต่ำ
- **Reversal path (inferred):** เพิ่ม metadata ภายหลังทำได้ แต่เอกสารที่ออกไปก่อนหน้าไม่มี provenance ย้อนหลัง
- **Recommendation (29):** minimal: template id/version/hash + renderer image digest (เมื่อทราบ) + font hash

## D-11 — ขอบเขตที่เหลือ (workload/async, connector, PDF profile, signature, distribution)

- **ผู้ใช้ต้องเลือกก่อนลงทุนสูง: ใช่ — รายข้อ เมื่อต้องการข้อนั้น** (ตอนนี้ตั้งเป็น `later`/`out` ใน MVP)
- **Options (แต่ละข้อแยก):**
  - workload/async: sync-only · async + durable job + idempotency + artifact store ([19](../findings/19-job-processing.md), [18](../findings/18-api-contract.md))
  - data connector: JSON จาก caller · REST · SQL ([17](../findings/17-data-source-options.md))
  - PDF profile: PDF ธรรมดา · PDF/A · PDF/UA · Factur-X ([25](../findings/25-pdf-capabilities.md), [26](../findings/26-pdf-profile-validation.md))
  - signature: ไม่มี · cryptographic (custody A–D, PAdES ระดับใด, CA/TSA) ([27](../findings/27-signature-lifecycle.md))
  - distribution: download ที่ผ่าน authz · signed URL · email/schedule/bursting ([21](../findings/21-distribution-options.md))
- **Rationale:** แต่ละข้อไม่มี use case ยืนยันจากผู้ใช้; D08 เป็น P0 เมื่อยืนยัน workload; PAdES ระดับ/OCSP/HSM = unknown; กฎหมายไทย = unknown ไม่ใช่คำแนะนำทางกฎหมาย
- **Blast radius (29):** แต่ละข้อเป็น milestone แยก; async/shared/signature เพิ่มงาน authz, storage, key custody และ egress (TSA = external egress; ต้อง config ฝั่งเซิร์ฟเวอร์ ไม่รับจากผู้ใช้)
- **Reversal path (inferred):** เพิ่ม capability ภายหลังทำได้ถ้า core แยกจากส่วนเหล่านี้; เปลี่ยนจาก sync เป็น async กระทบ API contract; ตัดสินใจเรื่อง Idempotency-Key ของโหมด sync ควรทำพร้อมกัน (I-1)
- **Recommendation (29):** รอข้อมูลผู้ใช้; ตั้งเป็น `later`/`out` ในตอนนี้

---

## สรุปข้อที่ผู้ใช้ต้องเลือกก่อนลงทุนสูง

| Decision | ต้องเลือกก่อน | ถ้ายังไม่เลือก |
| --- | --- | --- |
| D-4 | M0 / วงพัฒนา | ทุกข้อเสนอคงเป็นแบบมีเงื่อนไข ไม่ปิด R04/R05/R12 |
| D-1 | ลงทุน Designer / canonical template format | ทำ M0 และเตรียม (ค) |
| D-9 | เลือก template engine | v1 จำกัด trusted-author |
| D-2 | M3 | ใช้ library/CLI ได้ก่อน |
| D-5, D-6 | M2 | ไม่เริ่ม M2 policy-dependent |
| D-3 | รับ contribution / publish | ไม่ publish; ไม่เพิ่ม LICENSE |
| D-7, D-8, D-10, D-11 | ตามตารางลำดับด้านบน | ใช้ค่า assumption/`later` ที่ระบุ |

*ข้อจำกัด:* เอกสารนี้ไม่ได้เปิด URL ภายนอกซ้ำ; ตัวเลข effort ทั้งหมดเป็น inferred estimate ความเชื่อมั่นต่ำจาก [29](../findings/29-mvp-roadmap.md) ไม่ใช่ผลวัด
