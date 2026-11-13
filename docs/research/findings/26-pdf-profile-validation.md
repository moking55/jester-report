# T26 — แผนตรวจ PDF/A และ PDF/UA

ตรวจเอกสาร: 12 พฤศจิกายน 2026  
สถานะ: **validation design เท่านั้น; automated และ manual checks ทั้งหมด deferred/not-tested** ไม่มี PDF, validation report หรือผล compliance จากโปรเจกต์

## 1. Profile ตัวอย่างและหลักฐานที่ต้องได้

| Profile | เหตุผลศึกษา / ขอบเขต | Validator options จากเอกสาร | ผลที่ต้องเก็บในอนาคต |
| --- | --- | --- | --- |
| `PDF/A-2b` | ตัวอย่าง archival สำหรับ quotation และ sales report; ไม่ใช่การเลือก profile สุดท้าย | Gotenberg 9.x `POST /forms/pdf/validate`: `files` + `profile` (required; ค่า `PDF/A-2b` อยู่ในรายการที่รับ), `password` เมื่อไฟล์เข้ารหัส; veraPDF docs ระบุ flavour PDF/A-1/2/3/4 (documented; ชื่อ flag CLI และรูปแบบ report ไม่ได้อยู่ในหน้าที่ตรวจ = **unknown**) | Profile/version, source/output hashes, response JSON (`profile`, `compliant`, `violations[]` ที่มี `specification`, `clause`, `testNumber`, `description`, `context`, `severity`), validator version |
| `PDF/UA-1` | ตัวอย่าง accessibility สำหรับภาษาไทย ตาราง และรูปภาพ | Gotenberg `/forms/pdf/validate` รับ `profile=PDF/UA-1`; veraPDF ระบุ "ใน PDF/UA ทำเฉพาะ machine verifiable checks" (documented) | Profile/version, machine report + ผล manual accessibility review แยกกัน |
| Pair `PDF/A-2b` + `PDF/UA-1` | ศึกษาข้อกำหนด archival + accessibility ร่วมกันเมื่อ use case ต้องการ | `profile` เป็น JSON array หรือ repeated field; รับเฉพาะ pair ที่ remediate รองรับ (PDF/A-1/2/3 หรือ Factur-X กับ UA-1; PDF/A-4 กับ UA-2) pair อื่น 400; `compliant` เป็น true เมื่อผ่านทั้งคู่; severity `fatal` ทำให้ไม่ compliant ส่วน `warning` (เกิดเฉพาะกฎ Schematron ของ Factur-X) ไม่ | ผลราย profile/violations และ evidence ว่าตรวจ PDF output เดียวกัน |

