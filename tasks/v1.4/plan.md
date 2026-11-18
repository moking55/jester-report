# แผน v1.4: ฟอร์มออกเอกสาร

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** · task list: [todo.md](todo.md)
ที่มา: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) หัวข้อ v1.4 และหัวข้อ v1.4 ของ `SPEC-report-definition.md`, `SPEC-template-store.md`,
`SPEC-studio.md` (อนุมัติ 18 พ.ย. 2026) · ฐาน: tag `v1.3.0`

## Overview

หัวหน้าทีมที่ dev ชวนมาลอง กดปุ่ม "ออกเอกสาร" ใน catalog → workspace เปิดในโหมดฟอร์ม (ซ่อนไฟล์และแท็บล่าง) → กรอกฟอร์ม
ภาษาไทยที่สร้างจาก version ที่ publish → ได้ PDF ข้างฟอร์ม · ไม่มี endpoint ใหม่, ไม่มี dependency ใหม่, ไม่เก็บเอกสาร

## Architecture Decisions

- **F0 ก่อน F1:** ป้ายภาษาไทยมาจาก `title` ของ schema และของ parameter; ต้องให้ `report.json` รับ `title` ได้ก่อน (ตอนนี้ `extra="forbid"`)
- **`lib/form.ts` เป็น pure function ทั้งหมด** (schema → ช่อง, ค่า → body, ตรวจค่า, pointer → ช่อง) จึง test ด้วย Vitest ได้ครบ
  ก่อนต่อ UI — ส่วนที่เสี่ยงที่สุด (ตัวเลขไม่ผ่าน float, pointer ของแถวในตาราง) อยู่ที่นี่
- **body ประกอบจากข้อความ** แบบ `lib/render.ts`: decimal เป็น string ตาม schema, integer เป็นตัวเลข JSON จากข้อความที่ผ่าน regex
- **Route Handler `app/issue/[id]/route.ts`** รับ body JSON จาก `fetch` ของฟอร์ม แล้วส่งต่อ `/v1/render` ด้วย version `"published"`
  ตอบ PDF หรือ problem JSON — ต่างจาก `/render/[id]` เดิมที่รับ form POST และตอบหน้า error เป็น HTML
- **โหมดอยู่ใน `Workspace`:** prop `mode` จาก `?mode=issue`; หน้า `templates/[id]/page.tsx` โหลด `getVersion` ของ version ที่ publish
  เฉพาะเมื่ออยู่ในโหมดนี้
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task (แยกตาม path เพื่อไม่ปนกัน), ตรวจในเบราว์เซอร์กับ api ที่ VM

## Phases

| Phase | Tasks | ปิดด้วย |
| --- | --- | --- |
| F0 ป้ายภาษาไทย | T1–T2 | api test ผ่าน, ทุก starter มี title ครบ |
| F1 โหมดออกเอกสาร | T3–T7 | Checkpoint: E2E 4 spec ผ่าน + ผู้ใช้ลองออกใบกำกับภาษีเอง → ปล่อย `v1.4.0` |

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ตัวเลขเงินคลาดจาก float | High | ประกอบ body จากข้อความ; Vitest กับ `"12345678901234567.89"` |
| schema ของผู้ใช้มีโครงที่ฟอร์มไม่รองรับ | Med | ส่วนนั้นเป็น textarea JSON ดิบ ไม่ทำให้ฟอร์มพัง; test ครอบ `oneOf`/`$ref` |
| pointer ของ api ชี้แถวในตารางผิด | Med | test `/data/items/1/unitPrice` → ช่องแถวที่ 2; E2E ใส่ค่าผิดให้ api ตอบ |
| โหมดใหม่ทำ workspace เดิมพัง (layout, shortcut, การบันทึก) | Med | E2E เดิม 3 spec ต้องผ่าน; โหมดออกเอกสารไม่ mount editor |
| VM โหลดหนัก/หลุดระหว่าง E2E | Low | หยุด main stack ชั่วคราว, รอ load < 4 ก่อนรัน (ทำแบบนี้แล้วใน v1.1) |

## Open Questions

- CI ยังติด billing (ผู้ใช้กำลังตรวจ) — งานรอบนี้ยังรัน test บน VM ไปก่อน; ถ้า CI กลับมาระหว่างทาง จะเพิ่มการตรวจ CI ทุก commit
