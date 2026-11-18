# Tasks v1.4: ฟอร์มออกเอกสาร

แผน: [plan.md](plan.md) · สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026**

กติกา: commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → เลข version 1.4.0, tag `v1.4.0`, push `master` + tag;
ไม่สร้าง GitHub Release; VM เป็นเครื่องทดสอบล้วน

คำสั่งตรวจ:
- api: `ruff check . && ruff format --check .` + pytest บน VM (สคริปต์ทดสอบที่ส่ง `apps/api` ไปรันข้าง dev DB)
- studio: `npm run lint && npm run typecheck && npm test && npm run build`
- E2E: stack ใหม่ `-p jester-e2e` (3002/8002), token ตัวล่าสุดจาก log, หยุด main stack ชั่วคราว, `down -v` หลังจบ

## Phase F0: ป้ายภาษาไทย

- [ ] **T1 report-definition: `title`/`description` ของ parameter**
  - Acceptance: `Parameter` รับ `title` (1–80) และ `description` (1–300); ผิดกติกา → `DEFINITION_INVALID` ที่ pointer ของช่อง; report เดิมผ่าน
  - Verify: pytest `tests/report_definition`, ruff
  - Files: `report_definition/model.py`, `tests/report_definition/test_model.py`
- [ ] **T2 template-store: ป้ายภาษาไทยในทุก starter**
  - Acceptance: ทุก parameter และทุก property ใน `data.schema.json` (รวม item ของ array) ของ 5 starter มี `title` ภาษาไทย;
    `description` ในช่องที่ไม่ชัด; ลำดับ property อ่านเป็นธรรมชาติ; ไม่เปลี่ยน key/ชนิด/กติกา
  - Verify: test ใหม่เดินทุก schema หา `title` ที่ขาด; test starter เดิม + golden ผ่าน
  - Files: `starters/*/report.json`, `starters/*/data.schema.json` (แก้แบบเดียวกันหลายไฟล์), `tests/template_store/test_starter_titles.py`

## Phase F1: โหมดออกเอกสาร

- [ ] **T3 `lib/form.ts` (pure)**
  - Acceptance: schema/parameters → ช่องตามตารางใน spec (รวมตาราง array และ textarea สำหรับ schema ที่ไม่รองรับ); ค่า → body ของ
    `/v1/render` แบบไม่ผ่าน float; ตรวจ required/ความยาว/pattern/date/decimal/integer/enum/จำนวนแถว เป็นข้อความไทย;
    pointer ของ api → ช่อง; เติมค่าจาก sample; ช่องว่างที่ไม่ required ไม่ถูกส่ง
  - Verify: Vitest `tests/form.test.ts`
  - Files: `lib/form.ts`, `tests/form.test.ts`
- [ ] **T4 Route Handler ออก PDF + โหลด version ในหน้า workspace**
  - Acceptance: `POST /issue/[id]` (same-origin, id ผ่าน `isTemplateId`) ส่งต่อ `/v1/render` version `"published"` → PDF (`inline`)
    หรือ problem JSON พร้อม status; หน้า `templates/[id]` อ่าน `?mode=issue` แล้วโหลด `getVersion` ของ version ที่ publish
  - Verify: studio 4 คำสั่ง; เรียกจากเบราว์เซอร์บน VM ได้ PDF และ 422 พร้อม problems
  - Files: `app/issue/[id]/route.ts`, `app/(app)/templates/[id]/page.tsx`
- [ ] **T5 `IssueForm`**
  - Acceptance: แสดงช่องจาก T3 (fieldset, ตารางเพิ่ม/ลบแถว, select, date, checkbox); ข้อความผิดใต้ช่องและเลื่อนไปช่องแรก;
    "ใช้ข้อมูลตัวอย่าง" / "ล้างฟอร์ม"; ส่งแล้วคืน PDF blob หรือ problems ให้ parent
  - Verify: studio 4 คำสั่ง + เบราว์เซอร์
  - Files: `components/IssueForm.tsx`, `components/IssueForm.module.css`
- [ ] **T6 โหมดออกเอกสารใน workspace + ปุ่มใน catalog**
  - Acceptance: `?mode=issue` → ซ่อนรายการไฟล์ แท็บล่าง และปุ่มของ draft; ฟอร์มแทน editor; PDF ในช่องขวา + ลิงก์ดาวน์โหลด;
    toolbar มี version N / ใช้ข้อมูลตัวอย่าง / ล้างฟอร์ม / ออก PDF / กลับไปแก้ code; ปุ่ม "ออกเอกสาร" ใน toolbar (ถามก่อนถ้ามีไฟล์ยังไม่บันทึก)
    และในแถว/การ์ดของ catalog เฉพาะรายงานที่ publish แล้วและไม่ archive
  - Verify: studio 4 คำสั่ง + เบราว์เซอร์ (ภาพหน้าจอทั้งสองโหมด)
  - Files: `components/Workspace.tsx`, `components/Workspace.module.css`, `app/(app)/page.tsx`
- [ ] **T7 E2E `e2e/issue.spec.ts`**
  - Acceptance: ตาม Testing Strategy ใน spec (สร้างจาก tax-invoice → publish → ปุ่มใน catalog → โหมดฟอร์มว่าง ไม่เห็นไฟล์ → กรอกเองรวม 2 แถว
    → PDF; required ว่าง → ข้อความก่อนส่ง; วันที่ที่ api ปฏิเสธ → problem ใต้ช่อง; browser ไม่เรียก api ตรง)
  - Verify: E2E 4 spec ผ่านบน stack ใหม่
  - Files: `e2e/issue.spec.ts`

### Checkpoint (ปล่อย v1.4.0)
- [ ] api + studio ครบทุกคำสั่ง; E2E 4 spec ผ่านบน stack ใหม่ แล้ว `down -v`
- [ ] deploy ขึ้น main stack บน VM; ผู้ใช้ลองออกใบกำกับภาษีจากปุ่มใน catalog เอง
- [ ] อัปเดต spec ตามที่เปลี่ยนระหว่างทำ
- [ ] ผู้ใช้อนุมัติแล้ว: เลข version → 1.4.0, tag `v1.4.0`, push `master` + tag
