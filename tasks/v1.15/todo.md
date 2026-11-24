# v1.15 นำเข้าแบบฟอร์ม Word — task list

แผน: [plan.md](plan.md) · spec: หัวข้อ v1.15 ของ SPEC-template-store / SPEC-public-api / SPEC-studio
กติกา: test ก่อนโค้ด, commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → เลข version 1.15.0, tag `v1.15.0`, push `master` + tag, deploy (และ Meditech เมื่อผู้ใช้สั่ง)
คำสั่ง: api `cd apps/api && .venv/Scripts/python.exe -m pytest <path>` + ruff · studio `npx vitest run <path> && npm run lint && npm run typecheck` · pytest เต็มชุดและ E2E บนเครื่องทดสอบ

## Phase 1: ตัวแปลง (api, ไม่แตะ DB)

- [x] **T1 `docx/package.py`: อ่าน .docx อย่างปลอดภัย** (M)
  - Acceptance: ≤ 25 MB; entry ≤ 1000; path ไม่มี `..`/absolute/backslash; ไม่ symlink/เข้ารหัส; XML part ≤ 10 MB นับจากไบต์ที่ inflate จริง; ปฏิเสธ `<!DOCTYPE`; ต้องมี `[Content_Types].xml` + `word/document.xml` ไม่งั้น `INPUT_INVALID` "ไม่ใช่ไฟล์ Word (.docx)"; ไฟล์ OLE (Word เข้ารหัส, magic `D0 CF 11 E0`) → `INPUT_INVALID` บอกว่าเข้ารหัส/เป็น .doc; อ่าน relationships โดยข้าม `TargetMode="External"`
  - Verify: `pytest tests/template_store/docx/test_package.py` (zip bomb, DOCTYPE/entity, traversal, ไม่ใช่ docx, OLE)
  - Files: `template_store/docx/__init__.py`, `docx/package.py`, `tests/template_store/docx/conftest.py` (ตัวสร้าง .docx ใน test), `test_package.py`

- [x] **T2 `page.py` + `body.py`: กระดาษ ย่อหน้า run** (M)
  - Acceptance: ขนาดมาตรฐาน ±1 mm / custom / orientation / ขอบ (ตัดที่ 50 + `PAGE_MARGIN_CLAMPED`); Heading1–3/Title → h1–h3; `<p>` + `text-align`; `margin-top/bottom` จาก spacing (ตรง → style → docDefaults, ไม่มี = 0); b/i/u, br, tab; ย่อหน้าว่างติดกัน → `space`; page break → `page-break`; list → `<p>` ขึ้นต้นด้วยเลข/•; `w:ins` เก็บ `w:del` ทิ้ง; `w:sdt`/`w:hyperlink`/`w:smartTag` คลี่ข้อความ; ข้อความ escape + `{`/`}` เป็น entity
  - Verify: `pytest tests/template_store/docx/test_body.py` (หนึ่ง test ต่อกฎ + `{{ x }}` ในข้อความไม่กลายเป็น Jinja)
  - Files: `docx/page.py`, `docx/body.py`, `test_body.py`

- [x] **T3 `table.py`** (M)
  - Acceptance: `<table data-jd="grid" style="width: 100%; border-collapse: collapse">`; `width: N%` จาก `w:tblGrid` บนเซลล์แถวแรก; เส้น `border: 1px solid #000` ตาม tblBorders/tcBorders; `padding: 1mm 2mm`; `w:shd` → `background-color`; text-align ของย่อหน้าแรก; gridSpan → colspan; vMerge → rowspan; tblHeader → th; หลายย่อหน้า → `<br>`; ตารางซ้อน → ข้อความ + warning
  - Verify: `pytest tests/template_store/docx/test_table.py`
  - Files: `docx/table.py`, `test_table.py`

- [x] **T4 `media.py` + header/footer + warnings** (M)
  - Acceptance: รูป inline png/jpg/gif → asset (ชื่อตามกติกา, ตรวจด้วย `detect`) + `<img style="width: Xmm">`; > 5 MB/EMF/WMF/TIFF/ภายนอก/anchor → ข้าม + warning; header/footer ของ section แรก → `header.html`/`footer.html`, PAGE/NUMPAGES → span, รูป > 1 MB ข้าม; text box/รูปทรง/footnote/section ที่ 2 กระดาษต่าง/ฟอนต์อื่น → warning (ฟอนต์เตือนครั้งเดียว); `read_docx` ประกอบ Bundle: report.json (name, page), schema ว่าง, `sample.json` = `{}`, `report.css` ของ blank
  - Verify: `pytest tests/template_store/docx`
  - Files: `docx/media.py`, `docx/__init__.py`, `test_media.py`, `test_read_docx.py`

- [x] **T5 fixture สมจริงด้วยสคริปต์ + golden** (S)
  - Acceptance: `tests/fixtures/docx/make_form.py` สร้าง `form.docx` (โลโก้, หัวข้อ, จุดไข่ปลา, ตารางมี colspan + rowspan, สีพื้นแถวหัว, header/footer เลขหน้า); test แปลงแล้วเทียบกับ `form.template.html` (golden, commit ไว้) และ `load_definition` + bind ไม่มี error
  - Verify: `pytest tests/template_store/docx/test_form.py`
  - Files: `tests/fixtures/docx/make_form.py`, `form.docx`, `form.template.html`, `test_form.py`

## Phase 2: เก็บลง store และ API

