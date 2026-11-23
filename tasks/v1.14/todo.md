# v1.14 ฟอร์มเปล่า — task list

แผน: [plan.md](plan.md) · spec: หัวข้อ v1.14 ของ SPEC-data-prep / SPEC-public-api / SPEC-studio
กติกา: test ก่อนโค้ด, commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → เลข version 1.14.0, tag `v1.14.0`, push `master` + tag, deploy
คำสั่ง: api `cd apps/api && uv run pytest <path> && uv run ruff check <files>` · studio `cd apps/studio && npx vitest run <path> && npm run lint && npm run typecheck` · pytest เต็มชุดและ E2E บนเครื่องทดสอบ

## Phase 1: api

- [x] **T1 `prepare(..., blank=True)`** (M)
  - Acceptance: parameter บังคับที่ขาดเป็น `None`; error `required`/`minItems` ของ schema ไม่นับ (ชนิด/format ยังนับ); `VALUE_MISSING` และ aggregate ของ list ว่างให้ `None` โดยไม่มี problem และส่งต่อถึงยอดที่พึ่ง; key ของ sort/groupBy ที่ขาดไม่ error เรียงท้าย; `meta.blank` ตั้งเสมอ (`True`/`False`)
  - Verify: `pytest tests/data_prep` (test ใหม่ตาม Testing Strategy v1.14 + test เดิมไม่แก้)
  - Files: `data_prep/prepare.py`, `data_prep/params.py`, `data_prep/lists.py`, `data_prep/evaluate.py`, `tests/data_prep/test_blank.py`

- [x] **T2 `fmt` ของโหมดเปล่า** (S)
  - Acceptance: `fmt.qr(None)`, `fmt.promptpay(None)`, `fmt.barcode("")` คืนค่าว่างเมื่อ `blank`; โหมดปกติ error เหมือนเดิม; bind starter ทั้ง 5 ด้วย `data={}` แบบเปล่าไม่มี error และ HTML ไม่มี `None`/`0.00`
  - Verify: `pytest tests/data_prep tests/binder`
  - Files: `data_prep/prepare.py`, `data_prep/codes.py`, `tests/data_prep/test_blank.py`, `tests/binder/test_blank_bind.py`

- [x] **T3 `allowEmpty` บน `/v1/render`, `draft/preview`, `draft/prepared`** (M)
  - Acceptance: query param boolean (ค่าอื่น → 422); ส่งถึง `prepare(blank=...)`; quota/allow-list/run history/การเก็บเอกสารเหมือนเดิม; `public-api.yaml` มี param + description + example; `npm run gen:api` แล้ว `tsc` ผ่าน
  - Verify: `pytest tests/public_api tests/render_service`
  - Files: `public_api/routes/render.py`, `render_service/service.py`, `openapi/public-api.yaml`, `tests/public_api/test_render_blank.py`, `apps/studio/lib/types.gen.ts`

### Checkpoint A: api
- [x] pytest เต็มชุดของ api บนเครื่องทดสอบผ่าน: 805 passed / 3 skipped (live_stack) ใน 106 วินาที (23 พ.ย. 2026); ruff ของไฟล์ที่แตะสะอาด; Studio `gen:api` + `tsc` ผ่าน
- [ ] curl `?allowEmpty=true` กับ starter `quotation` บน stack rc ได้ PDF ที่ช่องว่างและไม่มี `0.00`

## Phase 2: Designer และ starter

- [x] **T4 `doc-blocks`: บรรทัดเปล่าของบล็อกตารางรายการ** (M)
  - Acceptance: อ่านรูปแบบใน plan เป็นส่วนของบล็อก `table` (`blankRows: N`); ตั้ง N เขียนทั้งสองส่วน (แถวเปล่า + ตัวห่อแถว "ไม่มีรายการ"); 0 → N → 0 ได้ไฟล์เดิมทุกตัวอักษร; เพิ่ม/ลบ/สลับคอลัมน์ปรับแถวเปล่าตาม; ตารางที่มี detail row ใช้ได้; รูปอื่นที่คล้ายแต่ไม่ตรงเป็น Custom Code
  - Verify: `npx vitest run tests/doc-blocks.test.ts tests/doc-edit.test.ts`
  - Files: `lib/doc-blocks.ts`, `lib/doc-edit.ts`, `tests/doc-blocks.test.ts`, `tests/doc-edit.test.ts`

- [x] **T5 แผงคุณสมบัติ "บรรทัดเปล่าในฟอร์มเปล่า" + ตารางใหม่ = 10** (S)
  - Acceptance: ช่องจำนวนเต็ม 0–100 ในแผงของบล็อกตารางรายการ, undo ได้; ตารางที่ลากจาก palette มี 10; ผืนไม่วาดแถวเปล่า
  - Verify: vitest ของแผง/palette; `npm run lint && npm run typecheck`
  - Files: `components/designer/*` (แผงตาราง, palette), `lib/doc-edit.ts`

