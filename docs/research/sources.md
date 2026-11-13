# Source Register — Report System Research

วันที่ตรวจ: **12 พฤศจิกายน 2026**  
ขอบเขต: Checkpoints 1–9 และ T28–T29; primary-source desk research (ไม่มี ID S95–S99: ข้ามโดยไม่ใช้)  
ผู้ตรวจ: subagents ตามแต่ละ checkpoint และ parent Codex; S62–S81 เพิ่มสำหรับ Checkpoints 5–8; S82–S103 สำหรับ T25–T28 (เปิดอ่าน 2026-11-13)

## วิธีอ่าน

S01–S22 รักษา IDs จาก keyword map เดิม แหล่งเพิ่มเติมเรียง S23 เป็นต้นไป สถานะทุกรายการคือ **readable ณ วันที่ตรวจ / documented evidence** เว้นแต่ข้อจำกัดในคอลัมน์ scope การอ่านได้ไม่เท่ากับทุก claim ในหน้าถูกนำมายืนยัน หรือ runtime ผ่าน

Source access ตรวจโดย researchers; parent เปิดตรวจ consequential claims ซ้ำด้าน Engine release/migration, product boundaries, critical edition/license terms และ security controls ไม่อ้างว่าตรวจทุก dependency/artifact ทั้งชุด

