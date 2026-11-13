# T27 — Digital Signature และ Key Lifecycle

ตรวจเอกสาร: 13 พฤศจิกายน 2026  
สถานะ: desk study ไม่มี key/certificate จริง ไม่เรียก TSA ไม่รัน Gotenberg/Docker/openssl; **live signing, validation และ timestamp = not-tested** ทุกข้อ. ไม่ใช่คำแนะนำทางกฎหมาย ไม่เลือก vendor/license/architecture แทนผู้ใช้

ป้ายสถานะ: **documented** = มีใน source ที่เปิดอ่านจริง, **inferred** = อนุมานจาก documented/ความรู้ทั่วไป ยังไม่ยืนยัน, **unknown** = ต้องตรวจ/ตัดสินใจเพิ่ม

## 1. ภาพลายเซ็น vs cryptographic signature

| | ภาพ/ช่องลายเซ็น (signature placeholder) | Cryptographic signature |
| --- | --- | --- |
| สิ่งที่เป็น | เนื้อหาที่วาดบนหน้า (เช่น ช่อง "ผู้อนุมัติ" ใน [T01](01-product-brief.md), stamp-image) | ค่า signature + certificate ใน PDF ผูกกับ byte range ของไฟล์ |
| ตรวจการแก้ไขหลังออกเอกสาร | ไม่ได้ ใครก็คัดลอก/วางภาพได้ | ตรวจได้ว่า bytes ที่เซ็นเปลี่ยนหรือไม่ (inferred จากหลักการ signature) |
| ระบุตัวผู้เซ็น | ไม่ได้ | ผ่าน certificate + trust chain; "trusted" ขึ้นกับ trust store ของผู้ตรวจ |
| Gotenberg | `stamp-image` ฯลฯ ([T25](25-pdf-capabilities.md)) | `/forms/pdf/sign`, `/forms/pdf/timestamp` |

ข้อสรุป (inferred): signature placeholder ที่ T01 ระบุเป็นเรื่อง layout ปกติ ไม่ต้องมี key; cryptographic signing เป็น requirement แยกที่ T01 ยังไม่ยืนยันว่าต้องมีใน MVP.

## 2. Gotenberg sign / timestamp (documented, version 9.x docs)

