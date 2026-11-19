# Tasks v1.6: Form builder

แผน: [plan.md](plan.md) · สถานะ: **อนุมัติ 19 พ.ย. 2026 · กำลังทำ**

กติกา: commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → version 1.6.0, tag `v1.6.0`, push `master` + tag;
ไม่สร้าง GitHub Release; VM เป็นเครื่องทดสอบล้วน

คำสั่งตรวจ:
- studio: `npm run lint && npm run typecheck && npm test && npm run build` (ใน `apps/studio`)
- E2E: stack ใหม่ `-p jester-e2e` (3002/8002), token ตัวล่าสุดจาก log, หยุด main stack ชั่วคราว, Playwright จาก Windows, `down -v` หลังจบ

## Phase E1: model (`lib/`, pure)

- [x] **T1 `lib/form-layout.ts`: อ่าน/เขียน `form.json`**
  - Acceptance: `readLayout(text?)` คืน `{ fields, warnings }` — ไม่มีไฟล์/parse ไม่ได้/`formVersion` ≠ 1/ค่าไม่รู้จัก → ข้ามพร้อมคำเตือน;
    `writeLayout(layout, known)` ตัด pointer ที่ไม่อยู่ใน `known`, ไม่เขียน `width: "full"` หรือ entry ว่าง, ไม่มี entry เลย → ไม่มีไฟล์
  - Verify: Vitest `tests/form-layout.test.ts`
  - Files: `lib/form-layout.ts`, `tests/form-layout.test.ts`
- [x] **T2 `lib/schema-edit.ts`: อ่าน → ต้นไม้ช่อง, เขียนกลับ, เพิ่ม, แก้คุณสมบัติ**
  - Acceptance: JSON อ่าน/เขียนด้วย token ตัวเลขจาก `context.source`; round-trip ทุก starter ได้ข้อความเท่าเดิม (หลังจัดรูปแบบ 2 ช่องว่าง);
    ส่วนที่ไม่รองรับ (`oneOf`, `$ref`, หลาย `type`, key ขึ้นต้นตัวเลข) เป็น node อ่านอย่างเดียว; เพิ่มได้ 9 ชนิดใน data และ 7 ชนิดใน parameters ตามตาราง spec;
    `setProps` แก้ป้าย/คำอธิบาย/บังคับ/default/min/max/ความยาว/pattern/ตัวเลือก/จำนวนแถว/widget/width ตามตาราง (parameter บังคับ → ล้าง default);
    key ใหม่ `fieldN`; key ผิดกติกา `Name` หรือซ้ำ → `Result` error ภาษาไทย
  - Verify: Vitest `tests/schema-edit.test.ts` (รวม `12345678901234567.89` ใน sample ยังตรงหลังแก้)
  - Files: `lib/schema-edit.ts`, `lib/json-exact.ts` (ใหม่: parse/stringify ที่เก็บ token ตัวเลข), `tests/schema-edit.test.ts`
- [x] **T3 `schema-edit`: ย้าย, เปลี่ยนชื่อ, ลบ, เติม sample**
  - Acceptance: `canMove`/`move` ในระดับเดียว, ข้ามกลุ่ม, เข้าตาราง (scalar เท่านั้น), parameters ↔ data ได้เฉพาะชนิดที่รองรับทั้งสองฝั่ง;
    `rename` แก้ properties (คงลำดับ), required, form.json, ทุก sample, `lists.*.path` (รวม list ลูก); `remove` ปฏิเสธ array ที่ list ชี้;
    เพิ่มหรือเปิดบังคับ → sample ได้ค่าตัวอย่างตาม spec และผ่านการตรวจด้วย `validate` ของ `lib/form.ts`
  - Verify: Vitest `tests/schema-edit.test.ts`
  - Files: `lib/schema-edit.ts`, `tests/schema-edit.test.ts`
- [x] **T4 `lib/field-refs.ts`: expression, "ไม่ถูกใช้", การอ้างก่อนเปลี่ยนชื่อ/ลบ**
  - Acceptance: expression ตาม spec (params, data, list + list ลูก, `fmt.money`, `fmt.thai_date`); `unused(files)` ช่อง scalar ที่ไม่พบ `.<key>`
    ในไฟล์ `.html` และ expression ของ `report.json`; `references(files, path)` คืนชื่อไฟล์ที่พบ `.<key>` หรือ `["<key>"]`
  - Verify: Vitest `tests/field-refs.test.ts` กับ starter `quotation` (ไม่มีช่องไม่ถูกใช้ที่ผิด) และ `tax-invoice`
  - Files: `lib/field-refs.ts`, `tests/field-refs.test.ts`

## Phase E3: ฟอร์มออกเอกสาร + แท็บ "ช่องข้อมูล"

