# Spec ร่าง: Tag (ป้ายกำกับ) ของรายงานและเอกสารที่ออก — v1.11

สถานะ: **ร่าง รออนุมัติ** (ยังไม่มี plan / ไม่แตะโค้ด) · ฐาน: `v1.10.1`
ที่มา: ผู้ใช้ 21 พ.ย. 2026 — "tag จะอยู่ในเอกสารทั้งหมดและสามารถแก้ไขได้"

## สมมติฐาน (แก้ได้ตอนอนุมัติ)

1. "เอกสารทั้งหมด" = **ทั้งรายงาน (template) และเอกสารที่ออกแล้ว (หน้า "เอกสารที่ออก")** ใช้ชุด tag เดียวกัน ไม่ใช่ tag ของ PDF (accessibility)
2. Tag เป็นข้อความสั้นอิสระ ไม่มีสี ไม่มีลำดับชั้น
3. Tag เป็น metadata ของ catalog: **ไม่ใช่ส่วนของรายงาน** → ไม่อยู่ใน version, ไม่ทำให้สถานะเป็น "แก้หลัง publish", ไม่สร้าง draft revision
4. ทุกบัญชี Studio แก้ tag ได้ (สิทธิ์เท่ากัน ตาม SPEC-auth); API key ใส่ tag ได้ตอนออกเอกสารเท่านั้น แก้ภายหลังไม่ได้
5. รายงานที่ archive แล้วยังแก้ tag ได้ (ไม่แตะ render ที่ตอบ 410)

## Objective

ติดป้ายให้รายงานและเอกสารที่ออก (เช่น "ใบกำกับภาษี", "ลูกค้า-ก", "ไตรมาส 4") แก้ได้ทุกเมื่อ และกรอง/ค้นด้วย tag ใน catalog กับหน้าเอกสารที่ออก
ผู้ใช้: คนในองค์กรที่มีรายงานหลายสิบตัวและเอกสารที่ออกเป็นพัน ต้องหาแบบกลุ่มโดยไม่จำ id

## กติกา tag

- ตัดช่องว่างหัวท้าย, ยุบช่องว่างซ้อน, NFC; ยาว 1–30 ตัวอักษร; ห้ามเครื่องหมายจุลภาคและอักขระควบคุม; ภาษาไทยได้
- เทียบแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ ("VIP" = "vip") เก็บรูปแรกที่พิมพ์; ซ้ำในชุดเดียวกันถูกรวมเป็นอันเดียว
- ต่อรายการได้ไม่เกิน 10 tag; เกิน/ผิดกติกา → 422 บอกว่า tag ไหน
- ลำดับ = ลำดับที่ผู้ใช้ใส่ (ไม่เรียงเอง)

## Data และ API (`public-api`, `template-store`, `render-service`)

- migration `0009_tags.sql`: `templates.tags text[] NOT NULL DEFAULT '{}'`, `documents.tags text[] NOT NULL DEFAULT '{}'` + GIN index ทั้งสอง (รายการเดิมเป็นชุดว่าง)
- `GET /v1/templates` (+ `GET /v1/templates/{id}`) ตอบ `tags: string[]`; กรอง `?tag=a&tag=b` (ต้องมี **ทุก** tag)
- `PUT /v1/templates/{id}/tags` body `{tags: [...]}` แทนทั้งชุด (idempotent, ไม่แตะ `updated_at` ของ draft)
- `GET /v1/documents` ตอบ `tags`; กรอง `?tag=` แบบเดียวกัน และ `q` ค้น tag ด้วย
- `PUT /v1/documents/{runId}/tags` แทนทั้งชุด (Studio session เท่านั้น เหมือน route เอกสารเดิม)
- `POST /v1/render` เพิ่ม `tags?: string[]` (เสริม; ไม่ส่ง = ใช้ tag ของรายงานตอนนั้น); ผล = **สำเนา** ณ ตอนออก (ไม่ผูกต่อ: แก้ tag รายงานทีหลังไม่ย้อนเปลี่ยนเอกสารเก่า)
- `GET /v1/tags` → `[{tag, templates, documents}]` เรียงตามจำนวนใช้ สำหรับ autocomplete และแถบ filter
- duplicate รายงาน: คัดลอก tag; export/import zip: `manifest.tags` (เสริม; zip เก่าที่ไม่มีนำเข้าได้ ไม่เปลี่ยน `formatVersion`)
- OpenAPI (`apps/api/openapi/public-api.yaml`; ชุดที่ Studio เสิร์ฟที่ `apps/studio/app/(app)/api/openapi.yaml` ปรับตาม) ปรับพร้อมกัน ตามกติกา contract เดิม

## Studio

