# Foundations v1.1: ทำพื้นฐานให้ครบก่อนเป็น business friendly

สถานะ: ผู้ใช้เลือกแนวทางแล้ว 17 พฤศจิกายน 2026 (idea-refine) — ยังไม่มี spec/plan
ต้นทาง: [intent v1](../intent/report-server-v1.md) · [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md)

## Problem Statement

เราจะทำอย่างไรให้ developer ที่ self-host Jester ใช้งานต่อเนื่องได้จริง ย้าย template ข้าม environment ได้ วางบน network จริงได้อย่างมั่นใจ และออกเอกสารไทยที่ใช้จริงได้ทันที ก่อนจะลงทุนกับฟีเจอร์สำหรับคนฝ่ายธุรกิจ

## ที่มา

ผู้ใช้ตั้งเป้าระยะยาวว่าให้คนฝ่ายธุรกิจออกเอกสารจริงได้ทุกวันโดยไม่ต้องมี developer ช่วย (กลุ่มเป้าหมาย: ชุมชน open source) แต่ตัดสินให้ **ลด scope: ยังไม่ทำลากวางทุกแบบ ยังคง dev friendly และทำระบบพื้นฐานที่ขาดก่อน**

ตรวจจาก `apps/api/openapi/public-api.yaml` (35 operation) และเอกสารใน repo เมื่อ 17 พ.ย. 2026 พบว่ายังไม่มี:

- ลบ/archive, ทำสำเนา, export/import template
- แอดมินตั้งรหัสผ่านให้ผู้ใช้อื่น (ทำได้แค่ลบแล้วสร้างใหม่)
- วันหมดอายุและการจำกัดรายงานของ API key (`ApiKey` มีแค่ `id`, `name`, `prefix`, `createdAt`, `createdBy`, `lastUsedAt`)
- rate limit ต่อ key ที่ `/v1/render` (SPEC-public-api ระบุว่าอยู่นอก v1)
- helper QR/barcode
- คู่มือ backup/restore (`infra/README.md`)
- CI ที่รันได้ (GitHub Actions ขึ้น `startup_failure` ทุก run) และ Next.js ยังเป็น 16.4.3 ที่มี advisory GHSA-mfr8-8qww-v76h (แก้ใน 16.4.6)

## Recommended Direction

ทำตามลำดับ **สุขอนามัย → A → B → C**

**0. สุขอนามัย** — อัปเกรด Next.js เป็น 16.4.6 และทำให้ CI เขียว เป็นหนี้ที่มีอยู่แล้ว เล็ก และกันปัญหาที่ตามมาทุก PR (CI ต้องให้เจ้าของบัญชีตรวจหน้า Actions/billing ก่อน)

**A. วงจรชีวิตของ template** — export/import เป็นไฟล์ zip, ทำสำเนา, archive แทนลบ, แอดมินตั้งรหัสผ่านให้ผู้อื่น เป็นสิ่งที่ developer เจอทุกวัน โดยเฉพาะการย้ายจาก dev ไป production ซึ่งตอนนี้ต้องก๊อปไฟล์ทีละไฟล์ import ต้องได้ **draft เสมอ** เพื่อไม่ข้ามการ validate และการตรวจก่อน publish

**B. พร้อมวางบน network จริง** — API key มีวันหมดอายุและจำกัดรายงานได้ (key เดิมยังใช้ได้เหมือนเดิม), rate limit ต่อ key ที่ `/v1/render` นับใน PostgreSQL เพราะ api รันหลาย worker, คู่มือ backup/restore พร้อมสคริปต์ที่ลองกู้คืนจริง

**C. เอกสารไทยครบ** — helper QR (PromptPay) และ barcode ที่สร้างฝั่ง server (engine ไม่รัน JavaScript) และ template สำเร็จรูป: ใบกำกับภาษีเต็มรูป, ใบเสร็จ, หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) แจกด้วย export/import จาก A จึงเป็นการ dogfood ระบบทั้งหมดไปในตัว

A มาก่อน B เพราะ A เจ็บทุกวัน ส่วน B ยังเป็นความเสี่ยงที่ยังไม่เกิด C อยู่ท้ายเพราะต้องใช้ A และควรสร้างบนฐานที่นิ่งแล้ว

