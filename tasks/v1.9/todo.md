# Todo v1.9: toolbar และตัวแปรมีประเภท/เงื่อนไข

แผน: [plan.md](plan.md) · spec: หัวข้อ v1.9 ใน [SPEC-studio.md](../../SPEC-studio.md) · ฐาน: `v1.8.1`

## Phase A: ตัวแปร

- [x] **T1 `lib/doc-var.ts`: อ่าน/เขียนค่าของ set เป็นประเภท + แถวเงื่อนไข**
  - Acceptance: `readVar(inner) → { name, type: text|number|bool|expr, rows, otherwise } | null` และ `writeVar(...)`; ternary ต่อกันหลายชั้นไป-กลับตรง;
    ตัวเลขรับเฉพาะ ตัวเลข/ชื่อ/`+ - * / ( )`/`| round(n)`; ค่าเขียนมือแปลก = `expr` และ `writeVar(readVar(x)) === x`
  - Verify: `npx vitest run tests/doc-var.test.ts`
  - Files: `lib/doc-var.ts`, `tests/doc-var.test.ts`
- [x] **T2 แผงตัวแปร + รายการข้างผืน + เตือนใช้ก่อนตั้ง**
  - Acceptance: แผงมีชื่อ, ค่า (ค่าเดียว/แถว `ถ้า → ค่า` เพิ่ม/ลบ/เลื่อน + `ไม่เช่นนั้น`) ตามประเภท (ข้อความใช้ `TemplateField`); ค่าผิดรูปไม่บันทึก + เตือน;
    รายการข้างผืนแสดงชื่อ/ประเภท/ค่าย่อหรือ "ตามเงื่อนไข n ข้อ"; ชิปตัวแปรที่อยู่ก่อน set ของมันมีขีดเตือน
  - Verify: vitest (workbench helpers) + Playwright บน dev: ตั้งสถานะ 2 เงื่อนไข → template มีแท็กเดียวตามคาด
  - Files: `components/designer/BlockPanels.tsx`, `components/designer/Workbench.tsx`, `components/designer/PaperCanvas.tsx`, tests
- [x] **T3 ผืนคำนวณตัวแปรกับข้อมูลตัวอย่าง**
  - Acceptance: `evaluate` รองรับ literal, `~`, `+ - * /`, `( )`, `| round(n)`, ternary; ผืนเติม scope ตามลำดับเอกสาร (ใน repeat ต่อแถว); คำนวณไม่ได้ = ชิปชื่อ
  - Verify: vitest `tests/doc-sample.test.ts` (กรณีใหม่) + dev: `vat = data.subtotal * 0.07` แสดงค่าบนผืน
  - Files: `lib/doc-sample.ts`, `components/designer/PaperCanvas.tsx`, tests

### Checkpoint A
- [x] studio 4 คำสั่งผ่าน · ตัวแปรใช้งานได้ครบด้วยแผง (ส่วน toolbar ของตัวแปรอยู่ T10)

## Phase B: toolbar ส่วนจัดรูปแบบ

- [x] **T4 toolbar shell + `lucide-react`**
  - Acceptance: `npm i lucide-react` (pin version); `Toolbar.tsx` แถวที่สองใต้แถบบน ติดตลอด; กลุ่ม + เส้นคั่น; ไอคอน + tooltip ไทย + คีย์ลัด;
    ปุ่มเทาเมื่อใช้ไม่ได้; ล้นกว้าง = กลุ่มท้ายพับเข้า "…"; ใช้ได้ทั้งแบบคงที่/อิสระ/header-footer
  - Verify: vitest (การพับกลุ่มเป็น pure function) + build; dev ที่ 1280 px ไม่ล้น
  - Files: `package.json`, `package-lock.json`, `components/designer/Toolbar.tsx`, `components/designer/Workbench.tsx`, `Designer.module.css`
- [x] **T5 รูปแบบระดับคำ: หนา/เอียง/ขีดเส้นใต้/สี/ล้างรูปแบบ**
  - Acceptance: ขณะพิมพ์ ลากเลือกแล้วกด = ห่อ/ถอด `<strong>` `<em>` `<u>` `<span style="color">` เฉพาะช่วงนั้น; ชิปไม่ถูกผ่า; Ctrl+B/I/U;
    ปุ่มกดค้างตามรูปแบบที่ caret; บันทึกแล้ว PDF หนาเฉพาะส่วน
  - Verify: vitest `tests/doc-text.test.ts` (ห่อ/ถอด/คร่อมชิป/คร่อม tag/ล้าง) + Playwright บน dev
  - Files: `lib/doc-text.ts`, `components/designer/TextEditor.tsx`, `components/designer/Toolbar.tsx`, tests
- [x] **T6 ระดับบล็อก: หนา/เอียง/ขีดเส้นใต้/สี/ฟอนต์/ขนาด/จัดชิด + เอาออกจากแผงขวา**
  - Acceptance: เลือกบล็อก (ไม่พิมพ์) → ปุ่มเขียน `style=` ของบล็อก; ฟอนต์จาก `report.json` fonts + asset ฟอนต์; `StylePanel` เหลือระยะบน/ล่าง,
    ความกว้าง, เส้นตาราง + ระยะบรรทัดใหม่
  - Verify: vitest (style edits) + dev
  - Files: `components/designer/Toolbar.tsx`, `components/designer/StylePanel.tsx`, `lib/doc-edit.ts`, tests
