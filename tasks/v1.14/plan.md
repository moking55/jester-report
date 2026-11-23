# แผน v1.14: ฟอร์มเปล่า

สถานะ: **รออนุมัติ** · task list: [todo.md](todo.md)
ที่มา: หัวข้อ v1.14 ของ [SPEC-data-prep.md](../../SPEC-data-prep.md), [SPEC-public-api.md](../../SPEC-public-api.md), [SPEC-studio.md](../../SPEC-studio.md), [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) (อนุมัติ 23 พ.ย. 2026) · ฐาน: `v1.13.0` + format ใน editor (`ee17d58`)

## Overview

เจ้าหน้าที่ติ๊ก "ฟอร์มเปล่า" ตอนออกเอกสาร (หรือระบบอื่นส่ง `?allowEmpty=true`) แล้วได้ PDF ที่ช่องที่ไม่กรอกและยอดที่คำนวณไม่ได้เว้นว่าง และตารางรายการมีบรรทัดเปล่าตามที่คนออกแบบตั้งใน Designer
แกนอยู่ที่ `data_prep.prepare(..., blank=True)`; api เปิดสวิตช์ผ่าน query param; Studio มี checkbox, ช่องจำนวนบรรทัดในบล็อกตาราง และ "ดูแบบฟอร์มเปล่า" ใน Preview
ไม่มี migration, ไม่มี dependency ใหม่

## Architecture Decisions

- **สวิตช์เดียว ส่งต่อลงไปถึง `prepare`:** route อ่าน `allowEmpty` → `render_service` (render/preview/prepared) → `prepare(blank=...)`; ไม่มี logic ฟอร์มเปล่าที่ชั้นอื่น โหมดปกติ (`blank=False`) ต้องเหมือนเดิมทุกบรรทัด: test เดิมทั้งหมดผ่านโดยไม่แก้
- **`meta.blank` ตั้งใน `prepare` เสมอ** (ทับค่าที่ผู้เรียกส่งมา) เพื่อไม่ให้ template ที่อ่านมันล้มด้วย `StrictUndefined` ในทางที่ไม่ผ่าน render service (`jester_pack.py`, MCP, fixture)
- **`fmt` ต่อโหมด:** `Prepared.fmt` ของโหมดเปล่าเป็น namespace ใหม่ที่ `qr`/`barcode`/`promptpay` คืนค่าว่างเมื่อค่าว่าง; `FMT` เดิมไม่เปลี่ยน
- **รูปแบบ Jinja ของบรรทัดเปล่า (ที่ spec ให้กำหนดใน plan):** อยู่ใน `<tbody>` ของบล็อกตารางรายการ ระหว่างลูปกับแถวท้าย

  ```html
  <tbody>
    {% for item in lists.items %}
    <tr>…</tr>
    {% else %}
    {% if not meta.blank %}<tr><td colspan="4">ไม่มีรายการ</td></tr>{% endif %}
    {% endfor %}
    {% if meta.blank %}{% for _ in range(10 - lists.items|length) %}
    <tr data-jd="blank"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    {% endfor %}{% endif %}
    <tr>…แถวท้าย…</tr>
  </tbody>
  ```

  - `range(ลบ)` ว่างเอง จึงไม่ต้องเช็ก N − แถว; `&nbsp;` ทำให้สูงเท่าแถวข้อความหนึ่งบรรทัด; `<td>` ตามจำนวนคอลัมน์ของแถวลูป (นับ colspan) และ class/style ของเซลล์ตามแถวลูป เพื่อให้เส้นกรอบเหมือนกัน
  - ตัวห่อ `{% if not meta.blank %}` ของแถว "ไม่มีรายการ" มีเฉพาะเมื่อ N > 0; N = 0 → Designer ลบทั้งสองส่วนคืนเป็นรูปเดิมทุกตัวอักษร
  - ตารางที่มี detail row ก็ใช้รูปเดียวกัน (บรรทัดเปล่าไม่มี detail)
- **Designer ไม่วาดบรรทัดเปล่าบนผืน:** parser รู้จักส่วนนี้เป็นของบล็อกตาราง (ไม่ใช่ Custom Code) แต่ผืนข้ามมัน; ดูผลจริงด้วย "ดูแบบฟอร์มเปล่า"
- **starter แก้ด้วยมือ** ในรูปแบบเดียวกับที่ Designer เขียน และ test ยืนยันว่า Designer อ่านแล้วได้ N = 10 กับเขียนกลับไม่เปลี่ยนไฟล์
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task (ไม่ commit `AGENTS.md`/`launch.json`), ไม่ push ระหว่างทาง; pytest เต็มชุดและ E2E บนเครื่องทดสอบ (stack rc)

## Dependency graph

```
T1 prepare(blank) ─► T2 fmt ว่าง ─► T3 allowEmpty: render/preview/prepared + contract ─► Checkpoint A (api)
                                                                     │
T4 doc-blocks: อ่าน/เขียนบรรทัดเปล่า ─► T5 แผงคุณสมบัติ + ตารางใหม่ = 10 ─┤
                                     └─► T6 starter 4 ตัว (ต้องมี T1 เพื่อ bind) ─► Checkpoint B (Designer + starter)
                                                                     │
                        T7 checkbox ใน IssueForm + /issue ─► T8 "ดูแบบฟอร์มเปล่า" ─► T9 E2E + live ─► T10 release
```

T4 ทำคู่กับ T1–T3 ได้ (คนละ app); T6 ต้องมีทั้ง T1 (bind แบบเปล่า) และ T4 (test ว่า Designer อ่านได้)

## Risks and Mitigations

| ความเสี่ยง | ผล | ทางลด |
| --- | --- | --- |
| แตะ `prepare` แล้วโหมดปกติเปลี่ยน (ยอด, error) | สูง | `blank` เป็น keyword ที่ค่าเริ่มต้น `False`; ทุกกิ่งใหม่อยู่หลัง `if blank`; test เดิมของ data_prep/binder/render_service ผ่านโดยไม่แก้ |
| แก้ starter แล้ว PDF ปกติเปลี่ยน | กลาง | `test_starter_pdf` (ข้อความทุกชิ้นอยู่หน้าเดิม ±0.5 pt) ต้องผ่านโดยไม่แก้ expected |
| parser ของ Designer รับรูปใหม่แล้วตารางเดิมกลายเป็น Custom Code | กลาง | test round-trip ของ starter ทั้ง 5 และ fixture ตารางทุกแบบ (มี/ไม่มี else, footer, detail row) |
| 10 บรรทัดล้นหน้า A4 ในบาง starter | ต่ำ | T6 render ฟอร์มเปล่าจริงผ่าน Gotenberg และนับหน้า; ล้น → ลดเฉพาะตัวนั้น และจดใน todo |
| `allowEmpty` ถูกใช้หลบการตรวจข้อมูลของระบบอื่น | ต่ำ | เป็นทางเลือกที่ผู้เรียกตั้งใจส่งเอง; ค่าที่ส่งมายังตรวจชนิดตามเดิม; ไม่มีค่าสมมติ |

## Open Questions

ไม่มี
