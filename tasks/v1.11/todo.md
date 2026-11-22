# v1.11 Tag และสี — task list

แผน: [plan.md](plan.md) · spec: [docs/ideas/tags-v1-11.md](../../docs/ideas/tags-v1-11.md)
กติกา: test ก่อนโค้ด, commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → เลข version 1.11.0, tag `v1.11.0`, push `master` + tag, deploy
คำสั่ง: api `cd apps/api && uv run pytest <path>` · studio `cd apps/studio && npx vitest run && npx tsc --noEmit && npx eslint .` · E2E บน stack rc ของเครื่องทดสอบ

## Phase 0: spec เข้าที่

- [x] **T0 พับ spec เข้า SPEC-\*.md และ CAPABILITY_MAP** (S, docs)
  - Acceptance: หัวข้อ "v1.11" ต่อท้าย `SPEC-template-store.md`, `SPEC-render-service.md`, `SPEC-public-api.md`, `SPEC-studio.md` และ module `tags` ใน `CAPABILITY_MAP.md`; ตรงกับ one-pager
  - Verify: อ่านทวน; ลิงก์ในไฟล์เปิดได้
  - Files: `SPEC-*.md` 4 ไฟล์, `CAPABILITY_MAP.md`

## Phase 1: api

- [x] **T1 module `tags` + migration 0009** (M)
  - Acceptance: `normalize_tags(list)` ตามกติกา (trim/ยุบช่องว่าง/NFC, 1–30 ตัว, ห้ามจุลภาคและอักขระควบคุม, ซ้ำรวมเป็นอัน, ≤ 10, ลำดับคงเดิม, ผิด → `TagError` บอก tag ไหน); `COLORS` 9 ชื่อ; migration `0009_tags.sql` เพิ่ม `templates.tags`, `documents.tags` (`text[] NOT NULL DEFAULT '{}'` + GIN) และตาราง `tag_colors`; แถวเดิมเป็นชุดว่าง
  - Verify: `pytest tests/tags tests/db/test_migrations.py` (ฐานที่มี 0001–0008 + แถวเดิมย้ายขึ้นได้)
  - Files: `src/jester_api/tags/__init__.py`, `db/migrations/0009_tags.sql`, `tests/tags/test_normalize.py`, `tests/db/test_migrations.py`

- [x] **T2 tag ของรายงานใน template-store** (M)
  - Acceptance: `TemplateSummary.tags`; `list(tags=[…])` กรองต้องครบทุก tag; `set_tags(id, tags)` แทนทั้งชุด และ **ไม่เปลี่ยน** draft revision / `draftChangedSincePublish` / `updated_at` ของ draft; archive แล้วยังแก้ได้; `duplicate` คัดลอก tag; export ใส่ `manifest.tags`, import อ่านได้ทั้ง zip ใหม่และเก่า (ไม่มีฟิลด์ = ว่าง) โดย `formatVersion` เท่าเดิม
  - Verify: `pytest tests/template_store`
  - Files: `template_store/store.py`, `template_store/bundle.py`, `tests/template_store/test_tags.py`, `tests/template_store/test_bundle.py`

- [x] **T3 route และ OpenAPI ของ tag รายงาน** (M)
  - Acceptance: `GET /v1/templates` (+ `{id}`) ตอบ `tags`; `?tag=` ซ้ำได้; `PUT /v1/templates/{id}/tags` (Studio session; tag ผิด → 422 บอก tag ไหน; API key → 401 (route ของ session ตอบ 401 กับ API key ทุก route)); `public-api.yaml` ตรงกับ route
  - Verify: `pytest tests/public_api/test_templates.py tests/public_api/test_contract.py`
  - Files: `public_api/routes/templates.py`, `public_api/views.py`, `openapi/public-api.yaml`, `tests/public_api/test_templates.py`

