# Tasks v1.5: เก็บเอกสารที่ออก

แผน: [plan.md](plan.md) · สถานะ: **อนุมัติ 19 พ.ย. 2026 · T1–T10 เสร็จ รอ checkpoint ของผู้ใช้**

กติกา: commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → เลข version 1.5.0, tag `v1.5.0`, push `master` + tag;
ไม่สร้าง GitHub Release; VM เป็นเครื่องทดสอบล้วน

คำสั่งตรวจ:
- api: `ruff check . && ruff format --check .` + pytest บน VM (สคริปต์ทดสอบที่ส่ง `apps/api` ไปรันข้าง dev DB + RustFS)
- studio: `npm run lint && npm run typecheck && npm test && npm run build`
- E2E: stack ใหม่ `-p jester-e2e` (3002/8002), token ตัวล่าสุดจาก log, หยุด main stack ชั่วคราว, `down -v` หลังจบ

## Phase D1: เก็บเอกสาร (`render-service`)

- [x] **T1 `DocumentFiles` (S3 + memory)**
  - Acceptance: `put(run_id, pdf)`, `get(run_id)` (ไม่มี → `StoreError("NOT_FOUND")`), `delete(run_ids)` (ทีละ ≤ 1,000, key ที่ไม่มีไม่ผิด),
    `list_older_than(cutoff)` คืน run_id ใต้ `documents/`; run_id ต้องเป็น hex 22 ตัว
  - Verify: pytest แบบ memory + test live กับ RustFS ใน dev compose (put/get/delete/list) — ข้อนี้ยืนยัน `DeleteObjects` ก่อน T3
  - Files: `render_service/document_files.py`, `tests/render_service/test_document_files.py`
