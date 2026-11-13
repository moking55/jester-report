# T12 — Visual Assets, Charts และ Barcodes

ตรวจแหล่งข้อมูล: 12 พฤศจิกายน 2026  
สถานะ: Desk research; **PDF rendering, decode และ physical print-scan ยัง deferred/not-tested**

## 1. เปรียบเทียบทางเลือก

| Asset | สิ่งที่เอกสารระบุ / ข้อเสนอ | Readiness และคุณภาพที่ต้องตรวจ | License |
| --- | --- | --- | --- |
| SVG | รูปแบบ vector เหมาะสำหรับกราฟ/เส้นที่ต้องขยาย; เป็นข้อเสนอ ไม่ยืนยันว่า PDF รักษา vector ทุกองค์ประกอบ [W3C SVG 2](https://www.w3.org/TR/SVG2/) | ตรวจ output จริงทั้งตัวอักษร สี clipping และ rendering เมื่อขยาย | ตรวจ license generator, font และภาพที่ฝังแยก |
| PNG | รูปแบบ raster จึงต้องเลือก pixel dimensions ให้เหมาะกับขนาดพิมพ์; specification ไม่ยืนยันความคมของ PDF ใน pipeline นี้ [W3C PNG](https://www.w3.org/TR/png-3/) | ตรวจ pixel dimensions, scale, transparency และผลพิมพ์จริง | ตรวจ license รูปต้นฉบับและเครื่องมือ; มาตรฐาน format ไม่เท่ากับ license asset |
| Dynamic chart | Chart ที่สร้างหลัง page load ต้องส่ง readiness signal; `waitForSelector` หรือ `waitForExpression` เป็นทางเลือก documented [Gotenberg 9.x](https://gotenberg.dev/docs/chromium/convert-html) | Signal ต้องครอบคลุม data, fonts และ chart เสร็จ; ถ้าปิด JavaScript ต้องออกแบบ chart แบบ static | ยังไม่เลือก chart library; ตรวจ dependencies ก่อนใช้ |
| QR Code | ใช้ payload ตาม business contract; [GS1 2D retail guideline](https://ref.gs1.org/guidelines/2d-in-retail/) ระบุ quiet zone ของ QR สี่เท่าความกว้าง module รอบสี่ด้านในบริบท guideline | ตรวจ contrast, quiet zone, ขนาด module, decode จาก output และกระดาษแยกกัน | ตรวจ library/asset license และข้อกำหนดมาตรฐานที่ใช้ |
| Code 128 | Linear barcode; แยก Code 128 ทั่วไปจาก GS1-128 ที่มี FNC1 และกฎข้อมูลเฉพาะ [GS1 GS1-128](https://support.gs1.org/support/solutions/articles/43000734455-what-is-the-format-of-gs1-128-) | ตรวจ quiet zone, contrast, module width และ decoded bytes; กฎที่ใช้ขึ้นกับ symbology/การใช้งาน | ยังไม่เลือก library; ตรวจ license/dependencies ก่อนใช้ |

ไม่มี benchmark ที่วัด DPI, ขนาดไฟล์, สี, scan rate หรือประสิทธิภาพของ assets และไม่อ้างว่ารองรับ Gotenberg runtime แล้ว

## 2. Gotenberg 9.x — Asset และ Readiness Contract

- HTML route รับ `index.html` พร้อม CSS, fonts, images และ scripts โดยเอกสารระบุว่าไฟล์ถูกตัด directory ออก ต้องอ้างชื่อไฟล์ตาม route contract [HTML conversion](https://gotenberg.dev/docs/chromium/convert-html).
- Header/footer ไม่โหลด stylesheet/file images เหมือน body; ใช้ `<style>` และ images แบบ data URI; ประเด็น fonts ภาษาไทยยังไม่ทดสอบ ดู [T09](09-thai-fonts.md).
- เอกสารระบุ `waitForSelector`, `waitForExpression`, `waitForWindowStatus` และ `waitDelay`; fixed delay ไม่พิสูจน์ว่า chart/font เสร็จ และ waits อยู่ภายใต้ API timeout. ถ้า expression ใช้ JavaScript ต้องพิจารณา policy ที่ปิด JavaScript ด้วย
- แยก `failOnResourceHttpStatusCodes` จาก `failOnResourceLoadingFailed`: ตัวหลัง default false และเอกสารระบุไม่ครอบคลุม timeout/certificate errors; blocked subresource อาจหายจาก PDF แม้ได้ผลลัพธ์ [Gotenberg outbound](https://gotenberg.dev/docs/operate/outbound).
- `printBackground` ใน docs 9.x ควบคุม page background ของ `html`/`body`; ไม่ควรอ้างจาก 8.x ว่าปิด background ทุก element โดยอัตโนมัติ

ความครบถ้วนของ PDF ต้องใช้ application policy และ validation แยก; readiness flag เพียงตัวเดียวไม่รับประกันข้อมูลถูกต้องหรือภาพครบ

## 3. Deferred Cases สำหรับ D06

| Case | Input / trigger | Expected policy ที่ต้องกำหนด | หลักฐานเมื่อมี environment ในอนาคต |
| --- | --- | --- | --- |
| D06-MISSING-HTTP | โลโก้สำคัญตอบ HTTP error | Fail หรือแจ้ง incomplete ตาม policy; ห้ามอ้าง HTTP PDF success ว่าครบ | Request options, status/log และ PDF inspection ถ้ามี |
| D06-MISSING-BLOCKED | asset ถูก outbound policy ปฏิเสธ | แจ้งสาเหตุ/asset identifier โดยไม่เผย secrets | Controlled mock, error/log, content check |
| D06-MISSING-TLS | asset timeout หรือ certificate error | กำหนด policy แยกจาก network-failure option ที่ระบุข้อยกเว้น | Outcome/log และ timeout/certificate cause |
| D06-SLOW-CHART | Chart สร้างหลังโหลดหน้า | พิมพ์หลัง readiness ที่ครอบคลุม chart/data/fonts หรือ fail เมื่อเกินเวลาที่กำหนด | Timeline, readiness condition, PDF/ภาพเทียบ expected |
| D06-JS-DISABLED | ปิด JavaScript แต่ใช้ dynamic chart | ระบุ static fallback หรือ reject ไม่รอ signal ที่ไม่มีทางมา | Configuration, outcome และ expected policy |
| D06-QR-DIGITAL | Payload synthetic `INV-2026-001` | Decode จาก PDF ที่แสดง/แปลงเป็นภาพต้องตรง payload byte/encoding contract | Input bytes, decoder/version, output และภาพ |
| D06-QR-PRINT | QR เดียวกันพิมพ์บนกระดาษ | ตรวจ scan แยกตามเครื่องพิมพ์/ขนาด/วัสดุ; ไม่มีผลวัดในงานนี้ | Print settings, scanner และผล scan |
| D06-CODE128 | Code 128 สำหรับ synthetic `INV-2026-001` | Decode ตรง contract; ถ้าต้องใช้ GS1-128 ต้องกำหนด FNC1/AI แยก | Generator/decoder version, expected payload และภาพ |

ข้อมูลตัวอย่างและ expected policy เป็นการออกแบบ validation ไม่ใช่ผล decode หรือยืนยัน compliance กับมาตรฐานค้าปลีก กรณีใช้ GS1 ต้องระบุ application standard/version และ verifier requirements ก่อน

## 4. ข้อสรุปและข้อค้าง

เริ่มจาก logo/image ที่มี license ชัดและกำหนด mandatory/optional assets ส่วน charts และ barcode เลือกวิธีสร้างภายหลังจาก use case, license และผลทดสอบจริง ไม่มีการเลือก library หรือพัฒนาระบบใน T12

Cases ทั้งหมด **deferred/not-tested**: ยังไม่มีการ Render, ตรวจ PDF, decode, print หรือ scan และไม่รัน Docker/Engine/Cloud แทน
