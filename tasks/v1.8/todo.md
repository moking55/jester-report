# Todo v1.8: การจัดหน้า

แผน: [plan.md](plan.md) · spec: หัวข้อ v1.8 ใน SPEC ทั้ง 7 · ฐาน: `v1.7.0`

## Phase A: api

- [x] **T1 spike: ขนาดใด ๆ + ใบเสร็จม้วนใน Gotenberg**
  - Acceptance: สคริปต์ส่ง HTML จริงไป Gotenberg บน VM: A5 แนวนอน, custom 100×50 mm, 80 mm + `singlePage=true` (ข้อความยาว 3 ความยาว) →
    บันทึกขนาดหน้า PDF ที่ได้; ตัดสินวิธีทำม้วน (singlePage หรือ 2 รอบ) ใน plan.md
  - Verify: ตัวเลขขนาดหน้าจาก `pypdf` บันทึกใน `tasks/v1.8/spike.md`
  - Files: `tasks/v1.8/spike.md`, สคริปต์ใน `tasks/v1.8/`
- [x] **T2 `page` ใหม่ + list ซ้อน 3 ชั้นใน report-definition**
  - Acceptance: `size`/`orientation`/`widthMm`/`heightMm`/`rollWidthMm`/`layout`/`marginsMm` ตาม spec + `PAGE_INVALID`; ขนาด mm ของทุกขนาดคำนวณที่เดียว;
    list ซ้อน 3 ชั้น; report.json เดิมทั้งหมดยังผ่าน
  - Verify: pytest `tests/report_definition` (ค่าถูก/ผิดทุกกฎ, starter ทุกตัว load ได้)
  - Files: `report_definition/model.py`, `report_definition/page.py` (ใหม่), tests
- [x] **T3 engine: ขนาด mm + ม้วน**
  - Acceptance: `PageSetup(width_mm, height_mm, single_page, margins)`; วิธีม้วนตาม T1
  - Verify: pytest unit (form fields) + live: A5 แนวนอน, custom, ม้วน 58/80 ได้ขนาดหน้าถูก (`pypdf`)
  - Files: `engine_client/models.py`, `engine_client/client.py`, tests
- [x] **T4 binder: page setup, แบบอิสระ, header/footer**
  - Acceptance: PageSetup จาก `page`; CSS ฐานแบบอิสระ + ซ่อน guide; ไม่ส่ง header/footer ในม้วน/อิสระ (+ warning); `<img>` ใน header/footer เป็น data URI (≤ 1 MB)
  - Verify: pytest binder + live: แบบอิสระ A5 ข้อความอยู่ตามพิกัด ±0.5 mm; header มีรูปโลโก้ใน PDF
  - Files: `binder/bind.py`, `binder/document.py`, tests
- [x] **T5 data-prep: ซ้อน 3 ชั้น**
  - Acceptance: list ลูก/หลานเตรียมครบทุกชั้น, totals ต่อแถวแม่, ลำดับหลาน → ลูก → แม่; test เดิมผ่านทั้งหมด
  - Verify: pytest `tests/data_prep` (ใบสั่งซื้อ 3 ชั้น, หลานว่าง, groupBy ในลูก)
  - Files: `data_prep/prepare.py`, `data_prep/lists.py`, tests
- [x] **T6 สร้างรายงานพร้อม `page` (store + api + Studio types)**
  - Acceptance: `POST /v1/templates` รับ `page` (blank เท่านั้น) → report.json + template ตั้งต้นตามรูปแบบ (แผ่น/ม้วน/อิสระ); OpenAPI + contract test; `npm run gen:api`
  - Verify: pytest template_store + public_api (contract); starter PDF เทียบ v1.7 ผ่าน
  - Files: `template_store/store.py`, `template_store/starter.py`, `public_api/…`, `openapi/public-api.yaml`, `studio/lib/types.gen.ts`

### Checkpoint A
- [x] pytest ทั้งชุดบน VM ผ่าน (708); PDF จริงของ A5/custom/ม้วน/อิสระ ถูกขนาด (test_layouts_live)

## Phase B: Studio ขนาด + สร้าง

- [x] **T7 ผืนทุกขนาด + ม้วน + เปลี่ยนขนาดใน toolbar**
  - Acceptance: `paperOf` รู้ทุกขนาด (ตาราง mm ตรงกับ api); ผืน/ไม้บรรทัด/ขอบตามขนาด; ม้วน = แถบยาวตามเนื้อหา ไม่มีเส้นตัดหน้า/โซน header-footer;
    toolbar "ขนาดกระดาษ" + แนว เขียน `page` (แก้เฉพาะค่า, หนึ่งขั้น undo); ม้วน ↔ แผ่น ปิดไว้
  - Verify: Vitest `paper` (ทุกขนาด, setPage คงข้อความอื่น); เบราว์เซอร์ A5/Letter/ม้วน
  - Files: `lib/paper.ts`, `components/designer/PaperCanvas.tsx`, `Rulers.tsx`, `DesignerPage.tsx`, tests
- [x] **T8 modal สร้างรายงาน**
  - Acceptance: starter "ว่าง" → modal การ์ด "จัดวางแบบคงที่"/"จัดวางแบบอิสระ" + ขนาด (สำเร็จรูป/กำหนดเอง/ม้วน) + แนว; ม้วนปิดแบบอิสระพร้อมเหตุผล; starter อื่นไม่มี modal
  - Verify: Vitest component; เบราว์เซอร์สร้างทั้ง 3 แบบ
  - Files: `components/CreateTemplate.tsx`, `components/PageSetupModal.tsx` (ใหม่), `lib/actions/templates.ts`

