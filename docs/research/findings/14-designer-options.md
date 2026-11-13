# T14 — Designer Feasibility

สถานะ: ศึกษาเอกสาร ไม่ติดตั้ง/รัน demo หรือ renderer. Persona developer และ business author เป็นสมมติฐาน [T01](01-product-brief.md); input sales และ expected totals ตาม [T13 specimen](../../../research/specimens/template-options.json).

## งานเดียวกันและเกณฑ์ประเมิน

1. เพิ่ม field `region` จาก dataset พร้อมตรวจ missing field; 2. แก้ตาราง detail และ group ตาม region พร้อม subtotal; 3. reuse `company-header@1.0.0`; 4. จัดข้อความไทยยาว/หลายหน้า; 5. undo/redo; 6. preview PDF ผ่าน pipeline เดียวกับ final พร้อม error และ empty-data cases.

| Workflow | Code editor | Block editor | Visual canvas |
| --- | --- | --- | --- |
| Developer | เขียน bindings/layout ได้; error locations จำเป็น | เร็วเมื่อ blocks ครอบคลุม; extension contract สำคัญ | ตำแหน่งสัมพันธ์ flow ต้องตรวจ |
| Business author | ต้องเรียน syntax หรือพึ่ง developer | ใกล้เป้าหมายถ้าเลือก fields/groups ได้ | เข้าถึงได้ถ้ารองรับ keyboard และ semantics ของรายงานหลายหน้า |
| Table/group/preview | ต้องมีตัวช่วย binding และ server PDF preview | ต้องสร้าง table/group editor และ mapping | Canvas ไม่พิสูจน์ reflow/PDF fidelity; ต้อง preview PDF จริง |
| Undo/round trip | ใช้ editor history; source parser อาจสูญเสียข้อมูล | ต้องเก็บ model/history และ unknown nodes | ต้องพิสูจน์ source ↔ model ↔ generated HTML ไม่สูญเสีย |

## สอง candidates ที่ดูจากเอกสาร

| Candidate | Documented | Gap สำหรับ Gotenberg / license |
| --- | --- | --- |
| GrapesJS core | Components แทน HTML/JSON, project storage และ undo manager มี API [components](https://grapesjs.com/docs/modules/Components), [storage](https://grapesjs.com/docs/modules/Storage.html), [undo](https://grapesjs.com/docs/api/undo_manager.html). | ต้องออกแบบ binding/group/table report semantics, sandbox, asset policy และ HTML conversion/request. Project data เป็นแหล่งเก็บ editor state; round-trip fidelity กับ arbitrary template expressions ไม่ยืนยัน. [Core license](https://github.com/GrapesJS/grapesjs/blob/master/LICENSE) จาก mutable branch; แยก commercial Studio SDK และตรวจ exact release/plugins ก่อนใช้. |
| pdfme Designer | Shared Template/schema และ plugin UI; dynamic reflow ต้อง blank `basePdf` object, custom PDF base มี fixed pages [features](https://pdfme.com/docs/supported-features). JSX authoring beta ระบุไม่เป็น lossless source หลังแก้ใน Designer [JSX](https://pdfme.com/docs/jsx). | pdfme schema → HTML/CSS สำหรับ Gotenberg, group semantics, pagination parity และ round-trip **unknown**; การมี Designer ไม่พิสูจน์ว่าต่อ Gotenberg ได้. [MIT source](https://raw.githubusercontent.com/pdfme/pdfme/main/LICENSE.md) mutable; ตรวจ exact artifact/dependencies ก่อน reuse. |

Evaluation data อยู่ [designer-evaluation.json](../../../research/specimens/designer-evaluation.json); documented capabilities เป็นของ candidate เอง ไม่ยืนยันว่า user story ทั้งหกทำได้จริง; accessibility, undo ในทุก action และ usability ยังไม่ทดสอบ. ไม่ทดลอง editor, ไม่คัดลอก template/license ที่มีข้อจำกัด.

## Build / reuse / defer

- **Build:** คุม report semantics ได้ แต่ต้องรับภาระ canvas, keyboard, history, pagination preview, parser/compiler และ maintenance; effort **สูงเชิงสัมพัทธ์ ยังไม่วัด**.
- **Reuse:** อาจลด editor shell work แต่ต้องทำ data/group semantics, secure binding และ conversion; license ของแต่ละ version/plugin ต้องตรวจ. GrapesJS เหมาะศึกษา HTML surface; pdfme เหมาะศึกษา schema/UX โดย integration ไม่ยืนยัน.
- **Defer:** developer-first อาจเริ่มด้วย code editor + PDF preview และรอ business-author validation; หาก business authors เป็น persona หลัก defer อาจไม่ตอบโจทย์ MVP. เป็น scenarios ไม่ใช่ decision.

ก่อนเลือกลงทุน: ให้ผู้ใช้ยืนยัน persona และตัวอย่างเอกสาร, ตรวจ runtime pagination/Thai และทำ bounded no-production evaluation ใน environment ที่เหมาะสมตามข้อจำกัดเครื่อง. ไม่มีการเลือก designer หรือ engine ใหม่ใน T14.
