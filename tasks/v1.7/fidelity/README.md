# T11 ผืน vs PDF

วัดตำแหน่งต้นบรรทัดของข้อความหลัก (baseline) บนผืนของ Document Designer ในโหมด "แสดงข้อมูลตัวอย่าง" เทียบกับหน้าแรกของ PDF
จาก Preview pdf ของ draft เดียวกัน (starter quotation และ tax-invoice ของ v1.7) บน stack ทดสอบ (api 1.6.0-rc + Gotenberg บน VM, Studio `next dev`)

- `measure.mjs`: Playwright (1440×900) → `<id>.paper.json`, `<id>.paper.png`, `<id>.pdf` (ใส่ template.html/report.css ของ starter ลง draft ก่อน)
- `compare.py`: pypdf → `results.md` (เกณฑ์ ≤ 2 mm)

ผล 19 พ.ย. 2026: ต่างมากสุด 0.53 mm (ผ่าน) — ดู `results.md`

สิ่งที่ต้องแก้บนผืนก่อนจะผ่าน (ครั้งแรกต่างถึง 165 mm/10 mm):

1. inherited style ของ Studio (line-height 1.55, สี, ฟอนต์) ไหลเข้า shadow root → `:host { all: initial }`
2. PDF มี margin 8px ของ `body` (ค่าเริ่มของ Chromium) → `.jd-doc { margin: 8px }` ในกล่องหน้า (`display: flow-root`); report.css ทับได้
3. `.jd-sheet` กว้างเกิน A4 (padding ไม่รวม) → `box-sizing: border-box`
4. class ของคอลัมน์ (`data-jd="col"`) หายบนผืน → ใส่ class เดิมให้ `.jd-container`
5. โหมดตัวอย่าง: QR/บาร์โค้ดเป็น `<svg>` ขนาดจริง (size_mm, Code 128 ตามความยาวข้อความ) แทนชิป; ค่าที่คำนวณไม่ได้ (macro, baht_text)
   เป็นชิปสั้น `branch(…)`; เงื่อนไขที่ตัวอย่างเลือกสาขาได้วาดเหมือน PDF (ไม่มีกรอบ/ป้าย)
6. header/footer บนขอบใช้ฟอนต์ `fonts.headerFooter`

ข้อจำกัดที่รู้: ค่าที่คำนวณไม่ได้ในเบราว์เซอร์ (macro, `fmt.baht_text`) แสดงเป็นชิป ความกว้างจึงไม่เท่าข้อความจริง — บรรทัดที่ยาวอาจตัดต่างจาก PDF
