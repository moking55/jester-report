# Implementation Plan: `studio`

สถานะ: **เสร็จ — Checkpoint B ผ่าน ผู้ใช้ตรวจรับแล้ว** (15 พฤศจิกายน 2026)
Spec: [SPEC-studio.md](../../SPEC-studio.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

เริ่มจากส่วนที่ backend ต้องเพิ่ม (Prepared data และ theme) ให้ contract พร้อมก่อน แล้วสร้าง Next.js app ทีละชั้น: โครง + ตัวตน + theme → workspace (หัวใจของ Studio) → publish/render/history → settings + theme editor → E2E เต็มบน VM
Phase 1 จบด้วย studio ที่ deploy ใน compose แล้ว login ได้และสลับ theme ได้ เพื่อให้ E2E รอบแรกตรวจท่อทั้งหมด (cookie, Server Actions, proxy) ได้ก่อนลงรายละเอียดหน้าจอ

## Architecture Decisions

- **Contract ก่อนเสมอ:** endpoint ใหม่ (prepared, themes) เข้า `public-api.yaml` ก่อน → test contract ของ api บังคับ → `npm run gen:api` ให้ studio ได้ type ใหม่
- **Theme = token ที่ตรวจแล้วเท่านั้น:** backend ตรวจ token กับ allow-list และรูปแบบค่า; studio ตรวจซ้ำก่อนสร้าง `<style>:root{…}</style>` (defence in depth) — ค่าที่ไม่ผ่าน regex ถูกตัดทิ้ง ไม่ escape แล้วใส่
- **built-in theme อยู่ในโค้ด backend** (`classic`, `suriyan` เป็นค่าคงที่ใน `themes/builtin.py`) ไม่อยู่ในตาราง จึงลบ/แก้ไม่ได้โดยโครงสร้าง; ตาราง `themes` เก็บเฉพาะที่ผู้ใช้สร้าง + แถว `theme_default`
- **API client ฝั่ง server เท่านั้น:** `lib/api.ts` import `server-only`; ESLint `no-restricted-imports` ห้าม `lib/api` ใน Client Components และห้าม state library อื่นนอกจาก `use-immer`
- **Server Actions คืนผลเป็น union** (`{ok, data} | {ok:false, problem}`) ไม่ throw ข้ามขอบ server/client; หน้า Server Component ที่เจอ 401 → `redirect("/login")`
- **PDF preview:** Client ส่ง form POST (params/data ถ้ามี) ไปที่ Route Handler `preview/[id]` โดยตั้ง `target` เป็นชื่อของ `<iframe>`; Route Handler เรียก api ด้วย session จาก cookie แล้วตอบ PDF ตรง (`Content-Type: application/pdf`, `Cache-Control: no-store`) — browser ไม่เห็น api และไม่ต้องเก็บ PDF ไว้ที่ใด
- **เวอร์ชัน:** pin Next.js/React/CodeMirror เป็นรุ่น stable ที่ออกมาอย่างน้อย 2 สัปดาห์ ณ วันเริ่ม T2 (ตรวจจาก npm registry แล้วบันทึกไว้ใน package.json แบบ exact)

## Dependency Graph

```
T1 backend: prepared + themes (contract, store, routes, tests)
 └── T2 studio scaffold: Next, ESLint rules, gen:api, lib/api + session, tokens.css + theme injection, Dockerfile + compose
      └── T3 setup/login/logout + shell ตาม mockup ──── Checkpoint A (E2E บน VM: setup, login, สลับ theme)
           ├── T4 catalog + workspace (editor, save/412, validate/gutter, Prepared data, Provenance, preview)
           ├── T5 publish/versions/rollback/reset + Render dialog + history/retention
           └── T6 settings: users, API keys, password, theme editor (form, preview, import/export, default)
                └── T7 E2E เต็มบน VM + เก็บรายละเอียดให้ตรง mockup ── Checkpoint B
```

T4, T5, T6 ขึ้นกับ T3 แต่แตะไฟล์คนละชุด

## Task List

### Phase 1: backend ที่ต้องเพิ่ม + โครง Studio
- [x] T1: backend — `POST draft/prepared`, theme store (`0004_themes.sql`, built-in 2 แบบ, ตรวจ token), 6 endpoint ของ theme; contract + pytest
- [x] T2: studio scaffold — Next.js (pin), ESLint rules, `gen:api`, `lib/api.ts` + session cookie + client IP, `tokens.css` (classic, suriyan) + ใส่ theme ใน layout, Vitest, Dockerfile, service `studio` ใน compose
- [x] T3: หน้า setup, login, logout, shell (header/status bar ตาม mockup), 401 → login, เลือก theme ส่วนตัว (cookie)

### Checkpoint A
- [x] Vitest/build/lint ผ่าน; Playwright บน compose ที่ VM: setup → login → สลับ classic/suriyan → logout; ไม่มี request จาก browser ไป api

### Phase 2: หน้าจอหลัก
- [x] T4: catalog (สร้างจาก starter) + workspace (ไฟล์, CodeMirror, บันทึก + 412, validate + gutter, แท็บ Problems/Prepared data/Provenance, preview ใน iframe)
- [x] T5: publish (422 → problems), versions + rollback + reset, Render dialog + ตัวอย่าง curl, history + cursor + นโยบายเก็บพร้อมตัวเลขที่จะลบ
- [x] T6: settings — ผู้ใช้, API key (secret ครั้งเดียว), เปลี่ยนรหัส, theme editor (ฟอร์ม token + ตัวอย่างสด, ทำสำเนา, import/export JSON, ตั้งค่าเริ่มต้น)
- [x] T7: E2E เต็มบน VM + ปรับหน้าตา catalog/workspace/history ให้ตรง mockup ใน theme classic

### Checkpoint B
- [x] Success criteria 1–5 ของ spec ผ่าน; ผู้ใช้ตรวจรับและอนุมัติปิดงาน 15 พฤศจิกายน 2026 ("ผ่านครับปิดงานได้")

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Next.js เวอร์ชันใหม่เปลี่ยน API ของ Server Actions/cookies | กลาง | pin exact; อ่าน release notes ของรุ่นที่เลือกก่อนเขียน; build ทุก task |
| PDF preview ต้องส่ง body (params/data) แต่ iframe ทำได้แค่ GET/POST form | กลาง | form POST ไป Route Handler ที่ `target` เป็น iframe (ตัดสินใน T4 พร้อม test) |
| CSS injection ผ่าน theme | สูง | allow-list + regex ที่ backend และตรวจซ้ำตอนสร้าง `<style>`; test ด้วยค่าที่มี `;}` และ `</style>` |
| E2E ช้าเพราะต้อง build image และ tunnel | กลาง | รันเฉพาะ checkpoint ตามที่ตกลง; ระหว่าง task ใช้ Vitest/build |
| ระยะห่างระหว่าง mockup (HTML นิ่ง) กับ component จริง | ต่ำ | ดึง CSS ของ mockup มาเป็น token ของ classic ก่อน แล้วเทียบภาพใน T7 |
| ขอบเขตใหญ่ (backend + frontend ทั้งหมด) | สูง | แบ่ง checkpoint ชัด; ถ้า T4 ใหญ่เกิน (>5 ไฟล์หลัก) แตกย่อยเมื่อเริ่ม |

## Open Questions

ไม่มี (ปิดใน interview ของ spec)

---

## รอบ 2: ปรับปรุงหลังปิดงาน (16 พฤศจิกายน 2026)

สถานะ: **ผู้ใช้อนุมัติ 17 พฤศจิกายน 2026 — กำลังทำ** · Task list: [todo.md](todo.md#รอบ-2-ปรับปรุงหลังปิดงาน)

คำขอ 4 ข้อจากผู้ใช้: (1) upload รูปได้ทุกชนิดยกเว้น gif (2) diff ระหว่าง version ก่อน publish หรือ rollback (3) เพิ่มผู้ใช้เป็นปุ่ม (4) ย้ายนโยบายเก็บประวัติไปหน้าตั้งค่า

### สิ่งที่พบในโค้ด

- ชนิด asset ประกาศซ้ำ 6 ที่: `template_store/assets.py` (`CONTENT_TYPES`, `_MAGIC`), `template_store/store.py` (`ASSET_FILE`), `public-api.yaml` (pattern `AssetName`, content type ของ `getDraftAsset`, คำอธิบาย upload), `lib/actions/draft.ts` (`ASSET_NAME`), `components/FilePanel.tsx` (`ASSET`, `IMAGE`, `accept`) ตอนนี้รับ png/jpeg/svg; gif ไม่เคยรับอยู่แล้ว
- diff ไม่ต้องแก้ backend: `GET …/versions/{v}` คืน `files` + `assets` (มี `sha256`) ครบ และ draft อยู่ใน state ของ workspace แล้ว
- Publish ใช้ `prompt()` ขอโน้ต, "ตั้งเป็น published" และ "reset draft" ใช้ `confirm()` ทั้งหมดยังไม่เห็นว่าอะไรจะเปลี่ยน
- ฟอร์มเพิ่มผู้ใช้วางเปิดค้างใต้ตาราง (`UsersPanel.tsx`); นโยบายเก็บอยู่ท้าย `history/page.tsx` และ `lib/actions/runs.ts` redirect กลับ `/history?retention=…`
- E2E ไม่แตะฟอร์มผู้ใช้หรือนโยบายเก็บ

### Architecture Decisions

- **ชนิดรูปที่เพิ่ม: webp, avif, bmp** (Chromium ใน Gotenberg แสดงได้ทั้งหมด) ตรวจจาก magic bytes แบบเดิม: webp = `RIFF????WEBP`, avif = `????ftypavif|ftypavis`, bmp = `BM`; gif ยังตอบ `UNSUPPORTED_MEDIA_TYPE` และมี test ยืนยัน · ไม่รับ tiff (Chromium แสดงไม่ได้) และ ico
- **diff ทำที่ Studio ทั้งหมด** ด้วย `@codemirror/merge` 6.12.3 (pin exact, ออก 19 ต.ค. 2026) เพราะใช้ CodeMirror อยู่แล้ว สีตาม theme เดิม; dependency ใหม่ 1 ตัว ทางเลือกที่ไม่เลือก: `diff` (jsdiff) ต้องเขียน UI แสดงผลเอง
- **ฟังก์ชันเทียบเป็น pure** ใน `lib/diff.ts`: รับไฟล์สองชุด คืนรายชื่อ เพิ่ม/ลบ/แก้/เหมือน; asset เทียบด้วย `sha256` (รูปแสดงแค่ชื่อและสถานะ ไม่ diff bytes) — มี Vitest
- **diff dialog ตัวเดียวใช้ 3 ที่** และปุ่มยืนยันอยู่ใน dialog แทน `prompt()`/`confirm()`:
  - Publish: draft ปัจจุบัน (รวมที่ยังไม่บันทึก) เทียบ version ที่ published + ช่องโน้ต; ยังไม่เคย publish ก็แสดงว่าเป็น v1
  - ตั้งเป็น published: vN เทียบ version ที่ published อยู่
  - reset draft: draft เทียบ vN
- **เพิ่มผู้ใช้:** ปุ่ม "+ เพิ่มผู้ใช้" เหนือตาราง เปิด `<dialog>` ที่มีฟอร์มเดิม ปิดเองเมื่อสำเร็จ มีปุ่ม × แบบเดียวกับ Render dialog
- **นโยบายเก็บ:** แท็บใหม่ "ประวัติ Render" ในตั้งค่า (`/settings?tab=retention`) ย้ายโค้ดเดิมมาเป็น component; action redirect มาที่แท็บนี้; หน้า history เหลือลิงก์เล็ก "ตั้งนโยบายเก็บ" ไปที่แท็บ

### ลำดับ

U1 (เพิ่มผู้ใช้) → U2 (นโยบายเก็บ) → U3 (ชนิดรูป) → U4a (diff ใน Versions) → U4b (diff ตอน Publish) → Checkpoint C
U1–U3 แยกกันอิสระ; U4b ใช้ dialog จาก U4a

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| เปลี่ยน contract (pattern ของ `AssetName`) — client ที่ตรวจชื่อไฟล์ด้วย pattern เก่าจะไม่รู้จักนามสกุลใหม่ | ต่ำ (ขยายอย่างเดียว ไม่ตัดของเดิม) | `gen:api` + CI ตรวจ `types.gen.ts`; ย้อนได้ด้วย revert commit |
| avif ตรวจ magic ผิด (brand อื่นเช่น `mif1`) แล้วปฏิเสธไฟล์จริง | กลาง | test ด้วยไฟล์ avif จริงจาก encoder; ถ้าพบ brand อื่นค่อยเพิ่ม |
| diff ของไฟล์ใหญ่ช้าใน browser | ต่ำ (ไฟล์ข้อความต่อ template จำกัดขนาดอยู่แล้ว) | โหลด version เมื่อเปิด dialog เท่านั้น |
| bundle ของ workspace ใหญ่ขึ้นจาก `@codemirror/merge` | ต่ำ | ตอนทำจริงไม่ได้ใช้ `next/dynamic`: workspace โหลด CodeMirror อยู่แล้ว ส่วนที่เพิ่มเล็ก |

### Open questions

- ชนิดรูปที่เพิ่ม webp/avif/bmp พอไหม หรือต้องการ ico ด้วย (ผู้ใช้อนุมัติแผนโดยไม่ระบุ จึงใช้ webp/avif/bmp)
- ชื่อแท็บในตั้งค่า: ใช้ "ประวัติ Render" ตามค่าเริ่มต้นในแผน
