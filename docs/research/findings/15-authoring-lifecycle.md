# T15 — Authoring และ Template Lifecycle

สถานะ: proposed user flows / state contract; ไม่มี UI, storage หรือ runtime ที่สร้างแล้ว. Preview/final parity เป็น requirement proposal ต้องพิสูจน์ภายหลัง.

## Flow ผู้สร้างรายงาน

1. **สร้าง draft:** author สร้างหรือ fork จาก published version; ระบุชื่อ, schema version, locale/timezone, sample data ที่ไม่เป็นความลับ และ pinned assets. แสดง missing fields และ empty-data state ก่อน preview.
2. **แก้ไข:** เพิ่ม field/group/table หรือ source ตาม editor ที่เลือก; validate schema, data, expression และ asset references พร้อมตำแหน่งข้อผิดพลาด. Draft revision เปลี่ยนทุกครั้งที่บันทึก; optimistic concurrency conflict ต้องไม่เขียนทับงานอีกคนเงียบ ๆ.
3. **Preview:** capture draft revision + sample-data reference + assets + print options + renderer version; ผ่าน validation แล้วใช้ **PDF pipeline/config/fonts เดียวกับ final**. แสดง loading, validation error, renderer/resource error, empty data และ preview failure; ห้ามใช้ HTML screen preview เป็นหลักฐาน PDF parity.
4. **Publish:** ตรวจสิทธิ์และ validation, resolve component/asset versions, สร้าง immutable published version จาก revision ที่ระบุ แล้วบันทึก actor/time. Approval workflow เป็น optional ตามนโยบาย ยังไม่ตั้ง approval gate ใน MVP.
5. **Run/download:** caller ระบุ published version หรือ active alias; resolve alias ครั้งเดียวเมื่อ submit, authorize template และ data, ผูก job กับ snapshot แล้วตรวจสิทธิ์ artifact ทุกครั้งที่ download.
6. **Rollback:** ผู้มีสิทธิ์เปลี่ยน active alias ให้ชี้ published version เดิม หรือ publish copy ใหม่ตาม policy; ห้ามแก้ immutable version และไม่เปลี่ยนผลของ job ที่ capture snapshot ไปแล้ว.

## State / transitions ที่เสนอ

| Entity/state | Event | Next / invariant | Permission proposal |
| --- | --- | --- | --- |
| Draft revision n | save with matching revision | draft n+1; concurrent stale write → conflict | author แก้ template นั้น |
| Draft revision n | preview | preview job snapshot n; ไม่เปลี่ยน publish state | author/viewer ตาม policy + data scope |
| Draft revision n | publish | immutable published v; pin assets/components/options | publisher ของ template |
| Published v | edit | fork เป็น draft; v ไม่เปลี่ยน | author |
| Active alias → v2 | rollback | alias → v1; v1/v2 ยังคง immutable | publisher/operator ตาม policy |
| Render submitted for v2 | alias เปลี่ยนเป็น v1 | job ยังใช้ v2 + asset snapshot; output provenance v2 | caller และ worker ที่ได้รับสิทธิ์ |
| Artifact ready | download | ตรวจ template/job/artifact/tenant authorization อีกครั้ง | ผู้มีสิทธิ์ ณ เวลาดาวน์โหลด |

State model นี้ไม่ผูกฐานข้อมูล, endpoint หรือ queue technology; T18–T20 ต้องกำหนด error/status/authorization และ retention เพิ่ม.

## ประวัติเอกสารและ race scenarios

- **Save ระหว่าง render:** job จับ published version กับ asset reference อย่าง immutable แล้ว; draft ที่แก้ต่อไม่เปลี่ยน input ของงานเดิม. หาก resolution ไม่ atomic ให้รายงาน conflict และไม่ผสม asset versions.
- **Rollback ระหว่างงาน:** active alias เปลี่ยนมีผลต่อคำขอใหม่เท่านั้น; job เดิมระบุ resolved version เมื่อ submit. Authorization ต้องตรวจอีกครั้งตอน download.
- **เอกสารย้อนหลัง:** ทางเลือก A เก็บ PDF เดิม + provenance ให้ดาวน์โหลดซ้ำ; ทางเลือก B re-render จาก data snapshot + pinned definition/assets/renderer. B อาจให้ผลต่างและมี retention/privacy cost; exact reproduction/byte equality ไม่รับประกัน. ข้อเลือกและ retention ยังเปิด.
- **Asset ลบ/เปลี่ยน:** published version ต้องอ้าง immutable asset หรือ reject publish เมื่อ resolve ไม่ได้; garbage collection ต้องไม่ลบ dependency ที่ยังมี reference ตาม retention policy. Authorization และ storage semantics ยังต้องกำหนด.

## MVP / accessibility

| ผู้สมัคร MVP | ขั้นขยายตาม requirement |
| --- | --- |
| Draft/save, sample data, PDF preview ผ่าน pipeline เดียวกัน, explicit errors, publish immutable version และ rollback alias ขั้นพื้นฐาน | Multi-step approval, catalog search/ownership, workflow notifications, scheduled distribution และ fine-grained collaboration |
| Permission ขั้นต่ำสำหรับ author/publisher/caller/download เมื่อเป็น shared server | Multi-tenant governance, enterprise identity และ retention policies ตาม deployment |

Authoring controls ต้องใช้ keyboard ไปยัง field/tree/properties/dialog ได้, มี focus ที่มองเห็น, labels และ error messages ที่เชื่อม control. การลากวางต้องมี keyboard alternative ตาม [WAI keyboard practices](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/); ยังไม่อ้าง accessibility compliance ของ product/PDF.

**Open decisions:** ผู้ใช้หลัก, policy เก็บ artifact vs re-render, retention/PII, การ publish แบบ approval, read permissions, canonical definition, ที่เก็บ assets และ actual preview parity. ไม่รัน Engine หรือแก้ระบบในงานนี้.
