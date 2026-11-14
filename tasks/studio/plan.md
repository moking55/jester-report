# Implementation Plan: `studio`

สถานะ: **ร่าง รออนุมัติ** (15 พฤศจิกายน 2026)
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
- [ ] Vitest/build/lint ผ่าน; Playwright บน compose ที่ VM: setup → login → สลับ classic/suriyan → logout; ไม่มี request จาก browser ไป api

### Phase 2: หน้าจอหลัก
- [ ] T4: catalog (สร้างจาก starter) + workspace (ไฟล์, CodeMirror, บันทึก + 412, validate + gutter, แท็บ Problems/Prepared data/Provenance, preview ใน iframe)
- [ ] T5: publish (422 → problems), versions + rollback + reset, Render dialog + ตัวอย่าง curl, history + cursor + นโยบายเก็บพร้อมตัวเลขที่จะลบ
- [ ] T6: settings — ผู้ใช้, API key (secret ครั้งเดียว), เปลี่ยนรหัส, theme editor (ฟอร์ม token + ตัวอย่างสด, ทำสำเนา, import/export JSON, ตั้งค่าเริ่มต้น)
- [ ] T7: E2E เต็มบน VM + ปรับหน้าตา catalog/workspace/history ให้ตรง mockup ใน theme classic

### Checkpoint B
- [ ] Success criteria 1–5 ของ spec ผ่าน; ผู้ใช้ทบทวน

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
