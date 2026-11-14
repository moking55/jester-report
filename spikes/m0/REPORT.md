# Spike M0 — ผลการทดสอบ

วันที่รัน: 13 พฤศจิกายน 2026 · Spec: [SPEC-engine-client.md](../../SPEC-engine-client.md) · แผน: [tasks/engine-client](../../tasks/engine-client/todo.md)

> ผลนี้ยืนยันเฉพาะรายงาน 3 แบบและ variation ที่ระบุ บน environment ข้างล่าง ไม่ใช่ production ready ไม่ครอบคลุม performance, concurrency, security, PDF/A/UA, QR/chart

## Environment

| รายการ | ค่า |
| --- | --- |
| Engine | Gotenberg 9.4.1, image `sha256:7d790c081a944f4d30cacb59a2cdccbe71569532af691b93c36551f6a877b4fc`, Chromium 156.0.8078.79 (จาก log ตอน start) |
| Args | `--chromium-auto-start=true --chromium-start-timeout=60s`; container จำกัด 2 GB / 2 CPU |
| Host | VM Ubuntu 24.04.5, 4 vCPU, 4 GB (Proxmox) ที่ `10.0.1.29`; เรียกผ่าน SSH tunnel |
| Options ที่ส่งทุก request | A4 (`paperWidth` 8.27 / `paperHeight` 11.7), margin 20/20/15/15 mm, `failOnResourceLoadingFailed=true`, `failOnResourceHttpStatusCodes=[499,599]`, `failOnConsoleExceptions=true` |
| ฟอนต์ (sha256) | TH Sarabun New Regular `b248f824…f824a`, Bold `49596f29…75fa7`; Noto Sans Thai (variable) `5a1c559b…c9ef8`; Sarabun Regular `226d4f36…3b2f1` — ครบใน manifest |
| ตัวตรวจ | `pdftotext`/`pdffonts`/`pdftoppm` (poppler 24.02 บน VM) เป็นหลัก; `pypdf` 7 เป็นตัวรอง |
| รอบ | 3 รอบต่อ variation, ข้อมูลสังเคราะห์ทั้งหมด |

หลักฐาน: manifest ครบที่ [evidence/](evidence/) (`sp-*-manifest.json`) และภาพหน้าที่คัดไว้ในโฟลเดอร์เดียวกัน; PDF และภาพทุกหน้าอยู่ใน `out/` (ไม่ commit)

## สรุป

| คำถามของ spike | ผล | ระดับหลักฐาน |
| --- | --- | --- |
| หัวตารางซ้ำทุกหน้า (`thead { display: table-header-group }`) | **ผ่าน** — ทุกหน้าของ 50 แถว (3 หน้า), landscape (4 หน้า), 500 แถว (19 หน้า) | L1 อัตโนมัติ + L4 ภาพ |
| Row ID ครบ ไม่หาย ไม่ซ้ำ | **ผ่าน** — ทุก variation รวม 500 แถว | L1 |
| ยอด group/grand total และยอดใบเสนอราคา | **ผ่าน** — 3,100.70 / 3,210.00, ยอดภาค และ PO01 350.00 / PO02 0.00 | L2 |
| ไทยใน body: วรรณยุกต์/สระ, ฝังฟอนต์, copy/search | **ผ่าน** — TH Sarabun New ฝังเป็น CID TrueType (Identity-H, มี ToUnicode); poppler extract ตรงทุกสตริง | L3 + L4 |
| ไทยใน header/footer | **ผ่านบางส่วน** — ข้อความไทยถูกต้องและอ่านได้ แต่ **ไม่ใช้ TH Sarabun New** ไม่ว่าจะฝังแบบ data URI หรือ url(); Chromium ใช้ Noto Sans Thai ที่มากับ image | L3 + L4 |
| Fallback เมื่อไม่มี TH Sarabun New | **ผ่าน** — Noto Sans Thai ที่เราส่งไปถูกใช้และฝัง ไม่มีตัวสี่เหลี่ยม | L3 + L4 |
| ไม่ส่งฟอนต์เลย | ไทยยังแสดงได้ — image มี Noto Sans Thai เป็น system font (และ Liberation Serif สำหรับละติน) | L3 |
| แถวสูงเกินหน้า | **ข้อความไม่หาย** (MARK001–MARK120 ครบ) ทั้ง `break-inside: avoid` และ `auto`; Chromium แบ่งแถวข้ามหน้าเอง | L1 + L4 |
| Determinism (input เดิม 3 รอบ) | **ผ่าน** — ข้อความทุกหน้าเหมือนกันทุกรอบ; PDF bytes ต่างกันทุกรอบ (คาดว่าจาก timestamp/ID) | hash ใน manifest |

