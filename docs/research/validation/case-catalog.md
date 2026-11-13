# T06 — Validation Case Catalog

วันที่: 12 พฤศจิกายน 2026  
สถานะ runtime ทุกกรณี: **deferred/not-tested** ตามข้อจำกัดเครื่อง ไม่มี PDF หรือ benchmark ที่รันจริง  
อ้างอิง: [Product brief](../findings/01-product-brief.md), [Protocol](protocol.md)

## 1. กลุ่มกรณีตรวจ

| ID | กลุ่ม/หัวข้อ | Input หรือเงื่อนไข | Expected target | วิธีตรวจภายหลัง | Priority |
| --- | --- | --- | --- | --- | --- |
| D01 | เอกสารหน้าเดียว; R05/R06/R08/R13 | ใบเสนอราคา Q-DEMO-001, QL01–02, Thai address, logo | Subtotal 3100.70, grand total 3210.00, fields/IDs ครบ | Numeric/text checks และภาพ PDF | P0 |
| D02 | ตารางหลายหน้า; R04/R05 | 0/1/50/500 แถว, A4 portrait/landscape, repeated header/footer | ไม่มี ID หาย/ซ้ำ ไม่ทับ footer และ empty state ชัดเจน | Compare expected records และ boundary page images | P0 |
| D03 | แถวสูงเกินหน้า; R04/R05 | Description ยาวกว่าหนึ่งหน้า หลายบรรทัด หลาย cell | แบ่ง/ล้นตาม policy ที่เลือก ข้อมูลไม่ถูกตัดเงียบ | PDF text/visual checks; exact split policy = decision-open | P0 |
| D04 | Grouping/master-detail; R08/R10 | Sales S01–04 และ PO01/PO02 ตาม product brief | North 2000.00, South 400.00, grand 2400.00; PO01 350.00, PO02 empty policy | Expected arithmetic/parent mapping, แล้ว PDF checks | P0 |
| D05 | Thai/fonts; R12 | ไทย/อังกฤษผสม วรรณยุกต์ ที่อยู่ยาว ฟอนต์พร้อม/หาย body/header/footer | ไม่มี glyph/วรรณยุกต์ถูกตัด fallback/error ชัด ค้นข้อความได้ | Font embedding/text extraction/visual checks | P0 |
| D06 | Assets/readiness; R11/R13 | Logo/SVG/PNG/QR/chart พร้อม ช้า หาย หรือ JS error | รอ readiness ตาม contract หรือแจ้ง error; ไม่ปล่อยข้อมูลไม่ครบโดยเงียบ | Resource/error/log assertions และ output inspection | P0 |
| D07 | Security; R19/R20 | URL/redirect/asset/webhook ที่ไม่อนุญาต, template expressions, file references, ต่าง tenant | Allow/deny ตาม policy และไม่มีข้ามข้อมูล/credentials leak | Controlled isolated probes และ object authorization tests | P0 ก่อน shared service |
| D08 | Load/recovery; R17/R21 | Workloads 1/5/10 พร้อมกัน, timeout, restart, duplicate callback | Outcome/job state สอดคล้อง policy ไม่มีอ้าง exactly-once ที่พิสูจน์ไม่ได้ | Raw timings/errors/resource data และ failure recovery logs | P0 เมื่อยืนยัน workload |

ตัวเลขแถวและ concurrent jobs เป็น test design จาก keyword map ไม่ใช่ค่าขั้นต่ำของผลิตภัณฑ์ ไม่ต้องรันในเครื่องนี้ ไม่มี SLA หรือ hardware recommendation ที่ได้จากการวัด

## 2. กรณีย่อยที่ต้องรักษาความหมาย

| Case ID | Parent | Expected semantic check | Runtime status |
| --- | --- | --- | --- |
| D01-NUM | D01 | Decimal totals ตาม product brief; อัตรา fixture ไม่ใช่คำแนะนำภาษี | deferred/not-tested; arithmetic ตรวจ static แยกได้ |
| D02-EMPTY | D02 | ไม่มีข้อมูลต้องแสดง no-data behavior ที่ตัดสินใจแล้ว ไม่แสดงยอดจากค่าเดิม | deferred/not-tested |
| D02-IDS | D02 | Unique row IDs ตาม expected dataset ครบหนึ่งครั้ง | deferred/not-tested |
| D03-OVERFLOW | D03 | ไม่มีข้อความหาย แม้แถวสูงเกินหน้า; policy ยังเปิด | deferred/not-tested |
| D04-SCOPE | D04 | Group subtotal แยกจาก page subtotal; ไม่คำนวณตามหน้าจริงโดยเดาจำนวนแถว | deferred/not-tested |
| D04-PARENT | D04 | D01/D02 ของ PO01 ไม่ย้ายเข้า PO02; component version ต้องระบุ | deferred/not-tested |
| D05-COPY | D05 | Thai expected strings ยัง copy/search ได้ หรือมี limitation ที่บันทึก | deferred/not-tested |
| D05-HEADER | D05 | Header/footer style/font/image ถูกต้องแยกจาก body | deferred/not-tested |
| D06-MISSING | D06 | HTTP failure, blocked resource, timeout และ readiness failure ต้องมี policy แยก | deferred/not-tested |
| D06-QR | D06 | Payload decode จาก PDF และงานพิมพ์ตรวจแยกกัน | deferred/not-tested |
| D07-EGRESS | D07 | DNS/redirect/private targets/webhook policy ไม่หลุด boundary | deferred/not-tested |
| D07-AUTH | D07 | Engine authentication ไม่ใช้แทน template/job/artifact authorization | deferred/not-tested |
| D08-RETRY | D08 | Timeout หลัง output เสร็จหรือ callback ซ้ำไม่ทำให้ state ขัดกัน | deferred/not-tested |
| D08-MEASURE | D08 | ต้องบันทึก N, warm-up, environment/limits และ raw data ก่อนอ้าง p95 | deferred/not-tested |

