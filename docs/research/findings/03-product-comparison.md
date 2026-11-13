# T03 — Product Capability Comparison

ตรวจวันที่: 12 พฤศจิกายน 2026  
สถานะ: documented comparison; ไม่ติดตั้งหรือรันผลิตภัณฑ์ใด ไม่มี PDF fidelity/performance results

## 1. ขอบเขตผลิตภัณฑ์และเวอร์ชัน

| กลุ่ม | หลักฐานเวอร์ชัน/edition | ข้อจำกัด |
| --- | --- | --- |
| JasperReports Library | Sample/API docs 7.1.1 | ไม่เหมารวมกับ Studio หรือ report server |
| Jaspersoft Studio | Introduction page metadata v9.0.0; FAQ license ระบุเจาะจง 6.21.2 CE | Page metadata ไม่ยืนยัน latest binary release หรือ license ทุกเวอร์ชัน |
| JasperReports Server | REST docs 10.1.0 และ commercial product page | CE เดิมไม่ใช่ maintained current OSS baseline |
| jsreport | Rolling docs; source branch ไม่ pin release | Free-plan terms แยกจาก source license |
| Carbone ecosystem | Rolling design docs และ HTTP API V5 | CarboneJS, On-Prem binary และ Cloud คนละ distribution/license |
| pdfme | Rolling docs มี v6 migration link | ไม่ได้ pin package artifact; Gotenberg adapter ยัง unknown |

Mutable package manifests ที่ตรวจจากเว็บมีค่าแตกต่างกันระหว่าง cache/read จึงไม่ยก version จาก `main/master` เป็น latest release หรือ production pin ดู [source register](../sources.md)

## 2. Template, Layout และ Data

