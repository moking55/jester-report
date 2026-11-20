# แผน v1.9: toolbar และตัวแปรมีประเภท/เงื่อนไข

สถานะ: **รออนุมัติ** · task list: [todo.md](todo.md)
ที่มา: หัวข้อ v1.9 ใน [SPEC-studio.md](../../SPEC-studio.md) และ [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) (อนุมัติ 20 พ.ย. 2026) · ฐาน: tag `v1.8.1`

## Overview

Studio อย่างเดียว (ไม่แตะ api): toolbar ไอคอนแถวที่สองของ designer — ส่วนจัดรูปแบบ (ระดับคำ + ระดับบล็อก + รายการ) และส่วนของบล็อกที่เลือก
(ปุ่มกดครั้งเดียวของทุกชนิดบล็อก) แผงขวาเหลือ advanced; บล็อก "ตั้งค่าตัวแปร" มีประเภทและแถวเงื่อนไข และผืนคำนวณตัวแปรกับข้อมูลตัวอย่าง
dependency ใหม่หนึ่งตัว: `lucide-react` (อนุมัติแล้ว)

## Architecture Decisions

- **ตัวแปรยังเป็น `{% set x = … %}` แท็กเดียว:** ค่าตามเงื่อนไข = `A if c1 else (B if c2 else C)`; lib ใหม่ `lib/doc-var.ts` (pure, Vitest) แปลงไป-กลับ
  ระหว่างข้อความของแท็กกับ `{ type, rows: [{ test, value }], otherwise }`; ประเภทอ่านจากรูปของค่า; อ่านไม่ออก = "นิพจน์" ไม่เขียนทับ;
  ข้อความใช้ `textToArg`/`argToText` ของ `lib/code-arg.ts` (v1.8.1) ซ้ำ
- **ผืนคำนวณตัวแปร:** ขยาย `lib/doc-sample.ts` ให้ประเมิน literal, `~`, `+ - * /`, `( )`, `| round(n)`, ternary (เงื่อนไขผ่าน `test()` เดิม);
  `renderList` ของ `PaperCanvas` เดิน list ตามลำดับแล้วเติม scope เมื่อเจอบล็อก set (ใน repeat = ต่อแถว) — ไม่ใช่ Jinja ครบชุด
- **toolbar เป็น component ใหม่ `Toolbar.tsx`** อยู่ใน `Workbench` (รู้ selection/editing) ไม่ใช่ `DesignerPage`; คำสั่งของบล็อกอยู่ในตาราง
  `kind → ปุ่ม[]` ไฟล์เดียว (`toolbar-actions.ts`) ที่เรียก edit เดิมใน `lib/doc-edit.ts` — ปุ่มที่ย้ายจาก `BlockPanels` เรียกฟังก์ชันเดียวกัน ไม่เขียนใหม่;
  ล้นความกว้าง = กลุ่มท้ายพับเข้า "…" (วัดด้วย ResizeObserver)
- **รูปแบบระดับคำไม่ใช้ `document.execCommand`:** (ให้ `<font>`, พฤติกรรมใน shadow DOM ไม่แน่) — ทำเองใน `lib/doc-text.ts`: แปลง selection ของ
  contenteditable เป็นช่วงของ units แล้วห่อ/ถอด `<strong>` `<em>` `<u>` `<span style="color">`; ชิป `{{ }}` เป็นหน่วยเดียว (ไม่ผ่า);
  สถานะปุ่ม = รูปแบบที่ครอบ caret; tag เหล่านี้อยู่ใน `INLINE` อยู่แล้ว → parser/PDF ไม่ต้องแก้
- **ระดับบล็อก:** หนา/เอียง/ขีดเส้นใต้/สี/ฟอนต์/ขนาด/จัดชิด เขียน `style=` ของบล็อกผ่าน `readStyle`/`setStyle` เดิม; ฟอนต์ = ชื่อใน `report.json` fonts + ฟอนต์ asset
- **บล็อก "รายการ" ใหม่:** kind `list` = `<ul>`/`<ol>` ที่ทุก `<li>` เป็น inline content; TextEditor แก้ทั้งรายการ (หนึ่ง `<li>` ต่อบรรทัด, Enter = ข้อใหม่,
  Enter ที่ข้อว่าง = ออก); แปลงข้อความ ↔ รายการเป็น edit ใน `doc-edit`
- **รูปแบบตัวเลขของค่าช่องข้อมูล:** ครอบ/ถอด `fmt.money|number|thai_date(expr)` เฉพาะเมื่อ expression เป็น path ล้วนหรือครอบด้วยหนึ่งในสามตัวนี้; อื่น ๆ = ปุ่มเทา
- **scrollbar ตาม theme:** CSS ล้วนที่ `styles/tokens.css` (`scrollbar-color` มาตรฐาน, Chromium 121+ ใช้แทน `::-webkit-scrollbar`) — ไม่แตะแต่ละ component
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task, studio 4 คำสั่ง (typecheck, lint, vitest, build); E2E บน rc stack (`-p jester-e2e`) ตอนท้าย; api ไม่เปลี่ยน
  → pytest ไม่ต้องรันใหม่ แต่เทียบ PDF starter ทั้ง 5 กับ v1.8.1 ใน E2E

## Dependency graph

```
T1 doc-var ──► T2 แผงตัวแปร ──► T3 ผืนคำนวณตัวแปร
T4 toolbar shell (+lucide) ──► T5 ระดับคำ ──► T6 ระดับบล็อก + ย้ายออกจากแผง ──► T7 บล็อกรายการ
T4 + T2 ──► T8 ปุ่มทั่วไป/ข้อความ/ช่องข้อมูล ──► T9 รูป/แถว/ตาราง/สรุปยอด ──► T10 QR/เงื่อนไข/วนซ้ำ/ตัวแปร/แบบอิสระ ──► T11 แผงขวา cleanup
ทั้งหมด ──► T12 E2E ──► T13 ตรวจรวม + rc
```

Phase A (T1–T3) กับ Phase B (T4–T7) ทำคู่ขนานได้ (คนละไฟล์ ยกเว้น `Workbench.tsx` ตอนต่อสาย — ทำตามลำดับในเซสชันเดียว)

## Risks and Mitigations

| ความเสี่ยง | ผล | ทางลด |
| --- | --- | --- |
| selection ใน contenteditable + shadow DOM (ช่วงคร่อมชิป/คร่อม tag) | สูง | T5 เริ่มจาก pure function บน units + Vitest ครอบกรณีคร่อม; ทดสอบจริงด้วย Playwright ก่อน commit |
| `Workbench.tsx` (901 บรรทัด) โตอีก | กลาง | toolbar/คำสั่งอยู่ไฟล์ใหม่; Workbench แค่ส่ง selection/apply |
| ย้ายปุ่มจากแผงขวาแล้วพฤติกรรมเปลี่ยน | กลาง | ปุ่มเรียก edit เดิม; test เดิมของ doc-edit ต้องผ่านไม่แก้; E2E เดิมที่กดปุ่มในแผงแก้ selector ให้ชี้ toolbar |
| toolbar ล้นจอ 1280 px | ต่ำ | พับกลุ่มท้ายเข้า "…"; E2E วัดที่ 1280 |
| ternary ที่ dev เขียนมือแปลกรูป | ต่ำ | อ่านไม่ออก = นิพจน์, ไม่เขียนทับ (test) |

## Open Questions

- ไม่มี (ไอคอน = `lucide-react`, ไม่ทำประเภทวันที่/ตัวแปรสะสม ตาม spec)
