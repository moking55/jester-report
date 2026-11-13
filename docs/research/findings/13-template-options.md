# T13 — ทางเลือก Report Definition

ตรวจเอกสาร 12 พฤศจิกายน 2026; **ข้อเสนอ ไม่ใช่การเลือก format หรือผล runtime**. ใช้ [specimen เดียวกัน](../../../research/specimens/template-options.json): sales S01–S04, North 2000.00, South 400.00, grand 2400.00, header `company-header@1.0.0`, ข้อความไทยยาว; อ้าง [T01](01-product-brief.md), [T08](08-pagination.md), [T09](09-thai-fonts.md), [T10](10-grouping-totals.md), [T11](11-master-detail.md).

## เปรียบเทียบ

| เกณฑ์ | HTML-first | Declarative schema | Hybrid schema + bounded HTML |
| --- | --- | --- | --- |
| Definition | HTML/CSS + bindings/partials | Versioned model ของ fields, groups, sections | Structured blocks พร้อม HTML extension เฉพาะที่กำหนด |
| Grouping | Pre-group data หรือ restricted helpers; ต้องระบุ sort/scope | กำหนด group key/scope ใน model แล้วแปลง | Group เป็น model; extension ไม่แก้ totals โดยพลการ |
| Long text | CSS flow; breaks/Thai ยังไม่พิสูจน์ | Compiler ต้องสร้าง CSS ที่ให้ semantics ตาม model | Extension อาจเพิ่ม CSS interaction; ต้องตรวจ capability boundary |
| Reuse | Include/partial ที่ pin version | Component ID/version ใน model | Pin component และ extension dependencies |
| Editor / renderer | Source editor ตรง; visual editor อาจเปลี่ยน markup | Designer สร้าง model; ต้องสร้าง compiler HTML | ต้องมี editor สำหรับ block และ source; split ownership ซับซ้อน |
| Round trip | HTML → visual model → HTML อาจเสีย custom CSS/semantics | Schema → editor → schema อาจเสีย fields ที่ editor ไม่รู้ | ความเสี่ยงทั้งสองแบบ; ต้องเก็บ extension และ reject unsupported edits |
| Migration | Version syntax, helper และ asset contract | Schema version + migrations; ไม่ทิ้ง unknown fields เงียบ ๆ | Version ทั้ง schema และ extension contract |
| Expressions | จำกัด helpers, no arbitrary code; escaping ตาม context | Allowlisted typed operators; หลีกเลี่ยง eval | ต้องใช้ policy เดียวกันทั้ง model/HTML; อย่าเปิด escape hatch เป็น code execution |

Gotenberg รับ HTML/CSS/assets ตาม [9.x docs](https://gotenberg.dev/docs/chromium/convert-html); ไม่ได้จัด grouping, expression evaluation หรือ report schema ให้เองใน route ที่ศึกษา. HTML route ไม่พิสูจน์ว่าแนวทางใดให้ Jasper band semantics หรือ pagination เท่ากัน.

## Walkthrough และเงื่อนไข

ทั้งสามทางเลือกต้องผูก input ชุดเดียวกันกับ grouped records, สร้าง subtotal 2000.00/400.00 และ grand 2400.00 ตาม decimal policy ที่ T10 ระบุ, pin reusable header, แล้วส่ง output HTML ให้ renderer. รายละเอียด report definition ใน specimen เป็น **pseudo-contract** ไม่ใช่ syntax ที่ implementation รองรับ. Page subtotal, long text/oversized rows, header/footer ไทย และ output PDF เป็น **deferred/not-tested**; ไม่รับรองจากตัวอย่างนี้.

**Security:** template authorship อาจเป็น code execution boundary; [OWASP SSTI](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Template_Injection_Prevention_Cheat_Sheet.html) และ [Handlebars security](https://handlebarsjs.com/guide/security.html) ชี้ว่าการ escaping ไม่แทน template sandbox และ context-sensitive output handling. Runtime isolation, allowlist, quotas และ author permissions ยังต้องออกแบบ; ไม่เลือก templater หรือให้ arbitrary JS.

## Proposed decision และ reversibility

- Developer-first: เริ่มศึกษา HTML-first + limited bindings; effort สำรวจต่ำกว่า full visual model **เป็น relative hypothesis ไม่มี person-hour estimate**. เสี่ยง migration เมื่อจำเป็นต้อง round-trip กับ Designer.
- Business-author-first: ศึกษา schema-first เพื่อจำกัด authoring operations; compiler, layout coverage และ schema migration เพิ่มต้นทุน. หากใช้ hybrid ให้กำหนด bounded subset และ unsupported-node behavior ก่อน.
- ยังไม่เลือก canonical format: รอ persona, runtime validation, security และ license review. ก่อนลงทุนให้เก็บ versioned definition + sample data + generated HTML snapshot ใน spike ภายหลัง พร้อม explicit migration path. Rollback หมายถึงคง renderer/reader ของ version เก่าหรือ archive definition/asset ไม่ใช่แปลงย้อนที่ยังไม่พิสูจน์.
- License precheck: Handlebars reference license MIT ไม่ยืนยัน security; GrapesJS และ pdfme source license ต้องตรวจ tag และ dependencies; Carbone CCL เป็น source-available ภายใต้ข้อจำกัด ไม่ใช้เป็น template dependency อัตโนมัติ [T05](05-license-inventory.md).