- [x] **T5 ฟอร์มออกเอกสารอ่าน `form.json`**
  - Acceptance: `formSpec(report, schema, formJson?)` ใส่ `widget`/`width` ให้ `Field`; `IssueForm` เป็น grid 6 คอลัมน์, `textarea`, กลุ่ม radio,
    `money` แสดงหลักพันเมื่อออกจากช่องแต่ค่าที่ส่งเป็นข้อความเดิม; หน้า workspace โหลด `form.json` ของ version ที่ publish (ไม่มี → เหมือน v1.4)
  - Verify: Vitest `tests/form.test.ts` (เพิ่ม); เบราว์เซอร์กับ api บน VM: เพิ่ม `form.json` มือใน draft → publish → ฟอร์มเปลี่ยนตาม
  - Files: `lib/form.ts`, `components/IssueForm.tsx` (+ css), `app/(app)/templates/[id]/page.tsx`, `tests/form.test.ts`
- [x] **T6 แท็บ "ช่องข้อมูล" ในโหมด code**
  - Acceptance: แท็บข้าง Problems; ต้นไม้ช่องจากไฟล์ใน editor (รวมที่ยังไม่บันทึก), ปุ่ม "คัดลอก", ป้ายเหลือง "ไม่ถูกใช้", คำอธิบายข้อจำกัดการตรวจแบบข้อความ
  - Verify: studio 4 คำสั่ง; เบราว์เซอร์: คัดลอกแล้ววางใน `template.html` → Preview แสดงค่า
  - Files: `components/FieldsTab.tsx`, `components/Workspace.tsx`, `lib/workspace.ts`

## Phase E2: builder

- [x] **T7 โหมด "ออกแบบฟอร์ม": โครง, แผงคุณสมบัติ, บันทึก**
  - Acceptance: ติดตั้ง `@dnd-kit/*` pin ตรงตาม spec แล้วลองลากในเบราว์เซอร์ก่อน (React 19.3.1); `?mode=form` + ปุ่มใน toolbar
    (ถามก่อนถ้ามีไฟล์ไม่บันทึก); ผืนสองส่วนแสดงต้นไม้จาก model, เลือกช่องแล้วแก้คุณสมบัติได้, การ์ด "แก้ใน JSON" อ่านอย่างเดียว,
    คำเตือนจาก `form.json`; "บันทึก" เขียนเฉพาะไฟล์ที่ต่างตามลำดับ spec, 412 → หยุด + "โหลดใหม่", ล้มกลางทาง → บอกไฟล์ที่ค้าง;
    "ยกเลิกการแก้", ออกจากโหมดทั้งที่ยังไม่บันทึก → ถาม; archive → อ่านอย่างเดียว; หลังบันทึกเรียก validate แล้วแสดงจำนวน problem
  - Verify: Vitest ของลำดับบันทึก/412/ล้มกลางทาง (fetch ปลอม); studio 4 คำสั่ง; เบราว์เซอร์กับ api บน VM
  - Files: `package.json`, `components/FormBuilder.tsx` (+ css), `lib/builder-save.ts` (ใหม่), `components/Workspace.tsx`, `app/(app)/templates/[id]/page.tsx`
- [x] **T8 ลากวางด้วย `@dnd-kit`**
  - Acceptance: palette → ผืน, ย้ายในระดับเดียว/ข้ามกลุ่ม/เข้าตาราง ตาม `canMove`; วางไม่ได้ → เด้งกลับ + เหตุผล; เมาส์ (เลื่อน ≥ 5px),
    สัมผัส (กดค้าง 200ms), แป้นพิมพ์ (Space/ลูกศร/Esc) พร้อมประกาศภาษาไทย; palette กด Enter = เพิ่มท้ายส่วนที่เลือก;
    schema 150 ช่องลากไม่มี long task > 50ms
  - Verify: เบราว์เซอร์ (เมาส์ + แป้นพิมพ์ + emulate สัมผัส); Performance panel บันทึกผลด้านล่าง; studio 4 คำสั่ง
  - Files: `components/FormBuilder.tsx`, `components/BuilderCanvas.tsx` (ใหม่ ถ้า FormBuilder ยาวเกิน), css
- [ ] **T9 ตัวอย่างฟอร์ม + ยืนยันเปลี่ยนชื่อ/ลบ**
  - Acceptance: แผงขวาสลับเป็น "ตัวอย่างฟอร์ม" = `IssueForm` จากค่าที่ยังไม่บันทึก (ไม่มีปุ่มออก PDF); เปลี่ยนชื่อ/ลบที่ `references` พบ →
    dialog ยืนยันพร้อมรายชื่อไฟล์; ลบ array ที่ list ชี้ → ข้อความบอกชื่อ list
  - Verify: studio 4 คำสั่ง; เบราว์เซอร์กับ starter `quotation` (เปลี่ยนชื่อ `customer` → เห็นคำเตือน template.html)
  - Files: `components/FormBuilder.tsx`, `components/IssueForm.tsx` (โหมด preview)