แหล่ง: [sign](https://gotenberg.dev/docs/pdf/sign), [timestamp](https://gotenberg.dev/docs/pdf/timestamp), [outbound](https://gotenberg.dev/docs/operate/outbound) เปิดอ่าน 13 พ.ย. 2026; หน้า docs **ไม่ระบุ release ที่เริ่มมี route** → pin และตรวจ release note ก่อนใช้

| Route / option | Documented | หมายเหตุ |
| --- | --- | --- |
| `POST /forms/pdf/sign` | standalone, stage `sign` ใน `/forms/pdf/pipe`, และใน `stages` ของ Chromium/LibreOffice | คืน PDF ที่เซ็น หรือ ZIP เมื่อส่งหลายไฟล์ |
| `certificate` (required) | ไฟล์ PKCS#12 หรือ PEM cert (ใช้กับ `key`) | key/cert ถูก **ส่งไปกับ request** → engine เห็น private key (inferred ผลต่อ custody ดู §4) |
| `key`, `certificatePassword` | PEM private key; รหัส PKCS#12 | password เป็น form field |
| `reason`, `location`, `contactInfo`, `name` | แสดงใน signature panel | ไม่มี default ใน docs |
| `pades` (bool, default false) | สร้าง PAdES ซึ่งหน้า docs ระบุว่า eIDAS รับรู้ | **ไม่ระบุว่าได้ระดับ B-B/B-T/B-LT/B-LTA** (unknown) |
| `timestampUrl` | RFC 3161 TSA; operator กำหนดว่า Gotenberg เรียก authority ใดได้ | ใช้กับ sign เพื่อ timestamp ลายเซ็น |
| `POST /forms/pdf/timestamp` | ต้องมี `timestampUrl` (http/https); document timestamp **ไม่ระบุตัวผู้เซ็น** | ถ้าต้องการ timestamp ของ signature ให้ใช้ `sign`+`timestampUrl` |
| ข้อจำกัด | self-signed ถูก viewer ตีเป็น untrusted; เซ็นได้ครั้งเดียวต่อ stage list; หลัง sign ตามได้เฉพาะ `timestamp`/`render`; PDF ที่ encrypt เซ็นใน request เดียวไม่ได้ (decrypt ก่อน แล้วเซ็นใน request ถัดไป) | สอดคล้อง order rules [T25 §2](25-pdf-capabilities.md) |
| Egress | `timestampUrl` ถูกควบคุมด้วย family **PDF**: `--pdf-allow-list`, `--pdf-deny-list`, `--pdf-deny-private-ips` (`*_DENY_PUBLIC_IPS`, `*_ENABLE_ENVIRONMENT_PROXY` ตาม outbound page); refused → `403` | deny ชนะ; allow-list ที่ match ข้าม IP-class checks; default เข้าถึงทุก address ที่ network ถึง |

**ไม่พบใน docs ที่เปิดอ่าน (unknown):** การเรียก OCSP/CRL ของ Gotenberg, การฝัง validation data (LT/LTA), external signer/HSM/PKCS#11 interface, การแสดง visible signature appearance. อย่าสมมติว่ามี.

## 3. PAdES ระดับแนวคิด

มาตรฐาน: ETSI EN 319 142-1 (PAdES baseline; DSS doc อ้าง v1.2.1, 2024-01) — เปิด PDF ของ ETSI แล้วอ่านข้อความไม่ได้ในงานนี้ จึง **ไม่ได้ตรวจ clause โดยตรง**; คำอธิบายด้านล่างเป็น inferred จากความรู้ทั่วไปของ baseline profiles และต้องตรวจกับ standard ก่อนอ้าง

| ระดับ | แนวคิด (inferred) | สิ่งที่ต้องมี/พึ่งพา |
| --- | --- | --- |
| B-B | ลายเซ็น + signing certificate อ้างอิงได้ | cert/key; ผู้ตรวจต้องหา chain และ revocation เอง ณ เวลาตรวจ |
| B-T | B-B + timestamp พิสูจน์ว่าลายเซ็นมีอยู่ก่อนเวลาหนึ่ง | TSA (external egress) |
| B-LT | B-T + เก็บ validation data (chain, OCSP/CRL) ไว้ในไฟล์ | เข้าถึง OCSP/CRL ตอนเซ็น (egress เพิ่ม) |
| B-LTA | B-LT + document timestamp ต่ออายุได้เพื่อเก็บยาว | TSA ซ้ำเป็นระยะ; ต้องมีกระบวนการ re-timestamp |

Gap: Gotenberg `pades=true` + `timestampUrl` จะได้ระดับใด และใส่ validation data หรือไม่ = **unknown / not-tested** (ต้องตรวจด้วย verifier ใน environment ที่อนุญาต). MVP ไม่ควรอ้างระดับใดจนกว่าจะทดสอบ.

## 4. Key custody: local test key vs external signer/HSM/cloud signing

ตารางนี้เป็น contract-level เชิงแนวคิด ไม่ระบุ vendor ราคา "ต้นทุน" เป็นระดับสัมพัทธ์ (inferred) ไม่ใช่ตัวเลข

| ทางเลือก | ใครถือ private key | Fit กับ Gotenberg route ที่ documented | ต้นทุนสัมพัทธ์ | ความเสี่ยงหลัก |
| --- | --- | --- | --- | --- |
| A. Test key ชั่วคราว (self-signed) | ผู้ทดลอง/เครื่อง dev | ส่ง `certificate`/`key` ตรง | ต่ำสุด | untrusted ใน viewer; ห้ามใช้กับเอกสารจริง; key หลุดใน log/backup/request |
| B. Key ไฟล์ (PKCS#12/PEM) จาก CA จริง ผ่าน secret manager | service/ops | ส่งไปกับ request ถึง engine ได้ตรงตาม docs | กลาง (ค่า cert + ops) | engine และ network path เห็น key; blast radius สูงถ้า engine ถูกบุก ([T04](04-threat-model.md)); rotation เป็นงาน ops |
| C. External signer / HSM / cloud KMS signing | ผู้ให้บริการ/HSM; key export ไม่ได้ | **ไม่มี route ที่ documented** → ต้องมี signer service ภายนอก Gotenberg (เช่น ส่ง hash ไปเซ็นแล้วฝังเอง) = integration ใหม่ | สูง (ค่า HSM/บริการ, งานพัฒนา, latency) | ความซับซ้อน/ความถูกต้องของ PDF signing ที่ทำเอง; availability พึ่งบริการภายนอก; audit/ควบคุมการเรียกเซ็น |
| D. ผู้ใช้เซ็นเองด้วย token/โปรแกรมภายนอก | ผู้ใช้ปลายทาง | อยู่นอกระบบ (ระบบส่ง PDF ที่ยังไม่เซ็น) | ย้ายภาระไปผู้ใช้ | UX/ไม่ automated; ไม่ตรงกับ batch signing |

ข้อสังเกต (inferred): ถ้าต้องเก็บ key ไม่ให้เข้า engine ต้องใช้ C/D ซึ่ง Gotenberg docs ที่อ่านไม่รองรับโดยตรง; ถ้าใช้ B ต้องถือว่า engine เป็นส่วนของ trusted computing base และต้องแยก network/secrets. ไม่เลือกทางเลือกแทนผู้ใช้.

## 5. Certificate chain, revocation, TSA = external egress boundary

- Trust chain: ผู้ตรวจต้องมี root/intermediate ที่เชื่อถือ; self-signed = untrusted (documented). ใครเชื่อ root ใด = ขึ้นกับ viewer/trust store (inferred).
- Revocation (OCSP/CRL) และ TSA เป็นการเรียกเครือข่ายภายนอก: ฝั่งเซ็น (`timestampUrl` documented) และฝั่งตรวจ (ขึ้นกับ verifier, unknown). ข้อมูลที่ออกไป: hash/request ไม่ใช่เนื้อ PDF สำหรับ RFC 3161 (inferred; ยังไม่ได้เปิด RFC ในงานนี้) แต่ยังเผย IP, เวลา, ความถี่การเซ็น
- Threat model ([T04](04-threat-model.md) D07-EGRESS, [T22](22-security-review.md)): `timestampUrl` ที่มาจาก request payload = SSRF/egress vector ให้ผูกเป็น **server-side config + allow-list** ไม่รับจากผู้ใช้; ตั้ง `--pdf-allow-list` เฉพาะ TSA ที่อนุมัติ, `--pdf-deny-private-ips`; refused → 403 (documented). allow-list match ข้าม IP-class checks (documented) จึงเขียน pattern ให้แคบและทดสอบ proxy
- Availability: TSA/OCSP ล่ม → ต้องมี policy ว่า job fail, retry ([T19](19-job-processing.md)) หรือออกเอกสารโดยไม่มี timestamp (ตัดสินใจโดยผู้ใช้)

## 6. แก้ไขหลังเซ็น: incremental update vs rewrite

อ้างกฎ [T25 §2](25-pdf-capabilities.md) และ [sign docs](https://gotenberg.dev/docs/pdf/sign) (documented):

| การกระทำหลังเซ็น | Gotenberg ตาม docs | ผลที่คาด |
| --- | --- | --- |
| `merge`, `select`, `remediate` (PDF/A/UA/Factur-X), `optimize` | **ปฏิเสธ** PDF ที่เซ็นแล้ว | ทำก่อนเซ็น; อยากรวมเอกสารที่เซ็นแล้ว = ไม่ผ่าน route นี้ |
| stamp, rotate, metadata, bookmarks, attach, tags | append (incremental) → คงลายเซ็นเดิม | **คง bytes ≠ valid**: verifier อาจเตือนว่ามีการเปลี่ยนแปลงหลังเซ็น ตาม permission/certification (inferred, ตาม T25 ข้อ 5); not-tested |
| `encrypt` | ไม่รวมกับ sign/timestamp ใน stage list เดียว; PDF ที่ encrypt เซ็นไม่ได้ใน request เดียว | ลำดับที่ปลอดภัยที่สุด (inferred): content changes → remediate → sign → timestamp; encryption หลังเซ็นต้องตรวจเป็น case แยก ไม่ assume ลายเซ็นยังตรวจได้ |
| `decrypt` → sign | ต้องแยก request | ไฟล์ decrypted ชั่วคราวเป็นข้อมูลอ่อนไหว ([T20](20-access-data-lifecycle.md) temp cleanup) |

ผลต่อ design: pipeline เสนอ "sign เป็นขั้นท้ายสุด" และ artifact ที่เซ็นแล้วเป็น immutable; ต้องการแก้ = ออก artifact ใหม่แล้วเซ็นใหม่ (inferred).

## 7. ความเชื่อถือในไทย

**unknown / ต้องตรวจกฎหมายโดยผู้เชี่ยวชาญ**: สถานะตามกฎหมายไทยของลายเซ็นอิเล็กทรอนิกส์/ดิจิทัลแต่ละประเภท, ความต้องการ CA ที่ได้รับการรับรอง, ความสัมพันธ์กับ e-tax/e-invoice และการเก็บรักษา ไม่ได้ศึกษาในงานนี้ และ eIDAS ที่ Gotenberg docs อ้างเป็นกรอบ EU ไม่ใช่ไทย. ไม่มีข้อสรุปว่า PAdES/Gotenberg เพียงพอตามกฎหมายใดๆ

## 8. Walkthrough (tabletop, ไม่ใช่ผลทดสอบ)

1. **Key rotation (cert ใหม่):** เตรียม cert/key ใหม่ใน secret store → ปล่อยให้ signer ใช้ reference ใหม่ → เอกสารเก่าที่เซ็นแล้วไม่ถูกแก้; ตรวจเอกสารเก่าด้วย trust chain เดิมต้องยังเก็บ chain/validation data (LT/LTA) หรือ trust anchors เดิม. Key เก่าหลุด → revoke + ประเมินเอกสารที่เซ็นด้วย key นั้น (ต้อง timestamp เพื่อพิสูจน์เวลา). อ้าง audit log ของ key id/cert serial ไม่ใช่ key ([T20](20-access-data-lifecycle.md))
2. **Cert หมดอายุ:** ก่อนหมด: monitor วันหมดอายุ; หลังหมด: เซ็นใหม่ไม่ได้ (ตาม verifier); เอกสารที่เซ็นขณะ valid และมี timestamp อาจยัง validate ได้ ณ เวลาเซ็น (inferred; ขึ้นกับ verifier/level) — Gotenberg ไม่ได้ระบุพฤติกรรมนี้ → unknown
3. **Cert ถูก revoke:** job ใหม่ควร fail ก่อนเซ็น (ต้องมี pre-check เองเพราะ docs ไม่ระบุว่า Gotenberg ตรวจ revocation → unknown); เอกสารเก่าที่ตรวจหลัง revoke: ผลขึ้นกับเวลา revoke เทียบเวลา timestamp. ต้องมี policy re-issue
4. **Validation fail:** สาเหตุ (inferred): untrusted chain (self-signed), modified after signing, ไม่มี timestamp/revocation data, offline OCSP, post-sign edit. ระบบต้องแยก "signing สำเร็จ" ออกจาก "ผู้รับตรวจผ่าน"; เก็บ verifier report เป็นส่วนของ validation ([T25](25-pdf-capabilities.md)/T26)
5. **TSA ล่ม/ถูกบล็อก:** 403 (allow-list) หรือ network error → policy fail/retry/ข้าม timestamp ตามผู้ใช้เลือก

## 9. ใครถือ key ตาม deployment

| Deployment | ผู้ถือ key (proposed) | ประเด็น |
| --- | --- | --- |
| Library (ฝังในแอปผู้ใช้) | แอปโฮสต์/ผู้ใช้ระบบ | เราไม่เก็บ key; ต้องมี contract ให้โฮสต์ส่ง signer/secret ref; ความรับผิดชอบ custody อยู่ที่โฮสต์ |
| Local (เครื่องเดียว/dev) | ผู้ใช้เครื่อง; ใช้ test key เท่านั้นสำหรับทดลอง | key ในไฟล์/โฟลเดอร์ → ความเสี่ยง backup/log; ไม่เหมาะ production signing |
| Shared server | operator/service principal; อาจหลายผู้เช่า | ต้องกำหนดว่า tenant ใดใช้ cert ใด (ห้ามข้าม tenant), สิทธิ์ "sign" แยกจาก run/download ตาม [T20 matrix](20-access-data-lifecycle.md), audit ทุกการเซ็น, secret ไม่อยู่ใน template/log/URL |

ไม่มีใครเลือกเป็นผู้ถือ key ถาวรแทนผู้ใช้; เป็น open decision.

## 10. Open decisions / งานทดลองต่อ

Open decisions สำหรับ T29: ต้องมี cryptographic signature ใน MVP หรือไม่; ต้องการ PAdES ระดับใด; custody แบบ A-D; ใครเป็น CA/TSA; นโยบายเมื่อ TSA ล่ม; ข้อกำหนดทางกฎหมายไทย; signature ต่อ tenant.

งานทดลองต่อ (ต้อง environment/cert ที่ผู้ใช้อนุมัติ, deferred ทั้งหมด): ดู [signature-scenarios.json](../../../research/specimens/signature-scenarios.json) SIG-01..SIG-10. ไม่มีข้ออ้างผลเซ็นจริง.