## 3. PDF ขั้นสูงและการตรวจที่ต้องเพิ่มเติมตาม Use Case

| ID | เงื่อนไข | สิ่งที่ต้องตรวจ | สถานะ |
| --- | --- | --- | --- |
| A01 | ต้องการ PDF/A | Exact profile, validator result, fonts/text/content หลัง post-processing | deferred/not-tested |
| A02 | ต้องการ PDF/UA/accessibility | Tags/reading order/table semantics และ manual reading checks | deferred/not-tested |
| A03 | ต้องการ digital signature | Cryptographic validation, trust chain, revocation/timestamp และผลเมื่อแก้ PDF | deferred/not-tested; ไม่ใช้ keys จริงในรอบนี้ |
| A04 | ต้องการ reproducible output | กำหนด semantic/visual/byte comparison แยก; ควบคุม metadata/fonts/time | deferred/not-tested |
| A05 | Bookmarks (`nativeBookmarks` หรือ `set-bookmarks`) | Bookmark tree ตรง headings/ลำดับ/ระดับซ้อน; อ่านด้วย `/forms/pdf/bookmarks`; ยืนยันว่า `nativeBookmarks` เปิด tagged PDF ตาม docs; หน้าปลายทางถูกต้องหลัง merge/select | deferred/not-tested |
| A06 | Merge/select/split ชุดรายงานและภาคผนวก | Page count/ลำดับ source; ไม่มีหน้าหาย/ซ้ำ; header/footer และเลขหน้าของแต่ละ source; bookmarks/tags/metadata หลัง merge; ผลเมื่อ input signed (คาดตาม docs: 400) | deferred/not-tested |
| A07 | Stamp/watermark DRAFT (`stamp-text/image/pdf`, `position` ตั้งแต่ v9.4.0) | ตำแหน่งตาม anchor/offset บน A4 portrait/landscape และหน้าหมุน; ไม่ทับข้อมูลสำคัญ; ข้อความ stamp ไม่รบกวน text extraction/reading order; ผลต่อ tags และ PDF/A เมื่อ stamp หลัง remediate | deferred/not-tested |
| A08 | Order matrix: remediate/encrypt/sign/timestamp/optimize | ทดสอบลำดับที่ docs อนุญาตและห้าม (encrypt+sign, encrypt+PDF/A, rewrite stage บน signed PDF) ว่าได้ 400 ตรงตาม docs และลำดับที่อนุญาตยังคง profile/signature; ตรวจ `Gotenberg-Remediation-Residual`/`-Rolled-Back` | deferred/not-tested; ไม่ใช้ keys จริง |
| A09 | PDF/A-2b + PDF/UA-1 ในรายงานไทยหลัง post-processing | `profile` pair, `language=th-TH`, text/fonts/tags/table headers/page count ก่อน-หลัง remediate; machine report แยกจาก manual review; เทียบ `/forms/pdf/validate` กับ validator ภายนอก (engine ของ Gotenberg validate ยัง unknown) | deferred/not-tested |

ทุก case ต้องผูก source version และ production requirements ที่ยืนยันแล้วก่อนนำไปเป็น acceptance test ของระบบ ไม่ยกระดับ expected target ให้เป็น supported capability จาก catalog เพียงอย่างเดียว

## 4. รายละเอียดเพิ่มเติมสำหรับ Checkpoints 3–4

| Case | ข้อมูลสังเคราะห์ / expected | สิ่งที่ยังต้องตรวจจริง |
| --- | --- | --- |
| D02-PAPER | A4 portrait และ landscape; 0, 1, 50, 500 unique row IDs | Header/footer, page count และการซ้ำหัวตาราง; ไม่เดาจำนวนหน้า |
| D03-OVERSIZE | หนึ่งแถวมีข้อความยาวกว่าความสูงพื้นที่พิมพ์ | ข้อความครบและ split/overflow ตรง policy ที่ยังเปิด |
| D05-THAI | `บริษัท ตัวอย่าง จำกัด`, `ที่อยู่: ๑๒๓ ถนนสุขุมวิท กรุงเทพฯ`, `กำไรสุทธิ 1,234.50 บาท` | ภาพวรรณยุกต์ การตัดคำ และข้อความที่ copy/search; ไม่อ้างผล Render |
| D05-LOCALE | วันที่อ้างอิง 2026-11-12, timezone Asia/Bangkok, locale th-TH | ค.ศ./พ.ศ. และรูปแบบวันที่ต้องระบุ calendar policy; ไม่สมมติ default ของเครื่อง |
| D06-QR | Payload fixture `REPORT:Q-DEMO-001` | Decode จาก PDF และพิมพ์กระดาษแยกกัน ยังไม่ทดสอบทั้งคู่ |
| D06-CODE128 | Payload ASCII `PO01-D01` | ชนิด barcode, quiet zone, scale และ payload decode ตรงกัน; ยังไม่ทดสอบ |
| D06-READY | ภาพ 404, network failure, timeout/certificate error และ chart ที่ส่งสัญญาณ ready ช้า | Fail/warn ตาม policy ที่กำหนด; แยกแต่ละ error ไม่อ้างว่าค่าเดียวครอบคลุมทั้งหมด |

ตัวอย่างข้างต้นเป็นข้อมูลสังเคราะห์สำหรับออกแบบการตรวจ ไม่ใช่หลักฐานว่า Gotenberg หรือฟอนต์แสดงผลได้ถูกต้อง