- [x] **T4 tag ของเอกสารใน render-service** (M)
  - Acceptance: `render(..., tags=None)` ตรวจ tag **ก่อนเริ่ม** (ผิด → 422 ไม่มีแถว run/ไฟล์ค้าง); ไม่ส่ง = copy tag ของรายงานตอนนั้น; `documents.tags` เขียนในทรานแซกชันเดิม; `list_documents(tags=[…])` กรองครบทุก tag และ `q` ค้น tag ด้วย; `set_document_tags(run_id, tags)`; แก้ tag รายงานทีหลังไม่เปลี่ยนเอกสารเก่า
  - Verify: `pytest tests/render_service`
  - Files: `render_service/service.py`, `render_service/runs.py`, `tests/render_service/test_tags.py`, `tests/render_service/test_runs.py`

- [x] **T5 route และ OpenAPI ของ tag เอกสาร** (M)
  - Acceptance: `POST /v1/render` รับ `tags?` (API key ได้); `GET /v1/documents` ตอบ `tags`, กรอง `?tag=`; `PUT /v1/documents/{runId}/tags` (Studio session เท่านั้น, API key 401, runId ไม่มี 404); `public-api.yaml` ตรง
  - Verify: `pytest tests/public_api/test_render_runs.py tests/public_api/test_contract.py`
  - Files: `public_api/routes/render.py`, `public_api/routes/documents.py`, `public_api/views.py`, `openapi/public-api.yaml`, `tests/public_api/test_render_runs.py`

- [x] **T6 `/v1/tags` และสี** (S)
  - Acceptance: `GET /v1/tags` → `[{tag, color, templates, documents}]` เรียงตามจำนวนใช้รวมแล้วชื่อ; `PUT /v1/tag-colors` `{tag, color}` (ชื่อสีนอกชุด → 422; `gray` ลบแถว; tag ที่ไม่มีคนใช้ตั้งสีได้); Studio session เท่านั้น
  - Verify: `pytest tests/tags tests/public_api/test_contract.py`
  - Files: `tags/__init__.py` (ฟังก์ชันนับ/ตั้งสี), `public_api/routes/tags.py`, `public_api/app.py`, `openapi/public-api.yaml`, `tests/tags/test_routes.py`

### Checkpoint A: api
- [x] `pytest` ทั้งโฟลเดอร์ที่แตะผ่าน; ruff ผ่าน (ยกเว้น E501 สองจุดที่มีมาก่อน); OpenAPI ตรงกับ route (`test_contract`)
- [x] ทบทวนกับผู้ใช้ก่อนทำ Studio (ผู้ใช้สั่ง "ทำจนครบ Phase" 22 พ.ย. 2026 จึงไม่หยุดรอ)

## Phase 2: Studio

- [x] **T7 `lib/tags.ts`, types และ actions** (S)
  - Acceptance: `npm run gen:api` ได้ type ใหม่; `normalizeTags` เหมือนฝั่ง api (ชุดตัวอย่างเดียวกัน); `COLORS` ตรงชุด api; `chipStyle(color)` คืน CSS variables ของชิป; Server Actions `setTemplateTags`, `setDocumentTags`, `setTagColor`
  - Verify: `vitest tests/tags.test.ts`; `tsc`
  - Files: `lib/tags.ts`, `lib/types.gen.ts` (สร้าง), `lib/actions/tags.ts`, `tests/tags.test.ts`

- [x] **T8 `TagChip` และ `TagEditor`** (M)
  - Acceptance: ชิปแสดงชื่อ+สี; dialog: ช่องพิมพ์ (Enter/จุลภาคเพิ่ม, Backspace ลบอันท้าย, × ลบ), autocomplete จาก `/v1/tags`, เกิน 10/ผิดกติกาบอกที่ช่อง, กดชิปเปิดแผงเลือก 9 สี (radiogroup เลือกด้วยคีย์บอร์ดได้) แล้วบันทึกสีทั้งระบบ, บันทึก/ยกเลิก; aria ครบ
  - Verify: `vitest tests/tag-editor.test.tsx`
  - Files: `components/TagChip.tsx`, `components/TagEditor.tsx`, `components/TagEditor.module.css`, `tests/tag-editor.test.tsx`