| ID | Primary source / final reference | Version / scope marker | รองรับหัวข้อ / ข้อจำกัด |
| --- | --- | --- | --- |
| S01 | [JasperReports Sample Reference](https://jasperreports.sourceforge.net/sample.reference/README.html) | 7.1.1 | Library feature index |
| S02 | [JasperReports Jasper Sample](https://jasperreports.sourceforge.net/sample.reference/jasper/README.html) | 7.1.1 | Grouping/sections/aggregates |
| S03 | [JasperReports Subreport Sample](https://jasperreports.sourceforge.net/sample.reference/subreport/README.html) | 7.1.1 | Subreport data/parameters |
| S04 | [Gotenberg How it works](https://gotenberg.dev/docs/about) | 9.x | HTTP conversion/engines |
| S05 | [Gotenberg HTML conversion](https://gotenberg.dev/docs/chromium/convert-html) | 9.x | Inputs/readiness/header/footer |
| S06 | [Gotenberg Install](https://gotenberg.dev/docs/getting-started/installation) | 9.x | Distribution/version pinning; ไม่ติดตั้ง |
| S07 | [Gotenberg Upgrade](https://gotenberg.dev/docs/getting-started/upgrade) | 8.x→9.x | Migration; drift เรื่อง stamp position |
| S08 | [Gotenberg Routes](https://gotenberg.dev/docs/getting-started/routes) | 9.x | Conversion/PDF/system route scopes |
| S09 | [Gotenberg Outbound controls](https://gotenberg.dev/docs/operate/outbound) | 9.x | Egress precedence; readable หลัง navigation recovery |
| S10 | [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) | Rolling | SSRF prevention guidance |
| S11 | [OSI Open Source Definition](https://opensource.org/osd) | Definition 1.9 | Open-source criteria |
| S12 | [OSI Approved Licenses](https://opensource.org/licenses) | Rolling catalogue | License status catalogue |
| S13 | [jsreport Getting started](https://jsreport.net/learn/get-started) | Rolling, release unpinned | Templates/recipes/data/preview |
| S14 | [Carbone Template design](https://carbone.io/documentation/design/overview/getting-started.html) | Rolling, release unpinned | Tags/JSON/formatters |
| S15 | [pdfme Getting started](https://pdfme.com/docs/getting-started) | Rolling; v6 migration link | Template/UI/generator contracts |
| S16 | [W3C CSS Fragmentation Level 3](https://www.w3.org/TR/css-break-3/) | CR 2018-12-04 | Specification ไม่ใช่ Chromium proof |
| S17 | [JasperReports Fonts](https://jasperreports.sourceforge.net/sample.reference/fonts/README.html) | 7.1.1 | Jasper font concepts |
| S18 | [JasperReports Internationalization](https://jasperreports.sourceforge.net/sample.reference/i18n/README.html) | 7.1.1 | Locale/resource bundles |
| S19 | [Gotenberg Production](https://gotenberg.dev/docs/operate/production) | 9.x | Documented queues/concurrency/timeouts |
| S20 | [Gotenberg Webhooks](https://gotenberg.dev/docs/webhook-download) | 9.x | Result/events ไม่เท่ากับ durable app jobs |
| S21 | [Gotenberg Secure deployment](https://gotenberg.dev/docs/operate/secure) | 9.x | Authentication/isolation flags |
| S22 | [Gotenberg Telemetry](https://gotenberg.dev/docs/telemetry) | 9.x | Logs/OTel; หน้าเอกสารไม่ใช่ endpoint |
| S23 | [Gotenberg Release](https://github.com/gotenberg/gotenberg/releases/tag/v9.4.1) | v9.4.1 | latest redirect ชี้มาที่ tag ขณะตรวจ |
| S24 | [Gotenberg Stamp positions release](https://github.com/gotenberg/gotenberg/releases/tag/v9.4.0) | v9.4.0 | Release-specific stamp position evidence |
| S25 | [Gotenberg License](https://raw.githubusercontent.com/gotenberg/gotenberg/v9.4.1/LICENSE) | v9.4.1 | MIT ตัวโครงการ ไม่ใช่ image BOM ทั้งชุด |
| S26 | [JasperFillManager API](https://jasperreports.sourceforge.net/api/net/sf/jasperreports/engine/JasperFillManager.html) | 7.1.1 | Java fill API |
| S27 | [Jaspersoft Studio Introduction](https://community.jaspersoft.com/knowledgebase/getting-started/introduction-jaspersoft-studio/) | Page metadata v9.0.0 | Design/Source/Preview; ไม่ใช้ pin binary |
| S28 | [Jaspersoft CE changes FAQ](https://community.jaspersoft.com/knowledgebase/faq/faqs-on-community-edition-changes-effective-january-25-2024-r4629/) | Effective 2024-01-25; Studio6.21.2 | Server CE status/Studio binary-source scope |
| S29 | [Jaspersoft Commercial](https://www.jaspersoft.com/products/jaspersoft-commercial) | Rolling commercial page | Server/Studio/Web Studio/IO แยกผลิตภัณฑ์ |
| S30 | [JasperReports Server executions](https://docs.actian.com/jaspersoft/jasperreports-server/rest-api-reference/reportexecutions/) | 10.1.0 docs | Async/polling/output |
| S31 | [JasperReports Library License](https://raw.githubusercontent.com/TIBCOSoftware/jasperreports/7.1.1/LICENSE) | 7.1.1 tag | LGPL v3; redirected org alias ใช้ artifact เดียวกัน |
| S32 | [jsreport API](https://jsreport.net/learn/api) | Rolling | HTTP render/CRUD |
| S33 | [jsreport FAQ](https://jsreport.net/learn/faq) | Rolling | Vendor stored-template limits/inline exception |
| S34 | [jsreport Core License](https://raw.githubusercontent.com/jsreport/jsreport/master/packages/jsreport-core/LICENSE) | Mutable master; release unpinned | LGPL v3 core source |
| S35 | [Carbone HTTP API](https://carbone.io/documentation/developer/http-api/introduction.html) | API V5 docs | Template/render/download workflow |
| S36 | [Carbone License hub](https://carbone.io/company/licenses.html) | Updated 2026-10-26 | Distribution-specific licenses |
| S37 | [Carbone Code License](https://carbone.io/company/code-license.html) | CCL v2 effective 2026-10-26 | Source-available; publisher restrictions |
| S38 | [pdfme Features](https://pdfme.com/docs/supported-features) | Rolling; release unpinned | Dynamic layout/basePdf constraints |
| S39 | [pdfme License](https://raw.githubusercontent.com/pdfme/pdfme/main/LICENSE.md) | Mutable main; release unpinned | MIT ตัวโครงการ |
| S40 | [Handlebars License](https://raw.githubusercontent.com/handlebars-lang/handlebars.js/v4.7.8/LICENSE) | v4.7.8 license reference | MIT; ไม่แนะนำ version ใช้งานจริง |
| S41 | [Handlebars Security](https://handlebarsjs.com/guide/security.html) | Rolling | Context escaping/helpers/sandbox limits |
| S42 | [Sarabun OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/OFL.txt) | Google Fonts mutable snapshot; OFL1.1 | Font license; binary unpinned |
| S43 | [Noto Sans Thai OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/OFL.txt) | Google Fonts mutable snapshot; OFL1.1 | Font license; binary unpinned |
| S44 | [Noto Sans Thai Metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/METADATA.pb) | References NotoSansThai-v2.002 | Metadata ไม่ใช่ installed binary/hash |
| S45 | [MIT License](https://opensource.org/license/mit) | OSI MIT text | Permissive terms |
| S46 | [Apache License](https://www.apache.org/licenses/LICENSE-2.0) | Apache-2.0 | Patent/notices terms |
| S47 | [AGPL License](https://opensource.org/license/agpl-3.0) | AGPL-3.0 | Section13 modified network version |
| S48 | [Developer Certificate of Origin](https://developercertificate.org/) | DCO1.1 | Contribution rights attestation |
| S49 | [Gotenberg Resource limits](https://gotenberg.dev/docs/operate/limits) | 9.x | Body/archive/time/queue/PDF controls |
| S50 | [OWASP SSTI](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Template_Injection_Prevention_Cheat_Sheet.html) | Rolling | Template/data separation and containment |
| S51 | [Jaspersoft Studio EULA](https://community.jaspersoft.com/policies/jss-eula/) | Rolling; exact artifact unresolved | Third-party clauses ไม่ยืนยันสิทธิ์ Studio ทั้งโปรแกรม |
| S52 | [Unicode Line Breaking Algorithm](https://unicode.org/reports/tr14/tr14-57.html) | Revision 57 | Thai complex-context line breaking ไม่ใช่ผล Chromium runtime |
| S53 | [Sarabun metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/METADATA.pb) | Mutable main | Font subsets ไม่ยืนยัน glyph coverage หรือ binary hash |
| S54 | [W3C SVG 2](https://www.w3.org/TR/SVG2/) | Specification | รูปแบบ vector ไม่ยืนยัน output pipeline |
| S55 | [W3C PNG](https://www.w3.org/TR/png-3/) | Specification | Raster format ไม่ใช่ผลวัดคุณภาพ |
| S56 | [GS1 2D retail guideline](https://ref.gs1.org/guidelines/2d-in-retail/) | Rolling guideline | QR quiet zone ในบริบท GS1 retail |
| S57 | [GS1-128 format](https://support.gs1.org/support/solutions/articles/43000734455-what-is-the-format-of-gs1-128-) | Rolling | แยก GS1-128 จาก Code 128 ทั่วไป |
| S58 | [Gotenberg issue 392](https://github.com/gotenberg/gotenberg/issues/392) | Reported Gotenberg 7, 2021 | Issue report ไม่ reproduce และไม่ยืนยันว่ามีใน 9.x |
| S59 | [Gotenberg discussion 1377](https://github.com/gotenberg/gotenberg/discussions/1377) | 2025, version unspecified | Discussion ไม่ใช่หลักฐาน runtime |
| S60 | [Chrome print margins](https://developer.chrome.com/blog/print-margins) | Version ตามบทความ | Chromium capabilities ต้องตรวจกับ actual build |
| S61 | [JasperReports List Sample](https://jasperreports.sourceforge.net/sample.reference/list/README.html) | 7.1.1 | Dataset run/list semantics ของ JasperReports |
| S62 | [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Rolling | Object permissions / deny by default |
| S63 | [OWASP IDOR](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html) | Rolling | Object authorization |
| S64 | [OWASP Query Parameterization](https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html) | Rolling | Parameterized query guidance |
| S65 | [S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) | AWS example | Bearer / expiry; AWS ไม่ได้ถูกเลือก |
| S66 | [AWS Retry with Backoff](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html) | Reference example | Retry/backoff ไม่ได้เลือก cloud |
| S67 | [EventBridge Scheduler Types](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html) | Reference example | Schedule time zones; AWS ไม่ได้ถูกเลือก |
| S68 | [GrapesJS License](https://github.com/GrapesJS/grapesjs/blob/master/LICENSE) | Mutable branch | Core license; exact dependency unpinned |
| S69 | [Gotenberg Errors](https://gotenberg.dev/docs/reference/errors) | 9.x rolling | Engine error taxonomy |
| S70 | [GrapesJS Undo](https://grapesjs.com/docs/api/undo_manager.html) | Rolling | Editor history API |
| S71 | [GrapesJS Components](https://grapesjs.com/docs/modules/Components) | v0.15.8+ guide | Component model |
| S72 | [GrapesJS Storage](https://grapesjs.com/docs/modules/Storage.html) | v0.19+ guide | Project data persistence |
| S73 | [JSON Schema Annotations](https://json-schema.org/understanding-json-schema/reference/annotations) | Rolling | Annotation/default semantics |
| S74 | [JSON Schema Object](https://json-schema.org/understanding-json-schema/reference/object) | Rolling | Object validation |
| S75 | [JSON Schema Types](https://json-schema.org/understanding-json-schema/reference/type) | Rolling | Types and validation |
| S76 | [pdfme JSX beta](https://pdfme.com/docs/jsx) | Rolling beta | Authoring layer/round-trip limitations |
| S77 | [OpenAPI Specification](https://spec.openapis.org/oas/v3.1.0) | 3.1.0 | API document format |
| S78 | [PostgreSQL Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) | Rolling current | Snapshot illustration; database ไม่ได้ถูกเลือก |
| S79 | [RFC 6266](https://www.rfc-editor.org/rfc/rfc6266) | RFC 6266 | Content-Disposition |
| S80 | [RFC 8187](https://www.rfc-editor.org/rfc/rfc8187) | RFC 8187 | HTTP parameter encoding |
| S81 | [WAI Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) | Rolling | Keyboard authoring practices |
| S82 | [Gotenberg PDF pipe / stages](https://gotenberg.dev/docs/pdf/pipe) | 9.x (เปิดอ่าน 2026-11-13) | `/forms/pdf/pipe` fields, 28 stages, order rules, signed-PDF behaviour (rewrite/incremental/unchanged), encrypt/sign conflicts; ไม่ระบุ release ที่เริ่มมีแต่ละ stage |
| S83 | [Gotenberg remediate](https://gotenberg.dev/docs/pdf/remediate) | 9.x | `/forms/pdf/remediate` profiles PDF/A-1a..4f, PDF/UA-1/2, Factur-X; language/aggressive/figureAltText/xml/level; valid A+UA pairs; residual/rolled-back headers; คืน 200 แม้มี violations; ไม่ระบุพฤติกรรมเมื่อ input signed/encrypted |
| S84 | [Gotenberg validate](https://gotenberg.dev/docs/pdf/validate) | 9.x | `/forms/pdf/validate` fields/profile, JSON shape compliant/violations/severity; ไม่ระบุ validator engine |
| S85 | [Gotenberg sign](https://gotenberg.dev/docs/pdf/sign) | 9.x | `/forms/pdf/sign` fields (PKCS#12/PEM, pades, timestampUrl); sign ได้ครั้งเดียวต่อ list; self-signed test cert ไม่ trusted; ไม่ระบุ PAdES level/OCSP/HSM (S90 คือหน้าเดียวกัน อ่านซ้ำโดย T27) |
| S86 | [Gotenberg timestamp](https://gotenberg.dev/docs/pdf/timestamp) | 9.x | `/forms/pdf/timestamp` timestampUrl (RFC 3161); document timestamp ไม่ระบุผู้เซ็น (S91 คือหน้าเดียวกัน) |
| S87 | [Gotenberg encrypt](https://gotenberg.dev/docs/pdf/encrypt) | 9.x | `/forms/pdf/encrypt` passwords/algorithm/permissions; ต้องเป็น stage สุดท้าย; ไม่รวม sign/timestamp/PDF/A/Factur-X |
| S88 | [veraPDF validation](https://docs.verapdf.org/validation/) | docs ปัจจุบัน | Flavours PDF/A-1..4, PDF/UA-1/2, WTPDF; PDF/UA ตรวจได้เฉพาะ machine-verifiable; ไม่ระบุ CLI flags ในหน้านี้ |
| S89 | [PDF Association ISO 14289](https://pdfa.org/resource/iso-14289-pdfua/) | — | **inaccessible**: HTTP 403 ณ 2026-11-13 ไม่ใช้เป็นหลักฐาน; Matterhorn/ISO 14289 claims = unknown |
| S90 | [Gotenberg: Sign a PDF](https://gotenberg.dev/docs/pdf/sign) | docs 9.x เปิดอ่าน 2026-11-13 | ซ้ำกับ S85; T27 ใช้อ้าง `certificate`/`key`/`pades`/`timestampUrl` และ order rules |
| S91 | [Gotenberg: Timestamp a PDF](https://gotenberg.dev/docs/pdf/timestamp) | docs 9.x | ซ้ำกับ S86; `timestampUrl` http/https, Gotenberg เรียก TSA ออกนอก |
| S92 | [Gotenberg: Outbound requests](https://gotenberg.dev/docs/operate/outbound) | docs ปัจจุบัน | ซ้ำกับ S09; `timestampUrl` อยู่ใน family `--pdf-*`, deny ชนะ, allow-list ข้าม IP-class checks |
| S93 | [ETSI EN 319 142-1 PAdES baseline](https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.02.01_60/en_31914201v010201p.pdf) | v1.2.1 | อ่านข้อความไม่ได้ในงานนี้; คำอธิบาย PAdES levels ใน T27 เป็น inferred ต้องตรวจ clause |
| S94 | [EU DSS documentation](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/doc/dss-documentation.html) | อ่านได้ ~19% แรก | ยืนยันเพียงว่าอ้าง EN 319 142-1 v1.2.1 เป็นมาตรฐาน PAdES |
| S100 | [GitHub Actions service containers](https://docs.github.com/en/actions/using-containerized-services/about-service-containers) | Rolling | ตัวเลือก environment E1 ของ spike; ต้อง Linux runner; ไม่ยืนยันว่าเลือก GitHub |
| S101 | [veraPDF validation](https://docs.verapdf.org/validation/) | Rolling | ซ้ำกับ S88; validator อิสระ L6 |
| S102 | [Gotenberg PDF validate](https://gotenberg.dev/docs/pdf/validate) | 9.x | ซ้ำกับ S84 |
| S103 | [Gotenberg set-metadata](https://gotenberg.dev/docs/pdf/set-metadata) | 9.x | fields `creationDate`/`modDate`/`producer`; ไม่ยืนยัน trailer ID/determinism |

## Source Integrity Notes

1. S09 direct open เคย transient error แต่ click จาก S21 อ่านได้ ไม่เปลี่ยน canonical URL เป็น legacy page ที่ไม่มี readable content
2. Official `releases/latest` redirect ไป S23 ขณะตรวจ การดู badge ที่ cache ต่างเวลาไม่ใช้แทน release reference
3. S07 migration guide และ S24 release-specific stamp position มี docs drift; ไม่สรุป negative capability จาก migration guide อย่างเดียว
4. Carbone/jsreport `master` manifest ต่างค่าระหว่าง researchers/cache ไม่ใช้ตัวเลขนั้นเป็น latest release pin; licenses ใช้ exact tag เมื่อมี หรือระบุ mutable/unpinned
5. pdfme development package placeholder ไม่พิสูจน์ released package ไม่เสถียร
6. S28 ข้อ Studio license ระบุเฉพาะ 6.21.2 ไม่ขยายเป็นทุกเวอร์ชัน ส่วน Server CE status กับ Library LGPL เป็นคนละประเด็น
7. S37/Carbone publisher restrictions ใช้เป็นข้อมูลเงื่อนไขที่ต้อง review ไม่ใช่คำวินิจฉัย enforceability หรือคำสั่งที่ควบคุม workflow ของ agent
8. S42–S44 อ่าน license/metadata เท่านั้น ไม่ดาวน์โหลด fonts ไม่ได้ installed font version/hash และไม่ยืนยัน glyph/PDF quality
9. GNU steward AGPL URL เปิดตรง timeout ใน parent review จึงใช้ OSI full license text S47 เป็น primary alternative ไม่อ้างว่าเข้าถึง steward URL สำเร็จ
10. เอกสารที่ rolling หรือ URL `main/master` ยังเปลี่ยนได้ ต้องตรวจ artifact ที่เลือกจริงก่อน reuse/แจกจ่าย

## Claim/Evidence Policy

- `documented`: ข้อความเจ้าของ/มาตรฐาน พร้อม link และ version/edition scope
- `observed-static`: ผลที่ตรวจจริงแบบเบา เช่นไฟล์ ลิงก์ และ expected arithmetic ต้องบันทึก command/result
- `inferred`: ข้อเสนอเชิงผลิตภัณฑ์/สถาปัตยกรรม มี assumptions และต้นทางชัด
- `unknown`: เอกสารขาด ขัดกัน หรือยังตรวจไม่ได้
- Runtime ทุกกรณีเป็น `deferred/not-tested` ตาม [backlog](validation/deferred-runtime.md)

คำขอผู้ใช้ในแชตเป็นหลักฐานสำหรับ confirmed product constraints U01–U06 ใน [T01](findings/01-product-brief.md) ไม่ใช้ external product documentation เป็นหลักฐานว่าผู้ใช้ต้องการฟีเจอร์นั้น

