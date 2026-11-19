# แผน v1.7: Document Designer

สถานะ: **อนุมัติ 19 พ.ย. 2026** · task list: [todo.md](todo.md)
ที่มา: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) หัวข้อ v1.7, `SPEC-studio.md` และ `SPEC-template-store.md` หัวข้อ v1.7 (อนุมัติ 19 พ.ย. 2026) · ฐาน: tag `v1.6.0`

## Overview

หน้า Document Designer แยกเต็มจอ แก้ `template.html` ด้วยการลากวางบนผืน A4 จำลอง — `template.html` เป็นความจริงเดียว: parser HTML+Jinja ของเราเอง
แยกเป็นบล็อก (ส่วนที่ไม่รู้จัก = Custom Code) และเขียนกลับเฉพาะช่วงข้อความที่แก้ · starter ทั้ง 5 ตัวเขียนใหม่ให้ designer อ่านออกโดย PDF เหมือนเดิม ·
**ไม่มี endpoint ใหม่, ไม่มี dependency ใหม่** (ไฟล์ฟอนต์ TH Sarabun New คัดลอกเข้า Studio)

## Architecture Decisions

- **model ก่อน UI (แบบ v1.6):** `doc-parse` → `doc-edit` → `doc-check`/`doc-sample` เป็นฟังก์ชัน pure รับ/คืนข้อความไฟล์ มี Vitest ครบก่อนมีหน้าจอ
- **parser สองชั้น:** (1) tokenizer ตัดข้อความเป็น token ที่จำ offset: แท็ก HTML, `{{ }}`, `{% %}`, `{# #}`, ข้อความ (ไม่ทำ foster-parenting แบบ browser)
  (2) ต้นไม้ที่จับคู่แท็กเปิด/ปิด HTML และ block tag ของ Jinja (`if`/`for`/`macro`/…) ทนแท็กไม่ปิด; แล้ว **จำแนกบล็อก** ตามตารางใน spec —
  node ใดไม่ตรงรูปแบบ = Custom Code ที่ครอบช่วงข้อความต้นฉบับของมันพอดี
- **เขียนกลับ = แทนช่วงข้อความ:** แต่ละการแก้คำนวณช่วง `[start, end)` ที่เปลี่ยนแล้วแทนเฉพาะช่วงนั้น จากนั้น parse ใหม่ทั้งไฟล์ (ไฟล์เล็ก — starter ใหญ่สุด 78 บรรทัด)
  แทนการถือต้นไม้ที่แก้ได้; undo stack = สำเนาข้อความไฟล์ก่อนแต่ละการแก้ (ง่ายและคืนได้ทุกตัวอักษร)
- **ผืน = Shadow DOM** ใน Studio (ไม่ใช่ iframe): `@dnd-kit` ลากข้ามขอบ iframe ไม่ได้; Shadow DOM แยก `report.css` ออกจากสไตล์ Studio และเหตุการณ์เมาส์ยังไหลถึง `@dnd-kit`
  บล็อกบนผืนวาดด้วย React จากต้นไม้ (ไม่ใช่ `innerHTML` ของ template) — Custom Code วาด HTML ข้างในที่ Jinja ถูกแทนด้วยชิป (ข้อความ ไม่ execute)
- **ลากวาง:** ใช้กลไก v1.6 (`BuilderCanvas`: snapshot ตอนเริ่มลาก, pointer จริงแบบ capture, ช่อง "วางที่นี่", เหตุผลเมื่อวางไม่ได้) — แยกส่วนที่ใช้ร่วมเป็น
  `lib/drop-place.ts` + hook แทนการคัดลอก
- **เทียบ PDF ก่อน/หลังของ starter:** render ผ่าน Gotenberg (convert ที่มีอยู่) ทั้งไฟล์เดิมและไฟล์ใหม่ แล้วเทียบ **ข้อความและตำแหน่งของข้อความทุกชิ้นในทุกหน้า**
  ด้วย `pypdf` (มีอยู่แล้วใน dev deps) ต่างได้ ≤ 0.5 pt — ไม่ต้องมีตัว rasterize ใหม่; ภาพ/เส้นตรวจด้วยตาจากภาพหน้าแรกที่บันทึกใน `tasks/`
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task, studio 4 คำสั่ง บน Windows; pytest บน VM (container detached, `--user root`); E2E บน stack `-p jester-e2e`

## Phases

| Phase | Tasks | ปิดด้วย |
| --- | --- | --- |
| G1 model | T1–T4 | round-trip ทุกตัวอักษรของ starter ปัจจุบันทั้ง 5 + ไฟล์ทดสอบผิดรูป; จำแนกบล็อกครบตาราง; แก้แล้ว diff เฉพาะช่วง |
| G2 ผืน | T5 | ผืน A4 แสดง starter `quotation` ใกล้ PDF (ดูด้วยตา + วัดตำแหน่ง) |
| G3 หน้า designer | T6–T9 | ใช้ได้ครบใน browser กับ api บน VM |
| G4 starter | T10 | pytest เทียบ PDF ก่อน/หลังผ่านทั้ง 5; round-trip ไฟล์ใหม่ |
| ตรวจ | T11–T12 | Checkpoint: ผืน vs PDF บันทึกผล; E2E ทุก spec ผ่าน + ผู้ใช้ลอง → ปล่อย `v1.7.0` |

T10 ทำได้หลัง T2 (ต้องรู้รูปแบบบล็อก) คู่ขนานกับ G2/G3

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| parser พลาดกับ HTML+Jinja ที่เขียนมือ → เขียนทับเสียหาย | High | round-trip test กับทุก starter + ไฟล์ผิดรูป; ส่วนที่ไม่แน่ใจ = Custom Code เสมอ (ห้ามเดา); การแก้แทนเฉพาะช่วงของบล็อกที่ parse สำเร็จ |
| แก้ข้อความบนผืน (contenteditable) กับชิป → DOM เพี้ยน/caret หลุด | High | ข้อความแก้ใน editor เล็กที่ควบคุมเอง: ชิปเป็น element ที่ `contenteditable=false`; ตอนออกจากโหมดพิมพ์อ่านกลับเป็น token list ไม่ใช่ HTML ของ DOM; มี test ของการแปลง |
| ผืนไม่ตรง PDF (ฟอนต์, CSS ที่ binder เติม, ความกว้างตาราง) | Med | ใช้ฟอนต์ไฟล์เดียวกับ Gotenberg; ฉีด CSS ชุดเดียวกับ `index_html`; T11 วัดและบันทึก; เส้นตัดหน้าเป็นประมาณการ + Preview pdf |
| `@dnd-kit` ใน Shadow DOM | Med | T7 ลองลากใน Shadow DOM เป็นอย่างแรก; ไม่ได้ → ผืนเป็น div ปกติที่ scope CSS ด้วย prefix (ถามผู้ใช้ก่อนเปลี่ยน) |
| เขียน starter ใหม่แล้ว PDF ต่าง | Med | เทียบข้อความ+ตำแหน่งทุกชิ้นด้วย pypdf; ต่าง → ปรับ starter ไม่ใช่ปรับเกณฑ์ |
| งานใหญ่ (ปล่อยก้อนเดียว) | Med | checkpoint ภายในหลัง G1 และหลัง T7 ส่งภาพ/ลิงก์ให้ผู้ใช้ดูทิศทางก่อนไปต่อ |

## Open Questions

- ไม่มี (spec ปิดครบ) · CI ยังติด billing — test ของ studio รันบน Windows, api บน VM