- [x] **T9 catalog** (M)
  - Acceptance: การ์ด/แถวรายงานแสดงชิป; เมนูรายงานมี "แก้ tag…" (dialog ของตัวเอง); `CatalogFilters` เพิ่มตัวกรอง tag หลายตัวเก็บใน `?tag=` (ตัวเลือกจาก `/v1/tags`, optimistic เหมือน status); ช่องค้นหา `q` ค้นชื่อ id **และ tag**; duplicate พา tag ไปและขึ้นให้เห็น
  - Verify: `vitest` + ดูใน dev server ทั้ง theme Mahasamut และ Classic
  - Files: `app/(app)/page.tsx`, `components/CatalogFilters.tsx`, `components/TemplateMenu.tsx`, `app/(app)/catalog.module.css`, `tests/catalog-tags.test.tsx`

- [x] **T10 หน้าเอกสารที่ออก และตอนออกเอกสาร** (M)
  - Acceptance: คอลัมน์ tag + ตัวกรอง `?tag=` + "แก้ tag" ต่อแถว; ฟอร์มออกเอกสาร (`IssueForm`) และ dialog ออกเอกสารของ Studio (หาไฟล์ที่เรียก `render` จาก Studio ตอนทำ T10) มีช่อง tag เริ่มจาก tag ของรายงาน แก้ได้ก่อนออก; เอกสารที่ออกมี tag ตามที่เห็น
  - Verify: `vitest` + dev server
  - Files: `app/(app)/documents/page.tsx`, `components/IssueForm.tsx`, `lib/actions/runs.ts`, `tests/documents.test.ts`

- [x] **T11 สีอ่านออก 2 theme** (S)
  - Acceptance: test contrast ≥ 4.5:1 ครบ 9 สี × theme ที่มากับระบบ; classic ชิปกระจกตาม token; ตรวจตาใน dev server ทั้งสอง theme (ไม่มีตัวอักษรกลืน)
  - Verify: `vitest tests/tag-contrast.test.ts` + ภาพจาก dev server
  - Files: `components/TagChip.module.css`, `lib/tags.ts`, `tests/tag-contrast.test.ts`

### Checkpoint B: Studio
- [x] vitest ทั้งชุด (535), `tsc`, `eslint`, `next build` ผ่าน
- [x] ทบทวนกับผู้ใช้ (ดูข้างบน)

## Phase 3: E2E และปล่อย

- [x] **T12 E2E `tags.spec.ts` + ชุดเต็ม** (M)
  - Acceptance: ติด tag+สีรายงาน → กรองใน catalog → ออกเอกสาร (ได้สำเนา tag) → แก้ tag เอกสาร → กรองหน้าเอกสาร; แก้ tag รายงานแล้ว PDF เหมือนเดิม และสถานะไม่เป็น "แก้หลัง publish"; export→import แล้ว tag ยังอยู่; E2E เดิม 14 ตัวผ่านไม่ retry บน stack สดของเครื่องทดสอบ; **pytest ทั้งชุด** ผ่านบนเครื่องทดสอบ
  - Verify: `npx playwright test` (stack rc 1.11.0), `pytest` ทั้งชุด
  - Files: `e2e/tags.spec.ts`, `e2e/shared.ts`

- [ ] **T13 ปล่อย** (ผู้ใช้อนุมัติก่อนทุกขั้น)
  - [ ] อนุมัติ → bump 1.11.0 (`pyproject.toml`, `uv.lock`, `package.json`/lock, `infra/compose.yaml`), commit `chore: release 1.11.0`, tag `v1.11.0`, push `master` + tag, deploy `~/jester-stack` บนเครื่องทดสอบ (migration 0009 วิ่งตอน api ขึ้น), ลบ stack rc

ผลรัน T12 (22 พ.ย. 2026, เครื่องทดสอบ 192.168.30.26): pytest ทั้งชุด 771 passed / 3 skipped (live_stack ไม่ได้รัน); E2E 15/15 ไม่ retry บน stack สด 1.11.0-rc (เดิม 14 + tags)
