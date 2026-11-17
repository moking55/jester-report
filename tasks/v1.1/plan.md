# แผน v1.1: Foundations

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** (ปรับตาม interview) · task list: [todo.md](todo.md)
ที่มา: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) หัวข้อ v1.1 และหัวข้อ v1.1 ของทุก `SPEC-*.md` (อนุมัติครบ 18 พ.ย. 2026) · ฐาน: tag `v1.0.0` (`af35f3e`)

## Overview

ทำพื้นฐานให้ Jester ใช้ออกเอกสารจริงได้ทุกวัน: วงจรชีวิตรายงาน (export/import, ทำสำเนา, archive, ตั้งรหัสผ่านให้ผู้อื่น),
ความพร้อม production (API key หมดอายุ/จำกัดรายงาน/rate limit, backup/restore) และเอกสารไทย (QR/barcode/PromptPay, ใบกำกับภาษีเต็มรูป)
ไม่มี drag-and-drop (ตัดสินแล้วใน [foundations-v1-1.md](../../docs/ideas/foundations-v1-1.md))

## Architecture Decisions

- **slice แนวตั้งต่อฟีเจอร์:** store → render-service/auth → contract + route → Studio ในฟีเจอร์เดียวก่อนขึ้นฟีเจอร์ถัดไป
  contract (`openapi/public-api.yaml`) เพิ่มทีละ slice เพราะ test contract บังคับว่า route ต้องตรง operation พอดี
- **ลำดับ:** H1 → A3 → A2 → A1 → A4 → B1 → B2 → B3 → C1 → C2
  A3 (archive) มาก่อน A1/A2 เพราะ import/duplicate ต้องรู้สถานะ archive และ B1 ขึ้นกับ A3
- **migration:** 0006 (archive) ใน T2, 0007 (key limits + `api_key_usage`) ใน T11 — ไฟล์ migration ห้ามแก้หลังรันที่ VM แล้ว
- **dependency ใหม่:** `segno==1.6.6`, `python-barcode==0.16.1` (อนุมัติแล้วใน spec data-prep) — เพิ่มใน T18 เท่านั้น
- **ทุก task:** test ก่อนโค้ด (TDD), commit เดียวต่อ task, deploy ขึ้น VM เมื่อ task แตะ api/studio แล้วตรวจในเบราว์เซอร์

## Phases

| Phase | Tasks | ปิดด้วย | ปล่อยเป็น |
| --- | --- | --- | --- |
| 0 Hygiene | T1 | build ผ่านบน 16.4.6 | (รวมใน v1.1.0) |
| A Lifecycle | T2–T10 | Checkpoint A: E2E ขั้น 1–4, 6 | `v1.1.0` |
| B Production | T11–T16 | Checkpoint B: E2E ขั้น 5 + restore drill | `v1.2.0` |
| C Thai docs | T17–T19 | Checkpoint C: ใบกำกับภาษีจาก starter, สแกน QR จริง | `v1.3.0` |

## Release (interview 18 พ.ย. 2026)

- ปล่อยทีละ phase: ผู้ใช้อนุมัติ checkpoint → เปลี่ยนเลข version (api, studio, image ใน compose) → tag → push `master` + tag
- commit ทุก task แต่ไม่ push ระหว่าง phase; ไม่สร้าง GitHub Release; ไม่รอ CI (H2 ค้างที่ผู้ใช้)
- VM `10.0.1.29` เป็นเครื่องทดสอบล้วน ไม่มีผู้ใช้จริง: deploy ทับและรัน migration ได้โดยไม่ต้องสำรองก่อน
- starter `tax-invoice` ไม่มีผู้เชี่ยวชาญภาษีตรวจ: ปล่อยพร้อมคำเตือนว่าผู้ใช้ต้องตรวจกับสรรพากรเอง; ผู้ใช้สแกน QR ด้วยแอปธนาคารของตัวเอง 2 แอป (ไม่โอนจริง)

## Parallel

ทำคนเดียวตาม [AGENTS.md](../../AGENTS.md) (ไม่ใช้ subagent) จึงทำตามลำดับ
ที่ทำสลับได้ถ้าติดรอ VM: B3 (T15–T16) และ C1 (T17–T18) ไม่ขึ้นกับใคร

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Next 16.4.6 พฤติกรรมเปลี่ยน | Med | T1 แยก commit ก่อนงานอื่น, รัน E2E เดิมหลังอัปเกรด, ถอยได้ด้วย revert commit เดียว |
| zip import เป็นช่องโจมตี (zip bomb, path traversal) | High | T6 เป็น pure function มี test หนึ่งต่อแถวในตารางความปลอดภัย ก่อนต่อ store/HTTP |
| rate limit นับหายเมื่อหลาย process | Med | UPSERT…RETURNING ใน transaction เดียว, test 10 task พร้อมกัน (db marker) |
| PromptPay payload ผิด = รับเงินผิดคน | High | test vector จากแหล่งอ้างอิง + สแกนจริง 2 แอปธนาคารก่อนปิด C (ผู้ใช้ทำ) |
| ฟิลด์ใบกำกับภาษีไม่ครบตามกฎหมาย | High | ตาม ม.86/4 7 ข้อ; ไม่มีผู้เชี่ยวชาญตรวจ จึงเตือนใน README ของ starter และใน template ว่าผู้ใช้ต้องตรวจกับสรรพากรเอง |
| VM IO wait สูงหลัง build | Low | รอแล้ว rerun บน stack ใหม่ (เคยเกิดใน Checkpoint C รอบก่อน) |
| restore พังเงียบ | High | T16 ซ้อมกู้จริงบน VM เป็นเกณฑ์ปิด ไม่ใช่แค่ unit test |

## Open Questions

- **H2 CI startup_failure:** ต้องให้เจ้าของบัญชีตรวจ Actions/billing — ไม่อยู่ใน task list จนกว่าผู้ใช้จะสั่ง