- [x] **T6 `store.import_docx`** (M)
  - Acceptance: สร้างรายงานใหม่เท่านั้น (id ที่มีอยู่ รวม archive → `CONFLICT`); ตรวจ `load_definition` + bind ก่อนเขียน ไม่ผ่าน → `INTERNAL` และไม่เขียนอะไร; asset ก่อน แล้ว transaction เดียว (ใช้ `_insert_new` ร่วมกับ `import_zip`); คืน `ImportResult` + `warnings`; test ของ `import_zip` เดิมผ่านโดยไม่แก้
  - Verify: `pytest tests/template_store` (db, บนเครื่องทดสอบ)
  - Files: `template_store/store.py`, `tests/template_store/test_import_docx.py`

- [x] **T7 `POST /v1/templates/import` รับ .docx** (M)
  - Acceptance: แยกด้วยเนื้อใน; ต้องมี `templateId`; field `name`; `If-Match`/`unarchive=true` กับ .docx → 422; `ImportResult.warnings` เสมอ (zip = `[]`); contract + example; `gen:api` + `tsc`
  - Verify: `pytest tests/public_api` + `test_contract`
  - Files: `public_api/routes/templates.py`, `openapi/public-api.yaml`, `tests/public_api/test_import_docx.py`, `apps/studio/lib/types.gen.ts`

### Checkpoint A: api
- [x] pytest เต็มชุดบนเครื่องทดสอบ: 867 passed / 3 skipped + รอบแก้ test live (docx 36 passed กับ Gotenberg จริง) (24 พ.ย. 2026); ruff ของไฟล์ที่แตะสะอาด (E501 เดิมใน store.py ไม่ได้แตะ)
- [x] `form.docx` ผ่าน curl ไปที่ stack rc → 201, warnings ว่าง, Preview 1 หน้า; เจอ footer ชิดขวาพิมพ์ชิดซ้าย → แก้ (`35ac57f`) และส่ง PDF ให้ผู้ใช้แล้ว

## Phase 3: Studio

- [x] **T8 dialog "นำเข้า (.zip / .docx)"** (M)
  - Acceptance: รับ `.zip,.docx`; .docx: ช่อง id (เดาจากชื่อไฟล์, ไทยล้วน → `form-<yyyymmdd>`) + ชื่อรายงาน; ไม่มีตัวเลือกทับ; id มีอยู่ → "มีรายงาน id นี้อยู่แล้ว ใช้ id ใหม่"; สำเร็จ + warnings → รายการ "สิ่งที่แปลงไม่ได้" + ปุ่ม "เปิดใน Designer"; ไม่มี warnings → ไป Designer ทันที; route `/import` ส่ง `name` ต่อ; zip ทำงานเหมือนเดิม (test เดิมผ่าน)
  - Verify: vitest (`import-dialog`, `import-route`) + lint/typecheck
  - Files: `components/ImportDialog.tsx`, `app/import/route.ts`, `lib/import-id.ts`, tests

- [x] **T9 Designer อ่านผลได้ + E2E + live** (S)
  - Acceptance: vitest อ่าน `form.template.html` (golden จาก T5) ด้วย `readBlocks`: ไม่มี Custom Code ยกเว้นตาราง rowspan; E2E ใหม่ `import-docx.spec.ts` (นำเข้า `form.docx` → warnings → Designer → Preview PDF 1 หน้า); E2E เดิมผ่าน; test live: PDF ของ form ได้ 1 หน้าและข้อความครบ
  - Verify: `npx vitest run`, `npx playwright test` บน stack rc, pytest engine บนเครื่องทดสอบ
  - Files: `apps/studio/tests/docx-blocks.test.ts`, `e2e/import-docx.spec.ts`, `apps/api/tests/template_store/docx/test_form_live.py`

### Checkpoint B: ครบ
- [x] Success Criteria v1.15 ครบ (ข้อ 2 ลากช่องข้อมูลใส่ตาราง: ใช้เครื่องมือ Designer เดิมกับ grid ที่นำเข้า ไม่ได้มี E2E แยก); vitest 604 passed, E2E สด 17 ตัวผ่าน; build Docker ของ Studio เคยพังเพราะ client import โมดูล server-only → แก้ (`1014c9b`)
- [ ] ผู้ใช้ลองบน stack rc แล้วอนุมัติปล่อย

- [x] **T10 release 1.15.0** (S) — ปล่อยแล้ว 24 พ.ย. 2026: tag `v1.15.0` บน `7ab9d23` (หลัง release commit `bb9ed23` มีแยกปุ่มนำเข้า + modal ซ้อนสำหรับ warnings ตามที่ผู้ใช้ขอ), push `88badc9..7ab9d23`, backup `jester-backup-20261124-032602`, deploy stack หลัก (api/studio `1.15.0`, health up, 4 รายงานครบ), ปิด stack rc · ก่อนปล่อย E2E สดบน rc 17 ตัวผ่าน · ทำก่อนหน้า: เลข version 8 ไฟล์, commit `chore: release 1.15.0`, tag `v1.15.0`, push + deploy หลังผู้ใช้อนุมัติ, backup ก่อน deploy

## v1.15.1 (hotfix)

- [x] ปุ่มจัดรูปแบบใน code editor เปลี่ยนจาก Ctrl+Shift+Space เป็น **Shift+Alt+F** ตาม VS Code (ผู้ใช้ขอ 24 พ.ย. 2026) · มี test กดปุ่มจริงใน CodeMirror (`editor-format-key.test.tsx`) · ปล่อยแล้ว: tag `v1.15.1` บน `9c54107`, push `7ab9d23..9c54107`, backup `jester-backup-20261124-034046`, deploy stack หลัก, Meditech บน host และ CT 115 (merge `6129916`; ยังไม่ push ไป GitLab) · ไม่ได้รัน E2E ชุดเต็มบน rc รอบนี้ (แก้บรรทัดเดียว: vitest 608, lint, typecheck, `next build` ผ่าน)
