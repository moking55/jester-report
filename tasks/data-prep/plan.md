# Implementation Plan: `data-prep`

สถานะ: **T1–T5 เสร็จ — รอผู้ใช้ที่ Checkpoint B** (14 พฤศจิกายน 2026)
Spec: [SPEC-data-prep.md](../../SPEC-data-prep.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

สร้าง module ที่รับ `ReportDefinition` (จาก `report-definition`) + params + data + meta แล้วคืน view model (`params`, `data`, `lists`, `totals`, `meta`, `fmt`) หรือรายการปัญหาพร้อม pointer ทำจากส่วนที่ไม่ขึ้นกับใคร (formatters, evaluator) ไปยังส่วนที่รวมทุกอย่าง (`prepare`) และจบด้วย fixture รายงานอ้างอิง 3 แบบกับ specimen ของ research

## Architecture Decisions

- **Evaluator เดิน AST ของ `report-definition` ด้วย `match`:** ไม่มี parser ซ้ำ ไม่มี `eval`; ใช้ `decimal.localcontext()` (precision 28, `ROUND_HALF_UP`) ทุกครั้งที่คำนวณ จึงไม่แตะ context global
- **Error ภายในเป็น exception ส่วนตัว (`_CalcError(code, pointer)`)** แล้วแปลงเป็น `Problem` ที่ขอบ module; เก็บสูงสุด 50 รายการ
- **`ListView` เป็น `Sequence` จริง** (subclass `collections.abc.Sequence`) มี `.rows` และ `.groups` — Jinja วนลูปได้ และ sandbox ของ `binder` เข้าถึง attribute ปกติได้
- **ทำสำเนา data ก่อนแปลงตัวเลข:** row เป็น dict ใหม่ ไม่แก้ object ของผู้เรียก
- **ตรวจ data ด้วย validator + format checker เดียวกับ `report-definition`** (`data_schema.FORMATS`) — ไม่เขียนกติกาวันที่/ทศนิยมซ้ำ

## Dependency Graph

```
T1 formatters ────────────────────────┐
T2 evaluator ── T4 lists/sort/group ──┼── T5 prepare + fixtures + specimens
T3 params ────────────────────────────┘
```

T1, T2, T3 ไม่ขึ้นกับกัน (ไฟล์แยก)

## Task List

### Phase 1: ชิ้นส่วนอิสระ
- [x] T1: formatters (`money`, `number`, `thai_date`, `thai_date_short`, `baht_text`)
- [x] T2: evaluator ของ expression + decimal context
- [x] T3: ตรวจและเติม params

### Checkpoint A
- [x] tests T1–T3 ผ่าน, ruff สะอาด; decimal context global ไม่เปลี่ยน

### Phase 2: รวมเป็น view model
- [x] T4: lists — ดึง, แปลงตัวเลข, float, id ซ้ำ, computed/totals ต่อแถว, sort, group
- [x] T5: `prepare` — ตรวจ data, รวมทุกขั้น, fixture 3 แบบ, specimen ของ research

### Checkpoint B: module เสร็จ
- [x] Success criteria 1–5 ของ spec ผ่าน, coverage 98%
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม `binder`

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `baht_text` ผิดในกรณีขอบ (เอ็ด, ยี่สิบ, หลักล้านซ้อน, สตางค์) | High (เอกสารเงิน) | ตาราง test ≥ 15 ค่าที่ตรวจด้วยมือ รวม 11, 21, 101, 1,000,001, 21,000,000, ล้านล้าน, ติดลบ, ปัดสตางค์ |
| ปัดเศษผิดชั้น (ปัดก่อนหรือหลังรวม) | High | ปัดเฉพาะเมื่อ expression ใช้ `round()`; `fmt.money` ปัดตอนแสดงเท่านั้น; test กรณี rounding ของ T10 |
| float หลุดเข้ามาจาก JSON ที่ parse ผิด | Med | `NUMBER_IS_FLOAT` + test; `public-api` ต้อง parse ด้วย `parse_float=Decimal` (บันทึกไว้ใน spec แล้ว) |
| ข้อความ error มีค่าจาก data | Med | test ที่ใส่ค่าลับใน data แล้วตรวจว่าไม่มีในทุก message |

## Open Questions

ไม่มี — ทุกข้อใน spec ปิดแล้ว