- [x] **T2 ตาราง `documents` + `Runs.record()` เขียนเอกสาร + ค้นหา**
  - Acceptance: migration `0008_documents.sql` ตาม spec; `record()` สร้าง run_id → `put` → transaction → ล้มแล้วลบ object;
    `put` ล้ม → โยน error ให้ service map เป็น 503; `has_document` ใน `get`/`list`; `list_documents` (กรอง, `q` ILIKE escape `%` `_` `\`,
    cursor); `document(run_id)`; JSON เก็บด้วย `ensure_ascii=False, default=str`; `"\u0000"` และ Decimal เก็บได้
  - Verify: pytest `test_runs.py` (ค้น "สมชาย" ใน data เจอ, `%` ไม่เป็น wildcard, insert ล้ม → object หาย)
  - Files: `db/migrations/0008_documents.sql`, `render_service/runs.py`, `tests/render_service/test_runs.py`
- [x] **T3 retention ลบเป็นชุด + ลบ object หลัง commit + นับเอกสาร**
  - Acceptance: ลบ ≤ 500 run ต่อรอบ; run_id ที่มีเอกสารถูกส่งให้ `delete` หลัง commit; ลบ object ล้ม → log warning, render สำเร็จ;
    `retention(preview_days)` คืน `would_delete_documents`; ค่าเริ่มต้น (เก็บตลอด) ไม่ลบ
  - Verify: pytest `test_runs.py`
  - Files: `render_service/runs.py`, `tests/render_service/test_runs.py`
- [x] **T4 `RenderService` ส่งเอกสาร + อ่าน PDF + ต่อสาย**
  - Acceptance: `default_name` คำนวณก่อน `_record`; เก็บเฉพาะ `kind == "render"` ที่สำเร็จ; preview/422/403/410 ไม่มีเอกสาร;
    `put` ล้ม → `SERVICE_UNAVAILABLE` 503 และ run failed; `document_pdf` ตรวจ sha256 (หาย/ไม่ตรง → `NOT_FOUND` + log error);
    `build_services` สร้าง `DocumentFiles`; test เดิม "ไม่มี params/data/PDF ใน DB" เปลี่ยนเป็น "ไม่มีใน `runs` และ log"
  - Verify: pytest `render_service` ทั้งชุด; render บน VM แล้วเห็นแถว + object; วัดเวลา render ก่อน/หลังแล้วบันทึกด้านล่าง
  - Files: `render_service/service.py`, `public_api/app.py`, `tests/render_service/test_service.py`

## Phase D2: API (`public-api`)

- [x] **T5 `listDocuments`, `getDocument`, `Run.hasDocument`, `RunRetention.wouldDeleteDocuments`**
  - Acceptance: contract ตาม spec (50 operation); session เท่านั้น, API key → 401/403; `q` ว่าง/ยาวเกิน 100 → 422;
    run ที่ไม่มีหรือเป็น preview → 404; PDF ตอบพร้อม `Content-Disposition` จาก `content_disposition()` เดิม
  - Verify: pytest `test_contract.py`, `test_render_runs.py`; `npm run gen:api` แล้ว studio typecheck ผ่าน
  - Files: `openapi/public-api.yaml`, `public_api/routes/runs.py` (หรือ `documents.py` ใหม่ถ้า `runs.py` ยาวเกิน), `tests/public_api/test_render_runs.py`, `studio/lib/types.gen.ts`

## Phase Infra

- [x] **T6 `ops.blobs`: export/import เอกสาร + `sweep-documents`**
  - Acceptance: export เขียน `documents/<run_id>` ของทุกแถว (object หายแต่แถวยังอยู่ → ล้ม; แถวหายระหว่างทาง → ข้าม);
    import รับชื่อ sha256 หรือ `documents/<run_id>` เท่านั้น; sweep ลบเฉพาะ object ที่ไม่มีแถวและเก่ากว่า 1 ชั่วโมง พิมพ์จำนวน
  - Verify: pytest `tests/ops/test_blobs.py`
  - Files: `ops/blobs.py`, `tests/ops/test_blobs.py`
- [x] **T7 `backup.sh`/`restore.sh` manifest v2 + README**
  - Acceptance: `formatVersion: 2`, `blobCount` นับเฉพาะ asset, `documentCount`; restore รับ 1 และ 2; comment หัว `backup.sh` แก้ตาม spec;
    README: ตาราง backup, ข้อมูลลูกค้า, cron ของ `sweep-documents`
  - Verify: บน VM: render 3 ใบ → backup → restore ลง `-p jester-restore` → ดาวน์โหลดไบต์ตรง; restore backup v1 เก่ายังผ่าน; `shellcheck`
  - Files: `infra/backup.sh`, `infra/restore.sh`, `infra/README.md`

## Phase D3: Studio

- [x] **T8 หน้า "เอกสาร" + Route Handler ดาวน์โหลด**
  - Acceptance: `/documents` กรองรายงาน, ค้นหา, ตาราง, paging, ข้อความว่าง/ไม่พบ, นโยบายเก็บใต้หัวข้อ; `/documents/[runId]` ตรวจ runId แล้วส่งต่อ PDF;
    เมนู "เอกสาร" ใน `NavLinks`
  - Verify: studio 4 คำสั่ง; ลองในเบราว์เซอร์กับ api บน VM
  - Files: `app/(app)/documents/page.tsx`, `app/documents/[runId]/route.ts`, `components/NavLinks.tsx`
- [x] **T9 ทางเข้า + หน้าประวัติ + ยืนยัน retention**
  - Acceptance: ปุ่ม "เอกสารที่ออก" ใน catalog และ toolbar โหมดออกเอกสาร; ข้อความ "เก็บแล้ว · ดูเอกสารที่ออก" หลังออก PDF;
    หน้าประวัติมีลิงก์ดาวน์โหลดเมื่อ `hasDocument`; `RetentionPanel` ยืนยันด้วยทั้งสองจำนวน
  - Verify: studio 4 คำสั่ง; Vitest ของข้อความยืนยัน
  - Files: `app/(app)/page.tsx`, `components/Workspace.tsx`, `app/(app)/history/page.tsx`, `components/RetentionPanel.tsx`
- [x] **T10 E2E `issued-documents.spec.ts`**
  - Acceptance: ตาม Testing Strategy v1.5 ของ SPEC-studio (ฟอร์ม → ค้นเจอ → ไบต์ตรง; API key ขึ้นเป็น "API: <ชื่อ>"; preview ไม่ขึ้น)
  - Verify: E2E ทุก spec ผ่านบน `jester-e2e`
  - Files: `e2e/issued-documents.spec.ts`

บันทึก 19 พ.ย. 2026 (T1–T10 เสร็จ, commit f5c0db0..76f6415):
- api: ruff สะอาด · pytest ทั้งชุดบน VM 658 passed + 8 ตัวที่พังรันซ้ำผ่าน 29/29 (7 ตัวเป็น live test ที่ Chromium ของ Gotenberg ล่มตอน VM
  swap เต็ม — restart แล้วผ่าน; 1 ตัวเป็น test ใหม่ที่เช็ก `\u0000` ผิด) · coverage รวม 97% (`runs.py` 99%, `document_files.py` 97%,
  `routes/documents.py` 100%, `ops/blobs.py` 82%) · `DeleteObjects`/`ListObjectsV2` ใช้ได้กับ RustFS 1.0.4 จริง
- studio: lint, typecheck, test (80 + `documents.test.ts`), build ผ่าน · E2E 5/5 ผ่านบน stack ใหม่ `jester-e2e` (ไม่ใช้ retry)
- T7 บน VM: backup stack E2E (asset 1, เอกสาร 4, `formatVersion: 2`) → restore ลง `jester-restore` → PDF ทั้ง 4 ใบ sha256 ตรงกับก่อน backup;
  manifest แบบ v1 ผ่านการตรวจรูปแบบ (หยุดที่ "database not empty" ตามที่ควร) · `sweep-documents` บน stack จริง: 0 ไฟล์กำพร้า · `shellcheck` สะอาด
- ต่างจากแผน/spec:
  - E2E ชื่อ `issued-documents.spec.ts` (ไม่ใช่ `documents.spec.ts`) ให้เรียงหลัง full-flow ซึ่งต้องการ catalog ว่าง
  - E2E เทียบไบต์กับ blob ที่หน้าเว็บแสดง เพราะ Playwright คืน `response.body()` ว่างสำหรับ stream ที่หน้าอ่านไปแล้ว
  - ตารางเอกสารแสดง `key: ค่า` ของ params (ไม่ใช่ `title`) เพราะรายการไม่มี title ของ version — ถ้าต้องการ title ต้องอ่าน `report.json` ของแต่ละ version เพิ่ม
  - ไม่ได้วัดเวลา render ก่อน/หลัง (T4): VM มี IO pressure สูง (avg60 ~57%) ตัวเลขที่วัดได้จะไม่มีความหมาย
- สภาพ VM: RAM 4 GB ไม่พอรัน stack หลัก + stack E2E + pytest พร้อมกัน (swap เต็ม, load ถึง 71) — หยุด stack หลักชั่วคราวระหว่างตรวจ แล้วเปิดคืนแล้ว
  (ยังเป็น 1.4.0) · image ทดสอบใช้ tag `1.5.0-rc` เฉพาะในสำเนา `/opt/jester-e2e`

## Checkpoint: ปล่อย v1.5.0

- [x] api + studio + E2E ผ่านทั้งหมด
- [ ] ผู้ใช้ลองออกใบแล้วหาใบเดิมเจอจากเลขเอกสารหรือชื่อลูกค้า
- [ ] อนุมัติ → version 1.5.0 (api, studio, compose tag), tag `v1.5.0`, push, deploy บน VM
