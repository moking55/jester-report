# Research Keywords: ระบบรายงาน PDF สำหรับธุรกิจ

วันที่จัดทำและตรวจแหล่งข้อมูล: 12 พฤศจิกายน 2026  
โปรเจกต์: `jester-report`  
สถานะ: แผนวิจัยเบื้องต้นและรายการฟีเจอร์เสนอ ยังไม่ใช่ข้อกำหนดที่อนุมัติหรือผลทดสอบระบบ  
ประวัติ: ฉบับ Keywords แรกจัดทำโดย Codex คนเดียว; ต่อมาผู้ใช้ให้ Checkpoints 1–2 ทำ parallel research และ parent ตรวจผลแล้ว ดู [Checkpoint review](CHECKPOINTS_01_02.md) ภายหลังผู้ใช้อนุญาต Codex subagents แบบ parallel สำหรับ Checkpoints 3–4; ยังคงไม่ใช้ Gemini/Antigravity

ข้อกำหนดล่าสุด: ผู้ใช้ไม่ต้องการทดสอบผ่าน Docker เพราะเครื่องทรัพยากรจำกัด แผนปัจจุบันจึงเป็นการศึกษาเอกสารและตรวจ specimens แบบเบา ไม่ติดตั้ง/รัน Engine ไม่ทำ benchmark หนัก และไม่ใช้ Cloud ทดแทนเอง ดูรายละเอียดใน [แผน Research ที่ปรับแล้ว](../../tasks/plan.md) หัวข้อที่ต้องตรวจ runtime ด้านล่างเป็น **deferred/not-tested** ไม่ใช่งานที่ต้องรันบนเครื่องนี้

## 1. เป้าหมายและขอบเขต

เตรียมคำค้นและกรอบศึกษาสำหรับสร้างโปรแกรมออกเอกสารรายงาน PDF สำหรับธุรกิจ มีความสามารถด้านรายงานคล้าย JasperReports ใช้ Gotenberg เป็นเครื่องมือ Render PDF เบื้องหลัง และตั้งใจเผยแพร่เป็นโอเพนซอร์ส

เอกสารนี้ให้ทั้งหัวข้อค้นคว้า คำถามที่ต้องตอบ ผลลัพธ์ที่ควรได้จากการศึกษา และลำดับความสำคัญ เพื่อใช้เริ่ม Research เชิงลึกโดยไม่รีบเลือกสถาปัตยกรรม

### สิ่งที่ทราบ

- ต้องการ PDF เป็นผลลัพธ์หลัก ใช้ Gotenberg เป็น Engine และเปิดโอเพนซอร์ส
- ใช้ JasperReports เป็นจุดอ้างอิงด้านความสามารถ ยังไม่มีข้อกำหนดว่าต้องอ่านหรือแปลงไฟล์ JRXML ได้
- ขณะตรวจสอบ โฟลเดอร์โปรเจกต์ยังไม่มีไฟล์ และยังไม่เป็น Git repository จึงไม่มีโค้ดหรือสถาปัตยกรรมเดิมให้อ้างอิง

### สมมติฐานเพื่อเริ่มศึกษา

- เริ่มจากรายงานแบบกำหนดหน้ากระดาษ เช่น ใบเสนอราคา ใบแจ้งหนี้ และรายงานตารางหลายหน้า ส่วน dashboard และเครื่องมือ BI ยังอยู่นอกขอบเขต
- เสนอให้ใช้เส้นทาง HTML/CSS ของ Gotenberg เป็นฐานทดลองก่อน เพราะต้องสร้างเอกสารจากข้อมูลแบบเปลี่ยนแปลงได้ ไม่ได้ตัดสิทธิ์การศึกษา Office templates ภายหลัง
- ภาษาไทย/อังกฤษเป็นกรณีทดสอบสำคัญตามบริบทผู้ใช้ แต่ยังไม่ถือว่าเป็นข้อกำหนดตลาดที่ยืนยันแล้ว
- การเริ่มจากข้อมูล JSON และ API เป็นเพียงทางเลือก MVP สำหรับนักพัฒนา หากผู้ใช้หลักเป็นฝ่ายธุรกิจที่ไม่เขียนโค้ด ต้องทบทวนลำดับความสำคัญของ Visual Designer

### สิ่งที่ยังไม่ทราบ

กลุ่มผู้ใช้หลัก รูปแบบติดตั้ง ปริมาณงาน ขนาดรายงาน ความต้องการเชื่อมฐานข้อมูล ความจำเป็นของ Designer แบบลากวาง และนโยบาย license ยังไม่กำหนด จึงยังไม่เลือกภาษาโปรแกรม ฐานข้อมูล queue หรือ frontend framework

## 2. ข้อค้นพบตั้งต้นจากแหล่งข้อมูลหลัก

1. **JasperReports มีขอบเขตกว้างกว่าการแปลง HTML เป็น PDF**: ตัวอย่างทางการครอบคลุม grouping, subreports, tables, charts, parameters/data sources และ PDF export ควรใช้เป็นรายการตรวจสอบความสามารถ ไม่ใช่เป้าหมายทำทุกอย่างในรุ่นแรก [S01], [S02], [S03]
2. **Gotenberg เป็นบริการแปลงเอกสารผ่าน HTTP**: เส้นทาง Chromium รับ HTML/CSS และ assets เพื่อพิมพ์ PDF ได้ แต่การผูกข้อมูลกับ template การคำนวณ และการจัดการ template ต้องออกแบบในระบบรายงาน [S04], [S05]
3. **เอกสารปัจจุบันเป็น Gotenberg 9.x**: มีคู่มือย้ายจาก 8.x ซึ่งเปลี่ยน API บางส่วน ต้องระบุเวอร์ชันในผลวิจัยและตรึง image version เมื่อทดลอง ห้ามผสมตัวอย่างต่าง major version โดยไม่ตรวจสอบ [S06], [S07]
4. **Header/footer ของ Chromium มีข้อจำกัดเฉพาะ**: Render แยกจากเนื้อหาหลัก มีข้อกำหนดเรื่อง styles และ images จึงต้องทดสอบโลโก้ ฟอนต์ไทย และพื้นที่ margin โดยเฉพาะ [S05]
5. **Gotenberg 9.x มีงาน PDF หลัง Render** เช่น merge, stamp, encryption, signing และการตรวจมาตรฐานบางประเภท การมี API ไม่ได้ยืนยันว่าเอกสารธุรกิจของเราผ่านมาตรฐาน ต้องทดสอบ output ที่สร้างจริง [S08]
6. **Render เอกสารจากผู้ใช้มีขอบเขตความปลอดภัยด้านเครือข่าย**: HTML และ resources ที่อ้างถึงอาจทำให้เกิด outbound requests ต้องศึกษา SSRF และการจำกัดปลายทางก่อนเปิดรับผู้ใช้ที่ไม่ไว้วางใจ [S09], [S10]
7. **Open source เป็นเรื่องสิทธิการใช้ แก้ไข และแจกจ่ายด้วย**: การเปิด repository อย่างเดียวไม่เพียงพอ ต้องศึกษา license ของโครงการและส่วนประกอบที่จะนำมาแจกจ่าย [S11], [S12]