## Phase C: header/footer + ซ้อน

- [x] **T9 แก้ header/footer บนผืน**
  - Acceptance: ดับเบิลคลิกโซนบน/ล่าง → แก้ด้วยบล็อกชุดเล็ก + ชิป "หน้า X/Y"; history/บันทึกครอบ 4 ไฟล์; สร้างไฟล์ให้เมื่อยังไม่มี; ม้วน/อิสระไม่มีโซน
  - Verify: Vitest (history 4 ไฟล์, ชิปเลขหน้า); เบราว์เซอร์ + Preview pdf มีโลโก้/เลขหน้าทุกหน้า
  - Files: `DesignerPage.tsx`, `Workbench.tsx`, `PaperCanvas.tsx`, `lib/doc-edit.ts`
- [x] **T10 ซ้อนหลายชั้นใน designer**
  - Acceptance: วนซ้ำซ้อน 3 ชั้น; ตารางรายการ "แถวรายละเอียด" (เปิด/ปิด) ใส่ตาราง/วนซ้ำของ array ลูกได้; ยอดชั้นย่อยเป็นชิป; ตารางเดิมไม่เปลี่ยน
  - Verify: Vitest `doc-blocks`/`doc-edit` (แถวรายละเอียด, round-trip); เบราว์เซอร์ใบสั่งซื้อ 3 ชั้น + PDF
  - Files: `lib/doc-blocks.ts`, `lib/doc-edit.ts`, `PaperCanvas.tsx`, `BlockPanels.tsx`
- [x] **T11 form builder + ฟอร์มออกเอกสาร: ตารางซ้อน 3 ชั้น**
  - Acceptance: ลากตารางลงตาราง (≤ 3 ชั้น); ฟอร์มออกเอกสารกรอก/เพิ่ม/ลบแถวในตารางซ้อนได้; schema ที่ได้ผ่าน api
  - Verify: Vitest `schema-edit`, `form`; E2E เพิ่มใน `self-built-form`
  - Files: `lib/schema-edit.ts`, `components/FormBuilder.tsx`, `components/BuilderCanvas.tsx`, `components/IssueForm.tsx`

## Phase D: แบบอิสระ

- [x] **T12 model แบบอิสระ**
  - Acceptance: `doc-blocks` อ่าน `data-jd="page"`/`box`/`rect`/`line` (ส่วนอื่น = Custom Code); `doc-edit`: `addBox`, `setBoxRect`, `moveBoxOrder`, ลบกล่อง; `lib/snap.ts`
  - Verify: Vitest (round-trip, rect เป็น mm 0.1, snap ขอบ/กึ่งกลาง/กล่องอื่น/ตาราง)
  - Files: `lib/doc-blocks.ts`, `lib/doc-edit.ts`, `lib/snap.ts`, tests
- [x] **T13 ผืนแบบอิสระ: วาง ลาก ปรับขนาด snap**
  - Acceptance: palette ชุดอิสระ; ปล่อยที่ไหน = กล่องตรงนั้น; ลากย้าย/จุดปรับขนาด; เส้นนำทาง snap; Alt ปิด snap; ลูกศร 0.5/5 mm; หนึ่งขั้น undo ต่อการปล่อย
  - Verify: เบราว์เซอร์ (Playwright วัดตำแหน่งกล่องหลังลาก = ตัวเลขในแผง); zoom 75/100/150%
  - Files: `components/designer/FreeCanvas.tsx` (ใหม่), `Workbench.tsx`, `DesignerPage.tsx`
- [x] **T14 แผงแบบอิสระ + ภาพพื้นหลังนำทาง**
  - Acceptance: X/Y/กว้าง/สูง (mm), ยกขึ้นหน้า/ส่งไปหลัง; ข้อความล้นกล่องมีขีดเตือน; อัปโหลดภาพพื้นหลัง แสดงจาง ซ่อน/แสดง/ลบ ไม่พิมพ์; เปลี่ยนขนาดกระดาษแล้วเตือนกล่องหลุดขอบ
  - Verify: Vitest; เบราว์เซอร์ + Preview pdf ไม่มีภาพพื้นหลัง
  - Files: `BlockPanels.tsx`, `FreeCanvas.tsx`, `lib/doc-edit.ts`

## Phase ตรวจ

- [x] **T15 ผืน vs PDF หลายขนาด**
  - Acceptance: สคริปต์ T11 ของ v1.7 ขยายเป็น A5, Letter, custom, ม้วน 80 (≤ 2 mm) และแบบอิสระ A5 (≤ 0.5 mm)
  - Verify: `tasks/v1.8/fidelity/results.md`
- [x] **T16 E2E `layout.spec.ts` + ทุก spec**
  - Acceptance: modal → ม้วน 80 → designer → Preview pdf หน้าเดียว; อิสระ A5 วาง/ลาก/snap → PDF; header/footer โลโก้ + เลขหน้า; ใบสั่งซื้อ 3 ชั้น
  - Verify: E2E ทุก spec ผ่านบน stack สด 1.8.0-rc ไม่ retry

## Checkpoint: ปล่อย v1.8.0

- [x] studio 4 คำสั่ง + pytest + E2E ผ่านทั้งหมด
- [ ] ผู้ใช้ลอง
- [ ] อนุมัติ → version 1.8.0, tag `v1.8.0`, push, deploy บน VM