- [x] **T7 บล็อก "รายการ" (จุด/ตัวเลข)**
  - Acceptance: kind `list` (`<ul>`/`<ol>` ของ `<li>` inline); ปุ่มแปลงข้อความ ↔ รายการ (หนึ่งบรรทัด = หนึ่งข้อ), สลับจุด/ตัวเลข; TextEditor: Enter = ข้อใหม่,
    Enter ที่ข้อว่าง = จบ; `{{ }}` และรูปแบบระดับคำในข้อได้; header/footer ปุ่มเทา; PDF ตรงผืน
  - Verify: vitest (`doc-blocks`, `doc-edit`) + Playwright
  - Files: `lib/doc-blocks.ts`, `lib/doc-edit.ts`, `components/designer/TextEditor.tsx`, `components/designer/PaperCanvas.tsx`, tests

- [x] **T7b scrollbar ตาม theme**
  - Acceptance: `styles/tokens.css` ตั้ง `scrollbar-width: thin` + `scrollbar-color` จาก `--color-border`/`--color-textMuted` (hover) ทั้ง Studio;
    ครอบหน้ารายการ, palette/ผืน/แผงขวา, CodeMirror, modal; เปลี่ยน theme แล้วสีตาม;
    theme classic (`[data-look="aero"]`): แบบ Java Swing Metal (Ocean) — แท่งฟ้าไล่เฉด + grip, ปุ่มลูกศรหัว/ท้าย, รางเทาขอบคม (`::-webkit-scrollbar*`)
  - Verify: dev: theme อื่น 1 ตัว (computed `scrollbar-color`) + classic (screenshot เทียบ Metal) ในพื้นที่เลื่อนแต่ละที่
  - Files: `styles/tokens.css`

### Checkpoint B
- [x] studio 4 คำสั่งผ่าน · Success Criteria ข้อ 1 ส่วนตัวหนา + รายการทำได้ด้วย toolbar

## Phase C: toolbar ส่วนของบล็อก

- [ ] **T8 ทุกบล็อก (ทำสำเนา/ลบ) + ข้อความ (ระดับ H1–H3/ปกติ) + ค่าช่องข้อมูล (รูปแบบตัวเลข)**
  - Acceptance: ทำสำเนา = ต่อท้ายบล็อกเดิมหนึ่งขั้น undo; ระดับใช้ `setTextTag`; รูปแบบครอบ/ถอด `fmt.*` ตาม spec, อื่น ๆ เทา
  - Verify: vitest (`duplicateBlock`, `setFieldFormat`) + dev
  - Files: `lib/doc-edit.ts`, `components/designer/toolbar-actions.ts`, tests
- [ ] **T9 รูป, แถวแบ่งคอลัมน์, ตารางรายการ, ตารางเปล่า, สรุปยอด**
  - Acceptance: ปุ่มตามตาราง spec เรียก edit เดิม (`addColumn`, `gridAddRow`, `mergeColumns`, …); รูป: อัปโหลด + กว้าง 25/50/100%; แถว: แบ่ง 2/3 เท่ากัน
  - Verify: vitest (edit ใหม่ถ้ามี) + dev
  - Files: `components/designer/toolbar-actions.ts`, `lib/doc-edit.ts`, tests
- [ ] **T10 QR, เงื่อนไข, วนซ้ำ, ตัวแปร, แบบอิสระ**
  - Acceptance: ชนิด QR; เงื่อนไข: เพิ่มหรือถ้า/เพิ่ม-ลบไม่เช่นนั้น; วนซ้ำ: เปิด/ปิดถ้าไม่มีแถว; ตัวแปร: ประเภท + ค่าเดียว/ตามเงื่อนไข;
    แบบอิสระ: ลำดับซ้อน 4 ปุ่ม + จัดแนวกับกระดาษ 6 ปุ่ม
  - Verify: vitest (`alignBox`) + dev
  - Files: `components/designer/toolbar-actions.ts`, `lib/doc-edit.ts`, `components/designer/FreeCanvas.tsx`, tests
- [ ] **T11 แผงขวา: เอาปุ่มที่ย้ายไป toolbar ออก**
  - Acceptance: ไม่มีปุ่มซ้ำสองที่; แผงเหลือค่าที่ต้องพิมพ์ตามคอลัมน์ "แผงขวา" ของ spec; toolbar 1280 px ไม่ล้น
  - Verify: vitest + E2E เดิมที่ใช้ปุ่มในแผงแก้ selector ให้ผ่าน
  - Files: `components/designer/BlockPanels.tsx`, `components/designer/FreeCanvas.tsx`, `e2e/*.spec.ts`

### Checkpoint C
- [ ] studio 4 คำสั่งผ่าน · ทุกชนิดบล็อกมีปุ่มตามตาราง spec

## Phase D: ตรวจรวม

- [ ] **T12 E2E: toolbar + ตัวแปร**
  - Acceptance: spec ใหม่ครอบ Success Criteria 1–5 (ตัวหนาเฉพาะส่วน/รายการ/เงินใน PDF, กดปุ่มครบทุกชนิดบล็อก, สถานะ 3 กรณี, vat ผืน = PDF, set เขียนมือไม่ถูกแก้)
  - Verify: Playwright จาก Windows บน rc stack
  - Files: `e2e/toolbar.spec.ts`, `e2e/variables.spec.ts`
- [ ] **T13 ตรวจรวม + rc**
  - Acceptance: studio 4 คำสั่ง; E2E ทุก spec ผ่านบน stack สด 1.9.0-rc ไม่ retry; starter 5 ตัว PDF เท่ากับ v1.8.1
  - Verify: ผล Playwright + เทียบ PDF

## Checkpoint: ปล่อย v1.9.0

- [ ] ผู้ใช้ลอง
- [ ] อนุมัติ → version 1.9.0, tag `v1.9.0`, push, deploy บน VM