ข้อเสนอในส่วนถัดไปเป็นการสังเคราะห์เพื่อกำหนดงานวิจัย ไม่ใช่ฟีเจอร์ที่พัฒนาแล้ว และไม่ใช่การรับรองว่า Gotenberg รองรับพฤติกรรมแบบ JasperReports ครบถ้วน

## 3. ฟีเจอร์พื้นฐานที่ควรนำไปประเมิน

ความหมายของระดับ: **P0** = ผู้สมัครฟีเจอร์รุ่นแรก, **P1** = ขยายหลังแกนหลักพิสูจน์แล้ว, **P2** = ขั้นสูงหรือเฉพาะกรณี ทั้งหมดปรับได้ตามผู้ใช้จริง

| ความสามารถ | ระดับเสนอ | พฤติกรรมที่ควรได้ | เจ้าของความสามารถ |
| --- | --- | --- | --- |
| Template และ sample data | P0 | สร้าง แก้ไข บันทึก และเปิดตัวอย่างรายงานซ้ำได้ | ระบบรายงาน |
| Data binding และ parameters | P0 | ผูก fields/list ตรวจชนิดและค่าที่จำเป็น แจ้งข้อมูลผิดจุดได้ | ระบบรายงาน |
| Text, table, image, line และรูปแบบตัวเลข/วันที่ | P0 | ประกอบรายงานธุรกิจพื้นฐานและจัดแนวตัวเลขได้ | ระบบรายงานสร้าง HTML/CSS แล้วให้ Engine Render |
| ขนาดกระดาษ margin และ orientation | P0 | A4 แนวตั้ง/นอนและค่าที่กำหนดในขอบเขตที่รองรับ | ระบบรายงานส่งค่าหรือ CSS ให้ Gotenberg |
| Pagination, หัวตารางซ้ำ และ page number | P0 | ตารางหลายหน้าไม่มีข้อมูลหาย ไม่ทับ footer | ต้องพิสูจน์ร่วมกันระหว่าง template และ Chromium |
| Grouping, subtotal, grand total | P0 แบบพื้นฐาน | รวมยอดตามกลุ่มข้อมูลและทั้งรายงานได้ | ระบบรายงาน; ยอดต่อหน้าจริงแยกศึกษาขั้นสูง |
| ภาษาไทยและ fonts | P0 ตามสมมติฐาน | วรรณยุกต์ครบ ตัดบรรทัดเหมาะสม และค้นข้อความใน PDF ได้ | Template, font packaging และ Engine ร่วมกัน |
| Preview จาก PDF จริงและ download | P0 | ตัวอย่างใช้ pipeline เดียวกับ output ที่ดาวน์โหลด | ระบบรายงานเรียก Gotenberg |
| API พร้อม validation และ error ที่อ่านรู้เรื่อง | P0 | ระบบภายนอกส่งข้อมูล ขอรายงาน และแยกสาเหตุล้มเหลวได้ | ระบบรายงาน |
| Template version และข้อมูลอ้างอิงการสร้างเอกสาร | P0 แบบพื้นฐาน | ระบุได้ว่า PDF ใช้ template และ renderer รุ่นใด | ระบบรายงาน |
| Limits, timeout และการจำกัด resources | P0 | งานผิดปกติไม่ใช้ทรัพยากรไม่จำกัด ไม่โหลด URL ตามอำเภอใจ | ระบบรายงานและการตั้งค่า Gotenberg |
| Authentication และ authorization | P0 เมื่อติดตั้งเป็น shared server | ตรวจสิทธิ์ template, job และไฟล์ที่ดาวน์โหลด | ระบบรายงาน; Engine auth ไม่แทนสิทธิ์ระดับธุรกิจ |
| Visual Designer แบบลากวาง | P1 หรือ P0 ตามกลุ่มผู้ใช้ | สร้างรายงานโดยไม่ต้องเขียน HTML พร้อม undo/redo | ระบบรายงาน; ยังไม่ตัดสินใจวิธีสร้าง |
| Reusable components และ master-detail | P1 | ใช้หัวบริษัทและส่วนย่อยซ้ำได้ รองรับข้อมูลซ้อน | ระบบรายงาน |
| Charts, QR และ barcodes | P1 | สื่อสารข้อมูลสรุปและอ้างอิงเอกสารได้ | ระบบรายงานสร้าง assets ให้ Engine |
| Background jobs, retry และประวัติงาน | P1 หรือ P0 เมื่องานใหญ่ | งานยาวติดตามสถานะได้ และการ retry ไม่สร้างผลข้างเคียงซ้ำ | ระบบรายงาน; ศึกษา webhook ของ Engine ประกอบ |
| Schedule, email และ batch delivery | P2 | ออกรายงานตามเวลาและส่งผู้รับที่มีสิทธิ์ | ระบบรายงาน |
| PDF/A, PDF/UA, encryption และ digital signature | P2 ตามกรณี | ผ่านเกณฑ์ที่ระบุและมีหลักฐานตรวจผล | Engine บางส่วน; ระบบรายงานดูแล policy และ keys |
| JRXML migration และ export รูปแบบอื่น | P2 | ทำเฉพาะเมื่อยืนยันว่าจำเป็น | งานแยก; ไม่ถือว่า Gotenberg ทำให้ได้โดยอัตโนมัติ |

ตารางนี้เป็นข้อเสนอด้านผลิตภัณฑ์ อ้างอิงขอบเขต Engine จาก [S04], [S05], [S08] ส่วนฟีเจอร์รายงานใช้ [S01] เป็น benchmark ยังไม่ใช่ผลเปรียบเทียบที่ทดสอบแล้ว

