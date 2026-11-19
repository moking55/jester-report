# v1.8 T15 ผืน vs PDF หลายขนาด

ขยายสคริปต์ของ v1.7 (`tasks/v1.7/fidelity`): วางตำแหน่งต้นบรรทัดของข้อความหลักบนผืนของ Document Designer (โหมด "แสดงข้อมูลตัวอย่าง")
เทียบกับหน้าแรกของ PDF จาก Preview pdf ของ draft เดียวกัน บน stack ทดสอบ (api 1.8.0-rc + Gotenberg บน VM, Studio `next dev`)

| กรณี | กระดาษ | เนื้อหา | เกณฑ์ |
|---|---|---|---|
| f-a5 | A5 แนวตั้ง, flow | starter ใบเสนอราคา | ≤ 2 mm |
| f-letter | Letter, flow | ใบเสนอราคา | ≤ 2 mm |
| f-custom | custom 180×250, flow | ใบเสนอราคา | ≤ 2 mm |
| f-roll80 | ม้วน 80 mm | ใบเสร็จสั้น | ≤ 2 mm |
| f-free-a5 | A5 แนวนอน, อิสระ | กล่องข้อความ/หัวข้อ/สี่เหลี่ยมตามพิกัด mm | ≤ 0.5 mm |

- `measure.mjs`: Playwright (1440×900) → `<id>.paper.json`, `<id>.paper.png`, `<id>.pdf` (`CASES=f-a5,f-roll80` เลือกบางกรณี)
- `compare.py`: pypdf → `results.md` (ตัวอักษรไทยจาก PDF มีรูปวรรณยุกต์/สระต่างจากข้อความต้นฉบับ จึงเทียบเฉพาะตัวฐาน)

```powershell
cd apps/studio
$env:STUDIO="http://localhost:3100"; $env:API="http://localhost:8002"; node ../../tasks/v1.8/fidelity/measure.mjs
cd ../..; python tasks/v1.8/fidelity/compare.py
```