## ข้อค้นพบที่กระทบการออกแบบ

1. **ฟอนต์ใน header/footer ของ Gotenberg ใช้ custom font ไม่ได้** ([ภาพ header](evidence/sp-a-header-inline.png), [ภาพ footer](evidence/sp-a-footer-inline.png))
   - ทั้ง `@font-face` แบบ data URI และ url() ไม่มีผล ได้ Noto Sans Thai แทน (เห็นจากรูปตัวอักษรมีหัวกลม)
   - เอกสารที่ต้องใช้ TH Sarabun New ทั้งฉบับ (เช่นเอกสารราชการ) จึงใส่ข้อความใน header/footer ของ Gotenberg ไม่ได้ตามต้องการ
2. **Footer จัดวางไม่ตรง CSS:** `text-align: right` ไม่มีผล และช่องว่างระหว่าง "หน้า" กับเลขหน้าหายไป ("หน้า1/1ผู้อนุมัติ") ต้องหาวิธีจัดวางที่ใช้ได้กับ header/footer context
3. **Fallback เปลี่ยนขนาดตัวอักษรมาก:** ที่ 16pt Noto Sans Thai ใหญ่กว่า TH Sarabun New ชัดเจน ([ภาพ](evidence/sp-a-body-fallback-noto.png) เทียบ [ภาพ](evidence/sp-a-body.png)) ถ้าฟอนต์หลักหาย จำนวนหน้าและการตัดบรรทัดจะเปลี่ยน — ควรถือว่าฟอนต์หลักหายเป็น error ไม่ใช่ fallback เงียบ ๆ
4. **`<tfoot>` ซ้ำทุกหน้า:** แถว "รวม PO04 5.00" ปรากฏ 3 ครั้งในเอกสาร 3–4 หน้า ([ภาพหน้า 2](evidence/sp-c-avoid-p2.png)) ทำให้ดูเหมือนมียอดรวมหลายครั้ง ยอดสรุปจึงห้ามใช้ `<tfoot>`
5. **`break-inside: avoid` กับแถวสูงเกินหน้า** ([ภาพ](evidence/sp-c-avoid-p1.png)) ดันแถวไปหน้าถัดไป เหลือหัวข้อ "ใบสั่งซื้อ PO04" ค้างท้ายหน้า 1 กับพื้นที่ว่างเกือบทั้งหน้า แล้วจึงแบ่งแถวข้ามหน้า; แบบ `auto` ([ภาพ](evidence/sp-c-auto-p1.png)) ไม่มีช่องว่างแต่แถวถูกแบ่งกลางเนื้อหา — ไม่มีข้อความหายทั้งสองแบบ
6. **`pypdf` อ่านไทยไม่ครบ:** หล่นไม้เอก/ไม้โทบางตัว ("ช่วง" → "ชวง"), แสดงสระอำเป็นนิคหิต+สระอา และไม่เห็นข้อความใน header/footer ขณะที่ poppler อ่านได้ถูก — การตรวจ PDF ภาษาไทยในอนาคตต้องใช้ poppler (หรือเทียบเท่า) ไม่ใช่ `pypdf`
7. **Cold start ของ Chromium บน VM นี้ช้ากว่า 20 วินาที** ต้องใช้ `--chromium-auto-start` (ดู spec ส่วน "ผลจริงจาก Checkpoint A")

## รอบที่ 2: image ที่ build เองพร้อม TH Sarabun New เป็น system font

ผู้ใช้เลือก D1 = (ค) — build image ([infra/gotenberg/Dockerfile](../../infra/gotenberg/Dockerfile)) จาก `gotenberg/gotenberg:9.4.1@sha256:7d790c08…` แล้วติดตั้ง TH Sarabun New Regular/Bold ไว้ที่ `/usr/local/share/fonts/jester/` + `fc-cache`
ได้ image `jester/gotenberg:9.4.1-th1` (`sha256:ab7478a2fef19abad868d64b65de4fad0cb2a394e0d5d56a56e67879a10b1eec`) รันด้วย args เดิม แล้วรัน SP-A/B/C ใหม่ทั้งหมด 3 รอบ (manifest ใน `evidence/` เป็นของรอบนี้)

