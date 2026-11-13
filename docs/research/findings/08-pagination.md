# T08 — Pagination และ Header/Footer Desk Study

วันที่ตรวจ: 12 พฤศจิกายน 2026  
สถานะ: documented/specification/issue report แยกจาก runtime; ไม่มีการ Render หรือ reproduce issue ในเครื่องนี้

## หลักฐานและขอบเขต

| เรื่อง | หลักฐาน | ข้อสรุปที่อนุญาต |
| --- | --- | --- |
| A4, แนวนอน, margins, page numbers | [Gotenberg HTML conversion 9.x](https://gotenberg.dev/docs/chromium/convert-html) | มี fields/template classes ตาม docs; ยังไม่พิสูจน์ output ของโปรเจกต์ |
| `@page`, `break-before`, `break-inside` | [W3C CSS Fragmentation Level 3](https://www.w3.org/TR/css-break-3/) | Specification อธิบาย fragmentation; ไม่ใช่ผลทดสอบ Chromium build ที่จะใช้ |
| Page margin boxes | [Chrome print margins](https://developer.chrome.com/blog/print-margins) | บทความอธิบายความสามารถ Chromium ตามรุ่นในบทความ; ไม่เหมาว่าตรงกับ runtime ที่ยังไม่ทราบ |
| หัวตารางทับข้อมูล | [Gotenberg issue #392](https://github.com/gotenberg/gotenberg/issues/392) รายงานปี 2021, ใช้ Gotenberg 7; Chromium version ไม่ระบุ | ผู้รายงานพบปัญหาและระบุว่า CSS workaround ที่เสนอไม่ช่วยกรณีนั้น; **ไม่ reproduce locally และไม่อ้างว่ายังเกิดใน 9.x** |
| Header ต่างหน้าแรก | [Discussion #1377](https://github.com/gotenberg/gotenberg/discussions/1377) ปี 2025; Gotenberg/Chromium version ไม่ระบุ | เป็นรายงาน/คำแนะนำใน discussion ไม่ใช่ข้อพิสูจน์ว่า 9.x รองรับหรือไม่รองรับทุกกรณี; **ไม่ reproduce locally** |

## Page setup และ source of truth

Gotenberg 9.x มี `paperSize=A4`, `landscape`, `marginTop/Bottom/Left/Right` และ `preferCssPageSize` ตาม [API docs](https://gotenberg.dev/docs/chromium/convert-html) เอกสารระบุว่า `@page` สามารถคง orientation ของตัวเองได้แม้ไม่ได้ใช้ขนาด CSS จึงต้องออกแบบ template และ request ให้ไม่ขัดกัน แล้วตรวจ actual result ใน D02

Header/footer ใช้ files แยกจาก body; พิมพ์ภายใน margin ของหน้า, ใช้ `<style>` ของตน, ภาพ data URI และ `pageNumber`/`totalPages` classes กำหนดความสูง/spacing โดยไม่ทับ body ต้องพิสูจน์จริง ไม่อ้าง margin ที่เหมาะสมโดยไม่มี fixture [T07](07-gotenberg-contract.md)

## ตาราง, กลุ่ม และการแตกหน้า

- `thead`/`table-header-group` และ `break-inside: avoid` เป็นแนวทางที่ควรศึกษา แต่ issue #392 แสดงว่า CSS ที่เสนอไม่แก้กรณีผู้รายงานในเวอร์ชันเก่า ห้ามบอกว่าทำให้หัวตารางซ้ำหรือไม่ทับข้อมูลได้แน่นอน
- ข้อกำหนด CSS อนุญาตผ่อนข้อจำกัดบางอย่างเมื่อจำเป็นเพื่อวางเนื้อหาให้คืบหน้า `break-inside: avoid` จึงไม่ใช่คำรับประกันว่าแถวสูงเกินหน้าจะไม่ split; ต้องกำหนด overflow/split policy ก่อนตรวจ [CSS Break §4](https://www.w3.org/TR/css-break-3/)
- Page subtotal ต้องรู้ว่ารายการใดปรากฏในแต่ละหน้าจริง; group subtotal อาศัยขอบเขตข้อมูลคนละแบบ ห้ามประมาณ page subtotal จากจำนวนแถวหรือ CSS เพียงอย่างเดียว
- ชุดข้อมูลว่าง, heading ติดปลายหน้า, กลุ่มข้ามหน้า และ long row อาจมีผลต่อความหมายของข้อมูล ต้องตรวจ content และภาพควบคู่ ไม่ใช้ page count เพียงอย่างเดียว

## Case design และ acceptance ที่เลื่อนทดสอบ

| Case | Input / variations | Expected / checks เมื่อมี environment ที่เหมาะสม |
| --- | --- | --- |
| D01 | ใบเสนอราคา A4 portrait, header/footer/logo | ยอดและ IDs ครบ; footer ไม่ทับ body, page number ตรง output |
| D02-EMPTY | ตาราง 0 แถว | no-data state ตาม policy, ไม่มีข้อมูลจากรอบก่อน |
| D02-ONE | 1 แถว และ A4 portrait/landscape | row ID ปรากฏครั้งเดียว; orientation/margins ถูกต้อง |
| D02-IDS | 50 และ 500 แถว unique IDs; portrait/landscape | เทียบ expected IDs กับ extracted text และตรวจหัวตาราง/จุดเปลี่ยนหน้าจากภาพ; ไม่มีหาย/ซ้ำหรือ overlap |
| D03-OVERFLOW | แถวสูงเกิน 1 หน้า, multi-line cells | เนื้อหาครบ, split/overflow/error ตรง policy ที่เลือก; policy ยัง decision-open |
| D04-SCOPE | กลุ่มหลายกลุ่มและกลุ่มข้ามหน้า | subtotal ตาม group; page subtotal แยกและยังไม่รับรอง |
| D05-HEADER | header/footer ไทยและภาพ; margins ต่างกัน | ตรวจวรรณยุกต์, fonts, logo และการทับ/ตัดจากภาพและ text extraction |

ใน [case catalog](../validation/case-catalog.md) มี D02-EMPTY, D02-IDS, D03-OVERFLOW, D04-SCOPE และ D05-HEADER; D02-ONE เป็นกรณีย่อยที่เสนอต่อยอดจาก D02 ซึ่งรวม 1 แถวอยู่แล้ว ทุกกรณี **deferred/not-tested** ไม่ได้สร้าง PDF และไม่อ้างว่ารองรับหรือผ่าน

## ข้อสรุปสำหรับการตัดสินใจ

แยก report semantic correctness ออกจาก layout fidelity; ออกแบบ validation ให้ตรวจ IDs, aggregate values, page boundaries และ visual overlap พร้อม version/fonts/environment manifest ก่อนพิจารณาเกณฑ์ผลิตภัณฑ์ การเลือก workaround หรือรับรอง pagination เป็นเรื่องที่ต้องอิงผลตรวจจริงภายหลัง ไม่ใช้ issue เก่าหรือ CSS specification แทนผลนั้น
