# T02 — Engine และ Source Baseline

ตรวจวันที่: 12 พฤศจิกายน 2026  
ผล: documented baseline สำหรับ Research เท่านั้น ไม่มี Gotenberg runtime, Docker image, PDF output หรือ measured benchmark

## 1. เวอร์ชันที่ตรวจจากเอกสาร

Official `releases/latest` ชี้ไป [Gotenberg v9.4.1](https://github.com/gotenberg/gotenberg/releases/tag/v9.4.1) ขณะตรวจ ส่วนคู่มือที่ใช้อ้างอิงระบุ **9.x** จึงสอดคล้องระดับ major version นี่ไม่ใช่คำแนะนำให้อัปเกรดหรือติดตั้ง และไม่ยืนยัน actual Chromium/LibreOffice version หรือ image digest เพราะไม่ได้รันหรือดึง image

| สิ่งที่ทราบ | Class | สิ่งที่ยังไม่ทราบ |
| --- | --- | --- |
| Release page v9.4.1 อ่านได้; docs 9.x | documented | Runtime ของเครื่อง/ระบบที่จะติดตั้งจริง |
| Chromium HTML route เป็น input path ที่ตรงโจทย์ HTML/CSS | documented [HTML conversion](https://gotenberg.dev/docs/chromium/convert-html) | Pagination/Thai/fonts ของ reference reports |
| Gotenberg มี conversion/PDF/system routes แยกกัน | documented [Routes](https://gotenberg.dev/docs/getting-started/routes) | End-to-end behavior ของ application ที่ยังไม่สร้าง |
| เคยมี source S01–S22 ใน keyword map และรอบนี้อ่านตรวจได้ครบ | observed source access | Source pages อาจเปลี่ยนภายหลัง; ไม่ได้เก็บ immutable snapshot ทุกหน้า |

ทะเบียนครบอยู่ [sources.md](../sources.md) S09 เคยเปิดตรงได้ transient error แล้วอ่านได้ผ่าน navigation จาก Secure deployment page จึงใช้สถานะ readable/recovered ไม่อ้าง HTTP code ที่เครื่องมือไม่ได้รายงาน

## 2. Migration ที่กระทบคำค้นและการออกแบบ

จาก [Upgrade from 8.x](https://gotenberg.dev/docs/getting-started/upgrade):

- PDF routes เปลี่ยนจาก `/forms/pdfengines/*` เป็น `/forms/pdf/*`; ตัวอย่างเก่าต้องตรวจชื่อใหม่
- PDF post-processing ใช้ ordered `stages`; ไม่ส่ง flat fields เดิมโดยถือว่าทำงานเหมือนกัน
- Native conversion fields และ webhook contract มีการเปลี่ยน ต้องอ้างคู่มือ major เดียวกัน
- Telemetry เปลี่ยนแนวทางจาก Prometheus module เดิม; หน้าเอกสาร telemetry ไม่ใช่ชื่อ runtime API route

**Docs drift ที่พบ:** migration guide มีข้อความบางส่วนเรื่อง stamp anchors ที่ล้าหลัง [v9.4.0 release note](https://github.com/gotenberg/gotenberg/releases/tag/v9.4.0) ซึ่งเพิ่ม `position` สำหรับ stamping จึงไม่ใช้ migration guide เพียงหน้าเดียวสรุปว่า 9.4.1 ไม่มีความสามารถนั้น ใช้ release-specific evidence และเก็บข้อขัดกันไว้

## 3. ขอบเขตหลักฐานด้าน HTML และความครบของเอกสาร

เอกสาร HTML route ระบุการส่ง `index.html`/assets และ readiness options ส่วน header/footer มีวิธี style/image แยกจาก body จึงห้ามเหมาว่ากฎของ body ใช้ได้ทั้งหมด [HTML conversion](https://gotenberg.dev/docs/chromium/convert-html)

การตอบสำเร็จยังต้องแยกจาก resource completeness โดยเฉพาะ asset ที่ถูกบล็อกหรือโหลดไม่ครบ ควรมี policy ในระบบรายงานและ future validation cases ไม่ใช่อาศัย HTTP success อย่างเดียว [Outbound controls](https://gotenberg.dev/docs/operate/outbound)

ยังไม่ยืนยันการทำ page subtotal, exact page breaks, Thai text extraction, chart readiness หรือ PDF profile conformance ของโปรเจกต์ ดู [deferred runtime](../validation/deferred-runtime.md)

## 4. Baseline สำหรับการอ้างอิงต่อ

1. บันทึก source URL, section, docs/release version และวันที่ ไม่ใช้ `main/master` หรือ `latest` เป็น artifact pin
2. Jasper sample reference ระบุ 7.1.1; W3C CSS Fragmentation เป็น specification ไม่ใช่ implementation proof ของ Chromium
3. Product/license pages ที่ rolling และ branches ที่ไม่ pin ต้องระบุชัด และตรวจใหม่ก่อนใช้ dependency จริง
4. แยก documented, observed-static, inferred และ unknown ตาม [validation protocol](../validation/protocol.md)

## 5. การตรวจ Antigravity และการคัดกรอง

Subagent engine_sources เรียก agy 1.5.5 / `gemini-3.8-flash-high` แบบอ่าน selected evidence ไม่ใช้ tools/writes ภายใต้ plan mode และ timeout 90s; รายงาน exit 0 / SUCCESS ทั้งรอบแรกและ clarification, conversation `7c0c3267-d32c-497b-93bb-6743a6506ccd`

รับคำเตือนเรื่อง version pinning, docs ไม่เท่ากับ runtime, resource completeness และ SSRF review หลังตรวจ source แล้ว ปฏิเสธ/แก้ข้ออ้างที่ไม่รองรับ: tagged PDF เท่ากับ PDF/UA ผ่าน, PDF pipe รับ HTML, telemetry docs เป็น runtime route, Library เท่ากับ Designer, ฝังทุก asset เป็น data URI และการเสนอ remote CI เอง

ข้อชี้แจงที่ถามต่อได้รับการถอนข้ออ้างผิด แต่ parent ยังตรวจด้วย primary sources แทนการรับคำตอบโมเดลเป็นหลักฐานใหม่ ไม่มีการเปลี่ยน Engine, ลงทุน implementation หรือเลือกเวอร์ชัน production ใน T02
