# Tasks v1.7: Document Designer

แผน: [plan.md](plan.md) · สถานะ: **อนุมัติ 19 พ.ย. 2026 · กำลังทำ**

กติกา: commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → version 1.7.0, tag `v1.7.0`, push `master` + tag;
ไม่สร้าง GitHub Release; VM เป็นเครื่องทดสอบล้วน

คำสั่งตรวจ:
- studio: `npm run lint && npm run typecheck && npm test && npm run build` (ใน `apps/studio`)
- api: pytest บน VM (container `jester-pytest` แบบ detached, `--user root`, หยุด main stack ระหว่างรัน), ruff
- E2E: stack ใหม่ `-p jester-e2e` (3002/8002), token จาก log, Playwright จาก Windows (viewport 1440×900), `down -v` หลังจบ

## Phase G1: model (`lib/`, pure)

- [x] **T1 `doc-parse`: tokenizer + ต้นไม้ที่จำ offset**
  - Acceptance: token = แท็ก HTML (เปิด/ปิด/self-closing, attribute คงตัวอักษร), `{{ }}`, `{% %}` (รวม `-` trim), `{# #}`, ข้อความ — แต่ละตัวมี `[start,end)`;
    ต้นไม้จับคู่แท็ก HTML และ block tag ของ Jinja (`if/elif/else`, `for/else`, `macro`, `raw`, `set` แบบ block); แท็กไม่ปิด/ซ้อนผิด → node ปิดตัวเองไม่ throw;
    `print(tree)` คืนข้อความเดิมทุกตัวอักษร
  - Verify: Vitest round-trip starter ทั้ง 5 (ไฟล์ปัจจุบัน) + ไฟล์ทดสอบ (comment, macro, `{% if %}` กลางข้อความ, แท็กไม่ปิด, `<` ใน `{{ }}`)
  - Files: `lib/doc-parse.ts`, `tests/doc-parse.test.ts`, `tests/fixtures/doc/*.html`
- [x] **T2 `doc-parse`: จำแนกบล็อก**
  - Acceptance: node → บล็อกตามตารางใน SPEC-studio v1.7 (ข้อความ, ค่าช่อง, รูป, แถว/คอลัมน์, ตาราง list, สรุปยอด, QR/barcode, เส้นคั่น, ช่องว่าง, ขึ้นหน้า,
    เงื่อนไข, วนซ้ำ, ตั้งค่าตัวแปร, ชิปเงื่อนไขในข้อความ, ชิปช่องข้อมูล) — ไม่ตรง = Custom Code ช่วงพอดี; `<link report.css>` เป็นส่วนหัวไม่ใช่บล็อก;
    ตาราง: thead แถวเดียว, `{% for %}` ใน tbody, `{% else %}`, แถวท้าย; วนซ้ำรู้ list ลูกของตัวแปร loop
  - Verify: Vitest ต่อชนิด + starter ปัจจุบัน (คาดว่าส่วนใหญ่เป็น Custom Code — บันทึกผลเป็น baseline)
  - Files: `lib/doc-parse.ts` (หรือ `lib/doc-blocks.ts`), `tests/doc-blocks.test.ts`
- [x] **T3 `doc-edit`: แก้แบบแทนช่วง + undo**
  - Acceptance: เพิ่ม/ย้าย/ลบบล็อก (รวมเข้าคอลัมน์, สาขาเงื่อนไข, วนซ้ำ), สไตล์ (`style=` เฉพาะ property ที่รู้จัก, คงที่เหลือตามลำดับ), ข้อความ (token list ↔ HTML),
    ตาราง (คอลัมน์ เพิ่ม/ย้าย/ลบ/หัว/expression/จัดแนว/กว้าง, แถวไม่มีรายการ, แถวท้าย), สรุปยอด, เงื่อนไข/วนซ้ำ/ตัวแปร, แทน Custom Code;
    บล็อกใหม่เยื้องตามระดับ; ทุกการแก้ = ข้อความไฟล์ใหม่ที่ต่างจากเดิมเฉพาะช่วงที่เกี่ยว; undo/redo คืนข้อความเดิมทุกตัวอักษร
  - Verify: Vitest: diff ของแต่ละการแก้อยู่ในช่วงบล็อก; undo หลายขั้น
  - Files: `lib/doc-edit.ts`, `tests/doc-edit.test.ts`
- [x] **T4 `doc-check` + `doc-sample`**
  - Acceptance: check: tag Jinja ครบคู่/ซ้อนถูก, delimiter ปิดครบ, ชื่อ tag ที่ Jinja มี, HTML ปิดครบ → `{ line, message }` ภาษาไทย;
    sample: ประเมิน path / `loop.index` / `fmt.money` / `fmt.number` / `fmt.thai_date` กับ view model ของ `prepareDraft`, เงื่อนไขชุดเล็ก — ที่เหลือคืน "ประเมินไม่ได้"
  - Verify: Vitest (`fmt` ใช้ค่าทดสอบชุดเดียวกับ test ของ data-prep ฝั่ง api)
  - Files: `lib/doc-check.ts`, `lib/doc-sample.ts`, `tests/doc-check.test.ts`, `tests/doc-sample.test.ts`

