# แผน v1.5: เก็บเอกสารที่ออก

สถานะ: **อนุมัติ 19 พ.ย. 2026** · task list: [todo.md](todo.md)
ที่มา: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) หัวข้อ v1.5 และหัวข้อ v1.5 ของ `SPEC-render-service.md`, `SPEC-public-api.md`,
`SPEC-studio.md`, `SPEC-infra.md` (อนุมัติ 19 พ.ย. 2026) · ฐาน: tag `v1.4.0`

## Overview

ทุก render ที่สำเร็จจาก version ที่ publish (ฟอร์มใน Studio หรือ API key) ถูกเก็บ: PDF ใน rustfs ที่ `documents/<run_id>`,
params/data/ชื่อไฟล์/sha256 ในตาราง `documents` → หน้า "เอกสาร" ใน Studio กรอง ค้นหา และดาวน์โหลดไบต์เดิมได้ ·
ลบตาม `run_retention` เดิม, backup รวม PDF, มีคำสั่งเก็บกวาดไฟล์กำพร้า · ไม่มี dependency ใหม่

## Architecture Decisions

- **`DocumentFiles` แยกจาก `BlobStore`:** asset เป็น content-addressed ไม่มี delete; เอกสารลบได้ ใช้ key ตาม run_id —
  bucket และ credential ชุดเดียวกัน คนละ prefix; มีแบบ memory ให้ unit test แบบเดียวกับ `MemoryBlobStore`
- **`Runs.record()` เป็นจุดเดียวที่เขียนเอกสาร:** สร้าง run_id → `put` → transaction (`runs` + `documents`) → ล้มแล้วลบ object
  `Runs` รับ `DocumentFiles` ทาง constructor; service แค่ส่ง `NewDocument` มา
- **retention ลบ DB ก่อน แล้วลบ object หลัง commit** — ต้องย้ายการเรียก `_apply_retention` ให้รู้ว่า transaction จบแล้ว
  (คืน run_id ที่ต้องลบออกมาจาก block `conn.transaction()` แล้วค่อยเรียก `delete`)
- **JSON ที่เก็บ:** `json.dumps(..., ensure_ascii=False, default=str)` — `ensure_ascii=False` จำเป็น: ไม่งั้นภาษาไทยถูกเก็บเป็น `\uXXXX`
  และ `ILIKE '%สมชาย%'` ไม่เจอ
- **contract ก่อน route** แบบทุกรอบ: `public-api.yaml` → test contract → `npm run gen:api` → studio
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task, ruff/pytest บน VM (สคริปต์ทดสอบเดิม), studio 4 คำสั่ง, E2E stack `-p jester-e2e`

## Phases

| Phase | Tasks | ปิดด้วย |
| --- | --- | --- |
| D1 เก็บเอกสาร | T1–T4 | pytest ผ่านรวม test กับ RustFS จริง; render บน VM แล้วเห็นแถว + object |
| D2 API | T5 | test contract 50 operation ผ่าน; `types.gen.ts` ใหม่ |
| Infra | T6–T7 | backup → restore ลง stack ใหม่ → ดาวน์โหลดเอกสารเดิมไบต์ตรง |
| D3 Studio | T8–T10 | Checkpoint: E2E ทุก spec ผ่าน + ผู้ใช้ลองหาใบเดิมเอง → ปล่อย `v1.5.0` |

Infra (T6–T7) ไม่ขึ้นกับ D2/D3 — ทำหลัง T4 ได้; จัดไว้ก่อน D3 เพื่อให้ E2E รอบสุดท้ายครอบ stack ที่ backup ได้แล้ว

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| VM/rustfs ต่อไม่ได้ (เครือข่ายเปลี่ยนเป็น hotspot เมื่อ 19 พ.ย.) | High | unit test ใช้ memory store ทำได้ก่อน; test ที่ต้องใช้ RustFS/Postgres รอ VM; บอกผู้ใช้ทันทีที่ติด |
| RustFS ไม่รองรับ `DeleteObjects` หรือ `ListObjectsV2` แบบที่ boto3 ส่ง | Med | T1 test กับ RustFS จริงก่อนใช้ใน T3/T6; ไม่ได้ → ลบทีละ key (`delete_object`) |
| ค้นภาษาไทยไม่เจอเพราะ JSON escape | Med | `ensure_ascii=False` + test ค้น "สมชาย" ใน T2 |
| retention รอบแรกลบไฟล์จำนวนมากใน request ของ render | Med | ชุดละ 500; ลบ object ล้มไม่ทำให้ render ล้ม |
| render ช้าขึ้นจากการ PUT PDF | Low | วัดเวลา render บน VM ก่อน/หลังใน T4 แล้วบันทึกลง todo |
| test เดิม "ไม่มี params/data/PDF ใน DB" ขัดกับ v1.5 | Low | เปลี่ยนเป็น "ไม่มีใน `runs` และ log" ตาม spec (ไม่ลบ test) |

## Open Questions

- CI ยังติด billing — รัน test บน VM ไปก่อนเหมือน v1.4
