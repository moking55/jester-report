# Implementation Plan: `render-service`

สถานะ: **Phase 1 เสร็จ — Checkpoint A ผ่าน** (14 พฤศจิกายน 2026)
Spec: [SPEC-render-service.md](../../SPEC-render-service.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

รวม `template-store` → `report-definition` → `data-prep` → `binder` → `engine-client` เป็น pipeline เดียวสำหรับ render/preview/validate พร้อมประวัติการ render (run) ที่มี provenance และนโยบายเก็บที่ผู้ใช้ตั้งเอง
ทำชิ้นที่ทดสอบแยกได้ก่อน (worker, probe ฟอนต์, run) แล้วรวมเป็น service และจบด้วย live test บน VM

## Architecture Decisions

- **worker = process ใหม่ต่องาน (`multiprocessing`):** parent โหลด definition (cache) แล้วส่ง `ReportDefinition` + ไฟล์ + asset info + params + data ให้ child รัน `prepare` + `bind` แล้วส่ง `BindResult` กลับทาง `Pipe`; เกิน timeout → `kill()` + `join()`; รอผล child ด้วย `asyncio.to_thread` เพื่อไม่ขวาง event loop; comment `shortcut:` บอกทางเปลี่ยนเป็น pool
  - context: `fork` บน Linux (เร็ว, ไม่ต้อง pickle argument), `spawn` บน Windows (dev) — ต้อง pickle ได้ จึงมี test ว่า `ReportDefinition` และ `Prepared` input pickle ได้
- **cache เป็น dict แบบ LRU เล็ก ๆ ใน service** (stdlib `OrderedDict`) ไม่เพิ่ม dependency: definition ของ version (64 รายการ), asset bytes (รวม 64 MB), `system_fonts` (จน restart)
- **probe ฟอนต์:** render `header.html` ที่ใช้ `font-family: "<family>"` หนึ่งครั้งต่อ family ที่ยังไม่รู้ แล้วอ่าน `/BaseFont` จาก PDF ด้วย `pypdf`; ผลจำไว้ทั้งมีและไม่มี
- **คิว:** `asyncio.Semaphore(6)` ต่อ process + `asyncio.wait_for(acquire, 10 s)` → `SERVICE_UNAVAILABLE`; สร้างใน `__init__` ของ service (loop เดียวกับ API) ไม่สร้างตอน import
- **run:** บันทึกใน transaction แยกจากงาน render (บันทึก failed ได้เสมอ); canonical hash = sha256 ของ `json.dumps(sort_keys=True, default=str)` (Decimal เป็น string); retention ตรวจทุก 100 run ด้วยตัวนับใน DB (`nextval` ของ sequence) ไม่ใช่ตัวนับใน memory
- **ลายน้ำ DRAFT:** แทรก `<div style="position:fixed; …">DRAFT</div>` ก่อน `</body>` ของ `index_html` ที่ bind แล้ว (ข้อความคงที่ ไม่ผ่าน resource check เพราะไม่มี resource)

## Dependency Graph

```
T1 worker ──────────┐
T2 fonts probe ─────┼── T4 service: render ── T5 preview/validate/runs API/health/contract ── T6 live
T3 runs + retention ┘
```

T1–T3 ไม่ขึ้นกับกัน

## Task List

### Phase 1: ชิ้นส่วน
- [x] T1: `worker.py` — `run_in_worker` ใน process ใหม่ต่องาน, timeout + kill, exception เป็น problem, comment ต่อยอดเป็น pool
- [x] T2: `fonts.py` — probe ฟอนต์ของ engine + cache, engine ล่ม → `None`
- [x] T3: `0003_runs.sql` + `runs.py` — บันทึก/อ่าน run, canonical hash, cursor, retention (ค่าเริ่มต้นเก็บตลอด)

### Checkpoint A
- [x] tests T1–T3 ผ่าน (T3 บน db), ruff สะอาด

### Phase 2: service
- [ ] T4: `service.py` — `render`: resolve version, cache definition/asset, worker, engine, provenance, map error ทุกแถวของตาราง, คิว
- [ ] T5: `preview` (ลายน้ำ), `validate` (trial bind ทุก sample), `list_runs`/`get_run`/`last_runs`, `health`, `retention`/`set_retention`; contract `/v1/runs/retention`; `pypdf` เป็น dependency จริง
- [ ] T6: live test บน VM (engine + db + storage): render quotation จาก starter ที่ publish, preview มี DRAFT ทุกหน้า, probe เจอ TH Sarabun New, ลูปไม่รู้จบได้ 504 ขณะ request อื่นยังตอบ

### Checkpoint B
- [ ] Success criteria 1–5 ของ spec ผ่าน; ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `spawn` บน Windows ช้า (~0.5–1 วินาที) ทำให้ test ช้า | ต่ำ | production เป็น Linux (`fork`); test worker ใช้ timeout สั้นและงานน้อย |
| object บางตัว pickle ไม่ได้ (เช่น `SimpleNamespace` ของ formatter) | กลาง | ส่งแค่ input (definition, params, data, meta) ให้ child สร้าง `Prepared` เอง; มี test pickle |
| `fork` หลังเปิด psycopg pool หรือ thread แล้ว child ได้ state ครึ่ง ๆ | กลาง | child ไม่แตะ DB/network เลย ทำแค่ `prepare` + `bind` แล้วออก |
| probe ฟอนต์ช้าในการเรียกครั้งแรก | ต่ำ | ทำครั้งเดียวต่อ family แล้ว cache; validate ที่ engine ล่มได้ `FONT_UNVERIFIED` แทนรอ |
| retention ลบผิดจำนวน | สูง | ค่าเริ่มต้น `NULL` = ไม่ลบเลย; test ว่า preview นับตรงกับที่ลบจริง |

## Open Questions

ไม่มี (ปิดใน interview ของ spec)