## Checkpoint G1 (ภายใน)

- [x] ส่งผล baseline ของ starter ให้ผู้ใช้ดู (แจ้งแล้ว ไม่ได้รออนุมัติ — goal ให้ทำต่อ):
  `quotation` (head 1, image 1, text 3, table 1) และ `blank` (text 2) อ่านได้ทั้งหน้าโดยไม่ต้องเขียนใหม่ ·
  `purchase-order` (repeat 1 + section ข้างในเป็น Custom Code 1, text 1) · `sales-grouped` (text 2, ตารางแบ่งกลุ่ม Custom Code 1) ·
  `tax-invoice` (table 1, Custom Code 4, ไม่แสดงผล 2: comment + macro)
- ตาม advisor (T2): บล็อกที่รู้จักต้องอยู่ในโมเดลทุกส่วน ไม่อย่างนั้นทั้งก้อนเป็น Custom Code; เก็บช่วงของทุกส่วนที่แก้ได้ (attribute, style, cell, branch tag);
  style ที่มี Jinja = อ่านอย่างเดียว; comment/macro/set = ไม่แสดงผลแต่ยังอยู่ในลำดับ; แก้ bug T1 `{#` ใน attribute

## Phase G2: ผืน A4

- [x] **T5 `PaperCanvas`**
  - Acceptance: ฟอนต์ TH Sarabun New + LICENSE ใน `public/fonts/`; Shadow DOM, ขนาด mm ตาม `page`, ขอบ, โซน header/footer (อ่านอย่างเดียว, ชิป), เส้นตัดหน้า;
    CSS = `@font-face` ตาม `fonts.body` + `body { font-family }` + `BASE_CSS` + `report.css`; รูป/asset จาก route เดิม; วาดบล็อกจาก T2 (ยังไม่แก้ได้);
    โหมด expression / ข้อมูลตัวอย่าง
  - Verify: Vitest ของการคำนวณขนาด/เส้นตัดหน้า; เบราว์เซอร์: starter `quotation` เทียบ PDF ด้วยตา
  - Files: `components/designer/PaperCanvas.tsx` (+ css), `lib/paper.ts`, `public/fonts/*`, `tests/paper.test.ts`

## Phase G3: หน้า designer

- [x] **T6 หน้า, toolbar, บันทึก, Preview pdf**
  - Acceptance: `/templates/<id>/designer`; ปุ่ม "Document Designer" ที่หัวช่อง code (ถามก่อนถ้ามีไฟล์ค้าง); บันทึก `template.html` (`putDraftFile` + revision, 412 → โหลดใหม่),
    ถามก่อนออก/ปิดแท็บถ้ายังไม่บันทึก; "Preview pdf" (ถามบันทึกถ้ามีการแก้) → modal; undo/redo ปุ่ม + คีย์ลัด (ไม่ล้างเมื่อบันทึก); archive = อ่านอย่างเดียว
  - Verify: Vitest component (save/412/leave); เบราว์เซอร์กับ api บน VM
  - Files: `app/(app)/templates/[id]/designer/page.tsx`, `components/designer/DesignerPage.tsx`, `components/designer/PdfModal.tsx`, `components/Workspace.tsx`
- [x] **T7 ลากวาง + เลือก + แผงสไตล์**
  - Acceptance: palette (ทุกบล็อก + Custom Code เปล่า) → ผืน, ย้ายบล็อก (คอลัมน์, สาขา, วนซ้ำ) ด้วยช่อง "วางที่นี่" + เหตุผลเมื่อวางไม่ได้ (ใช้กลไกร่วมกับ v1.6
    ที่แยกเป็น `lib/drop-place.ts`); เลือก/ลบ; แผงคุณสมบัติสไตล์; ลองลากใน Shadow DOM เป็นอย่างแรก
  - Verify: เบราว์เซอร์ (เมาส์ + แป้นพิมพ์); studio 4 คำสั่ง; FormBuilder ยังผ่าน test เดิม
  - Files: `components/designer/Workbench.tsx` (palette + ผืน + แผง), `components/designer/StylePanel.tsx`, `lib/drop-place.ts`, `components/BuilderCanvas.tsx`
  - ตรวจแล้ว (19 พ.ย., `next dev` + api บน VM): ลาก palette → ผืน (รวมที่ว่างใต้บล็อกสุดท้าย = ต่อท้าย), ย้ายขึ้นบน, ย้ายเข้าคอลัมน์ของ row,
    ย้ายเข้าสาขาเงื่อนไข, ช่อง "วางที่นี่" ใน Shadow DOM, row ลากเข้าตัวเองไม่ได้, เลือก + จัดแนว/สไตล์, Delete + Ctrl+Z; builder test เดิมผ่าน
