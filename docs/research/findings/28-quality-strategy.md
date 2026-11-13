# T28 — Quality Strategy และช่องว่าง Runtime

วันที่: 13 พฤศจิกายน 2026  
สถานะ: **strategy/validation design เท่านั้น** ไม่มี Gotenberg runtime, PDF, validator report หรือ benchmark ที่รันจริง ทุกวิธีตรวจในเอกสารนี้เป็นข้อเสนอ (inferred) ไม่ใช่ผลวัด  
อินพุต: [protocol](../validation/protocol.md), [case catalog](../validation/case-catalog.md), [deferred runtime](../validation/deferred-runtime.md), findings [08](08-pagination.md), [09](09-thai-fonts.md), [10](10-grouping-totals.md), [11](11-master-detail.md), [12](12-visual-assets.md), [22](22-security-review.md), [23](23-performance-scenarios.md), [25](25-pdf-capabilities.md), [26](26-pdf-profile-validation.md), specimens [grouped-cases.json](../../../research/specimens/grouped-cases.json), [master-detail-cases.json](../../../research/specimens/master-detail-cases.json)

> **Desk research complete ไม่เท่ากับ runtime validated และไม่เท่ากับ implementation ready** (ดู §5)

## 1. Traceability ของ validation cases

กติกาอ่านตาราง:
- Priority ของ D01–D08 มาจาก case catalog ตรง ๆ; กรณีย่อยที่ไม่มี priority ของตนเองใช้ค่าของ parent ส่วนที่ผมเสนอเองใส่ **(เสนอ)** ให้ผู้ใช้/T29 ทบทวน
- สถานะ runtime ทุกแถว = **deferred/not-tested** ยกเว้นคอลัมน์ "static" ที่ระบุผลตรวจเลขแบบเบา (§1.9)
- "ผลต่อ MVP ถ้าไม่ผ่าน" เป็นการอนุมานผลกระทบ ไม่ใช่ความเสี่ยงที่วัดได้
- Case ID ใช้ตามที่มีอยู่ ณ ตอนอ่าน ID ที่มีเฉพาะใน findings (ไม่อยู่ใน catalog) ทำเครื่องหมาย † และสรุปความต่างใน §1.10