| Variant | ฟอนต์ใน header/footer | ผล |
| --- | --- | --- |
| `hf-system-font`: header/footer ไม่ประกาศ `@font-face` อ้าง `"TH Sarabun New"` ตามชื่อ | **TH Sarabun New** ([header](evidence/sp-a-header-system-font.png), [footer](evidence/sp-a-footer-system-font.png)) | ผ่าน |
| `hf-font-url`: `@font-face` แบบ url() | TH Sarabun New (ได้จาก system font ที่ชื่อตรงกัน) | ผ่าน |
| `hf-font-inline`: `@font-face` แบบ data URI | ยังเป็น **Noto Sans Thai** — การประกาศ `@font-face` ที่โหลดไม่ได้ทำให้ไม่ไปหา system font ชื่อเดียวกัน | ผ่าน checks แต่ฟอนต์ไม่ตรง |
| `hf-system-font-fixed`: footer เป็น `<div>` กว้าง 100% + `white-space: pre` และ `box-sizing: border-box` ที่ body | TH Sarabun New, **ชิดขวาได้และช่องว่างไม่หาย** ([ภาพ](evidence/sp-a-footer-system-font-fixed.png)) | ผ่าน |
| `no-fonts`: ไม่ส่งไฟล์ฟอนต์เลย | body และ header/footer ใช้ TH Sarabun New จาก system | ผ่าน |
| `fallback-noto` | ไม่ได้ทดสอบ fallback อีกแล้ว: เมื่อ TH Sarabun New เป็น system font, กรณี "ฟอนต์หลักหาย" ไม่เกิดขึ้น | check ฟอนต์ fail ตามคาด |

SP-B (6 variations) และ SP-C (2 variations) ผ่านทุก check บน image ใหม่ จำนวนหน้าเท่ารอบแรก (3/4/19 และ 4/3) และข้อความนิ่งทุกรอบ — ไม่มี regression

**ข้อสรุปรอบ 2**
- D1 แก้ได้ด้วย image ของเราเอง: header/footer ใช้ TH Sarabun New ได้เมื่อ **อ้างชื่อฟอนต์ระบบ และห้ามประกาศ `@font-face` แบบ data URI ใน header/footer**
- ปัญหา footer ชิดขวา/ช่องว่างหาย (ข้อค้นพบ 2) แก้ได้ด้วย `box-sizing: border-box` + `<div>` กว้าง 100% + `white-space: pre`
- ต้นทุน: ต้อง build และดูแล image `jester/gotenberg` เอง (rebuild เมื่อ Gotenberg ออกเวอร์ชันใหม่) และแจก GPL notice ของ TH Sarabun New ไปกับ image
- Image ทางการ (`gotenberg/gotenberg:9.4.1`) ยังอยู่บน VM ใช้ย้อนกลับได้

## รอบที่ 3: engine แบบปิด JavaScript และ allow-list (14 พ.ย. 2026, SPEC-binder)

Image เดิม `jester/gotenberg:9.4.1-th1` เพิ่ม args `--api-start-timeout=90s --chromium-disable-javascript=true --chromium-allow-list=^file:///tmp/.* --chromium-deny-private-ips=true --chromium-deny-public-ips=true` (flag ทั้งหมดยืนยันจาก `gotenberg --help` ของ 9.4.1) รัน SP-A/B/C 1 รอบ manifest ที่ `evidence/sp-*-hardened-manifest.json`

| ตรวจ | ผล |
| --- | --- |
| SP-A/B/C (poppler) | เท่ารอบ 2 ทุก variant (`fallback-noto` fail ตามคาด) |
| 500 แถว 19 หน้า: เลขหน้าใน footer | 19/19 หน้า (`หน้าN/19`, poppler ทีละหน้า) |
| 500 แถว: หัวตารางซ้ำ | 19/19 หน้า |
| JavaScript ใน body | ไม่ทำงาน (ข้อความที่ script จะเขียนไม่ปรากฏ) |
| `<img>`/CSS `url()` ไป 169.254.169.254, 10.x, IP ภายนอก, `file:///etc/passwd` | engine บล็อกทุกกรณี (log `outbound request blocked by the Chromium filters`) |
| `data:` URI | ยังแสดงได้ |