## 4. Research Keyword Map

แต่ละหมวดมีคำค้นภาษาอังกฤษสำหรับค้นเอกสารทางเทคนิค พร้อมคำถามและผลส่งมอบที่ควรได้หลังศึกษาเชิงลึก `Query` เป็นคำค้นเตรียมไว้ ไม่ได้หมายความว่าค้นและทดสอบทุกหัวข้อแล้ว

### R01 — ผู้ใช้และงานรายงานธุรกิจ

- **Keywords:** `operational reporting`, `paginated reports`, `transactional documents`, `pixel-perfect reports`, `report authoring personas`, `embedded reporting`.
- **Query:** `business PDF reporting operational reports vs transactional documents requirements`
- **คำถาม:** ใครสร้าง template ใครเรียกรายงาน ใครอ่านผลลัพธ์? ต้องการเอกสารธุรกรรมหรือรายงานวิเคราะห์แบบตารางเป็นหลัก?
- **ผลส่งมอบ:** Personas, use cases 3–5 แบบ และตัวอย่างเอกสารที่ใช้เป็นเกณฑ์ความถูกต้อง
- **ลำดับ:** ศึกษาก่อนกำหนด MVP; เชื่อม R02, R14

### R02 — Benchmark JasperReports และเครื่องมือใกล้เคียง

- **Keywords:** `JasperReports report bands`, `Jaspersoft Studio report designer`, `jsreport templates recipes`, `Carbone document templates`, `pdfme designer schema`, `report feature matrix`.
- **Query:** `site:jasperreports.sourceforge.net/sample.reference/ report groups tables subreports`
- **Query:** `site:jsreport.net/learn templates preview assets` และ `site:pdfme.com/docs designer`
- **คำถาม:** สิ่งใดเป็นแกนรายงาน สิ่งใดเป็น Designer และสิ่งใดเป็น report server? ฟีเจอร์ที่อ้างถึงอยู่ใน edition และ license ใด?
- **ผลส่งมอบ:** ตารางเปรียบเทียบแยก library/designer/server พร้อมหลักฐาน เวอร์ชัน และสถานะ “ยังไม่ยืนยัน”
- **แหล่งตั้งต้น:** [S01], [S13], [S14], [S15]; ใช้ pdfme ศึกษาแนวคิด Designer ไม่ถือว่าเสียบกับ Gotenberg ได้ทันที

### R03 — รูปแบบ Template และ Report Definition

- **Keywords:** `declarative report schema`, `JSON report definition`, `HTML CSS report template`, `template schema versioning`, `report intermediate representation`, `template portability`.
- **Query:** `declarative report definition JSON schema HTML CSS template designer round trip`
- **คำถาม:** เก็บ template เป็น HTML/CSS โดยตรงหรือ schema ที่สร้าง HTML? ถ้ามีทั้ง code editor และ Designer จะรักษาข้อมูลตอนสลับโหมดอย่างไร?
- **ผลส่งมอบ:** เปรียบเทียบ 2–3 ทางเลือกพร้อมตัวอย่าง template เดียวกันและข้อจำกัด migration; ยังไม่เลือกรูปแบบถาวร
- **ลำดับ:** ตัวตัดสินสำคัญก่อนลงทุน R14; เชื่อม R05, R10, R15

### R04 — การแบ่งหน้าและ Print Layout

- **Keywords:** `CSS paged media`, `CSS fragmentation`, `break-inside`, `widows orphans`, `repeating table header`, `keep with next`, `oversized table row`, `page overflow`.
- **Query:** `Chromium print PDF repeating thead break-inside avoid oversized rows`
- **Query:** `site:w3.org/TR/css-break-3/ break-inside widows orphans`
- **คำถาม:** หัวตารางซ้ำได้ในโครงสร้างใด? แถวสูงเกินหนึ่งหน้าทำอย่างไร? Header/footer จะทับข้อมูลหรือเกิดหน้าว่างเมื่อใด?
- **ผลส่งมอบ:** ชุดตัวอย่าง pagination พร้อม PDF และภาพเทียบ; ระบุพฤติกรรมที่รองรับจริงตาม Chromium version
- **แหล่งตั้งต้น:** [S05], [S16]; ข้อกำหนด CSS ไม่ใช่หลักฐานว่า Chromium รองรับทุกกรณี

### R05 — Report Bands และองค์ประกอบพื้นฐาน

- **Keywords:** `title band`, `page header footer`, `detail band`, `group header footer`, `report summary`, `stretch text`, `conditional visibility`, `no data section`.
- **Query:** `site:jasperreports.sourceforge.net/sample.reference/jasper/ report bands stretch summary`
- **คำถาม:** Title, detail และ summary แสดงครั้งใด? จะจำลอง band semantics ด้วย HTML flow ได้แค่ไหน? พฤติกรรมเมื่อข้อความยาวหรือไม่มีข้อมูลคืออะไร?
- **ผลส่งมอบ:** รายการองค์ประกอบรุ่นแรกและกติกาการแสดงผล แยก report header ออกจาก page header
- **แหล่งตั้งต้น:** [S02]; ห้ามสมมติว่า CSS flow เทียบเท่า band engine

### R06 — Data Binding และ Dataset Contract

- **Keywords:** `JSON data binding`, `nested datasets`, `field mapping`, `JSON Schema validation`, `null handling`, `missing field diagnostics`, `empty dataset`.
- **Query:** `report template JSON data binding nested arrays missing fields schema validation`
- **คำถาม:** แยก null, ค่าว่าง และ field ที่ไม่มีอย่างไร? ข้อมูลซ้อนและ list ใช้ syntax ใด? จุดผิดพลาดย้อนกลับไปหา field และ template element ได้หรือไม่?
- **ผลส่งมอบ:** ตัวอย่าง input contract และกรณีข้อมูลผิด โดยไม่ผูกกับฐานข้อมูลเฉพาะ
- **ลำดับ:** P0; เชื่อม R07, R08, R16

### R07 — Report Parameters และตัวกรอง

- **Keywords:** `typed report parameters`, `parameter defaults`, `date range filter`, `multi-select parameters`, `parameter validation`, `parameter form generation`.
- **Query:** `report parameters types defaults validation date range multi select`
- **คำถาม:** Parameters ต่างจาก fields ใน dataset อย่างไร? รองรับวันที่ เขตเวลา enum และค่าบังคับอย่างไร? ผู้เรียกหรือระบบรายงานเป็นผู้กรองข้อมูล?
- **ผลส่งมอบ:** Parameter schema และพฤติกรรม error; แบบฟอร์มกรอกค่าถือเป็นขอบเขต UI แยก
- **ลำดับ:** P0; ความหมายตัวกรองต้องตรงกันระหว่าง R09 และ R16

