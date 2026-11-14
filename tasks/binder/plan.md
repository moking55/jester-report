# Implementation Plan: `binder`

สถานะ: **ร่าง รออนุมัติ** (14 พฤศจิกายน 2026)
Spec: [SPEC-binder.md](../../SPEC-binder.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

สร้าง module ที่รับ `ReportDefinition` + ไฟล์ template + รายชื่อ asset + `Prepared` แล้วคืน `Bound` (index/header/footer, ไฟล์และ asset ที่ถูกอ้าง, `PageSetup`) หรือปัญหาพร้อมไฟล์/บรรทัด
เริ่มจากการเติมค่าที่หายใน `data-prep` (กติกาที่ผู้ใช้เลือก) แล้วสร้างชิ้นส่วนของ binder ทีละไฟล์ รวมเป็น `bind()` และจบด้วยชั้นป้องกันที่ engine + live test บน VM

## Architecture Decisions

- **เติมค่าที่หายใน `data-prep` ไม่ใช่ใน `binder`:** แถวของ list ถูกสร้างใน `data-prep` อยู่แล้ว (`convert_numbers` คืน dict ใหม่) จึงเติม property ที่หายในจุดเดียวกันได้โดยไม่ต้องสร้าง `ListView` ซ้ำ; `data` ระดับบนทำสำเนาแล้วเติมตาม schema
- **`StrictUndefined` + `finalize`:** หลังเติมค่าแล้ว ชื่อที่ยัง undefined คือชื่อที่ไม่มีใน schema จริง (typo) จึงใช้ `StrictUndefined` ตรง ๆ ได้; `finalize` แปลง `None` → `""` และ `Mapping`/`list`/`ListView` → `""` พร้อมเก็บ warning
- **บรรทัดของ error มาจาก traceback:** Jinja เขียน traceback ใหม่ให้ frame มีชื่อไฟล์ template และบรรทัด จึงเดิน `exc.__traceback__` หา frame ที่ `co_filename` เป็นชื่อไฟล์ใน draft; warning ของ `finalize` ใช้ `sys._getframe` แบบเดียวกัน
- **ใช้ regex ของ lint ร่วมกัน:** `report_definition/lint.py` เปลี่ยน `_REFS`, `_EXTERNAL`, `_TFOOT` เป็น public (ไม่เปลี่ยนพฤติกรรม) เพื่อให้กติกา "resource ไหนยอมได้" มีที่เดียว
- **ไม่มี HTML parser:** ตรวจหลัง render ด้วย regex เหมือน lint และพึ่ง allow-list ของ engine เป็นชั้นที่สอง
- **Engine args:** เป้าหมาย `--chromium-disable-javascript=true`, `--chromium-allow-list=^file:///tmp/.*` และ `--chromium-deny-private-ips=true` ถ้า 9.4.1 มี — ยืนยันด้วย `gotenberg --help` ใน image ก่อน (docs ปัจจุบันอาจเป็นเวอร์ชันใหม่กว่า)

## Dependency Graph

```
T1 data-prep เติมค่าที่หาย ──┐
T2 environment ──────────────┼── T5 bind() + fixtures ── T6 engine hardening + live
T3 document ─────────────────┤
T4 resources ────────────────┘
```

T1–T4 ไม่ขึ้นกับกัน (ไฟล์แยก); T6 ต้องใช้ VM `10.0.1.29` ผ่าน SSH tunnel

## Task List

### Phase 1: ชิ้นส่วน
- [ ] T1: `data-prep` เติม property ที่ประกาศแต่ไม่ได้ส่งมา (data + แถวของ list + list ลูก) + อัปเดต SPEC-data-prep.md
- [ ] T2: `binder/environment.py` — sandbox, finalize, แปลง exception เป็น Problem พร้อมบรรทัด, จำกัด output 20 MB
- [ ] T3: `binder/document.py` — ห่อ index.html, CSS พื้นฐาน, @font-face ของ asset, CSS ของ header/footer, `PageSetup`
- [ ] T4: `binder/resources.py` — ตรวจ resource/script/tfoot หลัง render, รวบรวมไฟล์และ asset ที่ถูกอ้าง

### Checkpoint A
- [ ] tests T1–T4 ผ่าน, ruff สะอาด, test เดิมทั้งหมดยังผ่าน

### Phase 2: รวมและยืนยันกับ engine จริง
- [ ] T5: `bind()` — รวมทุกขั้น, fixture 3 แบบ, ตารางค่าที่หาย, escape, SSRF, determinism
- [ ] T6: args ป้องกันของ engine + spike ซ้ำ + live test ของ binder

### Checkpoint B
- [ ] Success criteria 1–6 ของ spec ผ่าน; ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| บรรทัดจาก traceback ของ Jinja ไม่ตรงใน `include`/macro | กลาง | test ทั้ง template และ partial; ถ้าหาไม่ได้คืน `line=None` แทนเลขผิด |
| `finalize` หาบรรทัดของ warning ไม่ได้เสมอ | ต่ำ | spec ยอมให้ "เท่าที่หาได้"; warning ไม่ขวางผล |
| ปิด JS แล้วเลขหน้าหาย | กลาง | ทางถอยที่ตกลงไว้: เปิด JS ใช้แค่ allow-list |
| flag ใน docs ไม่มีใน 9.4.1 | กลาง | ตรวจ `--help` ใน image ก่อน; ถ้าไม่มีให้แจ้งผู้ใช้ก่อนเปลี่ยนเวอร์ชัน |
| เติมค่าที่หายทำให้ `{% if data.x %}` เป็นจริงเสมอ | ต่ำ | ผู้ใช้ยอมรับแล้ว; เขียนไว้ใน spec และจะอยู่ในเอกสารผู้เขียน template |
| VM/SSH tunnel ไม่พร้อมตอน T6 | กลาง | T1–T5 ไม่ต้องใช้ engine; T6 ทำเมื่อเข้าถึง VM ได้ |

## Open Questions

ไม่มี (ปิดใน interview ของ spec)