แหล่ง: [Gotenberg validate](https://gotenberg.dev/docs/pdf/validate) (S84), [Gotenberg remediate](https://gotenberg.dev/docs/pdf/remediate) (S83), [veraPDF validation](https://docs.verapdf.org/validation/) (S88). หน้า validate ของ Gotenberg **ไม่ระบุ validator engine** (ไม่ได้ยืนยันว่าเป็น veraPDF) และไม่ระบุ limit ขนาด/หน้า/timeout (**unknown**) ดังนั้นผล `/forms/pdf/validate` และ veraPDF ภายนอกจึงอาจไม่ใช่ engine เดียวกัน — ห้ามเรียกว่า "independent" จนกว่าจะรู้ engine จริง; หน้า PDF Association ISO 14289-1 (`pdfa.org/resource/iso-14289-pdfua/`) ตอบ HTTP 403 ตอนตรวจ จึง**ไม่ใช้เป็นหลักฐาน** ในรอบนี้ (อ้างข้อความของมาตรฐาน/Matterhorn = unknown จนกว่าจะเปิดอ่านได้) veraPDF ระบุว่า PDF/UA automated validation ตรวจเฉพาะส่วนที่ machine-verifiable; human checkpoints ต้องตรวจเพิ่มเติม ไม่สรุป accessibility ทั้งหมดจาก machine report

`PDF/A-2b` และ `PDF/UA-1` เป็นตัวอย่างคู่ที่ docs อนุญาต ไม่ใช่ข้อกำหนดตลาดไทย, ข้อกำหนด e-tax หรือการยืนยันทางกฎหมาย ต้องเลือก exact profile ตามความต้องการผู้ใช้และ applicable requirements ภายหลัง

## 2. Sequence ออกแบบไว้ ไม่รันในรอบนี้

1. เลือก synthetic reference reports A–C จาก [T01](01-product-brief.md), เพิ่มข้อความไทย/อังกฤษ, ตารางหลายหน้า, โลโก้/alt text และ expected totals ตาม [case catalog](../validation/case-catalog.md)
2. เมื่อมีคำขอและ environment เหมาะสมในอนาคต บันทึก actual Engine image release/digest, Chromium/fonts/options, OS, exact source data, asset hashes และ PDF ก่อนแก้ไข
3. หากนโยบายเลือก remediation ส่ง profile ที่ตรง use case และภาษาเอกสารอย่างชัดเจน เช่น `th-TH` (BCP 47); Gotenberg docs ระบุค่า `language` default `en` จึงต้องไม่ปล่อย default โดยสมมติว่าเหมาะกับรายงานไทย; `aggressive` default `false` (เปิดแล้วอาจเปลี่ยนหน้าตา ต้องเทียบภาพ); `figureAltText` เป็น fallback ส่วน docs แนะนำเขียน `alt` ใน HTML [Remediate](https://gotenberg.dev/docs/pdf/remediate) ที่ปรับ remediate ให้ผ่านกฎ ≠ ความหมายถูกต้องทางภาษา/โครงสร้าง (**inferred**)
4. ตรวจ response headers `Gotenberg-Remediation-Residual` (จำนวน violations ที่เหลือ; 0 = conform ตาม docs) และ `Gotenberg-Remediation-Rolled-Back` (fix ที่ถูกยกเลิกเพราะทำให้หน้า/ข้อความ/รูปหาย) เมื่อมี remediation; หลาย PDF = รวมตัวเลข; HTTP 200 อาจมี residual violations, rollback หรือเนื้อหาไม่ตรงความหมายที่ต้องการ
5. ตรวจ **final PDF** ด้วย `/forms/pdf/validate` ระบุ exact profile และเก็บ JSON (keyed ด้วยชื่อไฟล์) `compliant`/`violations` พร้อม version; หากใช้เครื่องมือภายนอกเช่น veraPDF ให้ระบุ exact version/profile/report และอธิบายผลที่ต่างกัน (engine ของ Gotenberg validate ยัง unknown จึงเรียกว่า "second tool" ไม่ใช่ independent) ไม่กล่าวว่าตรวจแล้วจนมีไฟล์/report จริง
6. ตรวจภาพและข้อความ/ตัวเลขเทียบ expected พร้อมตรวจ tags/reading order/accessibility ด้วยคน จากนั้นทำซ้ำกับ output หลัง merge/stamp/metadata/attachments/signing ที่ relevant ตาม ordering rules; signing validation อยู่ใน T27

การเปรียบเทียบก่อน/หลังต้องตรวจเนื้อหาและจำนวนหน้าร่วมด้วย: remediation/optimization ไม่ควรถือว่าสำเร็จเชิงธุรกิจเพียงเพราะเครื่องตรวจ profile ผ่านหรือ residual เป็น 0

## 3. Checklist แยก Machine / Human

| Check | ตัวอย่างที่ต้องครอบคลุม | Machine check ที่เสนอ | Human / semantic check ที่เสนอ | สถานะ |
| --- | --- | --- | --- | --- |
| Thai text | `บริษัท ตัวอย่าง จำกัด`, `กำไรสุทธิ 1,234.50 บาท` | Extracted Unicode, font metadata/embedding; เทียบ input ภายใต้ normalization policy | อ่านวรรณยุกต์/สระ การตัดคำและ fallback | deferred/not-tested |
| Page count/content | Quote 1 หน้าเป็นเป้าหมาย; ตาราง 0/1/50/500 แถว | เปรียบเทียบ page count ก่อน/หลังและ row IDs ไม่หาย/ซ้ำ; ไม่เดา fixed pages ของข้อมูลยาว | ดูหน้าว่าง/เนื้อหาถูกตัด/หัวตารางซ้ำ | deferred/not-tested |
| Group totals | S01–S04; North 2000.00, South 400.00, grand 2400.00 | Extract และเทียบ expected decimal values | ตรวจป้ายยอด/กลุ่มว่าตรงข้อมูลและไม่สับสน page subtotal | deferred/not-tested |
| Tags / reading order | หัวรายงาน, sections, header/footer และภาษาไทย | ตรวจ tagged structure และ violations ของ profile | ตรวจลำดับอ่านและการแยก decorative elements ด้วย screen reader/assistive workflow | deferred/not-tested |
| Table semantics | หัวตารางและ detail ที่ต่อเนื่องข้ามหน้า | ตรวจ structure ตามที่ validator ตรวจอัตโนมัติได้ | ตรวจ header-to-cell association และ logical order ว่าใช้เข้าใจข้อมูลได้ | deferred/not-tested |
| Images / alternative text | โลโก้, QR/chart ที่มีความหมาย | ตรวจข้อกำหนด alt text ที่เครื่องตรวจได้ | ตรวจคำอธิบายมีความหมายเหมาะกับบริบท ไม่รั่วข้อมูล | deferred/not-tested |
| Fonts/color/metadata | Sarabun/Noto candidate และ page/body/header | Validator reports + font/metadata inspection | อ่านความคมชัด/ความถูกต้องในตัวดูที่กำหนด | deferred/not-tested |
| Signature/attachments | Report พร้อมภาคผนวกและ signer เมื่อมี use case | ตรวจ signature/reference และรายการ attachments ด้วยเครื่องมือที่เลือก (`/forms/pdf/attachments` เป็น read route ที่ docs ระบุ) | ตรวจชนิดเอกสาร/สิทธิ์/meaning ตาม policy | deferred/not-tested |

Input A01–A09 และ D01–D06 มีอยู่ใน [case catalog](../validation/case-catalog.md); **machine pass** เป็นหลักฐานเฉพาะ machine-verifiable checks ไม่เท่ากับผ่าน manual review, e-invoice rules, ความถูกต้องทางการเงิน หรือ product accessibility ทั้งระบบ

## 4. เกณฑ์รายงานผลในอนาคต

- สถานะแต่ละ profile แยก `not-tested`, `machine-pass`, `machine-fail`, `manual-pending`, `manual-pass` หรือ `manual-fail` พร้อม tool/profile/version ไม่รวมเป็นคำว่า “ผ่าน” แบบกำกวม
- เก็บรายการ violations, remediation residual/rollback, output PDF hash, page/row/text comparison และ reviewer/วิธีตรวจ manual เท่าที่ policy อนุญาต
- ถ้า validator ขัดแย้งกัน ให้บันทึก version/profile, input PDF เดียวกัน, ความแตกต่างและข้อจำกัดก่อนตัดสินใจ ไม่เลือกผลที่ชอบ
- ถ้ายังไม่มี actual PDF หรือเครื่องมือ ให้คง `deferred/not-tested` ตาม [backlog](../validation/deferred-runtime.md) ไม่ทำเครื่องหมาย validation ว่าผ่าน