| ผลิตภัณฑ์ | Template | Layout | Data |
| --- | --- | --- | --- |
| JasperReports Library | JRXML/compiled design | Groups, tables, subreports, charts และ exports | Parameters/datasets/data-source interfaces; Java filling API [Samples](https://jasperreports.sourceforge.net/sample.reference/README.html), [Javadoc](https://jasperreports.sourceforge.net/api/net/sf/jasperreports/engine/JasperFillManager.html) |
| Studio | Visual authoring ของ JRXML แล้ว compile | Canvas, charts, images, subreports และ crosstabs | Data adapters และ preview กับ data source [Introduction](https://community.jaspersoft.com/knowledgebase/getting-started/introduction-jaspersoft-studio/) |
| Server | Repository report units และ reports ที่ออกแบบภายนอก | Report viewing/ad hoc/dashboard ตาม commercial offering | Server-level parameters/data sources [Commercial scope](https://www.jaspersoft.com/products/jaspersoft-commercial), [REST reference](https://docs.actian.com/jaspersoft/jasperreports-server/rest-api-reference/reportexecutions/) |
| jsreport | HTML/JS template engine + recipe | CSS/Chrome PDF workflow; reusable assets | JSON sample/input และ helpers [Workflow](https://jsreport.net/learn/get-started) |
| Carbone | Editable document templates + tags | Document-editor layout และ formatters | JSON merge, repetition และ formatting [Design guide](https://carbone.io/documentation/design/overview/getting-started.html) |
| pdfme | Shared Template: basePdf + schemas | Positioned schemas; dynamic layout มีเงื่อนไข basePdf | Inputs ผูก schema และ plugins [Getting started](https://pdfme.com/docs/getting-started), [Layout constraints](https://pdfme.com/docs/supported-features) |

## 3. Authoring, API และ Deployment

| ผลิตภัณฑ์ | Authoring | API | Deployment |
| --- | --- | --- | --- |
| Library | ใช้ Designer แยก; ตัว library ไม่ใช่ UI | Java fill/export APIs | Embed ใน Java app; HTTP server ต้องมีอีกชั้น [Javadoc](https://jasperreports.sourceforge.net/api/net/sf/jasperreports/engine/JasperFillManager.html) |
| Studio | Design/Source/Preview; properties/tree/problems | เชื่อม Server ได้; standalone public HTTP API ยังไม่ยืนยัน | Eclipse-based desktop application [Introduction](https://community.jaspersoft.com/knowledgebase/getting-started/introduction-jaspersoft-studio/) |
| Server | Report viewer/ad hoc ตาม edition; ไม่เท่ากับ full JRXML canvas | Async report execution, polling, output retrieval | Shared server/commercial offering [REST service](https://docs.actian.com/jaspersoft/jasperreports-server/rest-api-reference/reportexecutions/) |
| jsreport | Browser Studio และ template preview | HTTP rendering/CRUD; stored หรือ inline template | Node.js report server/distribution [API](https://jsreport.net/learn/api) |
| Carbone | Word/LibreOffice/OnlyOffice; ecosystem Studio ขึ้นกับ entitlement | Template/render/download flow แยก IDs | Embedded CarboneJS กับ Cloud/On-Prem ต้องแยก [API introduction](https://carbone.io/documentation/developer/http-api/introduction.html) |
| pdfme | Designer/Form/Viewer แยกจาก generator | JavaScript APIs; turnkey report-server HTTP API ยังไม่ยืนยัน | UI/generator packages ใช้ Template ร่วมกัน; ไม่ใช่ Gotenberg integration ที่พิสูจน์แล้ว [Getting started](https://pdfme.com/docs/getting-started) |

## 4. Edition และ License Caveats

- **Jasper ecosystem:** FAQ ระบุ Server CE ไม่แจก/ไม่สนับสนุนต่อ และ Studio 6.21.2 CE เป็น binary-use license โดยไม่แจก source; ต้องแยกจาก Library LGPL v3 [CE changes FAQ](https://community.jaspersoft.com/knowledgebase/faq/faqs-on-community-edition-changes-effective-january-25-2024-r4629/), [Library license 7.1.1](https://raw.githubusercontent.com/TIBCOSoftware/jasperreports/7.1.1/LICENSE)
- **jsreport:** Core source LGPL v3 ไม่เท่ากับ vendor distribution terms; FAQ free plan จำกัด stored templates 5 รายการและยกเว้น inline full specification ในเงื่อนไขที่ระบุ [Core license](https://raw.githubusercontent.com/jsreport/jsreport/master/packages/jsreport-core/LICENSE), [FAQ](https://jsreport.net/learn/faq)
- **Carbone:** License hub แยก CarboneJS CCL source-available, On-Prem license, Cloud terms และ Apache-2.0 ของ SDK/MCP/plugins/examples บางส่วน ไม่ใช่ OSS license เดียวทั้ง ecosystem [License hub](https://carbone.io/company/licenses.html)
- **pdfme:** Repository license MIT แต่ยังไม่ยืนยัน schema-to-HTML/Gotenberg compatibility การใช้ Designer ร่วมกับ Engine นี้ยังเป็น integration work ที่ต้องศึกษา [License](https://raw.githubusercontent.com/pdfme/pdfme/main/LICENSE.md)

รายละเอียดเงื่อนไขและสถานะก่อนนำโค้ดมาใช้ดู [T05 license inventory](05-license-inventory.md) ไม่มีการสรุป redistribution permission ของ Studio ทุกเวอร์ชัน หรือการตัดสิน legal compatibility แทนผู้ใช้

## 5. ใช้ผลเปรียบเทียบอย่างไรกับโปรเจกต์

ใช้เป็น benchmark สำหรับ template/data separation, parameters, groups/totals, long tables, reusable components, properties/tree/errors, preview parity และ versioned API

ตัวอย่าง [T01](01-product-brief.md) ทั้งสามแบบต้องใช้เทียบภายใต้ persona/expected semantics เดียวกัน ถ้าเลือก business-author-first ต้องศึกษา Designer ต่อ ส่วน developer-first ยังต้องมี diagnostics/preview ที่ใช้งานได้ ไม่เลือกแนวทางใดใน checkpoint นี้

ไม่ดึง ad hoc BI/dashboard, JRXML migration, export ทุก format, scheduling หรือ editor dependency เป็นข้อกำหนดอัตโนมัติ ไม่มี “ผู้ชนะ” จากจำนวนฟีเจอร์หรือจาก matrix ที่ยังไม่ทดสอบ runtime

## 6. Review และข้อจำกัด

Subagent benchmark_products ตรวจ primary sources และแชร์ edition/license gaps กับ security_license; รับ Gotenberg integration caveats จาก engine_sources จากนั้นใช้ agy `gemini-3.8-flash-high`, plan/read-only/no-tools, 90s: exit 0 / SUCCESS, conversation `b3bee521-20cf-4648-abbb-a22b6d62d2a8`

Parent รับข้อทักท้วงเรื่องแยก Library/Designer/Server, rolling docs และ license terms; แก้คำตอบที่เหมารวมว่าเฉพาะ SDK ของ Carbone เป็น Apache-2.0 เพราะ license hub รวม MCP/plugins/deployment examples ด้วย ผลโมเดลไม่ใช้แทน source citations

ยัง unknown: actual PDF output, Thai rendering, performance, full dependency-license compatibility และ round-trip ของ Designer ไป Gotenberg
