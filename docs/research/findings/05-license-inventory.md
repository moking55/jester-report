# T05 — License Inventory และ Open-source Readiness

ตรวจวันที่: 12 พฤศจิกายน 2026  
สถานะ: อ่าน license metadata/ข้อความเจ้าของเพื่อคัดทางเลือก ยังไม่เลือก dependency, pin binary, เลือก license โครงการ หรือรับรอง compatibility ของ distribution ทั้งชุด

## 1. Component Inventory รอบแรก

| Component / version reference | License / primary source | Intended use | สถานะก่อนนำมาใช้/แจกจ่าย |
| --- | --- | --- | --- |
| Gotenberg v9.4.1 | [MIT จาก tag](https://raw.githubusercontent.com/gotenberg/gotenberg/v9.4.1/LICENSE) | Engine ตามข้อกำหนด | Metadata ตรวจแล้ว; third-party components/image BOM และ notices ยังไม่ตรวจทั้งชุด |
| JasperReports Library 7.1.1 | [LGPL v3 จาก tag](https://raw.githubusercontent.com/TIBCOSoftware/jasperreports/7.1.1/LICENSE) | Benchmark semantics | ไม่เลือก embed library/code; ถ้าใช้ต้องประเมิน combined work ตามวิธี integration |
| Studio CE 6.21.2 ตาม FAQ | [BSD-type binary-use summary](https://community.jaspersoft.com/knowledgebase/faq/faqs-on-community-edition-changes-effective-january-25-2024-r4629/) | Benchmark authoring | Source ไม่แจกตาม FAQ; redistribution/embedding ยัง unresolved ไม่อนุมาน license รุ่นอื่น |
| Server CE เดิม / commercial | [Publisher FAQ](https://community.jaspersoft.com/knowledgebase/faq/faqs-on-community-edition-changes-effective-january-25-2024-r4629/) | Benchmark server | ต้องแยก edition/version และ EULA ไม่ใช้ Library license แทน |
| jsreport core source, release unpinned | [LGPL v3 LICENSE](https://raw.githubusercontent.com/jsreport/jsreport/master/packages/jsreport-core/LICENSE) | Benchmark/candidate study | อ่าน branch ที่ mutable; artifact/version และ distribution obligations ยังต้องตรวจ |
| jsreport official distribution, release unpinned | [Vendor FAQ](https://jsreport.net/learn/faq) | Benchmark server | Free-plan stored-template limits แยกจาก source LGPL; ยังไม่เลือก distribution |
| CarboneJS current license / CCL v2 effective 2026-10-26 | [License hub](https://carbone.io/company/licenses.html), [CCL text](https://carbone.io/company/code-license.html) | Comparative facts เท่านั้น | Source-available ตาม publisher มีข้อจำกัดแข่งขัน/บริการ; ไม่เลือก reuse ก่อนคลี่เงื่อนไข |
| pdfme source, release unpinned | [MIT LICENSE.md](https://raw.githubusercontent.com/pdfme/pdfme/main/LICENSE.md) | Designer concept/candidate | Metadata ตรวจแล้ว; plugins/dependencies และ Gotenberg integration ยังไม่ตรวจ |
| Handlebars v4.7.8 license reference | [MIT จาก tag](https://raw.githubusercontent.com/handlebars-lang/handlebars.js/v4.7.8/LICENSE) | Templater candidate | Tag ใช้อ้าง license เท่านั้น ไม่แนะนำ version นี้เป็น current/security choice |
| Sarabun Google Fonts source snapshot | [OFL 1.1](https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/OFL.txt) | Thai font candidate | Font binary/version/hash ยังไม่ pin; ไม่ดาวน์โหลดหรือตรวจ glyph rendering |
| Noto Sans Thai metadata อ้าง v2.002 | [OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/OFL.txt), [Metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/METADATA.pb) | Thai font candidate | Metadata มี source version/commit แต่ไม่ได้ยืนยัน binary ที่จะใช้; hash และ Render quality ยัง unknown |

ทุก candidate ที่ยังไม่เลือกใช้มีสถานะ **metadata-reviewed/use-decision-pending** ไม่ใช่ legal approval และไม่ถูกติดตั้งในงานนี้

## 2. ข้อแตกต่างที่ต้องรักษา

- LGPL ของ Library/jsreport core ไม่ได้ทำให้ Studio/Server/vendor binary มีเงื่อนไขเดียวกัน อ่าน artifact ที่จะใช้จริง ไม่ใช้คำว่า free/community ตัดสินสิทธิ์แจกจ่าย
- jsreport FAQ อธิบาย 5 stored templates และ inline `template.content` exception ของ free plan ไม่ใช่ข้อจำกัดที่เกิดจาก LGPL เอง [FAQ](https://jsreport.net/learn/faq)
- Carbone hub แยก Code License, On-Prem license, Cloud terms และ Apache-2.0 ของ SDK/MCP/plugins/examples บางส่วน; ข้อจำกัด competing generator เป็น publisher statement ที่ต้อง review ไม่ใช่คำตัดสิน enforceability ใน Research นี้ [License hub](https://carbone.io/company/licenses.html)
- Studio FAQ บอก source/binary scope ของ 6.21.2 เท่านั้น [EULA page](https://community.jaspersoft.com/policies/jss-eula/) มี third-party notices มาก การพบ BSD paragraph ของ dependency ไม่ยืนยันสิทธิ์ทั้ง Studio
- OFL อนุญาต embed/bundle ภายใต้เงื่อนไขของ font ต้องรักษา license/notices และตรวจ reserved names เมื่อดัดแปลง ไม่แปลว่า PDF output ต้องเปลี่ยน license เป็น OFL [Sarabun OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/OFL.txt)

Mutable package manifests ของ Carbone/jsreport ต่างค่าระหว่างการอ่าน/cache ของ researchers จึงไม่รายงานตัวเลขนั้นเป็น latest release ส่วน pdfme development placeholder ไม่ใช่หลักฐานว่า released package ไม่เสถียร

## 3. ทางเลือก License โครงการ — ยังไม่เลือก

| ทางเลือก | สิ่งที่ต้องพิจารณา | Source |
| --- | --- | --- |
| MIT | Permissive พร้อม copyright/permission notice; สั้นและไม่มี contributor patent section แบบ Apache | [OSI MIT](https://opensource.org/license/mit) |
| Apache-2.0 | Explicit contributor patent grant/termination และเงื่อนไข notices, changed-file notice, NOTICE เมื่อมี | [ASF license](https://www.apache.org/licenses/LICENSE-2.0) |
| AGPL-3.0 | Copyleft รวม section 13 สำหรับ modified covered version ที่โต้ตอบผ่าน network; ไม่เหมารวมว่า PDF data หรือ independent components ทั้งหมดต้องเปิด | [OSI AGPL](https://opensource.org/license/agpl-3.0) |

ต้องเลือกตามเป้าหมายการนำไปใช้และการมีส่วนร่วม ไม่เลือกจาก Engine license เพียงตัวเดียว การเปลี่ยน license เมื่อมี contributions แล้วอาจต้องจัดการสิทธิ์ผู้มีส่วนร่วม จึงควรกำหนดนโยบายก่อนเปิดรับโค้ด

## 4. Dependency Admission ก่อนใช้จริง

1. ระบุ exact artifact/version/source commit และ license ที่ผูกกับ artifact นั้น ไม่ใช้ branch metadata เป็น pin
2. บันทึก intended use: ใช้เป็น external service, link/embed, copy/modify code หรือแจก binary/image/font
3. ตรวจ transitive dependencies, notices, fonts, sample images/templates และการแจกต่อ; จัด inventory/SBOM ตาม distribution ที่เลือก
4. แยก metadata-reviewed จาก compatibility decision และ unresolved interpretation; ต้อง review ก่อนเผยแพร่ artifact จริง
5. License ที่อนุญาตใช้ไม่เท่ากับ security หรือ integration ผ่าน ต้องส่ง gap ไป T19/T22/T24 ตามขอบเขต

## 5. เอกสารและ Governance ที่เสนอสำหรับก่อนเผยแพร่

- LICENSE ที่ผู้ใช้เลือก และ third-party notices/license inventory ของ artifact จริง
- README ที่แยก supported/limited/not-tested พร้อม install/integration instructions ที่ตรวจแล้วในอนาคต
- CONTRIBUTING: review workflow, test expectations, source/asset provenance และ contribution rights
- เลือก DCO หรือ CLA ตามเป้าหมาย ไม่จำเป็นต้องบังคับทั้งสอง; [DCO 1.1](https://developercertificate.org/) เป็นคำรับรองสิทธิ์ส่ง contribution ไม่ใช่การโอน copyright โดยตัวมันเอง
- SECURITY.md: supported versions, ช่องทาง private vulnerability reporting และการตอบสนอง; กำหนด maintainer/release/deprecation policy

รายการนี้ยังไม่ใช่ไฟล์ที่สร้างครบหรือเงื่อนไขที่ผู้ใช้เลือกแล้ว ไม่มีการเพิ่ม LICENSE, เปลี่ยน sharing หรือ publish repository ใน checkpoint นี้

## 6. Review และข้อค้าง

Parent ตรวจข้อความ license สำคัญซ้ำจาก primary sources และรับผล critique ที่แยก source/distribution/OFL obligations ใช้ agy conversation เดียวกับ T04: `d44e2bff-0a43-4518-92e3-21c30e31bca2`, 2 successful turns

ไม่รับข้ออ้างว่า pdfme placeholder พิสูจน์ความไม่เสถียร หรือว่าต้องดาวน์โหลด fonts/checksums เพื่อปิด desk study เก็บ binary pin/hash เป็น pending ตามข้อจำกัดเครื่อง

Open: license โครงการ, final dependency shortlist/version, Studio artifact EULA, full image BOM, transitive notices และการตีความ CCL ที่สัมพันธ์กับ reuse แบบใด ยังไม่ขอผู้ใช้ตัดสินใจลงทุนสูงเพราะไม่มี implementation choice ที่ต้องทำตอนนี้