ข้อสังเกต:
- **URL ที่ถูกบล็อกไม่ทำให้ render fail:** ได้ PDF ที่รูปหายไปเฉย ๆ แม้มี `failOnResourceLoadingFailed` การตรวจของ `binder` จึงยังจำเป็นเพื่อให้ผู้ใช้เห็นปัญหา
- **ต้องใช้ `--api-start-timeout`:** ค่า default 30 วินาทีทำให้ container หยุดเองระหว่าง Chromium กำลังเปิด

## การตัดสินใจ (ปิดครบแล้ว)

| # | เรื่อง | ทางเลือก | ผลกระทบ |
| --- | --- | --- | --- |
| D1 ✅ เลือก (ค) แล้ว — ดูรอบที่ 2 | ข้อความใน header/footer ต้องเป็น TH Sarabun New หรือไม่ | (ก) ยอมรับ Noto Sans Thai ใน header/footer ของ Gotenberg และใช้แค่เลขหน้า/ข้อความสั้น (ข) ทำ header/footer ใน body เองโดยไม่ใช้ `header.html`/`footer.html` ของ Gotenberg (ค) ตรวจวิธีอื่นเพิ่ม เช่นติดตั้ง TH Sarabun New เป็น system font ใน image ของ Gotenberg ที่เรา build เอง | (ข) ทำให้ `binder` ต้องคุมการแบ่งหน้า/เลขหน้าเอง ซับซ้อนขึ้นมาก; (ค) ต้องดูแล Docker image ของ Gotenberg เอง แทนการใช้ image ทางการตรง ๆ |
| D2 ✅ เลือก (ข) error (13 พ.ย. 2026) | เมื่อฟอนต์ที่ template อ้างหาไม่เจอ (เช่นฟอนต์ที่ทีมอัปโหลดเอง) | (ก) render ต่อด้วย fallback และเตือน (ข) ถือเป็น error ไม่ออก PDF | หลังรอบ 2 TH Sarabun New อยู่ใน image แล้ว ข้อนี้เหลือเฉพาะฟอนต์อื่น; (ข) ปลอดภัยกว่าเพราะ fallback เปลี่ยน layout มาก |
| D3 ✅ เลือก (ก) `auto` (13 พ.ย. 2026) | แถวสูงเกินหน้า | (ก) `break-inside: auto` ให้แบ่งแถวได้ (ข) `avoid` เป็นค่าเริ่มต้น ยอมรับพื้นที่ว่าง (ค) reject แถวที่ยาวเกินกำหนดที่ชั้นแอป | ทั้ง (ก) และ (ข) ไม่ทำข้อความหายบน environment นี้ จึงไม่จำเป็นต้อง reject เพื่อกันข้อมูลหาย |
| D4 ✅ ใช้เป็นกติกาของ `binder` (ผู้ใช้ไม่แย้ง) | ยอดสรุปท้ายตาราง | ใช้แถวปกติใน `<tbody>` หรือ section แยก ห้ามใช้ `<tfoot>` | กติกาของ `binder` |

ผลที่ **ไม่** ต้องเปลี่ยนสถาปัตยกรรม: หัวตารางซ้ำด้วย CSS ทำงานจริง จึงไม่ต้องแบ่งหน้าเองที่ชั้นแอป (ทางเลือกที่ T28 กังวลไว้)

## ข้อจำกัด

- ทดสอบเฉพาะ variation ข้างบน, A4, ข้อมูลสังเคราะห์, ตัวอักษรไทย/ละตินพื้นฐาน
- L4 คือการดูภาพที่ความละเอียด 50–150 dpi โดย Claude; ผู้ใช้ยังไม่ได้ตรวจภาพเอง
- ไม่ได้ทดสอบ `failOnResourceHttpStatusCodes` เชิงความหมาย (ไม่มี HTTP resource), concurrency, เวลา/หน่วยความจำ, ข้อความผสมภาษาอื่น, ตัวเลขไทย
- Font ละติน/สัญลักษณ์บางตัว (เช่น `·`, `–`) ตกไปใช้ Noto Sans จาก image ตามที่ `pdffonts` แสดง