### 1.1 Pagination / ตาราง / header-footer (R04, R05)

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| D01 | Quote Q-DEMO-001: QL01–QL02 ครบอย่างละครั้ง, subtotal 3100.70, grand 3210.00, footer ไม่ทับ body | P0 | deferred | ไม่มีรายงานอ้างอิงหน้าเดียวที่เชื่อถือได้ ต้องทบทวน template/margin model ทั้งหมด | catalog D01; [01](01-product-brief.md); [08](08-pagination.md) |
| D02 | 0/1/50/500 แถว, portrait/landscape: ไม่มี ID หาย/ซ้ำ ไม่ทับ footer | P0 | deferred | รายงานตารางยาว (หัวใจ MVP) ยังรับรองไม่ได้ ต้องเลือกทางเลี่ยง เช่น แบ่งหน้าในแอปเอง | catalog D02; [08](08-pagination.md) |
| D02-EMPTY | 0 แถว → no-data state ตาม policy ไม่มียอดค้างจากรอบก่อน | P0 | deferred | แสดงตารางว่าง/ยอดผิดในรายงานจริง; ต้องมี empty-state policy ก่อน | catalog; [08](08-pagination.md) |
| D02-ONE † | 1 แถว, portrait/landscape: ID ปรากฏครั้งเดียว orientation/margins ถูก | P0 | deferred | ผลเดียวกับ D02 (กรณีขอบ) | [08](08-pagination.md) |
| D02-IDS | 50/500 unique IDs ครบหนึ่งครั้ง ไม่ overlap; จุดเปลี่ยนหน้าตรวจจากภาพ | P0 | deferred | ข้อมูลหาย/ซ้ำเงียบ = ผิดความหมายเชิงธุรกิจ; ต้องมี row-ID reconciliation เป็น gate | catalog; [08](08-pagination.md) |
| D02-PAPER | A4 portrait/landscape × 0/1/50/500; header/footer, page count, หัวตารางซ้ำ ไม่เดาจำนวนหน้า | P0 | deferred | ตัด landscape หรือหัวตารางซ้ำออกจาก MVP หรือเปลี่ยน approach | catalog §4 |
| D02-HEADER-REPEAT † (เสนอ) | หัวตารางซ้ำทุกหน้าและไม่ทับข้อมูล (ตาม issue [#392](https://github.com/gotenberg/gotenberg/issues/392) ที่ยังไม่ reproduce) | P0 | deferred | รายงานหลายหน้าอ่านยาก/ตีความผิด; ถ้า CSS `thead` ไม่พอต้องมี workaround | [08](08-pagination.md); S58 |
| D03 | แถวสูงเกินหน้า: เนื้อหาครบ, split/overflow ตาม policy (decision-open) | P0 | deferred | policy ไม่ถูกเลือกและยืนยัน → อาจตัดข้อมูลเงียบ; ต้องเลือก reject/split/truncate-พร้อมสัญญาณ | catalog D03; [08](08-pagination.md) |
| D03-OVERFLOW / D03-OVERSIZE | ไม่มีข้อความหาย แม้แถวสูงเกินพื้นที่พิมพ์ | P0 | deferred | เช่นเดียวกับ D03 | catalog |
| D05-HEADER | header/footer: style/font/image แยกจาก body ถูกต้อง ไม่ทับ/ตัด | P0 | deferred | ถ้าไม่ผ่านต้องย้ายข้อมูลสำคัญออกจาก header/footer หรือเปลี่ยนวิธีฝังฟอนต์/ภาพ | catalog; [08](08-pagination.md); [09](09-thai-fonts.md) |

### 1.2 ภาษาไทย / fonts / locale (R12)

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| D05 | ไทย/อังกฤษผสม วรรณยุกต์ไม่ถูกตัด ค้นข้อความได้; fallback/error ชัดเมื่อฟอนต์หาย | P0 | deferred | รายงานภาษาไทยใช้งานจริงไม่ได้ → ไม่ผ่านเงื่อนไขหลักของผลิตภัณฑ์ | catalog; [09](09-thai-fonts.md) |
| D05-THAI | `บริษัท ตัวอย่าง จำกัด` ฯลฯ: ภาพวรรณยุกต์/ตัดคำ/copy-search | P0 | deferred | เช่น D05 | catalog §4 |
| D05-COPY | expected strings copy/search ได้ หรือมี limitation บันทึก | P0 | deferred | ผู้ใช้ค้น/คัดลอกไม่ได้; ถ้าเป็น limitation ต้องแจ้งใน spec | catalog |
| D05-COPY-01 † | `บริษัท ทดสอบ จำกัด เลขที่ ๑๒๓/๔` มีสระ/วรรณยุกต์ครบ | P0 | deferred | เช่น D05 | [09](09-thai-fonts.md) |
| D05-WRAP-02 † | `กรุงเทพมหานครประเทศไทยรายงานประจำเดือน` ตัดบรรทัดไม่หาย/ซ้อน | P0 | deferred | ที่อยู่ยาวใน cell/ใบเสนอราคาอ่านไม่ได้; ต้องกำหนด wrap policy | [09](09-thai-fonts.md); S52 |
| D05-MIX-03 † | `Invoice INV-2026-001 ยอดสุทธิ 1,234.50 บาท` ครบและลำดับถูก | P0 | deferred | ตัวเลขเงินปนไทยอ่านผิด | [09](09-thai-fonts.md) |
| D05-FALLBACK-04 † | ฟอนต์หาย/สัญลักษณ์นอก coverage → fallback หรือ error ตาม policy | P0 | deferred | fallback เงียบทำให้ layout/page count เปลี่ยนโดยไม่รู้ตัว | [09](09-thai-fonts.md) |
| D05-HEADER-05 † | ชื่อบริษัทไทย + เลขหน้าใน header/footer ไม่ทับ body ทุกหน้า | P0 | deferred | เช่น D05-HEADER | [09](09-thai-fonts.md) |
| D05-LOCALE | 2026-11-12, Asia/Bangkok, th-TH: ต้องระบุ calendar policy ไม่พึ่ง default เครื่อง | P0 | deferred | ปี พ.ศ./ค.ศ. ผิดบนเอกสารทางการ; ต้องกำหนดใน contract | catalog; [09](09-thai-fonts.md) |
| L01 † | `th-TH-u-ca-buddhist` → พ.ศ. 2569 (ถ้ากำหนด) | P1 (เสนอ) | deferred | ต้องเลือกวิธี format วันที่ (เซิร์ฟเวอร์เทียบ client) | [09](09-thai-fonts.md) |
| L02 † | `th-TH-u-ca-gregory` → ค.ศ. 2026 | P1 (เสนอ) | deferred | เช่น L01 | [09](09-thai-fonts.md) |
| L03 † | 1234.50 THB ใน th-TH: ค่า/สกุลถูก รูปแบบตาม contract | P1 (เสนอ) | deferred | รูปแบบเงินไม่สม่ำเสมอ; ไม่กระทบค่าที่คำนวณถ้า format ที่ชั้นแสดงผล | [09](09-thai-fonts.md) |
| L04 † | timestamp ใกล้เที่ยงคืน + timezone ชัด: วันที่ตรง timezone ที่เลือก | P1 (เสนอ) | deferred | วันที่เอกสารเพี้ยนหนึ่งวัน; ต้องฝัง timezone ใน input | [09](09-thai-fonts.md) |

### 1.3 ยอดรวม / grouping (R08, R10)

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| D01-NUM | subtotal 3100.70 / net 3000.00 / 7% = 210.00 / grand 3210.00 (fixture ไม่ใช่คำแนะนำภาษี) | P0 | static-checked (§1.9); PDF deferred | ยอดบน PDF ไม่ตรง → รายงานการเงินใช้ไม่ได้ | catalog; [01](01-product-brief.md) |
| D04 | North 2000.00, South 400.00, grand 2400.00 | P0 | static-checked; PDF deferred | grouped report ที่แสดงใน PDF ไม่รับรอง | catalog; [10](10-grouping-totals.md) |
| D04-SCOPE | group subtotal แยกจาก page subtotal; ห้ามเดาจากจำนวนแถว | P0 | deferred | page subtotal ต้องตัดออกจาก MVP หรือคำนวณหลัง layout จริง (ต้องมีกลไกที่ยังไม่มีหลักฐาน) | catalog; [10](10-grouping-totals.md) |
| `sales-basic` / `empty-dataset` / `rounding` | ตาม [grouped-cases.json](../../../research/specimens/grouped-cases.json) (rounding: 1.01 + -0.01 = 1.00 ตาม assumption HALF_UP) | P0 (ตาม D04) | static-checked; PDF deferred | rounding policy ยังเป็น assumption ที่ธุรกิจต้องยืนยัน | [10](10-grouping-totals.md) |
| `null-amount` / `missing-group` / `duplicate-id` | validation error `invalid_amount` / `invalid_group` / `duplicate_id` | P0 (ตาม D04) | static-checked; implementation ยังไม่มี | ไม่มี validator → ยอดผิดเงียบ | [10](10-grouping-totals.md) |

### 1.4 Master-detail (R08, R10)

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| D04 (PO) | PO01 350.00, PO02 0.00 (policy empty = decision-open ใน catalog), grand 350.00 | P0 | static-checked; PDF deferred | master-detail ตัดออกจาก MVP หรือลดเหลือ repeated section ที่ไม่มี semantics ของ subreport | catalog; [11](11-master-detail.md) |
| D04-PARENT | D01/D02 ของ PO01 ไม่ย้ายเข้า PO02; ระบุ component version | P0 | deferred (static อ้างอิง `orphan-detail`) | ข้อมูลผิดพ่อ-ลูกปนกัน | catalog; [11](11-master-detail.md) |
| `negative-adjustment` / `long-detail` | -10.00 / 5.00; `long-detail` ยังไม่ยืนยันว่าข้ามหน้า | P0 (ตาม D04) | static-checked (ตัวเลข); long-detail layout deferred | เช่น D03 สำหรับ long-detail | [11](11-master-detail.md) |
| `orphan-detail` / `null-details` / `missing-component` | error `orphan_detail` / `invalid_details` / `missing_component` | P0 (ตาม D04) | static-checked; implementation ยังไม่มี | ไม่มี component version pin → render ด้วย component ผิดรุ่นเงียบ | [11](11-master-detail.md) |

### 1.5 Assets / readiness / QR / barcode (R11, R13)

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| D06 | ตามสัญญา readiness หรือ error; ไม่ปล่อยเอกสารไม่ครบเงียบ | P0 | deferred | ต้องมี fail policy + gate ก่อนรับงาน asset ใด ๆ | catalog; [12](12-visual-assets.md) |
| D06-MISSING | HTTP failure / blocked / timeout / readiness failure แยก policy | P0 | deferred | โลโก้/ภาพหายเงียบใน PDF ที่ได้ HTTP 200 | catalog |
| D06-MISSING-HTTP † / -BLOCKED † / -TLS † | แจ้ง incomplete/fail ตาม policy ทีละสาเหตุ (`failOnResourceHttpStatusCodes` ≠ `failOnResourceLoadingFailed`) | P0 | deferred | ต้องเปิด failOn ทั้งสองทางและตรวจ timeout/cert แยก | [12](12-visual-assets.md) |
| D06-READY | ภาพ 404/network/timeout/cert และ chart ช้า → fail/warn ตาม policy | P0 | deferred | เช่น D06 | catalog §4 |
| D06-SLOW-CHART † | พิมพ์หลัง readiness ครอบคลุม chart/data/fonts หรือ fail | P1 (เสนอ; chart ยังไม่ยืนยันเป็น MVP) | deferred | ตัด dynamic chart; ใช้ static SVG/PNG | [12](12-visual-assets.md) |
| D06-JS-DISABLED † | ปิด JS แต่ใช้ dynamic chart → static fallback หรือ reject | P1 (เสนอ) | deferred | ต้องเลือกว่าจะปิด JS หรือไม่ | [12](12-visual-assets.md) |
| D06-QR (catalog payload `REPORT:Q-DEMO-001`) | decode จาก PDF ตรง payload | P0 ตาม D06 / P1 (เสนอ) ถ้า QR ไม่อยู่ใน MVP | deferred | ตัด QR ออกจาก MVP | catalog |
| D06-QR-DIGITAL † (finding payload `INV-2026-001`) | decode จาก PDF/ภาพตรง byte/encoding contract | P1 (เสนอ) | deferred | เช่น D06-QR | [12](12-visual-assets.md) |
| D06-QR-PRINT † | scan กระดาษแยกเครื่องพิมพ์/ขนาด | P2 (เสนอ) | deferred | ไม่รับรอง QR สำหรับงานพิมพ์ | [12](12-visual-assets.md) |
| D06-CODE128 | Code 128 decode ตรง payload (catalog `PO01-D01`; finding 12 `INV-2026-001`) | P1 (เสนอ) | deferred | ตัด barcode ออก | catalog; [12](12-visual-assets.md) |

### 1.6 Security (R19, R20)

D07 ใน catalog เป็น **P0 ก่อน shared service**; SEC01–SEC08 ([22](22-security-review.md), [security-scenarios.json](../../../research/specimens/security-scenarios.json), `verified_runtime:false` ทั้งหมด) ไม่มีใน catalog จึงเสนอ priority ให้ผูกกับ D07

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| D07 | allow/deny ตาม policy; ไม่ข้ามข้อมูล/credentials | P0 ก่อน shared service | deferred (tabletop เท่านั้น) | ห้ามเปิดให้หลายผู้ใช้/tenant; จำกัดเป็น single-trust deployment | catalog; [22](22-security-review.md) |
| D07-EGRESS | DNS/redirect/private/webhook ไม่หลุด boundary | P0 ก่อน shared service | deferred | SSRF → ต้องปิด URL ภายนอก ใช้ asset ที่ app ส่งเอง | catalog |
| D07-AUTH | engine authN ไม่แทน template/job/artifact authZ | P0 ก่อน shared service | deferred | IDOR ข้ามผู้ใช้ | catalog |
| SEC01 † | redirect ไป private host ถูก deny | P0 ก่อน shared (เสนอ) | deferred | เช่น D07-EGRESS | [22](22-security-review.md) |
| SEC02 † | `downloadFrom`/webhook ปิดหรือ validate ปลายทาง | P0 ก่อน shared (เสนอ) | deferred | ปิด capability ไว้ก่อน | [22](22-security-review.md) |
| SEC03 † | asset ที่ถูกบล็อก/timeout ไม่หายเงียบ | P0 (เสนอ; ซ้อน D06-MISSING) | deferred | เช่น D06-MISSING | [22](22-security-review.md) |
| SEC04 † | template/helper ไม่ออกถึง host/secrets | P0 ก่อน untrusted template (เสนอ) | deferred | จำกัดเป็น trusted-author templates เท่านั้น | [22](22-security-review.md) |
| SEC05 † | cross-tenant object ID ถูก deny | P0 ก่อน shared (เสนอ) | deferred | เช่น D07-AUTH | [22](22-security-review.md) |
| SEC06 † | callback ปลอม/ซ้ำ ถูก authenticate+dedupe | P1 (เสนอ; ขึ้นกับว่า MVP ใช้ callback หรือไม่) | deferred | ใช้ polling แทน | [22](22-security-review.md) |
| SEC07 † | request/archive/ข้อมูลใหญ่อยู่ใน budget | P1 (เสนอ) | deferred | ต้องตั้ง limit อนุรักษ์ก่อนวัด | [22](22-security-review.md) |
| SEC08 † | logs ไม่มี token/ข้อมูลอ่อนไหว | P1 (เสนอ) | deferred | ปิด debug logging | [22](22-security-review.md) |

### 1.7 Performance / recovery (R17, R21)

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| D08 | workload 1/5/10 พร้อมกัน, timeout, restart, callback ซ้ำ: state สอดคล้อง | P0 เมื่อยืนยัน workload | deferred | ยังไม่มี sizing/SLA; ห้ามสัญญา throughput | catalog; [23](23-performance-scenarios.md) |
| D08-RETRY | timeout หลัง output เสร็จ/callback ซ้ำไม่ทำ state ขัดกัน | P0 เมื่อยืนยัน workload | deferred | ต้องมี idempotency/attempt model | catalog |
| D08-MEASURE | บันทึก N, warm-up, environment, raw data ก่อนอ้าง p95 | P0 เมื่อยืนยัน workload | deferred | ตัวเลขใด ๆ ไม่ใช่ measured | catalog |
| `small` / `medium` / `medium_slow` | utilization 1.67% / 20.83% / 41.67% (สูตรเฉลี่ย steady-state จาก [capacity-assumptions.json](../../../research/specimens/capacity-assumptions.json)) | P1 (เสนอ; สมมติฐาน ไม่ใช่ case ตรวจ) | ไม่ใช่ runtime case; ใช้เป็นตัวอย่างคณิตศาสตร์ | ไม่ใช้เลือกเครื่อง/SLA | [23](23-performance-scenarios.md) |

### 1.8 PDF profile / advanced (R15)

| ID | Expected | Pri | สถานะ | ผลต่อ MVP ถ้าไม่ผ่าน | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| A01 | PDF/A: profile ระบุ + validator report + ฟอนต์/ข้อความหลัง post-process | P1 (เสนอ; ต้องยืนยันก่อนว่า use case ต้องการ) | deferred | ไม่ประกาศว่ารองรับ PDF/A; ส่งเป็น PDF ธรรมดา | catalog §3; [25](25-pdf-capabilities.md); [26](26-pdf-profile-validation.md) |
| A02 | PDF/UA: tags/reading order/table semantics + manual | P1 (เสนอ) | deferred | ไม่ประกาศ accessibility | catalog; [26](26-pdf-profile-validation.md) |
| A03 | signature: cryptographic validation/trust/revocation; ไม่ใช้ key จริง | P2 (เสนอ) | deferred | ไม่มี signing ใน MVP | catalog; [25](25-pdf-capabilities.md) |
| A04 | reproducible output: semantic/visual/byte แยก ควบคุม metadata/fonts/time | P1 (เสนอ; ต้องใช้ใน regression ทุกชนิด จึงผูกกับ §2) | deferred | regression ใช้ byte-hash ไม่ได้ ต้องใช้ semantic/visual | catalog; §2 |
| ตรวจ [26](26-pdf-profile-validation.md) §3 (Thai text, page count, group totals, tags, table, alt text, fonts/metadata, signature/attachments) | machine และ manual แยกกัน; สถานะ `machine-pass`/`manual-pass` แยก | ตาม A01/A02 | deferred | ไม่มี conformance claim | [26](26-pdf-profile-validation.md) |

### 1.9 ผลตรวจ static ที่ทำในงานนี้ (observed-static, ไม่ใช่ runtime)

ผมรัน Python (`python -I`, stdlib `json` + `decimal`, สคริปต์ผ่าน stdin ไม่ได้บันทึกเป็นไฟล์) เทียบ [grouped-cases.json](../../../research/specimens/grouped-cases.json) และ [master-detail-cases.json](../../../research/specimens/master-detail-cases.json) กับ expected ที่ฝังในไฟล์: grouped 6/6 ตรง (groups/grand หรือ error code), master-detail 6/6 ตรง, และคำนวณ D01 ด้วยมือ/Decimal: 2501.00 + 599.70 = 3100.70, หัก 100.70 = 3000.00, 7% = 210.00, grand 3210.00 ตรงกับ [01](01-product-brief.md) ขอบเขต: ตรวจเฉพาะ arithmetic/error-code ของ fixture ตามกติกาที่เขียนไว้ใน findings 10/11 ผู้ตรวจเป็นผู้เขียนกติกาเอง ไม่ใช่ validator อิสระ และไม่เกี่ยวกับ PDF

### 1.10 ผลตรวจ traceability (กลับไปยังแหล่ง)

- Pagination → [08](08-pagination.md) → catalog D02/D03/D05-HEADER; ไทย → [09](09-thai-fonts.md) → catalog D05*; ยอดรวม → [10](10-grouping-totals.md)/[11](11-master-detail.md) → specimens ที่ตรวจข้างต้น; ครบทั้งสามสายสำหรับ D-level IDs
- **ID ที่มีใน findings แต่ไม่มีใน catalog (†)**: D02-ONE (finding 08 ยอมรับเอง), D05-COPY-01/WRAP-02/MIX-03/FALLBACK-04/HEADER-05, L01–L04, D06-MISSING-HTTP/-BLOCKED/-TLS, D06-SLOW-CHART, D06-JS-DISABLED, D06-QR-DIGITAL, D06-QR-PRINT, SEC01–SEC08, perf `small/medium/medium_slow`
- **ID ใน catalog ที่ finding ใช้ชื่ออื่น**: `D05-COPY` ↔ `D05-COPY-01`, `D05-HEADER` ↔ `D05-HEADER-05`, `D06-MISSING` ↔ `D06-MISSING-*` สามแถว, `D06-READY` ↔ `D06-SLOW-CHART`/`D06-JS-DISABLED` ควร reconcile หลัง agent อื่นตรวจ catalog เสร็จ (ผมไม่แก้ catalog)
- **ข้อมูลทดสอบขัดกัน**: payload QR catalog `REPORT:Q-DEMO-001` เทียบ finding 12 `INV-2026-001`; payload Code 128 catalog `PO01-D01` เทียบ finding 12 `INV-2026-001`; ตัวอย่างข้อความไทยใน D05-THAI (`บริษัท ตัวอย่าง จำกัด`) ต่างจาก D05-COPY-01 (`บริษัท ทดสอบ จำกัด …`) ทั้งหมดเป็นข้อมูลสังเคราะห์ ใช้ได้ทั้งคู่ แต่ต้องเลือกชุดเดียวก่อนทำ fixture
- ไม่พบ case ที่ claim ว่า observed/pass ใน inputs ที่อ่าน; ทุก runtime row ระบุ deferred/not-tested หรือ verified_runtime:false
- ช่องว่างที่พบ: catalog ไม่มี case สำหรับ header-footer repeat (ผมเสนอ D02-HEADER-REPEAT), ไม่มี non-determinism/regression case (ผมเสนอผ่าน A04 และ §2) และ D04 ระบุ `PO02 empty policy` เป็น decision-open ขณะ specimen ให้ 0.00 (specimen คือ assumption ของ fixture)

## 2. ชั้นการตรวจและ nondeterminism (ข้อเสนอ ไม่ใช่ผลวัด)

### 2.1 ชั้นการตรวจ

| ชั้น | ตรวจอะไร | วิธีที่เสนอ | ต้อง PDF จริงไหม |
| --- | --- | --- | --- |
| L0 Contract/static | schema input, error codes, ID uniqueness, component `(id, version)` | ตรวจ input ก่อน render (เช่น logic แบบ specimens) | ไม่ |
| L1 Semantic | ID ครบหนึ่งครั้ง, ฟิลด์บังคับ, จำนวนหน้าเป็นผลที่บันทึก ไม่ใช่ expected ที่เดา | extract ข้อความต่อหน้า → เทียบกับ expected IDs/ฟิลด์ | ใช่ |
| L2 Numeric | subtotal/group/grand ตรง Decimal และ scope | parse ตัวเลขจาก extracted text ที่ผ่านการ normalize (คั่นพัน/ทศนิยม) → เทียบเป็น Decimal ไม่ใช้ float | ใช่ |
| L3 Text/Thai | code points ตรงกับ input ภายใต้ normalization policy, ฟอนต์ถูกฝัง, ไม่มี glyph หาย | extract + เทียบหลัง normalize (policy NFC/NFD ต้องเลือกก่อน ยังไม่ระบุ failure เสมอ); อ่านรายการฟอนต์ใน PDF | ใช่ |
| L4 Visual | ไม่ทับ/ตัด, วรรณยุกต์, หัวตารางซ้ำ, footer | rasterize ทุกหน้าด้วยเครื่องมือและ DPI ที่ pin; เทียบกับ baseline ที่อนุมัติโดยคน; ตรวจบริเวณเสี่ยงเป็นพิเศษ (ขอบหน้า, header/footer, จุดแตกแถว) | ใช่ |
| L5 Byte | smoke ว่า environment ไม่เปลี่ยน | hash หลัง normalize metadata เฉพาะใน environment เดียวกัน ห้ามใช้เป็นเกณฑ์หลัก | ใช่ |
| L6 Conformance | PDF/A, PDF/UA ตาม [26](26-pdf-profile-validation.md) | `/forms/pdf/validate` ([S102](../sources.md)) + veraPDF ([S101](../sources.md)) + manual | ใช่ |

หลักการ: L1–L3 เป็น gate ความถูกต้อง, L4 เป็น gate layout ที่ต้องมีคนอนุมัติ baseline ครั้งแรก, L5 ไม่เป็น gate ผล L4 ที่ "ผ่าน" ไม่ล้างความผิดที่ L1–L2 พบ ตามที่ protocol ระบุ ("แยก semantic correctness ออกจาก layout fidelity")

### 2.2 แหล่ง nondeterminism และวิธีควบคุม

| แหล่ง | ทำไมเกี่ยว | ควบคุมที่เสนอ | วิธีเปรียบเทียบที่ทนต่อมัน |
| --- | --- | --- | --- |
| Fonts (binary/version/hash, ติดตั้งหรือส่งเป็น asset) | เปลี่ยนความกว้าง/ตัดบรรทัด/จำนวนหน้า ([09](09-thai-fonts.md)); metadata ใน Google Fonts เป็น mutable | ผูก font artifact + hash ใน manifest; ส่งเป็น asset ที่ pin ไม่พึ่งฟอนต์ของ image | เปลี่ยน hash = baseline ใหม่ที่ต้องอนุมัติ ไม่ใช่ fail อัตโนมัติ |
| Chromium/Gotenberg version | เวอร์ชันต่างกัน layout ต่าง; docs เป็น 9.x rolling, ยังไม่ทราบ build จริง ([02](02-engine-baseline.md)) | pin image digest; บันทึก Chromium version จริงจาก environment | baseline ผูก digest; upgrade = รัน suite ใหม่ + เทียบกับ baseline เดิมด้วย L1–L3 ก่อน L4 |
| วันที่/เวลา/timezone/locale | "วันนี้" ในรายงาน, พ.ศ./ค.ศ. ([09](09-thai-fonts.md) L01–L04) | inject `generatedAt`/`asOf` และ timezone เป็น input; ห้ามอ่านนาฬิกาเครื่อง ใน fixture ใช้วันที่คงที่ | เทียบข้อความหลังแทนค่าตามกติกาเดียวกัน; ตัดฟิลด์ที่เป็นเวลาจริงออกด้วย mask |
| Font fallback | ฟอนต์ไม่มี/glyph นอก coverage แทนด้วยฟอนต์อื่นเงียบ ๆ | ตรวจรายการฟอนต์ที่ฝังหลัง render และเทียบ allow-list; ฟอนต์หายต้อง fail (policy D05-FALLBACK-04) | L3 ตรวจรายชื่อฟอนต์; L4 ตรวจ glyph |
| Image/asset load timing | ภาพ/chart ยังโหลดไม่เสร็จตอนพิมพ์; fixed delay ไม่พิสูจน์ ([12](12-visual-assets.md)) | ใช้ readiness signal + `failOn*` ที่เปิดครบ; fixture ใช้ asset ที่ serve เอง ไม่พึ่งเครือข่ายภายนอก | รันหลายรอบและเทียบ L1/L4; ผลไม่นิ่งเองคือ finding ไม่ใช่ noise |
| PDF metadata (creation/mod date, producer, trailer ID) | ทำให้ byte hash ต่างทุกรอบแม้เนื้อหาเหมือนกัน; ([protocol §6](../validation/protocol.md)) | ตั้งค่า `creationDate`/`modDate` คงที่ผ่าน `/forms/pdf/set-metadata` ([S103](../sources.md)) เมื่อจำเป็น; trailer ID ยัง **unknown** ว่าถูก normalize ไหม ต้องดูหลังได้ output จริง | ตัด metadata/ID ก่อน hash (L5) หรือไม่เทียบ byte เลย |
| ลำดับ/ID ที่สร้างสุ่มใน template หรือ chart library | DOM id, สี, animation ต่างรอบ | ใช้ seed/ID แบบ deterministic; ปิด animation ใน fixture | visual mask หรือ ตรวจเฉพาะ semantic |
| Rasterizer/ICU/Intl | ภาพและ format วันที่/ตัวเลขอาจต่างตามเวอร์ชันเครื่องมือ | pin เวอร์ชันเครื่องมือเทียบภาพและบันทึกใน manifest | tolerance ของภาพ **ต้องกำหนดหลังเก็บ baseline ซ้ำหลายรอบใน environment เดียวกันเท่านั้น ไม่เสนอค่าตัวเลข ณ ตอนนี้** |
| ลำดับ concurrency/โหลด | งานพร้อมกันอาจเปลี่ยน timing ของ asset/readiness | spike ครั้งแรกรันทีละงาน; เรื่อง concurrency อยู่ที่ D08 แยก | แยกผล correctness กับ performance ([23](23-performance-scenarios.md)) |

ข้อสังเกต: ระดับ "byte-identical" ไม่ใช่เกณฑ์ผลิตภัณฑ์ (A04); การเปรียบเทียบที่เสนอคือ semantic ก่อน, visual รอง, byte เฉพาะเป็น smoke

## 3. Runtime validation backlog — จัดลำดับ

### 3.1 Spike แรกสุด (minimal, ลด risk สูงสุดก่อนลงทุนสร้างระบบ)

**เหตุผลที่เป็นลำดับแรก:** R04/R05 (ตารางข้ามหน้า, header ซ้ำ, oversized row) และ R12 (ไทยใน header/footer) เป็นจุดที่ [08](08-pagination.md), [09](09-thai-fonts.md) ระบุเองว่า "ยังไม่ทราบ" และถ้าพัง จะกระทบสถาปัตยกรรม template ทั้งระบบ (ต้องเปลี่ยนวิธีแบ่งหน้า/ฝังฟอนต์) การรู้ผลก่อนสร้างระบบถูกกว่าการแก้ภายหลัง ส่วน security/performance/PDF profile ต้องมี output ที่ render ได้ก่อน จึงตามหลัง

**ขอบเขตที่เสนอ (ผู้ใช้ตัดสินใจก่อนว่าจะทำ):** render synthetic reference reports 3 แบบผ่าน Gotenberg จริงบน environment ที่ pin (ดู §3.3) ด้วยข้อมูลสังเคราะห์จาก catalog/specimens ทีละงาน (ไม่ทำ concurrency):

| Spike | Report | Variation ขั้นต่ำ | Cases ที่ครอบคลุม |
| --- | --- | --- | --- |
| SP-A | A ใบเสนอราคา Q-DEMO-001 (หน้าเดียว, โลโก้, ที่อยู่ไทย) | portrait; header/footer ไทย + เลขหน้า | D01, D01-NUM, D05-HEADER(-05), D05-THAI |
| SP-B | B Sales grouped S01–S04 (+ ชุดขยายแถวมาก) | ตารางข้ามหน้า, หัวตารางซ้ำ (D02-HEADER-REPEAT), 0 แถว (D02-EMPTY), 50 แถวก่อน, 500 แถวเป็นส่วนเสริมถ้าทรัพยากรพอ, portrait และ landscape เป็นรอบเสริม | D02*, D04, D04-SCOPE (เฉพาะดู group ข้ามหน้า) |
| SP-C | C Master-detail PO01–PO04 | `long-detail` ที่ทำให้แถวสูงเกินหน้า (oversized row) + กรณี PO02 ไม่มี detail | D03*, D04-PARENT |

ตัวเลขแถว 50/500 มาจาก test design ใน catalog ไม่ใช่ขั้นต่ำผลิตภัณฑ์ และใน spike นี้ **ไม่วัดเวลา/RAM เป็นเกณฑ์ตัดสิน** (วัด performance ที่ spike นี้ไม่ได้ออกแบบมา)

**สิ่งที่ต้องบันทึกต่อรอบ** (ตาม [protocol §6](../validation/protocol.md)): image digest, Chromium version จริง, ฟอนต์+hash, options ที่ส่ง, input, output PDF, log ดิบ, ผล L1–L4 พร้อมภาพหน้าที่ตรวจ ห้ามตัดสินจาก HTTP 200

**Exit criteria และการตัดสินใจ** (ผลเป็นหมวดผ่าน/ไม่ผ่านทางคุณภาพ ไม่มีเกณฑ์ตัวเลขที่แต่งขึ้น):

| ผลที่สังเกต | ถ้าผ่าน | ถ้าไม่ผ่าน → การตัดสินใจที่เปิดให้ผู้ใช้ |
| --- | --- | --- |
| SP-B: ID ครบ/ไม่ซ้ำ, ไม่ทับ footer, หัวตารางซ้ำไม่ทับข้อมูลทุกหน้า (L1+L4) | ยืนยันได้ว่า template HTML/CSS table แบบนี้ใช้ได้ใน environment ที่ pin (ไม่ครอบคลุมรูปแบบอื่น) | เลือก: (1) แบ่งหน้า/ซ้ำหัวตารางที่ชั้นแอป (chunk แถวเอง) (2) จำกัดรูปแบบตารางที่ MVP รองรับ (3) พิจารณาแนวทาง render อื่น; ผลต่อ effort ของ MVP สูง → ให้ T29 ทบทวน |
| SP-A/B: วรรณยุกต์ไทยใน header/footer และ body ครบ, ฟอนต์ถูกฝัง, ข้อความ copy/search ได้ (L3+L4) | ยืนยัน font delivery สำหรับ body และ header/footer ที่ทดสอบ | เลือก: ฝังฟอนต์ใน header/footer ด้วยวิธีอื่น (เช่น data URI — ยังต้องทดสอบ), ย้ายข้อมูลสำคัญออกจาก header/footer, เปลี่ยนฟอนต์ candidate (Sarabun ↔ Noto Sans Thai), หรือรับ limitation เรื่อง copy/search แล้วบันทึกใน spec |
| SP-C: oversized row ไม่ทำข้อความหาย (L1) และ behavior ตรง policy ใดสักข้อ | เลือก policy overflow ได้จากผลจริง (ยัง decision-open จนกว่าผู้ใช้เลือก) | ข้อความหาย = ห้ามรับ row ลักษณะนี้: ต้อง reject/แบ่ง row ที่ชั้นแอปก่อน render เป็นเงื่อนไขของ MVP |
| SP-A: ยอด D01 ตรงใน PDF (L2) | ยืนยันเส้นทาง extract ตัวเลขสำหรับ regression | ถ้า extract ไม่ได้ ต้องเสริมวิธี verify (เช่น ฝังค่าที่ตรวจได้ใน output) หรือพึ่ง visual มากขึ้น |
| ผลไม่นิ่งเมื่อรันซ้ำ input เดิม (เช่น 2–3 รอบ ตามที่เหมาะกับทรัพยากร) | ระบุความนิ่งเฉพาะ environment นั้น | วิเคราะห์ nondeterminism จาก §2.2 ก่อนตัดสินใจเรื่อง baseline |

**ข้อจำกัดของ spike นี้ (ต้องบอกเสมอ):** ผ่าน ≠ พร้อมผลิต: ยืนยันเฉพาะ 3 report/variation ที่ทดสอบ บน environment, fonts, Chromium ที่บันทึก; ไม่ครอบคลุม security, performance/concurrency, PDF/A/UA, QR/chart, recovery และ report จริงของผู้ใช้ ผลไม่ผ่านบางข้อ (เช่น header ซ้ำ) เป็นข้อมูลชัดกว่าผลผ่าน เพราะบอกทางเปลี่ยนทิศ

### 3.2 Backlog ลำดับถัดไป (หลัง spike)

| ลำดับ | งาน | Cases | เงื่อนไขก่อนทำ |
| --- | --- | --- | --- |
| 2 | Asset/readiness + QR/barcode decode | D06*, D06-QR*, D06-CODE128 | เลือกว่า chart/QR อยู่ใน MVP หรือไม่; กำหนด fail policy |
| 3 | Security probes ใน isolated environment | D07*, SEC01–SEC08 | มี controlled endpoints; **ต้องทำก่อนเปิด shared service** |
| 4 | Concurrency/timeout/recovery + performance | D08*; ต้องยืนยัน workload ([23](23-performance-scenarios.md)) | ผู้ใช้ยืนยัน workload; บันทึก N/warm-up/limits |
| 5 | PDF/A, PDF/UA, signature | A01–A03, [26](26-pdf-profile-validation.md) | ยืนยันก่อนว่า use case ต้องการ profile ใด |
| 6 | Reproducibility/regression harness | A04, §2 | หลังมี baseline จาก spike |

ลำดับ 3 อาจมาก่อน 2 ได้ถ้าผู้ใช้ต้องการเปิดบริการแบบ shared ตั้งแต่แรก (D07 เป็น P0 ก่อน shared service) ผมเสนอให้ T29 ผูกกับ MVP scope ที่เลือก

### 3.3 ตัวเลือก environment (เสนอให้ผู้ใช้ตัดสินใจ; ผมไม่เลือกและไม่ provision ให้)

ข้อจำกัดที่ทราบ: เครื่องผู้ใช้มีทรัพยากรจำกัดและไม่ใช้ Docker ([deferred-runtime](../validation/deferred-runtime.md))

| ตัวเลือก | ลักษณะ | ข้อดี | ข้อจำกัด/ความเสี่ยง | สิ่งที่ผู้ใช้ต้องตัดสินใจ |
| --- | --- | --- | --- | --- |
| E1 CI service container | รัน Gotenberg image เป็น service ใน job; [GitHub Actions service containers](https://docs.github.com/en/actions/using-containerized-services/about-service-containers) ([S100](../sources.md)) ระบุว่าต้องใช้ Linux runner และ container ถูกทำลายเมื่อ job จบ | ไม่ใช้เครื่องผู้ใช้; ผลย้อนตรวจได้จาก log; ผูก digest ได้ | ต้องมี repo/CI ที่ผู้ใช้ยอมรับ (ปัจจุบันยังไม่ใช่ git repository); ข้อมูลสังเคราะห์ออกจากเครื่อง; ภาพหน้าต้องเก็บเป็น artifact; ผู้ให้บริการอื่น เช่น GitLab ไม่ได้ตรวจในงานนี้ | เลือกผู้ให้บริการ/ยอมรับการส่ง fixture ขึ้นบริการภายนอก |
| E2 เครื่อง/VM อื่นที่ผู้ใช้เข้าถึงอยู่แล้ว | ติดตั้ง container runtime บนเครื่องอื่น | ควบคุมเวอร์ชัน/ฟอนต์เองได้ | ผู้ใช้ต้องมีเครื่อง; ต้องวางแผนทรัพยากร/network; ไม่ได้ระบุ resource ขั้นต่ำเพราะไม่มีการวัด | เครื่องใดและใครดูแล |
| E3 เครื่องผู้ใช้โดยไม่ใช้ Docker | เอกสารที่ศึกษาไม่ได้ยืนยันวิธีรัน Gotenberg ที่ไม่ใช่ container บน Windows | — | ไม่มีหลักฐานในเอกสารของโครงการ จึงเป็น unknown; Chromium/ฟอนต์บนเครื่องผู้ใช้ไม่เท่ากับ image ที่ผลิตภัณฑ์จะใช้ ผลจึงใช้แทน Gotenberg image ไม่ได้ | ใช้เฉพาะถ้าผู้ใช้ต้องการแค่ตรวจ HTML/CSS เบื้องต้น และยอมรับว่าไม่ใช่ evidence ของ Gotenberg |
| E4 เลื่อนไปก่อน | คงสถานะ deferred | ไม่มีต้นทุน | ความเสี่ยง R04/R05/R12 ยังไม่ถูกปิดก่อนลงทุน; ทุกข้อเสนอ MVP เป็นแบบมีเงื่อนไข | เลื่อนได้ถ้าตกลงรับเงื่อนไขใน T29 |

ไม่มีข้อไหนที่ทำอยู่แล้ว: ไม่ได้ติดตั้ง รัน หรือ provision สิ่งใด ผมไม่ได้จัดอันดับว่าตัวเลือกใด "ดีที่สุด" เพราะขึ้นกับข้อมูลที่ผู้ใช้เท่านั้นที่รู้ (ความยินยอมส่ง fixture ออกนอกเครื่อง, เครื่องที่มี, งบ)

## 4. Source ที่เพิ่มสำหรับเอกสารนี้

ผม**ไม่ได้แก้** [sources.md](../sources.md) ตามข้อห้ามของงาน แถวด้านล่างให้ parent นำไปรวม; S100–S103 เปิดอ่านได้เมื่อ 13 พฤศจิกายน 2026 (ตรวจเฉพาะว่าหน้าอ่านได้และเนื้อหาที่ใช้อ้าง ไม่ใช่ทุก claim)

| ID | Primary source | Version / scope | รองรับหัวข้อ / ข้อจำกัด |
| --- | --- | --- | --- |
| S100 | [GitHub Actions service containers](https://docs.github.com/en/actions/using-containerized-services/about-service-containers) | Rolling | ตัวเลือก environment E1; ต้อง Linux runner; ไม่ได้ยืนยันว่าเลือก GitHub หรือรัน Gotenberg ได้แล้ว |
| S101 | [veraPDF validation](https://docs.verapdf.org/validation/) | Rolling | validator อิสระสำหรับ PDF/A และ PDF/UA (L6); ไม่ได้รัน |
| S102 | [Gotenberg PDF validate](https://gotenberg.dev/docs/pdf/validate) | 9.x rolling | `POST /forms/pdf/validate` field `profile` และ response `compliant`/`violations`; ไม่ได้รัน |
| S103 | [Gotenberg set-metadata](https://gotenberg.dev/docs/pdf/set-metadata) | 9.x rolling | fields `creationDate`/`modDate`/`producer` ฯลฯ สำหรับควบคุม metadata; ไม่ยืนยัน trailer ID หรือผลต่อ determinism |

## 5. สถานะความพร้อม — ย้ำ

| ระดับ | สถานะ ณ 13 พ.ย. 2026 | หลักฐาน |
| --- | --- | --- |
| Desk research | ใกล้ครบตามแผน (T28 นี้เป็นหนึ่งใน 30 งาน) | findings + source register |
| Static check | fixtures arithmetic ตรงที่ expected (§1.9) | observed-static ขอบเขตแคบ |
| Runtime validated | **ไม่มี** — ไม่มี PDF, validator report, security probe, benchmark | — |
| Implementation ready | **ไม่ใช่** — persona/MVP/authoring/license direction ยังรอผู้ใช้ ([plan §12](../../../tasks/plan.md)), policy หลัก (overflow, fonts, failOn, signature profile) ยังเป็น decision-open, และ P0 runtime ทั้งหมดยังเป็น evidence gap | plan §12; catalog |

การที่ catalog, fixtures และเอกสารนี้ครบ แสดงว่า "รู้ว่าจะตรวจอะไร" ไม่ใช่ "ตรวจแล้ว" ต้องไม่ใช้ในรายงานฉบับถัดไปเป็นหลักฐานว่า Gotenberg render ไทย/ตาราง/ยอดรวมผ่าน
