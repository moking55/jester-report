# Implementation Plan: `engine-client` + Spike M0

สถานะ: **อนุมัติแล้ว — Phase 0–1 เสร็จ, Checkpoint A ผ่าน** (13 พฤศจิกายน 2026)
Spec: [SPEC-engine-client.md](../../SPEC-engine-client.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md)
Task list: [todo.md](todo.md)

> ที่ตั้งไฟล์: `tasks/plan.md` และ `tasks/todo.md` เดิมเป็นแผน research ที่ปิดครบแล้ว (0 รายการค้าง) และมีเอกสาร 6 ไฟล์ลิงก์ถึง จึงไม่เขียนทับ แผนของแต่ละ module อยู่ใน `tasks/<module-id>/`

## Overview

สร้าง adapter `engine-client` (Python) ที่ส่งชุดไฟล์ HTML ไป Gotenberg 9.4.1 พร้อม safety options และแปล error เป็น taxonomy ของ Jester แล้วใช้มัน render รายงานอ้างอิง 3 แบบ (spike M0) เพื่อตอบคำถามหัวตารางซ้ำ, ภาษาไทยใน header/footer และแถวสูงเกินหน้า ผลลัพธ์สุดท้ายคือ module ที่ test ผ่าน และ `spikes/m0/REPORT.md` ที่ใช้ตัดสินทางเดินของ `binder`

## Architecture Decisions

- **Async `httpx` client ตัวเดียวต่อ `EngineClient`**: FastAPI เป็น async และ render ใช้เวลานาน ไม่ควร block event loop
- **Client ไม่ retry เอง**: คืน `retryable` ให้ `render-service` ตัดสิน เพราะ retry ต้องรู้ idempotency และ budget ของงาน
- **Safety options ฝังในโค้ด ไม่เป็น parameter**: ผู้เรียกปิด `failOn*` ไม่ได้ ตาม spec
- **Spike เรียก `engine-client` จริง ไม่เขียน HTTP แยก**: spike จึงเป็น integration test ของ module ไปด้วย
- **ภาพหน้า PDF ทำบน VM** ผ่าน `ssh`/`scp` + `pdftoppm` เพราะเครื่อง dev (Windows) ไม่มี poppler และไม่ติดตั้งของหนักบนเครื่องนี้
- **Text extraction สองตัว**: `pypdf` เป็นหลัก และ `pdftotext` (poppler บน VM) เป็นตัวเทียบ เพราะ extraction ภาษาไทยอาจสลับลำดับสระ/วรรณยุกต์ ถ้าสองตัวไม่ตรงกันให้ตัดสินด้วยภาพ (L4) ไม่สรุปว่า PDF ผิด

## Dependency Graph

```
T1 font licenses ─────────────────────────┐
T2 scaffold ── T3 models/validation ── T4 convert_html ── T5 errors+health
                                                              │
                                                     Checkpoint A
                                                              │
                                                 T6 spike harness
                                                   │      │      │
                                     (T1) ── T7 SP-B   T8 SP-A   T9 SP-C
                                                   └──────┼──────┘
                                                     T10 REPORT.md
                                                          │
                                                     Checkpoint B (ผู้ใช้ตัดสิน)
```

## Task List

### Phase 0: Foundation
- [x] T1: ตรวจ license ฟอนต์และตัดสินฟอนต์ค่าเริ่มต้น
- [x] T2: Scaffold `apps/api` (uv, ruff, pytest) และ git init

### Phase 1: engine-client
- [x] T3: Models และการตรวจไฟล์ก่อนส่ง
- [x] T4: `convert_html` happy path + live test
- [x] T5: Error mapping, network errors และ `health()`

### Checkpoint A: engine-client
- [x] Unit tests ผ่าน, coverage `engine_client` ≥ 90%, ruff สะอาด
- [x] Live tests ผ่านกับ Gotenberg จริงผ่าน tunnel
- [x] ค่า `failOnResourceHttpStatusCodes` และพฤติกรรม 503 ยืนยันจากผลจริงและบันทึกใน spec

### Phase 2: Spike M0
- [ ] T6: Spike harness (`run_spike.py`, manifest, checks L1–L3, ภาพหน้าบน VM)
- [ ] T7: SP-B ตารางข้ามหน้า + หัวตารางซ้ำ
- [ ] T8: SP-A ใบเสนอราคา + ไทยใน header/footer + fallback
- [ ] T9: SP-C แถวสูงเกินหน้า + PO02 ไม่มี detail
- [ ] T10: `REPORT.md` พร้อมผล L4 และการตัดสินใจที่เปิดให้ผู้ใช้

### Checkpoint B: ผล spike
- [ ] ทุก case มีผล ผ่าน/ไม่ผ่าน พร้อมหลักฐานใน manifest และภาพ
- [ ] ผู้ใช้ทบทวน REPORT.md และตัดสินทางเดินของ `binder` ก่อนเขียน spec ถัดไป

## Parallelization

- T1 ทำคู่กับ T2–T5 ได้ (เอกสารล้วน)
- T7, T8, T9 ทำคู่กันได้หลัง T6 (fixture แยกโฟลเดอร์) แต่ทั้งหมดใช้ Gotenberg ตัวเดียวบน VM 4 GB จึงรันจริงทีละ case
- T3 → T4 → T5 ต้องเรียงกัน (ไฟล์เดียวกัน)

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| License ฟอนต์แห่งชาติไม่อนุญาตแจกต่อ | Med | ตามที่ผู้ใช้ตกลง: ใช้ Sarabun (OFL) เป็นค่าเริ่มต้นแทน; T1 ทำก่อน T7/T8 |
| Text extraction ภาษาไทยเพี้ยนทั้งที่ PDF ถูก | Med | ใช้สอง extractor + ภาพหน้าเป็นตัวตัดสินสุดท้าย; บันทึกความต่าง |
| 500 แถว/landscape ทำ VM 4 GB หรือ container 2 GB ล้น | Low | 500 แถวเป็นรอบเสริม รันทีละงาน; ถ้า OOM บันทึกเป็นผล ไม่เพิ่ม limit เอง |
| SSH tunnel หลุดระหว่างรัน | Low | `run_spike.py` ตรวจ `health()` ก่อนแต่ละ case และหยุดพร้อมข้อความชัด |
| Gotenberg ตอบ 200 แต่ asset/ฟอนต์หายเงียบ | High | `failOn*` เปิดทุกครั้ง + ตรวจฟอนต์ที่ฝังและ `.notdef` ใน L3 |
| ผล spike ไม่ผ่านแล้วต้องเปลี่ยนแนวทาง | High (แต่คือเป้าของ spike) | หยุดที่ Checkpoint B ให้ผู้ใช้ตัดสิน ไม่เดินหน้า `binder` เอง |

## Open Questions

1. อนุญาต `git init` ที่ root ของโปรเจกต์ใน T2 ไหม (ยังไม่มี remote ไม่ push)
2. ที่ตั้งแผนแบบ `tasks/<module-id>/` ใช้ต่อทุก module ได้ไหม
