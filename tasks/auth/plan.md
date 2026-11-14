# Implementation Plan: `auth`

สถานะ: **ร่าง รออนุมัติ** (14 พฤศจิกายน 2026)
Spec: [SPEC-auth.md](../../SPEC-auth.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

สร้าง module ที่บอก `public-api` ว่าใครเรียก: first-run setup ด้วย token ใน DB, session token ที่ต่ออายุอัตโนมัติ, ผู้ใช้สิทธิ์เท่ากัน, API key, เปลี่ยนรหัสผ่าน และคำสั่งกู้บัญชี
เริ่มจากย้าย migration runner ไปเป็นของกลาง แล้วทำชิ้นที่ไม่ใช้ DB (hash, token) ก่อนต่อด้วย setup/ผู้ใช้ และ session/API key

## Architecture Decisions

- **migration เป็นของกลาง:** ย้าย `template_store/migrate.py` และ `migrations/` ไป `jester_api/db/`; เปลี่ยนชื่อ `0001_init.sql` เป็น `0001_template_store.sql` (ยังไม่เคยรันนอก schema ทดสอบ) แล้วเพิ่ม `0002_auth.sql`
- **นาฬิกาเป็น parameter:** `Auth(db, clock=…)` เพื่อทดสอบหมดอายุ, ต่ออายุ และเกณฑ์ 15 นาทีโดยไม่ต้องรอจริง; SQL ใช้เวลาที่ส่งเข้าไป ไม่ใช้ `now()` ของ DB ในส่วนที่ต้องทดสอบเวลา
- **hash ไม่ขวาง event loop:** `hash_password`/`verify_password` เป็น async ภายในใช้ `asyncio.to_thread` กับ semaphore 4 งาน; ค่า scrypt จริง (`n=2**15`, `maxmem=64 MiB`) ใช้ใน test ด้วย
- **ต่ออายุ session:** `authenticate` อ่าน session; ถ้า `expires_at - now < 6 ชม.` → `UPDATE … SET expires_at = least(now + 12 ชม., created_at + 7 วัน)`; ไม่เขียนถ้าเหลือมากกว่า 6 ชม.
- **ล็อกก่อนลบผู้ใช้:** `SELECT … FROM users FOR UPDATE` ทั้งตาราง (ผู้ใช้มีไม่กี่คน) แล้วนับ จึงลบพร้อมกันแล้วเหลือศูนย์ไม่ได้
- **setup token:** `prepare_setup()` ใน transaction พร้อม advisory lock: ถ้ามีผู้ใช้ → ลบ token และคืน `None`; ถ้ามี token อายุ < 5 นาที → คืน `None` (process อื่นพิมพ์ไปแล้ว); ไม่งั้นแทนด้วย token ใหม่และคืนค่าให้ผู้เรียกพิมพ์

## Dependency Graph

```
T1 db (ย้าย migration) ──┬── T3 setup + users ── T4 sessions + login ── T5 API keys + reset CLI + contract
T2 passwords + tokens ───┘
```

T1 และ T2 ไม่ขึ้นกับกัน

## Task List

### Phase 1: พื้นฐาน
- [ ] T1: ย้าย migration runner ไป `jester_api/db/` และปรับ template-store/test ให้ใช้ที่ใหม่
- [ ] T2: `passwords.py` (scrypt + thread + semaphore + needs_rehash) และ `tokens.py` (สร้าง/ sha256/ prefix)
- [ ] T3: `0002_auth.sql` + setup (`prepare_setup`, `setup_required`, `complete_setup`) + ผู้ใช้ (`list_users`, `create_user`, `delete_user`)

### Checkpoint A
- [ ] tests T1–T3 ผ่าน (รวม `db` บน VM), test เดิมของ template-store ผ่านหลังย้าย migration, ruff สะอาด

### Phase 2: session และ API key
- [ ] T4: `login` (rate limit ต่อ username+IP, dummy hash, rehash), `logout`, `authenticate` (session ต่ออายุ + API key), `change_password`
- [ ] T5: API key (`create`/`list`/`revoke`, `lastUsedAt` นาทีละครั้ง), `reset_password` + `python -m jester_api.auth reset-password`, เพิ่ม `PUT /v1/auth/password` ใน contract

### Checkpoint B
- [ ] Success criteria 1–5 ของ spec ผ่าน; ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| scrypt จริงทำให้ test ช้า (0.1 วินาทีต่อครั้ง) | ต่ำ | test ส่วนใหญ่สร้างผู้ใช้ไม่กี่ครั้ง; ยังใช้ค่าจริงตาม spec |
| test เวลา (หมดอายุ, 15 นาที) เปราะถ้าใช้ `now()` ของ DB | กลาง | ส่งเวลาจาก `clock` เข้า SQL ทุกที่ที่ทดสอบเวลา |
| test `db` ช้าเพราะ latency ของ tunnel | ต่ำ | รัน `db` เป็นชุดแยก; unit test ของ hash/token ไม่ต้องใช้ DB |
| ย้าย migration แล้ว template-store พัง | ต่ำ | ทำใน commit เดียวพร้อมรัน test `db` ของ template-store |
| ชื่อผู้ใช้ไม่สนตัวพิมพ์ (`Alice` = `alice`) แต่แสดงตามที่สมัคร | ต่ำ | unique index บน `lower(username)` และค้นด้วย `lower()` ทุกที่ |

## Open Questions

ไม่มี (ปิดใน interview ของ spec)