- catalog: การ์ด/แถวรายงานแสดง tag เป็นชิป; แถบ filter เพิ่มตัวเลือก tag (เลือกได้หลายอัน, เก็บใน URL `?tag=`); ช่องค้นหาเดิม (`q`) ค้น tag ด้วย
- แก้ tag: เมนูของรายงาน "แก้ tag…" เปิด dialog (ชิป + ช่องพิมพ์ Enter/จุลภาคเพื่อเพิ่ม, × เพื่อลบ, autocomplete จาก `/v1/tags`, บันทึกแล้วเห็นทันที)
- หน้าเอกสารที่ออก: คอลัมน์ tag, filter ตาม tag, แก้ tag ต่อแถวด้วย dialog เดียวกัน
- Render dialog / ปุ่ม "ออกเอกสาร" ในฟอร์ม: ช่อง tag เริ่มต้นจาก tag ของรายงาน แก้ได้ก่อนออก
- ทั้ง 2 theme (classic ใช้ชิปแบบกระจก ตาม token เดิม); คีย์บอร์ดและ aria ครบ

## Commands

```
API test:   cd apps/api && uv run pytest tests -k "tags" 
Studio:     cd apps/studio && npx vitest run && npx tsc --noEmit && npx eslint .
E2E:        rc stack บนเครื่องทดสอบ + npx playwright test (ดู memory e2e-on-vm)
```

## Testing

- pytest: กติกา tag (ปกติ/ซ้ำ/ยาวเกิน/เกิน 10/ไทย), migration รายการเดิมว่าง, กรองหลาย tag (AND), PUT แทนทั้งชุด, สำเนาตอน render (แก้รายงานทีหลังไม่เปลี่ยนเอกสาร), duplicate/export/import, zip เก่านำเข้าได้, API key แก้ tag เอกสารไม่ได้ (403)
- vitest: ตัวช่วย normalize tag ฝั่ง Studio ตรงกับ API, ชิป/ dialog
- E2E: ติด tag รายงาน → กรองใน catalog → ออกเอกสาร (ได้ tag สำเนา) → แก้ tag เอกสาร → กรองหน้าเอกสาร; export→import แล้ว tag ยังอยู่

## Boundaries

- Always: tag ผ่านฟังก์ชัน normalize ตัวเดียวทั้ง api และ Studio; migration ใหม่เป็นไฟล์ใหม่ ไม่แก้ 0001–0008
- Ask first: เปลี่ยน `formatVersion` ของ zip, เพิ่ม dependency
- Never: ให้ tag เปลี่ยน version/สถานะ publish ของรายงาน, ใส่ tag ลงใน PDF

## Success criteria

1. ติด/แก้/ลบ tag ของรายงานและเอกสารได้ใน Studio แล้วเห็นผลทันทีและหลังโหลดใหม่
2. กรองด้วยหลาย tag ได้ทั้ง catalog และเอกสารที่ออก (ผลต้องมีครบทุก tag)
3. เอกสารที่ออกใหม่มี tag ของรายงานเป็นสำเนา; แก้รายงานทีหลังไม่ย้อนเปลี่ยนเอกสารเก่า
4. แก้ tag ไม่ทำให้รายงานขึ้น "แก้หลัง publish" และ PDF ที่ render เหมือนเดิมทุกไบต์
5. duplicate และ export/import พา tag ไปด้วย; zip เก่าไม่พัง
6. E2E เดิม 14 ตัวยังผ่าน + spec tag ใหม่ผ่าน

## Not doing (v1.11)

- สี/ไอคอนของ tag, tag ซ้อนชั้น, สิทธิ์ราย tag
- เปลี่ยนชื่อ/รวม/ลบ tag ทั้งระบบในครั้งเดียว (แก้ทีละรายการเท่านั้น; `/v1/tags` อ่านอย่างเดียว)
- แก้ tag หลายรายการพร้อมกัน (bulk)
- tag บน run/ประวัติ (หน้า history) และ tag ใน PDF/metadata ของ PDF
- ให้ API key แก้ tag ย้อนหลัง

## คำถามค้าง (ต้องให้ผู้ใช้ตัดสิน)

1. **เอกสารที่ออกใหม่ได้ tag ของรายงานเป็นสำเนา** (ร่างนี้) หรือเริ่มว่างทุกครั้ง? ร่างเลือกสำเนา เพราะ "tag อยู่ในเอกสารทั้งหมด"
2. ต้องการ **เปลี่ยนชื่อ/ลบ tag ทั้งระบบ** รอบนี้ไหม (ร่างว่า ไม่ทำ)
3. ต้องการ **สี** ของ tag ไหม (ร่างว่า ไม่ทำ)
4. tag ใน zip export ควรไปด้วยไหม (ร่างว่า ไป; นำเข้าข้ามองค์กรอาจไม่อยากได้ tag เดิม)
