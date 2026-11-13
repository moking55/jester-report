# Implementation Plan: `report-definition`

สถานะ: **อนุมัติแล้ว — T1–T6 เสร็จ, รอผู้ใช้ที่ Checkpoint B** (14 พฤศจิกายน 2026)
Spec: [SPEC-report-definition.md](../../SPEC-report-definition.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

สร้าง module Python แบบ pure ที่รับไฟล์ข้อความของ draft/version + รายชื่อ asset + ฟอนต์ที่ engine มี แล้วคืน `ReportDefinition` ที่ parse แล้ว พร้อมปัญหาทั้งหมดในครั้งเดียว (file/line/pointer) ทำตามลำดับ: model ของ `report.json` → ภาษา expression → การอ้างอิงข้าม field → data schema/sample → lint template → `load_definition` ที่รวมทุกอย่าง และ fixture รายงานอ้างอิง 3 แบบ

## Architecture Decisions

- **แต่ละขั้นคืน `list[Problem]` ไม่ raise:** ทำให้ `load_definition` รวมปัญหาทั้งหมดได้ในครั้งเดียวตาม spec; exception ใช้เฉพาะ bug ของเราเอง
- **Model ของ `report.json` ใช้ pydantic `extra="forbid"`:** ได้การปฏิเสธ field ที่ไม่รู้จักฟรี และแปลง `loc` ของ pydantic เป็น JSON Pointer ได้ตรง ๆ
- **บรรทัดใน `report.json`:** ใช้ `json.JSONDecodeError.lineno` สำหรับ syntax error; ปัญหาเชิงความหมายรายงานเป็น JSON Pointer (ไม่สร้าง JSON parser ที่เก็บตำแหน่งเอง) — Studio ชี้ด้วย pointer ได้
- **Parser expression เขียนเอง (recursive descent):** tokenizer → AST เป็น dataclass เล็ก ๆ; โหมด basic/advanced ตรวจตอน parse; ไม่มี `eval`/`ast`/Jinja expression
- **Lint template ใช้ `jinja2.Environment().parse()` + `jinja2.meta`** สำหรับ syntax/ตัวแปรระดับบนสุด และ regex ที่จำกัดเป้าหมายสำหรับ `<tfoot`, `@font-face`, `font-family`, `src/href/url()` — ไม่สร้าง HTML/CSS parser เต็มรูป
- **sha256:** hash เหนือรายการ `(ชื่อไฟล์, sha256 เนื้อหา)` เรียงตามชื่อ + asset hashes ไม่ขึ้นกับลำดับ dict

## Dependency Graph

```
T1 model ── T2 expressions ── T3 refs/order ──┐
     │                                         ├── T6 load_definition + fixtures
     ├── T4 data schema + samples ─────────────┤
     └── T5 lint template ─────────────────────┘
```

T2, T4, T5 ขึ้นกับ T1 เท่านั้น จึงทำคู่ขนานได้ (ไฟล์แยกกัน) แต่ทำทีละตัวในเซสชันนี้

## Task List

### Phase 1: Definition model และ expressions
- [x] T1: deps + model ของ `report.json` + การแปลงปัญหาเป็น pointer
- [x] T2: tokenizer/parser ภาษา expression (basic + advanced)
- [x] T3: ตรวจการอ้างอิงและลำดับคำนวณ (refs, ตัวเลข, วงวน)

### Checkpoint A
- [x] tests ของ T1–T3 ผ่าน, ruff สะอาด
- [x] expression นอก grammar ถูกปฏิเสธทั้งหมดโดยไม่ execute code

### Phase 2: ไฟล์ประกอบและการรวม
- [x] T4: ตรวจ `data.schema.json` และ sample
- [x] T5: lint template/header/footer
- [x] T6: `load_definition`, sha256 และ fixture รายงานอ้างอิง 3 แบบ

### Checkpoint B: module เสร็จ
- [x] Success criteria 1–5 ของ spec ผ่าน, coverage 99%
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม `data-prep`

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Regex lint พลาดกรณี HTML/CSS แปลก ๆ (คอมเมนต์, string) | Med | จำกัดเป้าหมาย; test กรณีคอมเมนต์และ string ที่มีคำต้องห้าม; lint เป็นด่านแรก ไม่ใช่ด่านเดียว (engine `failOn*` ยังกันไฟล์หาย) |
| Parser expression มีช่องให้ทำงานเกินที่ตั้งใจ | High | grammar ปิด, test syntax ต้องห้าม (`__import__`, attribute call, lambda, index), ไม่มี `eval` ใน module (grep ใน test) |
| JSON Pointer ไม่ตรงกับที่ Studio คาด | Low | ใช้รูปแบบ RFC 6901 และ test escape `~0`/`~1` |
| Fixture รายงานอ้างอิงต้องเขียน template ใหม่เป็น Jinja | Low | ดัดแปลงจาก fixture ของ spike; data schema จาก `research/specimens/report-input.schema.json` |

## Open Questions

ไม่มี — ทุกข้อในสเปกปิดแล้ว