- [ ] **T8 แก้ข้อความบนผืน + ชิป**
  - Acceptance: ดับเบิลคลิกข้อความ → พิมพ์บนผืน; ชิปช่องข้อมูล (`contenteditable=false`) ลบทั้งก้อน, เพิ่มด้วยลากจากแท็บ "ช่องข้อมูล" หรือพิมพ์ `{{`;
    ชิปเงื่อนไขในข้อความ → popover แก้เงื่อนไข/ข้อความสาขา; ออกจากโหมดพิมพ์ = หนึ่งขั้น undo
  - Verify: Vitest ของ token list ↔ HTML; เบราว์เซอร์
  - Files: `components/designer/TextEditor.tsx`, `components/designer/InlineIf.tsx`, `lib/doc-text.ts`, `tests/doc-text.test.ts`
- [ ] **T9 แผงของบล็อกพิเศษ + Custom Code modal**
  - Acceptance: ตาราง (คอลัมน์ ฯลฯ), สรุปยอด, รูป (asset), QR/barcode, เงื่อนไข (modal เงื่อนไข), วนซ้ำ (list/ตัวแปร), ตั้งค่าตัวแปร; Custom Code modal: CodeMirror +
    autocomplete + snippet + ตรวจด้วย `doc-check` ก่อนปิด (ผิด = ปิดไม่ได้ + บอกบรรทัด)
  - Verify: Vitest component ของ modal; เบราว์เซอร์
  - Files: `components/designer/BlockPanels.tsx`, `components/designer/CustomCodeModal.tsx`, `components/designer/ConditionModal.tsx`

- T5–T6 ตรวจในเบราว์เซอร์ (19 พ.ย., `next dev` + api 1.6.0-rc บน VM): ผืน A4 ของ quotation ใช้ฟอนต์ TH Sarabun New, header ในขอบบน, ชิป expression;
  "แสดงข้อมูลตัวอย่าง" แทนค่า params/totals/header และแถวตารางตาม sample (`lists.<x>` ใน view model เป็น `{rows, groups}` → แปลงเป็น array ของแถวที่มี `.groups`);
  Preview pdf เปิด modal ได้ PDF จริงที่หน้าตาใกล้ผืน; ปุ่ม "Document Designer" ที่หัวช่อง code

## Phase G4: starter

- [ ] **T10 เขียน starter ใหม่ + เทียบ PDF**
  - Acceptance: `template.html` ของ 5 starter อยู่ในรูปแบบบล็อก (Custom Code เฉพาะ: ตารางแบ่งกลุ่มของ sales-grouped, `{% macro %}` ของ tax-invoice);
    test live: render ไฟล์เดิม (เก็บเป็น fixture) และไฟล์ใหม่ด้วย sample → ข้อความ+ตำแหน่งทุกชิ้นทุกหน้าต่าง ≤ 0.5 pt (pypdf)
  - Verify: pytest บน VM `tests/template_store`; Vitest round-trip + จำแนกบล็อกของไฟล์ใหม่ (เกือบไม่มี Custom Code)
  - Files: `starters/*/template.html` (+ `report.css` ถ้าย้าย class), `tests/template_store/test_starter_pdf.py`, `tests/template_store/fixtures/v16/*.html`

## Phase ตรวจ

- [ ] **T11 ผืน vs PDF**
  - Acceptance: `quotation` และ `tax-invoice` (โหมดข้อมูลตัวอย่าง): จับภาพผืนกับหน้าแรกของ PDF, วัดตำแหน่งบล็อกหลัก ต่าง ≤ ~2 mm; บันทึกภาพและตัวเลขใน `tasks/v1.7/`
  - Verify: สคริปต์ Playwright (ไม่อยู่ใน E2E) + บันทึกผล
  - Files: `tasks/v1.7/fidelity/*`
- [ ] **T12 E2E `designer.spec.ts`**
  - Acceptance: ตาม Testing Strategy v1.7 ของ SPEC-studio (blank → บล็อกครบ → วนซ้ำ + ตาราง → Custom Code ผิด/ถูก → undo/redo → บันทึก → Preview pdf → HTML ใหม่;
    comment ที่เขียนมือยังอยู่หลังแก้บล็อกอื่น)
  - Verify: E2E ทุก spec ผ่านบน `jester-e2e` (ไม่ใช้ retry)
  - Files: `e2e/designer.spec.ts`

## Checkpoint: ปล่อย v1.7.0

- [ ] studio 4 คำสั่ง + pytest + E2E ผ่านทั้งหมด
- [ ] ผู้ใช้ลองจัดหน้าเอกสารใหม่ใน designer และเปิด starter แก้ได้
- [ ] อนุมัติ → version 1.7.0 (api, studio, compose tag), tag `v1.7.0`, push, deploy บน VM
