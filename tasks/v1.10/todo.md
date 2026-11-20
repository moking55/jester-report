# Todo v1.10: toolbar รอบสอง และติดตั้งเป็นแอป (PWA)

แผน: [plan.md](plan.md) · spec: หัวข้อ v1.10 ใน [SPEC-studio.md](../../SPEC-studio.md) · ฐาน: `v1.9.0` + `8f016a6`

## Phase A: ตาราง

- [x] **C1 ตารางเปล่ารับ colspan; รวม/แยกช่อง**
  - Acceptance: ตารางเปล่าที่ทุกแถวรวม span เท่ากันอ่านเป็นตารางเปล่า (`GridCell.span`); ผืนวาด colspan; `gridMergeRight`, `gridSplit`;
    เพิ่ม/ลบ/เลื่อนคอลัมน์ และเพิ่ม/ลบแถว นับคอลัมน์จริงเมื่อมีช่องรวม; test เดิมของตารางเปล่าผ่านไม่แก้
  - Verify: `npx vitest run tests/grid-span.test.ts tests/doc-edit.test.ts tests/doc-blocks.test.ts`
  - Files: `lib/doc-blocks.ts`, `lib/doc-edit.ts`, `components/designer/PaperCanvas.tsx`, `tests/grid-span.test.ts`
- [x] **C2 เลือกเซลล์ในตาราง**
  - Acceptance: คลิกครั้งเดียวในตารางเปล่า/ตารางรายการ = เลือกตาราง + เซลล์ (กรอบฟ้า); `cellAt` แปลงเป็นแถว/คอลัมน์จริง; ดับเบิลคลิกยังพิมพ์;
    เซลล์หายจากไฟล์ = ล้าง
  - Verify: vitest (`cellAt`) + Playwright บน dev
  - Files: `components/designer/Workbench.tsx`, `components/designer/PaperCanvas.tsx`, `lib/table-cell.ts`, tests
- [x] **C3 ปุ่ม toolbar ตามเซลล์ + จำนวนคอลัมน์ + ขึ้น/ลง; เก็บแผงขวา**
  - Acceptance: ตารางรายการ: เพิ่มคอลัมน์ซ้าย/ขวา, ลบ, เลื่อนซ้าย/ขวา; ตารางเปล่า: แถวบน/ล่าง, คอลัมน์ซ้าย/ขวา, ลบแถว/คอลัมน์, เลื่อนคอลัมน์,
    รวมกับช่องขวา, แยกช่อง; ไม่มีเซลล์ = ท้าย; ปุ่มทำไม่ได้ = เทา; แถวแบ่งคอลัมน์ 2/3/4; ขึ้น/ลงใน toolbar; แผงขวาไม่มีปุ่มกดครั้งเดียวของตาราง/ขึ้นลง;
    toolbar 1280 px ไม่ล้น; E2E เดิมที่ใช้ปุ่มในแผงแก้ selector
  - Verify: vitest (`toolbar-actions`) + Playwright บน dev
  - Files: `components/designer/toolbar-actions.ts`, `components/designer/BlockPanels.tsx`, `components/designer/Workbench.tsx`, `e2e/*.spec.ts`, tests

### Checkpoint A
- [x] studio 4 คำสั่งผ่าน · Success Criteria 1–4 ทำได้บน dev

## Phase B: ติดตั้งเป็นแอป

- [x] **C4 PWA**
  - Acceptance: `app/manifest.ts` (ชื่อ, standalone, ไอคอน 192/512/maskable, สีจาก theme); `public/icons/*`; `public/sw.js` (static + หน้าออฟไลน์,
    ไม่ cache HTML/api/preview, cache ตามเวอร์ชัน); ลงทะเบียนใน production
  - Verify: build + `next start` บนเครื่อง: Chrome แสดงปุ่มติดตั้ง, Lighthouse installable, ตัดเน็ตเห็นหน้าออฟไลน์; vitest ของ manifest (สีจาก theme)
  - Files: `app/manifest.ts`, `lib/pwa.ts`, `public/sw.js`, `public/icons/*`, `public/offline.html`, `components/RegisterSw.tsx`, `app/layout.tsx`, `next.config.ts`
  - ผล: `next start` บนเครื่อง: Chrome `Page.getInstallabilityErrors` ว่าง, manifest ไม่มี error, sw ลงทะเบียน `/sw.js?v=<version>`, ออฟไลน์เห็นหน้า "ออฟไลน์อยู่"

## Phase C: ตรวจรวม

- [x] **C5 E2E + rc**
  - Acceptance: spec ใหม่ (เลือกเซลล์ → เพิ่มคอลัมน์ซ้าย, แถวบน, รวมช่อง → PDF มี colspan ตรงผืน; ตารางรายการเพิ่มคอลัมน์ขวา; แถว 3→2 คอลัมน์บล็อกไม่หาย;
    manifest/sw ตอบ); E2E ทุก spec ผ่านบน stack สด 1.10.0-rc ไม่ retry
  - Verify: Playwright จาก Windows ผ่าน tunnel ไปเครื่องทดสอบ
  - Files: `e2e/table-tools.spec.ts`
  - ผล: E2E 14/14 ผ่านบน stack สด 1.10.0-rc (เครื่องทดสอบ) ไม่ retry 2.8 นาที; api/infra ไม่เปลี่ยนจาก v1.9.0 จึงได้ PDF ของ starter จากชุดเดิม;
    E2E เดิมที่กดปุ่ม "เพิ่มคอลัมน์" ของแถวเปลี่ยนเป็นรายการ "จำนวนคอลัมน์"; ลำดับกลุ่ม toolbar: ของบล็อกที่เลือกขึ้นก่อน (กลุ่มจัดรูปแบบพับก่อน)

## Checkpoint: ปล่อย v1.10.0

- [x] ผู้ใช้ลอง
- [x] อนุมัติ → version 1.10.0 (รวม fix ปุ่มสาขา), tag `v1.10.0`, push, deploy บนเครื่อง `moking55@192.168.30.26`
