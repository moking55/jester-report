# แผน v1.6: Form builder

สถานะ: **รออนุมัติ** · task list: [todo.md](todo.md)
ที่มา: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) หัวข้อ v1.6 และหัวข้อ v1.6 ของ `SPEC-studio.md` (อนุมัติ 19 พ.ย. 2026) · ฐาน: tag `v1.5.0` + `2d5b253` (ปุ่มการ์ด catalog)

## Overview

dev สร้าง parameters + `data.schema.json` ด้วยการลากวางในโหมด "ออกแบบฟอร์ม" ของ workspace; ชนิด input และความกว้างอยู่ใน `form.json`;
ฟอร์มออกเอกสารอ่าน `form.json`; แท็บ "ช่องข้อมูล" ให้ copy expression · **Studio อย่างเดียว ไม่มีงาน api** ·
dependency ใหม่: `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2

## Architecture Decisions

- **model ก่อน UI:** `lib/schema-edit.ts` เป็นฟังก์ชัน pure รับ/คืน "ข้อความไฟล์" (`BuilderFiles` = report.json, schema, samples, form.json)
  ทุกกติกา (เพิ่ม, ย้าย, เปลี่ยนชื่อ, ลบ, sample, `lists.path`) อยู่ที่นี่และมี Vitest ครบก่อนมี UI — `FormBuilder` แค่เรียกและแสดงผล
- **ตัวเลขไม่เพี้ยนตอนเขียนกลับ:** อ่าน JSON ด้วย reviver ที่ใช้ `context.source` (Node 24 และ Chrome รองรับ, ตรวจแล้ว) เก็บตัวเลขเป็น
  token ข้อความ แล้ว stringify เองให้ token ออกมาเหมือนเดิม — `12345678901234567.89` ใน sample หรือ `default` ไม่กลายเป็น float
  (ถ้า browser ไม่มี `context.source` → builder อ่านอย่างเดียวพร้อมบอกเหตุผล ไม่เขียนทับ)
- **แก้ object เดิม ไม่สร้างใหม่:** แต่ละการแก้เปลี่ยนเฉพาะ key ที่ builder เป็นเจ้าของ (`type`, `format`, `title`, …) — keyword อื่นติดไปเอง;
  ลำดับ key = ลำดับช่อง (rename สร้าง object ใหม่ตามลำดับเดิม)
- **E3 ก่อน E2:** ฟอร์มออกเอกสารอ่าน `form.json` และแท็บ "ช่องข้อมูล" เล็กกว่าและใช้ model ตรง ๆ — ได้ทดสอบ `form.json` กับฟอร์มจริงก่อนสร้าง builder
- **`@dnd-kit` อยู่ใน `FormBuilder` เท่านั้น:** model ไม่รู้จัก dnd (รับ "ย้ายช่อง X ไปตำแหน่ง Y") เพื่อเปลี่ยน library ได้
- **performance:** การ์ด `memo` ตาม path; ระหว่างลากใช้ state ของ `@dnd-kit` (transform) — state ของ builder (`useImmer`) เปลี่ยนเมื่อวางเท่านั้น
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task, studio 4 คำสั่ง (`lint`, `typecheck`, `test`, `build`) บน Windows; E2E บน stack `-p jester-e2e` ตอนท้าย

## Phases

| Phase | Tasks | ปิดด้วย |
| --- | --- | --- |
| E1 model | T1–T4 | Vitest: round-trip ทุก starter, ทุกกติกาใน spec "เปลี่ยนชื่อและลบ" |
| E3 ฟอร์มและแท็บ | T5–T6 | ฟอร์มออกเอกสารใช้ `form.json` ที่เขียนมือ; แท็บ "ช่องข้อมูล" ใน workspace (ลองกับ api บน VM) |
| E2 builder | T7–T9 | ลากครบ 9 ชนิด + แป้นพิมพ์ + บันทึก + preview; performance 150 ช่อง |
| ตรวจ | T10 | Checkpoint: E2E ทุก spec ผ่าน + ผู้ใช้ลองสร้างฟอร์มเอง → ปล่อย `v1.6.0` |

T5–T6 ขึ้นกับ T1 และ T4 เท่านั้น; T7 ขึ้นกับ T2–T3

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ตัวเลขใน sample/default เพี้ยนเมื่อ builder เขียนกลับ | High | reviver `context.source` + test ด้วย `12345678901234567.89` และ `1e400` ใน T2 |
| key ที่เป็นตัวเลข (`"1"`) ถูก JS เรียงขึ้นก่อนเมื่อ parse → ลำดับช่องเปลี่ยน | Med | builder สร้างเฉพาะ key ตามกติกา `Name`; schema ที่มี key ขึ้นต้นด้วยตัวเลขอยู่แล้ว → ส่วนนั้นอ่านอย่างเดียว (test ใน T2) |
| sortable ซ้อนหลายระดับ (กลุ่มในกลุ่ม, คอลัมน์ในตาราง) ใน `@dnd-kit` ซับซ้อน | Med | T8 เริ่มจาก `SortableContext` ต่อ container + `onDragOver` ย้ายข้าม container ตามตัวอย่าง multiple containers ของ `@dnd-kit`; กติกาวางได้/ไม่ได้มาจาก model (`canMove`) |
| `@dnd-kit` (release ล่าสุดธ.ค. 2024) มีปัญหากับ React 19.3.1 | Med | T7 ติดตั้งแล้วลองลากในเบราว์เซอร์ก่อนสร้างส่วนอื่น; ไม่ได้ → หยุดถามผู้ใช้ |
| บันทึกทีละไฟล์ล้มกลางทาง | Low | ลำดับ schema → sample → report.json → form.json; บอกไฟล์ที่ค้าง; บันทึกซ้ำเขียนต่อเฉพาะที่ต่าง (test ใน T7 ด้วย fetch ปลอม) |
| ผืนใหญ่ลากกระตุก | Low | T8 วัดด้วย Performance panel กับ schema 150 ช่อง บันทึกผลใน todo |

## Open Questions

- ไม่มี (spec ปิดครบ) · CI ยังติด billing — test ของ studio รันบน Windows, E2E บน VM เหมือน v1.5