### R08 — Expressions, Grouping และการคำนวณ

- **Keywords:** `report expressions`, `group aggregates`, `running totals`, `subtotal grand total`, `decimal arithmetic`, `rounding policy`, `page subtotal`, `evaluation scope`.
- **Query:** `report aggregate scope group subtotal running total decimal rounding`
- **คำถาม:** ใครเป็นเจ้าของสูตรและการปัดเศษ? คำนวณก่อนหรือหลัง grouping? ยอดต่อหน้าต้องรู้ตำแหน่งแบ่งหน้าจริง จะรองรับหรือประกาศข้อจำกัดอย่างไร?
- **ผลส่งมอบ:** ขอบเขตสูตรและชุดข้อมูลที่มี expected totals ชัดเจน แยก group subtotal ออกจาก page subtotal
- **ลำดับ:** Grouping/ยอดรวมพื้นฐาน P0; page subtotal ศึกษาเพิ่มเติม ไม่รับปากว่าทำได้ด้วย CSS อย่างเดียว

### R09 — Data Sources และการเตรียมข้อมูล

- **Keywords:** `report data adapter`, `JSON input API`, `read-only SQL connector`, `parameterized queries`, `REST data source`, `data snapshot consistency`, `query timeout`.
- **Query:** `reporting JSON payload vs direct SQL data source parameterized queries snapshot`
- **คำถาม:** ให้ระบบต้นทางส่งข้อมูลพร้อมใช้ หรือให้ report server ดึงเอง? การรวมหลายแหล่งทำให้ข้อมูลต่างเวลากันหรือไม่? ใครเก็บ credentials?
- **ผลส่งมอบ:** ข้อดีข้อเสีย JSON-first กับ connectors พร้อมขอบเขตการอ่านข้อมูลและ timeout
- **แหล่งตั้งต้น:** [S01]; JSON-first เป็นข้อเสนอเพื่อลดขอบเขต ไม่ใช่ข้อกำหนดที่ยืนยันแล้ว

### R10 — Reusable Components และ Master-detail

- **Keywords:** `subreports`, `master detail report`, `template partials`, `reusable report components`, `component parameters`, `nested report pagination`.
- **Query:** `site:jasperreports.sourceforge.net/sample.reference/subreport/ master detail parameters`
- **คำถาม:** หัวบริษัท ลายเซ็น และตารางย่อยใช้ซ้ำอย่างไร? ส่วนย่อยรับข้อมูลและผูกเวอร์ชันอย่างไร? ต้องเป็น subreport จริงหรือ partial เพียงพอ?
- **ผลส่งมอบ:** รายงานใบสั่งซื้อที่มีรายการและข้อมูลย่อย พร้อมขอบเขต nesting และวิธีจัดการ dependency
- **แหล่งตั้งต้น:** [S03]; P1 หลัง layout พื้นฐานผ่าน

### R11 — Charts, Images, QR และ Barcodes

- **Keywords:** `print ready charts`, `SVG chart PDF`, `raster image DPI`, `QR code print quality`, `Code 128 barcode`, `asset embedding`, `chart render readiness`.
- **Query:** `Chromium PDF SVG charts font embedding barcode print scan quality`
- **คำถาม:** SVG หรือ PNG เหมาะกับแต่ละกรณี? ต้องรอ chart เสร็จก่อนพิมพ์อย่างไร? บาร์โค้ดที่สแกนได้จาก PDF ยังสแกนได้จากงานพิมพ์หรือไม่?
- **ผลส่งมอบ:** ตัวอย่าง assets และเกณฑ์ความคมชัด/การสแกน โดยไม่เลือก chart library ก่อนตรวจ license
- **ลำดับ:** รูปภาพพื้นฐาน P0; charts/รหัส P1; เชื่อม R13, R24

### R12 — ภาษาไทย, Localization และ Fonts

- **Keywords:** `Thai PDF line breaking`, `Thai combining marks`, `Chromium Thai font rendering`, `font embedding`, `Unicode text extraction`, `locale date currency`, `Buddhist calendar`.
- **Query:** `Chromium PDF Thai line breaking combining marks embedded fonts text extraction`
- **คำถาม:** สระและวรรณยุกต์ถูกตัดหรือไม่? เปลี่ยนฟอนต์แล้วจำนวนหน้าเปลี่ยนเท่าใด? เลข วันที่ ปี พ.ศ./ค.ศ. และเขตเวลาต้องกำหนดอย่างไร?
- **ผลส่งมอบ:** Thai/English fixture พร้อมชื่อ/ที่อยู่ยาว ข้อความผสมตัวเลข และการตรวจ copy/search จาก PDF; ตรวจสิทธิ์แจกจ่ายฟอนต์ด้วย
- **แหล่งตั้งต้น:** แนวคิด fonts/i18n ของ JasperReports [S17], [S18]; ความถูกต้องของ Gotenberg ต้องทดลองแยก

### R13 — Gotenberg Integration และ Version Contract

- **Keywords:** `Gotenberg 9 Chromium HTML conversion`, `multipart form data`, `header.html footer.html`, `preferCssPageSize`, `waitForExpression`, `resource loading failures`, `Gotenberg 8 to 9 migration`.
- **Query:** `site:gotenberg.dev/docs/chromium/convert-html waitForExpression header footer`
- **Query:** `site:gotenberg.dev/docs/getting-started/upgrade breaking changes`
- **คำถาม:** ส่ง HTML/CSS/fonts/images อย่างไร? ตรวจความพร้อม fonts และ chart อย่างไร? เมื่อ asset หายจะ fail หรือปล่อย PDF ไม่ครบ? API ใดต่างกันระหว่าง 8.x/9.x?
- **ผลส่งมอบ:** ตาราง request/response และ error cases ตามเวอร์ชันที่ตรึง พร้อมขอบเขตการแปลงเท่านั้น
- **แหล่งตั้งต้น:** [S04]–[S08]; ห้ามนำ route/field ข้ามเวอร์ชันโดยไม่ตรวจสอบ

### R14 — Report Designer และประสบการณ์สร้างรายงาน

