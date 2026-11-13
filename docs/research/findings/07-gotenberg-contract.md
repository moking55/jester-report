# T07 — Gotenberg HTML-to-PDF Contract

วันที่ตรวจ: 12 พฤศจิกายน 2026  
ขอบเขต: เอกสาร Gotenberg **9.x**; release baseline ที่ T02 ตรวจคือ v9.4.1 ไม่ใช่ runtime ที่รันจริง  
สถานะ: documented/inferred เท่านั้น; ไม่มี Docker, engine, HTTP request หรือ PDF ที่สร้างจริง

## Input และ route

`POST /forms/chromium/convert/html` รับ `multipart/form-data` โดย `files` ต้องมี `index.html` และอาจแนบ CSS, images, fonts และ scripts ตามที่หน้าใช้งาน Gotenberg แยกชื่อไฟล์ออกจากโฟลเดอร์ จึงต้องอ้างไฟล์ที่แนบด้วยชื่อไฟล์ ไม่ใช่ path โฟลเดอร์เดิม ไฟล์ชื่อซ้ำต้องพิจารณาก่อนแพ็ก [HTML conversion 9.x](https://gotenberg.dev/docs/chromium/convert-html)

`header.html` / `footer.html` เป็นไฟล์พิเศษ; `archives` และ `downloadFrom` เป็นทางเลือกตาม API แต่การยอมรับ archive หรือ remote URL เป็น policy ของระบบรายงานและมี security implications ไม่ถือว่าเปิดใช้โดยอัตโนมัติ ดู [threat model](04-threat-model.md)

| Option | ข้อเท็จจริงจากเอกสาร 9.x | นัยต่อระบบรายงาน |
| --- | --- | --- |
| `paperSize`, `landscape`, margins | รองรับ A4; default ขนาด Letter และ margin 0.39 นิ้ว | ส่งขนาด/ทิศทาง/margins ชัดเจน ไม่ใช้ค่า default เป็น requirement |
| `preferCssPageSize` | ค่าเริ่มต้น false; ให้ `@page` กำหนดขนาดเมื่อ true | กำหนด source of truth ระหว่าง CSS กับ fields; orientation ของ `@page` ยังมีผลแม้ใช้ขนาดจาก fields |
| `waitForSelector`, `waitForExpression`, `waitForWindowStatus`, `waitDelay` | รอสัญญาณตามชนิด; ทุก wait อยู่ใน API timeout | ใช้ explicit readiness contract เมื่อ page มี async charts/fonts; การเลือก signal ยังไม่ทดสอบ |
| `skipNetworkIdleEvent`, `skipNetworkAlmostIdleEvent` | default true คือข้ามการรอสัญญาณ network เหล่านั้น | ห้ามอนุมานว่า assets/chart พร้อมจากการโหลดหน้าเพียงอย่างเดียว |
| `failOnResourceHttpStatusCodes` | ตรวจ status ของ resources ที่กำหนดและตอบ 409 เมื่อเข้าเงื่อนไข | ระบุ policy สำหรับ missing assets แยก HTTP status จาก network failure |
| `failOnResourceLoadingFailed` | default false; เมื่อเปิดตรวจ network failures บางชนิด แต่เอกสารระบุว่า timeout/certificate errors ไม่นับ | ไม่ถือว่าตั้งค่านี้เพียงอย่างเดียวรับรอง assets ครบ |
| `failOnConsoleExceptions` | default false; เมื่อเปิดตอบ 409 สำหรับ JavaScript exception | ควรกำหนด policy เฉพาะ template ที่ใช้ scripts |
| `printBackground` | default false สำหรับ background ของหน้า `html`/`body`; backgrounds ของ elements พิมพ์แยกจาก flag นี้ | ตรวจสีและพื้นหลังตามประเภท element ใน D06 |

## ตัวอย่าง contract — เพื่ออ่านเท่านั้น

```text
POST /forms/chromium/convert/html
Content-Type: multipart/form-data; boundary=<client-generated>

files: index.html, report.css, logo.png, footer.html
paperSize: A4
landscape: false
marginTop: 20mm
marginBottom: 20mm
failOnResourceLoadingFailed: true
```

นี่เป็นตัวอย่าง fields ไม่ใช่ request ที่ส่งจริง ไม่ยืนยันไฟล์หรือฟอนต์ใดโหลดสำเร็จ หากใช้ chart ที่สร้างหลังโหลด ควรพิจารณา `waitForSelector` หรือ `waitForExpression` ตามสัญญาณที่ template ควบคุม; สัญญาณต้องรวม fonts/assets ที่สำคัญตาม policy ของแอป และตรวจความปลอดภัยของ scripts แยกต่างหาก

คำตอบ synchronous แบบสำเร็จโดยทั่วไปเป็น `application/pdf`; error เป็น plain text และ status ตาม [Errors 9.x](https://gotenberg.dev/docs/reference/errors) ตัวอย่าง status ที่ต้องแปลในแอป:

| HTTP | ตัวอย่างความหมายตามเอกสาร | แนวปฏิบัติเสนอ |
| --- | --- | --- |
| 400 / 415 | form/field ไม่ถูกต้อง หรือไม่ได้ใช้ multipart | ตรวจ input/config ก่อน retry |
| 401 / 403 | credentials ไม่ถูกต้อง / outbound URL ถูก policy ปฏิเสธ | ไม่ retry ซ้ำโดยไม่แก้สิทธิ์หรือนโยบาย |
| 404 | route ไม่มี หรือ image variant ไม่มี engine ที่ต้องใช้ | ตรวจ version, path และ variant |
| 409 | main page หรือ `failOn` check ล้มเหลวตามเงื่อนไข | แยก missing resource จาก template failure ตามรายละเอียด |
| 413 / 429 | request เกิน body limit / queue เต็ม | จำกัด input หรือจัด backoff ตาม policy |
| 503 / 500 | timeout/crash หรือ internal error | เก็บ trace; retry มีขอบเขตและคำนึงถึง idempotency |

การ retry เป็นข้อเสนอระดับ application ไม่ใช่ประกันว่า error ทุกกรณีแก้ได้ด้วยการ retry; webhook mode มี contract การรับผลต่างออกไป [Headers 9.x](https://gotenberg.dev/docs/reference/headers)

## Header/Footer และ output

Chromium แสดง `pageNumber`, `totalPages`, `title`, `date` และ `url` ผ่าน class ที่กำหนด Header/footer แยกจาก body: styles ต้องอยู่ใน `<style>`, ภาพใช้ data URI, ควรกำหนด font size และแยกชื่อ class เพราะ header/footer ใช้ document ร่วมกัน พื้นที่พิมพ์อยู่ใน top/bottom margins [HTML conversion](https://gotenberg.dev/docs/chromium/convert-html)

`200 OK` หรือ `application/pdf` ไม่ยืนยันว่าเนื้อหา/รูปภาพ/ฟอนต์ครบ ถูกแบ่งหน้าถูกต้อง หรือผ่าน PDF/A, PDF/UA. ค่า `failOnResourceLoadingFailed` ไม่ครอบคลุมทุก failure และ blocked subresource อาจหายจากเอกสารได้ [Outbound controls](https://gotenberg.dev/docs/operate/outbound)

## ข้อจำกัดและหลักฐานที่ยังขาด

- Actual image digest, Chromium build, fonts, OS และ resource settings: **unknown/not-tested**
- Render, page count, Thai text extraction, chart readiness และ error paths ของโปรเจกต์: **deferred/not-tested**
- ตรวจในอนาคตตาม D01, D02, D05, D06 และ D07 ใน [case catalog](../validation/case-catalog.md); environment manifest ตาม [protocol](../validation/protocol.md)
- เวอร์ชัน docs 9.x เป็น rolling docs; ก่อนใช้งานจริงต้องตรวจ exact release และ integration behavior ใหม่ ไม่ใช้ตัวอย่าง 8.x ปะปน
