# Font licenses (T1)

ตรวจ: 13 พฤศจิกายน 2026 โดย subagent อ่านจากต้นทาง และ parent สรุป — เป็นสิ่งที่ข้อความ license ระบุ ไม่ใช่คำแนะนำทางกฎหมาย

| ฟอนต์ | ต้นทางที่อ่าน | License | แจกต่อใน repo/image | หมายเหตุ |
| --- | --- | --- | --- | --- |
| TH Sarabun New | [f0nt.com/release/th-sarabun-new](https://www.f0nt.com/release/th-sarabun-new/) (หน้าเผยแพร่ของ SIPA); [TLWG COPYING](https://tug.ctan.org/fonts/thai/fonts-tlwg/COPYING) | GPL 2.0 + font exception (ตามประกาศ) | **ได้ตามประกาศ — ยังไม่ได้อ่านไฟล์ license ใน zip** | ต้องอ่านไฟล์ license ที่มากับ zip ตอนดาวน์โหลด (T7/T8) ก่อน commit; font exception ทำให้ PDF ที่ฝังฟอนต์ไม่ติด GPL |
| TH SarabunPSK | [f0nt.com 13 fonts](https://www.f0nt.com/release/13-free-fonts-from-sipa/) | **ไม่ชัด** — หน้าเผยแพร่ไม่ได้ระบุเงื่อนไข | **ไม่ชัด** | ตามกติกาใน spec: ไม่ bundle; ให้ทีมอัปโหลดเองเป็น asset |
| Sarabun (Google Fonts) | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/OFL.txt), [cadsondemak/Sarabun](https://github.com/cadsondemak/Sarabun) | SIL OFL 1.1, ไม่มี Reserved Font Name | ได้ | ออกแบบเดียวกับ TH Sarabun New (Cadson Demak ปรับปรุง 2018) แต่เป็นคนละไฟล์ |
| Noto Sans Thai | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/OFL.txt) | SIL OFL 1.1, ไม่มี Reserved Font Name | ได้ | google/fonts มีเฉพาะ variable font `NotoSansThai[wdth,wght].ttf` |

## ข้อตัดสินสำหรับ spike (ตามกติกาใน SPEC-engine-client.md สมมติฐานข้อ 4)

- **ค่าเริ่มต้น:** TH Sarabun New — ถ้าไฟล์ license ใน zip ตรงกับประกาศ GPL 2.0 + font exception; ถ้าไม่ตรงหรือไม่มีไฟล์ license ให้ใช้ Sarabun (Google Fonts) แทน
- **TH SarabunPSK:** ไม่ bundle (license ไม่ชัด) — ทีมอัปโหลดเองได้
- **Fallback:** Noto Sans Thai (variable font)
- ทุกไฟล์ต้อง pin sha256 และเก็บไฟล์ license ไว้ข้างกันก่อน commit

## Download URLs (ยังไม่ได้ดาวน์โหลด)

- https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf
- https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf
- https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/NotoSansThai%5Bwdth,wght%5D.ttf
- TH Sarabun New: zip จากหน้า f0nt.com ข้างบน