- **Keywords:** `WYSIWYG report designer`, `banded report designer`, `drag and drop report builder`, `schema based editor`, `property inspector`, `snap to grid`, `undo redo`, `PDF preview fidelity`.
- **Query:** `web report designer banded layout vs HTML visual editor PDF preview`
- **คำถาม:** ผู้สร้างรายงานเขียนโค้ดได้หรือไม่? ต้องจัดวางอิสระหรือใช้ blocks? Designer รองรับตารางยืดหลายหน้าได้อย่างไร? Preview ต้องเห็นหน้า PDF จริงเมื่อใด?
- **ผลส่งมอบ:** ทางเลือก code-first, block-based และ visual canvas พร้อมต้นทุนและข้อจำกัด ไม่ตัดสินใจสร้าง Designer เต็มรูปแบบในรอบนี้
- **แหล่งตั้งต้น:** [S13], [S15]; หากผู้ใช้หลักไม่เขียนโค้ด อาจต้องเลื่อนหมวดนี้เป็น P0

### R15 — Template Lifecycle และการทำซ้ำเอกสาร

- **Keywords:** `template versioning`, `draft publish workflow`, `immutable template release`, `template import export`, `schema migration`, `render provenance`, `reproducible document generation`.
- **Query:** `report template immutable version publish rollback reproducible PDF assets fonts`
- **คำถาม:** แก้ draft แล้วกระทบรายงาน production หรือไม่? ผูกเวอร์ชัน assets/fonts อย่างไร? ต้องเก็บ PDF เดิมหรือสร้างใหม่เมื่อเรียกเอกสารย้อนหลัง?
- **ผลส่งมอบ:** Lifecycle ขั้นต่ำและ metadata สำหรับติดตาม template, data reference/hash, assets และ renderer; กำหนด retention ก่อนเก็บข้อมูลจริง
- **ลำดับ:** Version ขั้นพื้นฐาน P0; approval workflow P1; ภาพเหมือนเดิมไม่เท่ากับไฟล์ byte-identical

### R16 — Public API และ Developer Experience

- **Keywords:** `report rendering REST API`, `OpenAPI`, `idempotency key`, `synchronous asynchronous rendering`, `content disposition`, `structured errors`, `template version API`.
- **Query:** `PDF report generation API idempotency async jobs template version OpenAPI`
- **คำถาม:** ส่ง template ID หรือ inline template? ตอบ PDF โดยตรงหรือ job ID? Error แยก data validation, template และ renderer อย่างไร? ระบุเวอร์ชัน template ในคำขอได้หรือไม่?
- **ผลส่งมอบ:** ร่าง API contract พร้อมตัวอย่างสำเร็จ/ล้มเหลว และขอบเขต idempotency; ยังไม่กำหนด endpoints ถาวร
- **ลำดับ:** P0; เชื่อม R06, R13, R17

### R17 — งานเบื้องหลัง, Retry และ Batch

- **Keywords:** `durable report job queue`, `backpressure`, `retry exponential backoff`, `dead letter queue`, `idempotent job processing`, `webhook delivery`, `cancellation semantics`.
- **Query:** `PDF rendering jobs durable queue backpressure idempotent retry webhook delivery`
- **คำถาม:** Queue ของ Engine กับ durable queue ของแอปต่างกันอย่างไร? Timeout หลัง Render เสร็จจะสร้างไฟล์ซ้ำหรือไม่? Cancel หยุด Engine จริงหรือเพียงยกเลิกผลลัพธ์?
- **ผลส่งมอบ:** Job states, retry policy และ recovery scenarios รวม duplicate callbacks; ไม่ถือว่า webhook ของ Gotenberg แทนระบบ job history ครบถ้วน
- **แหล่งตั้งต้น:** [S19], [S20]; P0 เฉพาะเมื่อ workload จำเป็น มิฉะนั้น P1

### R18 — Report Catalog, Scheduling และ Distribution

- **Keywords:** `report catalog`, `scheduled reports`, `cron timezone`, `report bursting`, `recipient authorization`, `signed download URL`, `document retention`, `delivery audit`.
- **Query:** `scheduled report bursting recipient authorization timezone retention PDF delivery`
- **คำถาม:** แบ่งรายงานตามลูกค้าหรือแผนกอย่างไร? ผู้รับยังมีสิทธิ์ตอนส่งจริงหรือไม่? งานตามเวลาที่พลาดต้องรันย้อนหลังหรือข้าม? ลิงก์หมดอายุเมื่อใด?
- **ผลส่งมอบ:** Use cases และ policy การส่ง/เก็บ/ลบ พร้อมการป้องกันส่งข้อมูลผิดผู้รับ
- **ลำดับ:** Catalog เบื้องต้นตาม UI ที่เลือก; scheduling/bursting P2 ไม่รวมเป็น MVP อัตโนมัติ

### R19 — ความปลอดภัยของ Template และ Renderer

- **Keywords:** `server side template injection`, `untrusted HTML rendering`, `SSRF prevention`, `DNS rebinding`, `network egress allowlist`, `JavaScript isolation`, `container resource limits`, `archive path traversal`.
- **Query:** `site:gotenberg.dev/docs/operate/ outbound secure untrusted HTML`
- **Query:** `site:cheatsheetseries.owasp.org server side template injection SSRF prevention`
- **คำถาม:** ใครแก้ template ได้? Expressions ทำอะไรกับ host ได้บ้าง? URL ใน CSS/fonts/images และ webhooks เข้าถึงเครือข่ายใด? จำกัด CPU/memory/files/time อย่างไร?
- **ผลส่งมอบ:** Threat model แยก template execution ในแอปออกจาก browser rendering พร้อม security test plan; ไม่ถือว่าปิด JavaScript อย่างเดียวเพียงพอ
- **แหล่งตั้งต้น:** [S09], [S10], [S21]; P0 ก่อนรับ template หรือข้อมูลอ้าง URL จากผู้ใช้ภายนอก

### R20 — สิทธิ์, Multi-tenancy และข้อมูลอ่อนไหว

