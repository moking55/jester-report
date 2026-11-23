# แผน v1.15: นำเข้าแบบฟอร์ม Word (.docx)

สถานะ: **อนุมัติ 24 พ.ย. 2026 (ผู้ใช้สั่งทำทุก phase)** · task list: [todo.md](todo.md)
ที่มา: หัวข้อ v1.15 ของ [SPEC-template-store.md](../../SPEC-template-store.md), [SPEC-public-api.md](../../SPEC-public-api.md), [SPEC-studio.md](../../SPEC-studio.md), [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) (อนุมัติ 24 พ.ย. 2026) · ฐาน: `v1.14.1`

## Overview

ปุ่ม "นำเข้า (.zip / .docx)" รับไฟล์ Word แล้วสร้างรายงานใหม่ที่ Designer แก้ต่อได้: กระดาษ ขอบ หัวข้อ ย่อหน้า ระยะย่อหน้า ตารางตีเส้น ช่องรวม สีพื้นเซลล์ รูป header/footer และเลขหน้า สิ่งที่แปลงไม่ได้กลายเป็น `warnings`
ทั้งหมดอยู่ใน api (stdlib: `zipfile` + `xml.etree.ElementTree`) ไม่มี dependency ใหม่ ไม่มี migration; Studio แก้แค่ dialog นำเข้า

## Architecture Decisions

- **ตัวแปลงเป็นโมดูลบริสุทธิ์** `template_store/docx/`: `read_docx(data, template_id, name) -> (Bundle, warnings)` ไม่แตะ DB/blob, test ได้ด้วย bytes ล้วน แบ่งไฟล์ตามงาน: `package.py` (อ่าน zip/XML อย่างปลอดภัย + relationships), `page.py` (กระดาษ/ขอบ), `body.py` (ย่อหน้า, run, ระยะ, list, space/page-break), `table.py`, `media.py` (รูป + header/footer), `__init__.py` (ประกอบ Bundle + report.json/schema/sample/css)
- **ใช้ของเดิมให้มากที่สุด:** `_read` (inflate แบบนับไบต์จริง) และ `StoreError` จาก `bundle.py`; `detect()` ตรวจรูป; `report.css` จาก starter `blank`; HTML ที่สร้างเป็นรูปแบบเดียวกับที่ Designer เขียน (`newBlockHtml`, `GRID_CELL_STYLE`, ขนาดตารางเป็น `%`) จึงไม่ต้องแก้ parser ของ Designer
- **zip ของ Word ไม่ใช่ zip ของ Jester:** มีโฟลเดอร์ (`word/…`) จึงใช้ `read_zip` ไม่ได้ แต่ใช้กติกาเดียวกัน: ≤ 25 MB, จำนวน entry ≤ 1000, แต่ละ part ≤ ขนาดที่กำหนด (XML ≤ 10 MB, รูป ≤ 5 MB), path ห้าม `..`/absolute, ห้าม symlink/เข้ารหัส; XML ปฏิเสธ `<!DOCTYPE` ก่อน parse
- **escape เดียวที่จุดเดียว:** ทุกข้อความจาก Word ผ่าน `html.escape` แล้วแทน `{`/`}` ด้วย `&#123;`/`&#125;` (HTML entity: Jinja ไม่เห็นเป็น delimiter, browser แสดงเป็นวงเล็บ, Designer แสดงเป็นข้อความ) — ง่ายกว่า `{{ "{" }}` และไม่สร้าง expression
- **ตรวจผลก่อนเขียน:** `import_docx` เรียก `load_definition` + `prepare` + `bind` กับ `sample.json` ใน worker เดียวกับ preview ก่อนเขียน DB; ไม่ผ่าน = `INTERNAL` (bug ของตัวแปลง) และไม่มีอะไรถูกเขียน
- **ทางเขียนร่วมกับ zip:** แยกส่วน "เขียน Bundle ใหม่ลง DB" ของ `import_zip` เป็น `_insert_new(conn, bundle, by)` ให้ `import_docx` ใช้ซ้ำ (เฉพาะสร้างใหม่; .docx ไม่ทับ)
- **API ตัดสินด้วยเนื้อใน:** route อ่าน upload ครั้งเดียว ถ้าเป็น zip ที่มี `word/document.xml` และไม่มี `jester.json` → ทาง docx; อย่างอื่น → ทาง zip เดิม (ไม่แตะพฤติกรรม zip)
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task (ไม่ commit `AGENTS.md`/`launch.json`), ไม่ push ระหว่างทาง; pytest เต็มชุดและ E2E บนเครื่องทดสอบ

## Dependency graph

```
T1 package: zip/XML ปลอดภัย + rels ─► T2 page + body ─► T3 table ─► T4 media + header/footer + warnings
                                                                              │
                                     T5 fixture สมจริง (สคริปต์) + golden template.html ◄┘
                                                                              │
                                  T6 store.import_docx + ตรวจ bind ─► T7 API route + contract ─► Checkpoint A
                                                                              │
                                              T8 Studio dialog .docx ─► T9 vitest อ่าน golden + E2E + live ─► T10 release
```

T2–T4 ทำตามลำดับ (แชร์ตัวช่วยของ body); T8 เริ่มได้หลัง T7 (ต้องใช้ contract)

## Risks and Mitigations

| ความเสี่ยง | ผล | ทางลด |
| --- | --- | --- |
| Word จริงใช้ XML ที่ fixture ไม่มี (style ซ้อน, theme font, `w:sdt`, field ซับซ้อน) | สูง | อะไรที่ไม่รู้จัก: เก็บข้อความถ้ามี + warning, ไม่ error; `w:sdt`/`w:smartTag`/`w:hyperlink` คลี่เอาข้อความข้างใน; หลังปล่อยลองไฟล์จริงแล้วเพิ่ม fixture |
| ไฟล์อันตราย (zip bomb, XXE, path traversal, Jinja injection) | สูง | กติกาใน Architecture Decisions + test ความปลอดภัยทีละกรณี |
| HTML ที่สร้างไม่ตรงรูปแบบ Designer → กลายเป็น Custom Code | กลาง | golden `template.html` ของ fixture ถูก vitest อ่านด้วย `readBlocks` ใน T9: ต้องไม่มี Custom Code ยกเว้นตาราง rowspan |
| หน้าตาเพี้ยนจากต้นฉบับ (ระยะ, ความกว้าง) | กลาง | map ระยะย่อหน้าและความกว้างคอลัมน์จริง; ฟอนต์/ขนาดตามที่ผู้ใช้ตัดสิน; live test นับหน้า |
| แปลงช้า/กินแรมกับไฟล์ใหญ่ | ต่ำ | จำกัด 25 MB, XML ≤ 10 MB, ElementTree ครั้งเดียวต่อ part; ทำใน worker ที่มี timeout เดิม |

## Open Questions

ไม่มี
