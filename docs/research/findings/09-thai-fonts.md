# T09 — ภาษาไทย, Localization และ Fonts

ตรวจแหล่งข้อมูล: 12 พฤศจิกายน 2026  
สถานะ: Desk research; **ยังไม่ติดตั้ง fonts หรือ Render/ตรวจ PDF จริง**

## 1. ข้อค้นพบและขอบเขต

Unicode UAX #14 revision 57 ระบุว่าอักษร Thai ในกลุ่ม South East Asian complex-context ต้องอาศัยการวิเคราะห์บริบทเพื่อหาโอกาสตัดบรรทัด การอ้างมาตรฐานไม่รับประกันผลตัดคำใน Chromium หรือ PDF ของโครงการ [Unicode UAX #14](https://unicode.org/reports/tr14/tr14-57.html).

การเลือก font, fallback, ขนาดและน้ำหนักอาจเปลี่ยนความกว้างและตำแหน่งตัดบรรทัด จึงอาจเปลี่ยนจำนวนหน้า **เป็นความเสี่ยงที่อนุมานจาก layout** ยังไม่ใช่ผลวัด ห้ามใช้จำนวนแถวคาดการณ์ page boundary หรือ page subtotal ดู [T06 deferred runtime](../validation/deferred-runtime.md).

## 2. Candidate fonts

| ประเด็น | Sarabun | Noto Sans Thai |
| --- | --- | --- |
| Metadata coverage | Google Fonts ระบุ subsets Thai, Latin, Latin-ext, Vietnamese; มี static weights และ italic [metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/METADATA.pb) | ระบุ subsets Thai, Latin, Latin-ext และ variable width/weight axes; metadata อ้าง source v2.002 [metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/METADATA.pb) |
| License | [SIL OFL 1.1](https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/OFL.txt) | [SIL OFL 1.1](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/OFL.txt) |
| การแจกจ่าย | ตรวจ notice, เงื่อนไข OFL และ reserved names หากดัดแปลง; ไม่ขาย font software แยกตามเงื่อนไข license | หลักตรวจเดียวกัน; ตรวจ artifact จริงก่อนแจก |
| สิ่งที่ยังไม่ทราบ | Binary/version/hash ที่เลือก, glyph coverage ราย code point, shaping และ PDF embedding | Binary/version/hash ที่เลือก, axis support ใน renderer, glyph coverage และ PDF embedding |

Metadata เป็น mutable branch ไม่ใช่ binary ที่ติดตั้งจริง คำว่า subset Thai ไม่ยืนยันว่าทุกสัญลักษณ์/combining sequence ที่ธุรกิจใช้รองรับครบ และ license ของ font ไม่ได้บังคับให้เอกสาร PDF ทั้งฉบับใช้ OFL ดู [T05](05-license-inventory.md).

## 3. Body, Header และ Footer

Gotenberg HTML route 9.x ระบุส่ง fonts เป็น assets ของ body ได้โดยอ้างชื่อไฟล์ และ header/footer มี rendering context กับ `<style>` แยก ไม่โหลด external stylesheets; header/footer ใช้ data URI สำหรับภาพ และใช้ class names แยกเพื่อไม่ให้ style ชนกัน [Gotenberg HTML conversion](https://gotenberg.dev/docs/chromium/convert-html).

**ยังไม่ยืนยัน** ว่าฟอนต์ไทยที่ส่งกับ body ใช้ใน header/footer ได้อย่างไรใน environment จริง หรือการฝังฟอนต์/การ substitute ทำงานอย่างไร ต้องตรวจ D05-HEADER แยก ห้ามเหมาว่าฟอนต์ใน body ใช้ร่วมได้อัตโนมัติ

## 4. Expected strings และ Locale Cases

กำหนด expected Unicode text โดยเก็บค่า input เดิมและ code points/normalization policy ก่อนเปรียบเทียบ extraction; ยังไม่กำหนดว่า normalization ต่างกันเป็น failure เสมอ

| Case | Input ตัวอย่าง | สิ่งที่ต้องตรวจภายหลัง |
| --- | --- | --- |
| D05-COPY-01 | `บริษัท ทดสอบ จำกัด เลขที่ ๑๒๓/๔` | ภาพมีสระ/วรรณยุกต์ครบ และ copy/search เทียบข้อความตาม policy |
| D05-WRAP-02 | `กรุงเทพมหานครประเทศไทยรายงานประจำเดือน` | ตัดบรรทัดได้ตาม policy โดยไม่หาย/ซ้อน; ไม่กำหนดจุดตัดแน่นอนก่อนวัด |
| D05-MIX-03 | `Invoice INV-2026-001 ยอดสุทธิ 1,234.50 บาท` | ไทย/อังกฤษ/ตัวเลขปรากฏครบ ลำดับอ่านและการจัดแนวตรง policy |
| D05-FALLBACK-04 | กำหนด font ที่ไม่มีและสัญลักษณ์ที่ font หลักอาจไม่มี | รายงาน fallback หรือ error ตาม policy; ไม่รับรองผลใดล่วงหน้า |
| D05-HEADER-05 | ชื่อบริษัทภาษาไทยและเลขหน้าใน header/footer | font/style/ภาพและ margin ไม่ทับ body; ตรวจแยกทุกหน้า |

| Case | Input | ผลที่คาดหวังตามสมมติฐานทดสอบ |
| --- | --- | --- |
| L01 | `2026-11-12`, `th-TH-u-ca-buddhist`, timezone ที่ระบุ | แสดงปี พ.ศ. 2569 หากกำหนด Buddhist calendar; exact punctuation/format ต้องกำหนดใน contract |
| L02 | `2026-11-12`, `th-TH-u-ca-gregory` | แสดงปี ค.ศ. 2026; รูปแบบวันเดือนเป็นข้อกำหนดแยก |
| L03 | Decimal `1234.50`, currency THB, `th-TH` | ค่าเชิงตัวเลข 1234.50 และสกุล THB; ตำแหน่งสัญลักษณ์/ทศนิยมขึ้นกับ formatting contract |
| L04 | Timestamp ใกล้เที่ยงคืนพร้อม timezone ชัดเจน | วันที่แสดงต้องสอดคล้อง timezone ที่เลือก ไม่ใช้ timezone ของเครื่องโดยปริยาย |

Locale, calendar, timezone และ rounding เป็นข้อเสนอสำหรับ test design ยังไม่ใช่กติกาทางธุรกิจที่ยืนยันแล้ว

## 5. Deferred Verification

1. เลือก exact font artifact, source commit, license notice และบันทึก version/hash เมื่อมี environment ที่เหมาะสม
2. ตรวจ glyph shaping/marks, line wrapping และขอบตัดด้วยภาพ body/header/footer; ตรวจ font embedding และ fallback แยก
3. ตรวจ copy/search/text extraction กับ expected strings และนโยบาย Unicode normalization; รักษา PDF, text และ version manifest
4. เทียบ font candidates และ missing-font case ด้วย input/options เดียวกัน; บันทึก page count แต่ไม่อ้าง fixed count ก่อนทดลอง

ทุกขั้นเป็น **deferred/not-tested** ไม่มีการติดตั้ง font, รัน Docker, เรียก Gotenberg หรือสร้าง PDF ในงานนี้