- **Keywords:** `report RBAC`, `tenant isolation`, `object level authorization`, `PII redaction`, `secret management`, `audit logging`, `data retention`, `download authorization`.
- **Query:** `multi tenant report generation template job artifact authorization sensitive data logging`
- **คำถาม:** ใครอ่าน/แก้/เผยแพร่ template และดาวน์โหลด output ได้? Cache, assets และไฟล์ชั่วคราวแยก tenant หรือไม่? Logs จะหลีกเลี่ยง payload และ credentials อย่างไร?
- **ผลส่งมอบ:** Access matrix และ data lifecycle; ศึกษาข้อกำหนดข้อมูลส่วนบุคคลตามตลาดจริงเพิ่มเติมก่อนอ้าง compliance
- **ลำดับ:** สิทธิ์พื้นฐาน P0 เมื่อ shared deployment; multi-tenancy P0 เฉพาะเมื่อยืนยันว่าจะใช้ร่วมหลายองค์กร

### R21 — Performance, Deployment และ Observability

- **Keywords:** `Gotenberg Chromium concurrency`, `render queue limits`, `p95 PDF latency`, `cold start`, `memory per render`, `horizontal scaling`, `health readiness`, `distributed tracing`.
- **Query:** `site:gotenberg.dev/docs/operate/production concurrency queue timeout`
- **Query:** `site:gotenberg.dev/docs/telemetry metrics traces`
- **คำถาม:** ปริมาณงานและจำนวนหน้าทำให้ RAM/latency โตอย่างไร? แยกเวลารอ queue จากเวลา Render ได้หรือไม่? ต้องรองรับติดตั้งใน Windows ผ่าน Docker หรือ Linux แบบใด?
- **ผลส่งมอบ:** Benchmark matrix, resource envelope และข้อมูลวัด error/latency/queue โดยไม่กำหนด SLO จากการคาดเดา
- **แหล่งตั้งต้น:** [S19], [S22]; อย่านำตัวเลข concurrency ของ major version อื่นมาใช้โดยตรง

### R22 — การทดสอบคุณภาพ PDF และ Regression

- **Keywords:** `PDF visual regression`, `golden master testing`, `PDF text extraction test`, `pagination regression`, `font embedding verification`, `deterministic rendering`, `PDF metadata normalization`.
- **Query:** `generated PDF visual regression text extraction pagination fonts golden files`
- **คำถาม:** แยก layout เปลี่ยนจริงจาก anti-aliasing อย่างไร? ตรวจข้อมูลหาย/ซ้ำและยอดรวมอย่างไร? Render ซ้ำต้องเหมือนระดับภาพ ข้อความ หรือ bytes?
- **ผลส่งมอบ:** Test corpus และเกณฑ์ผ่านด้านข้อความ ตัวเลข หน้า ภาพ และ resource failures; ไม่ใช้การเปิดไฟล์ได้เป็นหลักฐานความถูกต้องเพียงอย่างเดียว
- **ลำดับ:** P0 สำหรับ fixtures หลัก; เชื่อม R04, R08, R12, R23

### R23 — ความสามารถและมาตรฐาน PDF ขั้นสูง

- **Keywords:** `PDF/A validation`, `PDF/UA accessibility`, `tagged PDF reading order`, `PDF bookmarks`, `PDF encryption`, `PAdES digital signature`, `PDF merge watermark`, `embedded invoice XML`.
- **Query:** `site:gotenberg.dev/docs PDF validate remediate sign encrypt`
- **คำถาม:** ต้องการมาตรฐาน/profile ใดและเพราะอะไร? การ merge/stamp ทำให้ tags หรือ signatures เสียหรือไม่? ใครถือ keys และตรวจผล? ภาพลายเซ็นต่างจาก cryptographic signature อย่างไร?
- **ผลส่งมอบ:** Capability matrix ตามเวอร์ชัน พร้อมวิธี validate และข้อจำกัด; PDF/A หรือ PDF/UA ไม่ยืนยันความถูกต้องของข้อมูลธุรกิจหรือข้อกำหนด e-invoice โดยอัตโนมัติ
- **แหล่งตั้งต้น:** [S08]; P2 จนกว่าจะมี use case ยืนยัน

### R24 — Open-source License, Dependencies และ Governance

- **Keywords:** `OSI approved license`, `MIT Apache-2.0 AGPL-3.0 comparison`, `dependency license compatibility`, `SPDX SBOM`, `font redistribution license`, `DCO CLA`, `CONTRIBUTING SECURITY policy`.
- **Query:** `site:opensource.org/licenses MIT Apache AGPL`
- **Query:** `open source report designer dependency font license redistribution SBOM`
- **คำถาม:** ต้องการให้ใช้ในงานพาณิชย์/ดัดแปลง/ให้บริการต่อภายใต้เงื่อนไขใด? License ของ editor, renderer, fonts และ sample assets คืออะไร? ใครดูแลช่องทางรายงานช่องโหว่?
- **ผลส่งมอบ:** ตารางส่วนประกอบและ license, ทางเลือก license โครงการพร้อมข้อที่ต้องตัดสินใจ และรายการเอกสารก่อนเผยแพร่; ยังไม่เลือกหรือเพิ่ม LICENSE ในรอบนี้
- **แหล่งตั้งต้น:** [S11], [S12]; Gotenberg ระบุ MIT ในเอกสาร [S04] แต่ไม่ควรเหมารวม license ของทุก dependency และไฟล์ที่แจกจ่าย

### R25 — Self-hosting, Packaging และ Extension Model

- **Keywords:** `self hosted reporting`, `Docker Compose quickstart`, `offline PDF generation`, `template plugin API`, `custom formatter plugin`, `semantic versioning`, `backup restore`, `example report gallery`.
- **Query:** `open source reporting self hosted Docker Compose offline fonts template plugins`
- **คำถาม:** ผู้ใช้ clone แล้วสร้าง PDF แรกได้อย่างไร? ใช้งานโดยไม่มีอินเทอร์เน็ตได้หรือไม่? เพิ่ม formatter/component โดยไม่ fork core ได้แค่ไหน? สำรอง template/assets/config อย่างไร?
- **ผลส่งมอบ:** ข้อเสนอ quickstart และตัวอย่างรายงาน 3 แบบ; แยก extension ที่จำเป็นจาก plugin framework ที่ยังไม่มีผู้ใช้จริง
- **ลำดับ:** Quickstart และตัวอย่าง P0 ก่อนเผยแพร่; plugin framework P1/P2 ตามหลักฐานความต้องการ

## 5. ขอบเขตที่ Gotenberg ช่วยได้และสิ่งที่ต้องวิจัยเพิ่ม

