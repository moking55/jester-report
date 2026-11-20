# แผน v1.11: Tag และสีของรายงานกับเอกสารที่ออก

สถานะ: **รออนุมัติ** · task list: [todo.md](todo.md)
ที่มา: [docs/ideas/tags-v1-11.md](../../docs/ideas/tags-v1-11.md) (ผู้ใช้สั่ง 21 พ.ย. 2026) · ฐาน: `v1.10.1`

## Overview

ติด tag (ข้อความสั้น มีสี 1 ใน 9 สี) ให้รายงานและเอกสารที่ออก แก้ได้ กรองได้ใน catalog และหน้าเอกสารที่ออก
ทำทั้ง api และ Studio; ไม่มี dependency ใหม่; migration ใหม่ 1 ไฟล์ (`0009_tags.sql`)

## Architecture Decisions

- **module ใหม่ `tags` (เล็ก, ไม่ขึ้นกับใคร):** กติกา normalize/ตรวจ tag, ชุดชื่อสี, ตาราง `tag_colors`, คำสั่งนับการใช้ (`GET /v1/tags`).
  `template-store` และ `render-service` เรียกเฉพาะฟังก์ชัน normalize (pure) → ไม่มีวงวน; `public-api` ขึ้นกับ `tags`. เหตุผล: กติกาเดียวสองที่ (รายงานกับเอกสาร) ต้องไม่ซ้ำสองฉบับ
- **เก็บเป็น `text[]` บนแถวเดิม** (`templates.tags`, `documents.tags`) + GIN index; กรองหลาย tag ด้วย `tags @> ARRAY[...]` (ต้องมีครบ); เทียบตรงตัว (ไม่ lower) เพื่อให้ index ใช้ได้
- **tag ไม่ใช่ส่วนของรายงาน:** `set_tags` อัปเดตเฉพาะ `templates.tags` — ไม่แตะ `updated_at` ของ draft, `draft_revision`, version, hash;
  test ต้องยืนยันว่า `draftChangedSincePublish` และ PDF ที่ render ไม่เปลี่ยน
- **เอกสารที่ออก = สำเนาตอนออก:** `render()` ตรวจ tag ของ request (ถ้ามี) **ก่อนเริ่ม render** (ผิด = 422 ทันที ไม่เสียงาน), ไม่ส่ง = copy tag ของรายงาน ณ ตอนนั้น;
  `Runs.record` เขียน `tags` ลง `documents` ในทรานแซกชันเดียวกับแถวเดิม
- **สีเป็นของชื่อ tag:** upsert `tag_colors(tag, color)`; `gray` = ลบแถว; Studio อ่านผ่าน `GET /v1/tags` ครั้งเดียวต่อหน้า
- **Studio:** `lib/tags.ts` (pure: normalize เหมือน api, ชื่อสี, สไตล์ชิปจากชื่อสี) + `TagChip` + `TagEditor` (dialog ใช้ร่วมกันทั้งรายงานและเอกสาร) —
  state ในฟอร์ม dialog ใช้ `useState` ตาม pattern ของ dialog อื่น (`DuplicateDialog`), เขียนผ่าน Server Actions → `PUT`
- **สี:** `color-mix` จากสีหลักกับ `--color-surface`/`--color-text` ของ theme; classic ใช้ชิปกระจกด้วย token เดิม; test contrast ≥ 4.5:1 ทุกสี × ทุก theme ที่มากับระบบ
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task (ไม่ commit `AGENTS.md`/`launch.json`), ไม่ push ระหว่างทาง; E2E บน stack rc ของเครื่องทดสอบ

## Dependency graph

```
T0 spec → SPEC-*.md ──┐
T1 tags module + 0009 ─┼─► T2 template tags (store) ─► T3 template routes + OpenAPI ─┐
                       ├─► T4 document tags (render-service) ─► T5 document routes ──┼─► Checkpoint A (api)
                       └─► T6 /v1/tags + /v1/tag-colors ─────────────────────────────┘
                                                                  │
T7 lib/tags + types.gen + actions ◄───────────────────────────────┘
   ├─► T8 TagChip + TagEditor ─► T9 catalog ─┐
   │                          └► T10 documents + Render/Issue ┼─► T11 contrast + 2 theme ─► Checkpoint B (studio) ─► T12 E2E ─► T13 release
```

T2/T4/T6 ทำสลับกันได้หลัง T1; T9/T10 คู่ขนานกันได้หลัง T8 (แต่ลงมือทีละอัน)

## Risks and Mitigations

| ความเสี่ยง | ผล | ทางลด |
| --- | --- | --- |
| แก้ tag ไปทำให้รายงานขึ้น "แก้หลัง publish" หรือเปลี่ยน PDF | สูง | `set_tags` เขียนเฉพาะ `templates.tags`; test: draftRevision/สถานะ/ hash PDF เท่าเดิม |
| `render()` พังกลางทางเพราะ tag ผิดหลังเริ่ม render แล้ว | กลาง | ตรวจ tag ก่อนทำอะไร (422); test ว่าไม่มีแถว run/ไฟล์ค้าง |
| migration ผิดกับฐานข้อมูลที่มีข้อมูลจริง (main stack) | สูง | เพิ่มคอลัมน์ `DEFAULT '{}'` + ตารางใหม่ล้วน ไม่แก้ตารางเดิมอย่างอื่น; ทดสอบกับฐานที่มี 0001–0008 + แถวเดิม (`test_migrations`); ย้อนกลับ = ไม่ต้อง (คอลัมน์เสริมไม่กระทบโค้ดเก่า) |
| สีอ่านไม่ออกบน theme ที่ผู้ใช้สร้างเอง | กลาง | ผสมกับ token ของ theme นั้น + ตัวอักษรเป็นข้อความเสมอ; test contrast เฉพาะ theme ที่มากับระบบ, theme เองบอกใน spec ว่าไม่รับประกัน |
| contract (OpenAPI) กับ `types.gen.ts` ไม่ตรงกัน | กลาง | `test_contract` ของ api + `npm run gen:api` แล้ว `tsc` ทุกครั้งที่แก้ yaml |
| dialog แก้ tag ซ้อนกับ dialog ในเมนูรายงาน (TemplateMenu มีหลาย dialog) | ต่ำ | dialog ของตัวเองใน `TagEditor` เปิดด้วย ref ของตัวเอง ไม่ใช้ `querySelector('dialog')` |
| แก้ tag พร้อมกันสองคน (PUT แทนทั้งชุด = คนหลังชนะ) | ต่ำ | ยอมรับ (บัญชีน้อย) — ใส่ `shortcut:` ในโค้ด |

## Open Questions

- ข้อ 1/2/4 ใน spec ใช้ค่าตามร่าง (สำเนาตอนออก, ไม่ทำ rename/ลบทั้งระบบ, tag ไปกับ zip) — แจ้งถ้าต้องการต่างออกไป
- เลข version: feature → `1.11.0`