- [x] **T6 starter 4 ตัวได้บรรทัดเปล่า 10** (M)
  - Acceptance: `quotation`, `purchase-order`, `sales-grouped`, `tax-invoice` มีรูปแบบใน plan; vitest อ่านได้ N = 10 และ round-trip ไม่เปลี่ยน; ฟอร์มเปล่าด้วย `data={}` ผ่าน Gotenberg ได้ 1 หน้า A4 (ล้น → ลดเฉพาะตัวนั้นและจดไว้ที่นี่); `test_starter_pdf` ผ่านโดยไม่แก้ expected
  - Verify: `pytest tests/template_store tests/binder` (live บนเครื่องทดสอบ) + `npx vitest run tests/doc-blocks.test.ts`
  - Files: `template_store/starters/*/template.html` (4 ไฟล์), `tests/template_store/test_starter_blank.py`
  - ผล: 10 บรรทัดได้ 1 หน้า A4 ทั้ง 4 ตัว (test live ผ่านบนเครื่องทดสอบ: pytest 819 passed / 3 skipped); `sales-grouped` เป็นตารางแบ่งกลุ่ม (Custom Code ใน Designer) จึงเขียนมือในรูปแบบเดียวกัน; `purchase-order` วนตารางต่อใบสั่งซื้อ: ฟอร์มเปล่าที่ไม่ส่งใบสั่งซื้อเลยจะไม่มีตาราง ต้องส่งอย่างน้อย 1 ใบ (เช่น `{"orders": [{"orderId": ""}]}`)

### Checkpoint B: Designer และ starter
- [ ] สร้างรายงานจาก `quotation` บน stack rc → ฟอร์มเปล่าผ่าน API ได้ 10 บรรทัด; Designer เปิด starter ได้โดยตารางไม่เป็น Custom Code
- [ ] ทบทวนกับผู้ใช้ (ภาพ PDF ฟอร์มเปล่าของ starter ทั้ง 4)

## Phase 3: Studio ออกเอกสาร

- [x] **T7 checkbox "ฟอร์มเปล่า (สำหรับเขียนมือ)"** (M)
  - Acceptance: ไม่ติ๊ก = เหมือนเดิม; ติ๊ก → `validate` ข้ามช่องบังคับแต่ยังจับค่าผิดรูปแบบ, ส่ง `/issue/<id>?allowEmpty=true`, ชื่อไฟล์เริ่มต้น `<id>-blank-v<version>.pdf`; Developer dialog มี `?allowEmpty=true` และ body เฉพาะค่าที่กรอก
  - Verify: `npx vitest run tests/form.test.ts tests/render.test.ts` + lint/typecheck
  - Files: `components/IssueForm.tsx`, `lib/form.ts`, `lib/render.ts`, `app/issue/[id]/route.ts`, tests

- [x] **T8 "ดูแบบฟอร์มเปล่า" ใน Preview** (S)
  - Acceptance: Designer และ workspace มีตัวเลือกนี้ข้างปุ่ม Preview; ส่ง `data={}` + `allowEmpty=true` ไป `/preview/<id>`; ตั้ง 15 บรรทัดแล้วเห็น 15 โดยไม่ publish
  - Verify: vitest ของ route/ปุ่ม + lint/typecheck
  - Files: `app/preview/[id]/route.ts`, `components/Workspace.tsx`, `components/designer/Workbench.tsx`

- [x] **T9 E2E และ live** (S)
  - Acceptance: E2E ใหม่ `blank-form.spec.ts` (Success Criteria 1, 2, 4 ของ SPEC-studio v1.14); E2E เดิมผ่าน; ลองกด Ctrl+Shift+Space ใน editor บน stack rc ด้วย (ค้างจาก `ee17d58`)
  - Verify: `npx playwright test` บน stack rc
  - Files: `e2e/issue-blank.spec.ts` (ชื่อนี้เพื่อให้รันหลัง checkpoint-a ที่สร้างผู้ใช้ E2E)
  - ผล (23 พ.ย. 2026, stack rc `1.14.0-rc`): E2E ทั้งชุด 16 ตัวผ่าน (15 เดิม + ตัวใหม่ที่รันซ้ำหลังเปลี่ยนชื่อ); Ctrl+Shift+Space ใน editor ลองใน browser จริงแล้ว `td{padding:1mm;color:red}` กลายเป็น 4 บรรทัดที่จัดรูปแบบ

### Checkpoint C: ครบ
- [x] Success Criteria v1.14 ครบทุกข้อ; pytest 819 passed (เครื่องทดสอบ), vitest 581 passed, E2E 16 ตัวผ่าน
- [ ] ผู้ใช้ลองบน stack rc แล้วอนุมัติปล่อย

- [ ] **T10 release 1.14.0** (S): เลข version (api, studio, compose), commit `chore: release 1.14.0`, tag `v1.14.0`, push + deploy หลังผู้ใช้อนุมัติ, backup ก่อน deploy