| ประเด็น | สิ่งที่พบในเอกสาร | สิ่งที่ระบบรายงานยังต้องจัดการ |
| --- | --- | --- |
| HTML เป็น PDF | Chromium conversion route [S05] | ผูกข้อมูล สร้าง HTML/CSS และตรวจ input |
| หน้ากระดาษและเลขหน้า | มีตัวเลือกและ header/footer templates [S05] | ออกแบบ UI/config และพิสูจน์ layout ภาษาไทย |
| งาน PDF หลัง Render | 9.x มี PDF routes/stages [S08] | เลือก operation, ลำดับ, policy และตรวจผล |
| ส่งผลลัพธ์แบบ webhook | มีช่องทางส่งไฟล์และแจ้งผล [S20] | Durable jobs, authorization, retries และประวัติระดับแอป |
| งานพร้อมกันและ queue | Engine มีขอบเขต concurrency/queue [S19] | Admission control, quota และการเก็บงานให้กู้คืนได้ |
| ความปลอดภัย | มี deployment และ outbound controls [S09], [S21] | สิทธิ์ระดับ template/job, sandbox ของ expressions และข้อมูลส่วนบุคคล |
| Report Designer | Gotenberg ระบุว่าไม่มี UI [S08] | เลือกและสร้างประสบการณ์ออกแบบรายงาน |
| JRXML และ Jasper expressions | เอกสาร conversion ที่ตรวจไม่แสดงเส้นทาง JRXML [S08] | ถ้าต้องรองรับ ต้องศึกษา parser/translator และ compatibility แยก |

## 6. ลำดับศึกษาที่เสนอ

1. **ยืนยันผลิตภัณฑ์:** R01–R02 ระบุผู้ใช้และเอกสารหลักก่อนตัดสินว่า Designer เป็นเงื่อนไข MVP หรือไม่
2. **พิสูจน์ความเสี่ยงด้านการจัดหน้า:** R04, R05, R12, R13 และ R22 ทดลองเอกสารหลายหน้าและภาษาไทยก่อนลงทุนทำ editor
3. **ประเมินรูปแบบ template และความปลอดภัยร่วมกัน:** R03, R14, R19 และ R24 ตรวจความเหมาะสมของรูปแบบข้อมูลและส่วนประกอบก่อนผูก architecture
4. **กำหนดแกนรายงาน:** R06–R10, R15–R16 ระบุ input, parameters, สูตร, version และ API
5. **ประเมินการใช้งานจริง:** R17, R20–R21, R25 ใช้ workload ที่ยืนยันแล้วกำหนด queue, permissions และ deployment
6. **ขยายตามความต้องการจริง:** R11, R18 และ R23; เลี่ยงขยายเป็น BI platform หรือ document management ทั้งชุดโดยไม่มี use case

การศึกษาขั้นลึกควรได้เอกสาร requirements/MVP, renderer feasibility results, feature comparison และ decision records ตามลำดับ เอกสารฉบับนี้ยังไม่ได้ทำหรืออนุมัติ deliverables เหล่านั้น

## 7. ชุด Runtime Validation ที่เลื่อนออกจากแผนปัจจุบัน

ทุกข้อด้านล่างเป็น **deferred/not-tested** ตามข้อจำกัดเครื่อง เก็บไว้เป็นเกณฑ์ออกแบบวิธีตรวจในอนาคต ไม่บังคับทดสอบ Docker เพื่อปิดงาน Research จำนวนข้อมูลเป็นระดับทดสอบเสนอ ไม่ใช่ SLA หรือข้อจำกัดที่ยืนยันแล้ว

| กรณี | ข้อมูลทดสอบ | หลักฐานที่ต้องเก็บ |
| --- | --- | --- |
| เอกสารธุรกิจหน้าเดียว | โลโก้ ที่อยู่ไทย รายการ ยอดรวม และท้ายเอกสาร | PDF, ภาพหน้ากระดาษ, ข้อความที่ extract และยอดที่คาดหวัง |
| ตารางหลายหน้า | 0, 1, 50 และ 500 แถว พร้อมข้อความยาว | หัวตารางซ้ำ แถวไม่หาย/ซ้ำ footer ไม่ทับ และไม่มีหน้าว่างที่ไม่ตั้งใจ |
| แถวสูงเกินหน้า | Description ยาวกว่าหนึ่งหน้าและ cell หลายบรรทัด | พฤติกรรม split/overflow ที่ชัดเจน ไม่ตัดข้อมูลเงียบ |
| Group และ summary | หลายแผนก กลุ่มว่าง ตัวเลขทศนิยมและค่าติดลบ | Expected subtotal/grand total และตำแหน่งหัวกลุ่ม |
| Fonts และภาษาไทย | วรรณยุกต์ ข้อความไทย/อังกฤษผสม และฟอนต์หาย | ภาพเทียบ การค้น/คัดลอกข้อความ และผลตรวจ font embedding |
| Assets หรือ script ไม่พร้อม | ภาพหาย ฟอนต์โหลดช้า chart ยังไม่พร้อม | Error/warning ตาม policy และหลักฐานว่าไม่ปล่อยเอกสารไม่ครบโดยไม่แจ้ง |
| ความปลอดภัย | URL ไป private network, redirect และ template expression ที่ไม่อนุญาต | ผลปฏิเสธในสภาพแวดล้อมทดสอบ และ logs ที่ไม่เปิดเผยข้อมูลลับ |
| งานพร้อมกันและ recovery | 1, 5 และ 10 งานร่วมกัน, timeout และ restart | เวลารอ/Render, p50/p95, RAM สูงสุด, failure rate และพฤติกรรม retry |

ก่อนทดลองต้องบันทึก Gotenberg image tag/digest, Chromium version, fonts, OS/container และ render options เพื่อเทียบผลย้อนหลังได้ รอบนี้ไม่มีการติดตั้ง Engine หรือสร้าง PDF

## 8. คำถามที่ต้องตัดสินใจก่อนเริ่มออกแบบระบบ