## Key Assumptions to Validate

- [ ] developer ติดปัญหาย้าย template ข้าม environment จริง — ลองติดตั้ง Jester ชุดที่สองแล้วย้าย template จริงหนึ่งตัว จับเวลาและจดขั้นตอนที่ติด
- [ ] zip import ป้องกัน path traversal และ zip bomb ได้ — test ด้วยไฟล์ zip ที่มี `../`, symlink และไฟล์ที่ขยายแล้วเกินขนาดที่กำหนด
- [ ] rate limit ที่นับใน PostgreSQL ไม่ทำให้ render ช้าลงเกินรับได้ — load test สั้นเทียบก่อน/หลัง
- [ ] QR ที่ฝังใน PDF สแกนจ่ายได้จริง — สแกนด้วยแอปธนาคารอย่างน้อย 2 แอป
- [ ] template ใบกำกับภาษีมีช่องครบตามประมวลรัษฎากร มาตรา 86/4 — ตรวจรายการช่องกับข้อกำหนดของกรมสรรพากรก่อนประกาศ

## MVP Scope

**อยู่ใน**
- 0: Next.js 16.4.6, CI เขียว
- A: `GET …/export` (zip ของ version หรือ draft), `POST /v1/templates/import` (zip → template ใหม่หรือ draft ใหม่), ทำสำเนารายงาน, archive/unarchive (ซ่อนจาก catalog และ render ไม่ได้), แอดมินตั้งรหัสผ่านให้ผู้อื่น; ปุ่มใน Studio ครบทุกข้อ
- B: `expiresAt` และ `templates` (รายการที่อนุญาต) ใน API key แบบเลือกใส่, rate limit ต่อ key ที่ตั้งค่าได้, `infra/README.md` ส่วน backup/restore + สคริปต์
- C: fmt helper `qr()` / `barcode()` คืน SVG, template ใบกำกับภาษีเต็มรูป 1 ตัวเป็นตัวแรก

**ไม่อยู่ใน MVP นี้:** template สำเร็จรูปตัวที่สองขึ้นไป (ทำหลังใบกำกับภาษีผ่านการตรวจ), metrics endpoint, image สำเร็จรูปบน registry

## Not Doing (and Why)

- **ลากวางทุกแบบ** (designer layout และ form builder) — ผู้ใช้ตัดสินให้ทำพื้นฐานก่อน ลากวางคุ้มเมื่อฐานนิ่งแล้วเท่านั้น
- **ฟอร์มให้คนธุรกิจกรอกเอง** — เป็นเป้าระยะยาว แต่ต้องมีบทบาทผู้ใช้และพื้นฐานใน B ก่อน
- **บทบาท/สิทธิ์ (RBAC)** — ยังคงทุกคนสิทธิ์เท่ากันตาม v1 จนกว่าจะมีผู้ใช้ที่ไม่ใช่ developer
- **เก็บ PDF และทะเบียนเอกสาร/เลขรัน** — จะเปลี่ยน Jester จาก engine เป็นระบบเอกสาร ซึ่งชนกับโปรแกรมบัญชีที่มีอยู่
- **async job, schedule, email, webhook** — นอก v1 และไม่มีใครขอ
- **SSO, 2FA** — ยังไม่จำเป็นสำหรับทีม self-host ขนาดเล็ก

## Decisions (ผู้ใช้ตอบ 17 พ.ย. 2026)

- import รายงานที่ id ซ้ำ: **ทับ draft ของรายงานเดิม** (ต้องส่ง revision ปัจจุบัน; version ที่ publish แล้วไม่เปลี่ยน)
- render รายงานที่ archive: **410 `TEMPLATE_ARCHIVED`**
- rate limit: **ต่อ key, ปิดเป็นค่าเริ่มต้น** (key ที่ไม่ตั้ง = ไม่จำกัด เหมือนเดิม)
- QR/barcode: **เพิ่ม dependency `segno` + `python-barcode`** (ตรวจ license และอายุ release ก่อน pin)

## Open Questions

- CI `startup_failure` มาจากการตั้งค่าบัญชี/billing หรือไม่ (ต้องให้เจ้าของบัญชีดู)