- [ ] **T10 E2E `form-builder.spec.ts`**
  - Acceptance: ตาม Testing Strategy v1.6 ของ SPEC-studio (blank → ลาก 9 ชนิด + 2 parameters → แป้นพิมพ์ → บันทึก → Problems ว่าง →
    แก้ JSON มือ → builder เห็น → publish → ออกเอกสารด้วยฟอร์มตาม `form.json` → PDF)
  - Verify: E2E ทุก spec ผ่านบน `jester-e2e` (ไม่ใช้ retry)
  - Files: `e2e/form-builder.spec.ts`

## บันทึกระหว่างทำ

- ต่างจาก spec/แผน (T3, ตาม advisor):
  - เปลี่ยนชื่อคอลัมน์ที่ `lists.*.id`, `sort`, `groupBy.key` ใช้อยู่ → แก้ชื่อในสามที่นั้นด้วย (api ตรวจว่าเป็นคอลัมน์จริง: `REF_UNKNOWN`);
    ลบหรือย้ายข้ามกลุ่มคอลัมน์/ตาราง/กลุ่มที่ list ใช้ → ปฏิเสธพร้อมชื่อ list
  - ย้ายระหว่าง "ข้อมูลเอกสาร" กับ "ข้อมูล" ไม่ได้ (spec ไม่ได้ระบุ; จะต้องแปลงชนิดและทำ `data.x` → `params.x` เสีย) — สร้างช่องใหม่แทน
  - ย้ายข้ามกลุ่ม: ค่าใน sample ย้ายตาม (สร้าง object ปลายทางถ้ายังไม่มี); ข้ามขอบตาราง: ค่าเดิมหาย ช่องบังคับได้ค่าตัวอย่างใหม่
  - key `__proto__`/`constructor`/`prototype` ถูกปฏิเสธ (ผ่าน regex `Name` แต่อันตรายใน JS)
- **ค้างตรวจในเบราว์เซอร์** (19 พ.ย. เครือข่ายเป็น hotspot เข้า VM ไม่ได้): T5 ฟอร์มตาม `form.json` มือ, T6 แท็บ "ช่องข้อมูล", T7 builder กับ api จริง (ลอจิกตรวจด้วย Vitest + jsdom แล้ว) — ทำพร้อม T10
- T8 ตรวจในเบราว์เซอร์ (19 พ.ย., `next dev`/`next start` บนเครื่องนี้ + api 1.5.0-rc บน VM):
  - ลากด้วยเมาส์ (ย้ายในระดับเดียว, palette → ตาราง, กลุ่มลงตาราง = ปฏิเสธพร้อมเหตุผล) และแป้นพิมพ์ (Space/ลูกศร/Space พร้อมประกาศภาษาไทย) ใช้ได้;
    บันทึกแล้ว validate จริง "ไม่มี problem"; publish แล้วฟอร์มออกเอกสารใช้ `width: half` และช่องเงินแสดง `1,250.50` (T5 ผ่าน); แท็บ "ช่องข้อมูล" แสดงจริง (T6 ผ่าน)
  - **ต่างจาก spec:** แป้นพิมพ์ลากได้เฉพาะสลับในระดับเดียวกัน — `closestCenter` กับลูกศรขึ้นจะตกเข้ากลุ่มข้างบนเสมอ;
    การย้ายข้ามกลุ่ม/เข้าตารางด้วยแป้นพิมพ์ใช้ช่อง "อยู่ใน" ในแผงคุณสมบัติแทน (เลือกได้เฉพาะปลายทางที่ `canMove` อนุญาต)
  - เมาส์/สัมผัสใช้ที่วางชั้นในสุดใต้ pointer (`pointerWithin` + พื้นที่เล็กสุด) แทน `closestCenter`
  - `DndContext` ใช้ `id` จาก `useId()` แก้ hydration mismatch ของ `aria-describedby`
  - **performance ยังไม่ผ่านเป้าเต็ม:** 150 ช่อง, production build, 120 จังหวะ pointer: median 3 ms, p90 48 ms, 9 จังหวะ > 50 ms (max 97 ms) —
    วัดตอน pane ของเบราว์เซอร์ถูกซ่อน (ตัวเลขอาจคลาด) และวัดเวลา React ต่อจังหวะ ไม่ใช่ long task จาก Performance panel;
    ลดแล้วหนึ่งรอบ (แยกหัวการ์ดเป็น `memo`: p90 53 → 48 ms) — ต้นเหตุคือทุก `useSortable` render ใหม่เมื่อจุดวางเปลี่ยน (การออกแบบของ `@dnd-kit`)
- builder เก็บ state ด้วย `useState` (ไม่ใช่ `useImmer`): เอกสารมี token `JSON.rawJSON` ที่ freeze แล้ว และ model เป็น immutable อยู่แล้ว

## Checkpoint: ปล่อย v1.6.0

- [ ] studio 4 คำสั่ง + E2E ผ่านทั้งหมด
- [ ] ผู้ใช้ลองสร้างฟอร์มจาก `blank` เองโดยไม่เปิด JSON แล้วออก PDF ได้
- [ ] อนุมัติ → version 1.6.0 (api, studio, compose tag), tag `v1.6.0`, push, deploy บน VM