1. ผู้สร้าง template หลักเป็นนักพัฒนาหรือผู้ใช้ธุรกิจที่ไม่เขียนโค้ด?
2. “คล้าย JasperReports” หมายถึงรายงานแบบ bands, Designer แบบลากวาง หรือจำเป็นต้องใช้ JRXML เดิมด้วย?
3. รายงาน 3 แบบแรกคืออะไร และมีตัวอย่างเอกสารจริงที่ไม่เปิดเผยข้อมูลลับหรือไม่?
4. ติดตั้งแบบ library, local app หรือ shared report server? ต้องแยกหลายองค์กรหรือไม่?
5. ให้ระบบต้นทางส่ง JSON หรือ report server ต้องเชื่อมฐานข้อมูลเองตั้งแต่รุ่นแรก?
6. ขนาดรายงาน ปริมาณงานพร้อมกัน และเวลารอที่ยอมรับได้คือเท่าใด?
7. ต้องมี schedule, digital signature, PDF/A, accessibility หรือข้อกำหนด e-invoice ใดตั้งแต่แรก?
8. ต้องการแนวทาง license และการดูแลชุมชนแบบใด?

คำถามเหล่านี้เป็นรายการสำหรับรอบออกแบบ ไม่ขวางการจัดทำ keyword research ในรอบนี้ และยังไม่มีการตัดสินใจแทนผู้ใช้ในเรื่องที่ลงทุนสูง

## 9. แหล่งข้อมูลหลักและขอบเขตการตรวจ

แหล่งทั้งหมดตรวจวันที่ 12 พฤศจิกายน 2026 ใช้เอกสารเจ้าของโครงการ องค์กรมาตรฐาน และแนวทาง OWASP เป็นฐาน ข้อมูล Gotenberg ในเอกสารนี้อ้าง **9.x** เว้นแต่ระบุว่าเปรียบเทียบ 8.x ไม่อ้างผล benchmark จากแหล่งอื่นเป็นผลของโปรเจกต์นี้

- **S01:** [JasperReports Sample Reference](https://jasperreports.sourceforge.net/sample.reference/README.html) — รายการความสามารถของ library ไม่ใช่การยืนยันทุก edition ของ report server หรือ Designer
- **S02:** [JasperReports Jasper Sample](https://jasperreports.sourceforge.net/sample.reference/jasper/README.html) — โครงสร้างรายงานและตัวอย่างการใช้ความสามารถร่วมกัน
- **S03:** [JasperReports Subreport Sample](https://jasperreports.sourceforge.net/sample.reference/subreport/README.html) — แนวคิดรายงานย่อย
- **S04:** [Gotenberg: How Gotenberg works](https://gotenberg.dev/docs/about) — บทบาทบริการและ engines
- **S05:** [Gotenberg: Convert HTML to PDF](https://gotenberg.dev/docs/chromium/convert-html) — Input, render options, readiness และ header/footer
- **S06:** [Gotenberg: Install](https://gotenberg.dev/docs/getting-started/installation) — เอกสาร 9.x และแนวทางตรึง image version
- **S07:** [Gotenberg: Upgrade from 8.x](https://gotenberg.dev/docs/getting-started/upgrade) — ความแตกต่างของ API ระหว่าง major versions
- **S08:** [Gotenberg: Routes](https://gotenberg.dev/docs/getting-started/routes) — ขอบเขต conversion, PDF operations และ system routes
- **S09:** [Gotenberg: Restrict outbound requests](https://gotenberg.dev/docs/operate/outbound) — ขอบเขต outbound และการจำกัดปลายทาง
- **S10:** [OWASP: SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — กรอบวิเคราะห์และป้องกัน SSRF
- **S11:** [Open Source Initiative: Open Source Definition](https://opensource.org/osd) — หลักการสิทธิของโอเพนซอร์ส
- **S12:** [Open Source Initiative: Approved Licenses](https://opensource.org/licenses) — แหล่งเริ่มต้นตรวจตัวเลือก license
- **S13:** [jsreport: Getting started](https://jsreport.net/learn/get-started) — Templates, sample data, assets, preview และ API workflow
- **S14:** [Carbone: Design your first template](https://carbone.io/documentation/design/overview/getting-started.html) — แนวคิดเอกสาร template ผูก JSON และ formatters
- **S15:** [pdfme: Getting Started](https://pdfme.com/docs/getting-started) — แนวคิด schema, Designer และการแยก UI/generator
- **S16:** [W3C: CSS Fragmentation Module Level 3](https://www.w3.org/TR/css-break-3/) — ข้อกำหนด page breaks และการแยกเนื้อหาข้ามหน้า
- **S17:** [JasperReports Fonts Sample](https://jasperreports.sourceforge.net/sample.reference/fonts/README.html) — แนวคิด fonts ในรายงาน
- **S18:** [JasperReports Internationalization Sample](https://jasperreports.sourceforge.net/sample.reference/i18n/README.html) — แนวคิด localization
- **S19:** [Gotenberg: Run in production](https://gotenberg.dev/docs/operate/production) — Concurrency, queues, timeouts และ health
- **S20:** [Gotenberg: Deliver with webhooks](https://gotenberg.dev/docs/webhook-download) — การส่งผลลัพธ์และแจ้งผล
- **S21:** [Gotenberg: Secure your deployment](https://gotenberg.dev/docs/operate/secure) — ขอบเขตการเปิดบริการและการตั้งค่าความปลอดภัย
- **S22:** [Gotenberg: Telemetry](https://gotenberg.dev/docs/telemetry) — การสังเกตพฤติกรรมบริการ

[S01]: https://jasperreports.sourceforge.net/sample.reference/README.html
[S02]: https://jasperreports.sourceforge.net/sample.reference/jasper/README.html
[S03]: https://jasperreports.sourceforge.net/sample.reference/subreport/README.html
[S04]: https://gotenberg.dev/docs/about
[S05]: https://gotenberg.dev/docs/chromium/convert-html
[S06]: https://gotenberg.dev/docs/getting-started/installation
[S07]: https://gotenberg.dev/docs/getting-started/upgrade
[S08]: https://gotenberg.dev/docs/getting-started/routes
[S09]: https://gotenberg.dev/docs/operate/outbound
[S10]: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
[S11]: https://opensource.org/osd
[S12]: https://opensource.org/licenses
[S13]: https://jsreport.net/learn/get-started
[S14]: https://carbone.io/documentation/design/overview/getting-started.html
[S15]: https://pdfme.com/docs/getting-started
[S16]: https://www.w3.org/TR/css-break-3/
[S17]: https://jasperreports.sourceforge.net/sample.reference/fonts/README.html
[S18]: https://jasperreports.sourceforge.net/sample.reference/i18n/README.html
[S19]: https://gotenberg.dev/docs/operate/production
[S20]: https://gotenberg.dev/docs/webhook-download
[S21]: https://gotenberg.dev/docs/operate/secure
[S22]: https://gotenberg.dev/docs/telemetry
