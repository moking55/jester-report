# แผน v1.8: การจัดหน้า

สถานะ: **รออนุมัติ** · task list: [todo.md](todo.md)
ที่มา: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) หัวข้อ v1.8 และหัวข้อ v1.8 ใน SPEC ทั้ง 7 (อนุมัติ 20 พ.ย. 2026) · ฐาน: tag `v1.7.0`

## Overview

กระดาษทุกขนาดและใบเสร็จม้วน, การจัดวางแบบอิสระ (วางตามพิกัด, หน้าเดียว), แก้ header/footer บนผืน, ข้อมูลซ้อน 3 ชั้น —
ฝั่ง api ทำ `page` ใหม่ + ส่งขนาดจริงให้ engine + binder/data-prep ให้รองรับ แล้ว Studio ต่อยอด designer v1.7
**ไม่มี dependency ใหม่** · endpoint เดิม (`POST /v1/templates` รับ `page` เพิ่ม)

## Architecture Decisions

- **spike ก่อนทุกอย่าง (T1):** ลอง Gotenberg 9.4.1 ของเราด้วย `paperWidth`/`paperHeight` เป็นค่าใด ๆ และ `singlePage=true` กับใบเสร็จ 80 mm
  ผลกำหนด T3: ถ้า `singlePage` ได้ PDF หน้าเดียวสูงตามเนื้อหา → ใช้ตรง ๆ; ถ้าไม่ได้ → render 2 รอบ (รอบแรกหน้าสูงมาก + `waitForExpression`
  ไม่ช่วย จึงวัดจาก PDF รอบแรกด้วย `pypdf`: ตำแหน่งข้อความต่ำสุด + ขอบล่าง → ความสูง → รอบสอง)
- **`page` อยู่ใน `report.json`** (ไม่เพิ่มไฟล์ใหม่) และทุก field มีค่าเริ่มต้นเท่าแบบเดิม → รายงานเดิม/starter ไม่ต้องแก้; Studio อ่านขนาดจาก `lib/paper.ts`
  ฟังก์ชันเดียว (`paperOf`) ที่ขยายให้รู้ทุกขนาด — ตาราง mm ของขนาดสำเร็จรูปมีที่เดียวต่อฝั่ง (`report_definition` / `lib/paper.ts`) พร้อม test ตรงกัน
- **แบบอิสระ = HTML ธรรมดา:** `data-jd="page"` (relative, ขนาดกระดาษ) + `data-jd="box"` (absolute, `left/top/width/height` เป็น mm ใน `style=`) ข้างในกล่องคือบล็อกเดิม
  ของ v1.7 (ข้อความ, ช่องข้อมูล, รูป, code, ตารางเปล่า) + บล็อกใหม่ "กรอบ" และ "เส้น" (`data-jd="rect"`/`data-jd="line"`) → parser/edits/ชิป/TextEditor
  ใช้ต่อได้; edit ใหม่แค่ `setBoxRect`, `addBox`, `moveBoxOrder`
- **ลาก/ปรับขนาดในแบบอิสระไม่ใช้ `@dnd-kit` sortable:** pointer events ตรงบนผืน (ตำแหน่งเป็น mm จาก zoom + `PX_PER_MM`), เขียนกลับตอนปล่อย (หนึ่งขั้น undo);
  ลากจาก palette ยังใช้ `@dnd-kit` แค่หาจุดปล่อย; snap = ฟังก์ชัน pure (`lib/snap.ts`) มี Vitest
- **header/footer บนผืน:** แต่ละโซนเป็น "list" ของบล็อกจากไฟล์ `header.html`/`footer.html` (parser เดียวกัน); history ของ designer ขยายเป็น
  `{ html, header, footer, report }` และบันทึกเฉพาะไฟล์ที่เปลี่ยน (ต่อจาก v1.7 ที่มี html + report)
- **ซ้อนหลายชั้น:** data-prep ทำแบบ recursive แทนกรณีชั้นเดียว; ตารางรายการได้ **แถวรายละเอียด** = `{% for %}` body มี 2 `<tr>` โดยแถวที่สองมี `<td colspan=n>`
  ที่ข้างในเป็นบล็อกลิสต์ (ใส่ตาราง/วนซ้ำได้) — ขยาย `tableDetail` และ `doc-edit` แบบไม่กระทบตารางเดิม
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task, studio 4 คำสั่งบน Windows, pytest บน VM (container detached, Gotenberg restart ถ้า timeout), E2E บน `-p jester-e2e`
  สำหรับไฟล์ที่มี `\` ให้แก้ด้วย Edit/Write (Bash heredoc กิน backslash)

## Phases

| Phase | Tasks | ปิดด้วย |
| --- | --- | --- |
| A api | T1–T6 | pytest ทั้งชุดผ่าน; PDF จริง A5 แนวนอน, custom 100×50, ม้วน 58/80, แบบอิสระ A5; starter 5 ตัว PDF เท่า v1.7 |
| B Studio ขนาด + สร้าง | T7–T8 | ผืนทุกขนาด/ม้วน + modal สร้างรายงาน ใช้ได้ใน browser |
| C header/footer + ซ้อน | T9–T11 | แก้ header/footer บนผืนได้ PDF ทุกหน้า; ใบสั่งซื้อ 3 ชั้นด้วยบล็อก; form builder ตารางซ้อน |
| D แบบอิสระ | T12–T14 | ฟอร์ม A5 แบบอิสระ 6 กล่อง snap ได้ PDF ตรง ≤ 0.5 mm |
| ตรวจ | T15–T16 | fidelity หลายขนาด ≤ 2 mm; E2E ทุก spec บน stack สด; ผู้ใช้ลอง → ปล่อย `v1.8.0` |

T2 ก่อน T3–T6; T3–T6 คู่ขนานได้ · Phase C และ D เริ่มได้หลัง Phase B (ไม่ขึ้นต่อกัน)

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `singlePage` ไม่มี/ไม่ตรงใน Gotenberg 9.4.1 | High (ม้วนทำไม่ได้) | T1 spike ก่อน; วิธีสำรอง render 2 รอบวัดจาก PDF |
| รูปใน header/footer ไม่ขึ้นแม้เป็น data URI / ขนาด request ใหญ่ | Med | T4 ทดสอบ live; จำกัดรูป 1 MB |
| ลาก/ปรับขนาดแบบอิสระบนผืนที่ zoom + scroll คลาดเคลื่อน | Med | คิดเป็น mm จาก rect ของ `.jd-sheet` ทุกครั้ง; Vitest snap; Playwright วัดตำแหน่งหลังลาก |
| ขยาย history/บันทึกเป็น 4 ไฟล์แล้วชน revision | Med | บันทึกเรียงไฟล์ด้วย revision ต่อเนื่อง (แบบ v1.7) + Vitest |
| data-prep recursive ทำให้ผลชั้นเดียวเปลี่ยน | High | test เดิมทั้งหมดต้องผ่าน + starter PDF compare |
| ผืนม้วนยาวไม่จำกัด / ภาพพื้นหลังใหญ่ทำผืนช้า | Low | ม้วนวาดแถบเดียว; ภาพพื้นหลังเป็น `<img>` ธรรมดา |

## Open Questions

- snap ตาราง: ใช้ 1 mm ตามที่เสนอใน spec (เปลี่ยนได้ภายหลัง)
