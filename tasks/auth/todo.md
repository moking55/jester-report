# Tasks: `auth`

แผน: [plan.md](plan.md) · Spec: [SPEC-auth.md](../../SPEC-auth.md)
คำสั่ง test: `cd apps/api && uv run ruff check . && uv run pytest tests -q --cov=jester_api.auth --cov-report=term-missing`
DB: `JESTER_TEST_DATABASE_URL=postgresql://jester:jester-dev@127.0.0.1:5432/jester uv run pytest -m db -q` (ผ่าน SSH tunnel ไป VM)

## Phase 1: พื้นฐาน

### T1: migration เป็นของกลาง

**Description:** ย้าย `template_store/migrate.py` และ `template_store/migrations/` ไป `jester_api/db/`; เปลี่ยนชื่อ `0001_init.sql` → `0001_template_store.sql`; แก้ import ใน template-store และ test

**Acceptance criteria:**
- [x] `from jester_api.db import migrate` ใช้ได้ และ template-store ไม่มี `migrate.py` แล้ว
- [x] test `db` ของ template-store ทั้งหมดผ่านกับ path ใหม่
- [x] test เดิมที่ไม่ใช้ DB ผ่านทั้งหมด

**Verification:**
- [x] `uv run pytest tests -q` และ `-m db` ใน `tests/template_store`

**Dependencies:** None
**Files likely touched:** `db/{__init__,migrate}.py`, `db/migrations/*`, `template_store/__init__.py`, `tests/template_store/{conftest,test_migrations}.py`
**Estimated scope:** S

### T2: passwords + tokens

**Description:** `hash_password`/`verify_password` (async; scrypt `n=2**15, r=8, p=1, maxmem=64 MiB`, salt 16 byte, รูปแบบ `scrypt$n$r$p$salt$hash`, ผ่าน `asyncio.to_thread` + semaphore 4) และ `needs_rehash`; `new_token(prefix)`, `sha256_hex`, `display_prefix`

**Acceptance criteria:**
- [x] hash/verify ด้วยค่าจริงผ่าน; รหัสผิด → False; hash ที่รูปแบบเสียหาย → False (ไม่ crash)
- [x] 8 งานพร้อมกัน: ทำจริงพร้อมกันไม่เกิน 4 และ coroutine อื่นไม่ถูกหน่วงเกิน 50 ms
- [x] token ขึ้นต้นด้วย `jrs_`/`jrk_`, ยาว ≥ 43 ตัวหลัง prefix, ไม่ซ้ำใน 1,000 ครั้ง; prefix สำหรับแสดง = 8 ตัวแรก

**Verification:**
- [x] `uv run pytest tests/auth/test_passwords.py tests/auth/test_tokens.py -q`

**Dependencies:** None
**Files likely touched:** `auth/{passwords,tokens}.py`, `tests/auth/test_{passwords,tokens}.py`
**Estimated scope:** S

### T3: schema + setup + ผู้ใช้

**Description:** `db/migrations/0002_auth.sql` (users, sessions, api_keys, setup_tokens, login_failures ตาม spec; unique `lower(username)`); `Auth.prepare_setup`, `setup_required`, `complete_setup`, `list_users`, `create_user`, `delete_user` (ห้ามลบคนสุดท้าย, เพิกถอน session ด้วย FK cascade)

**Acceptance criteria:**
- [x] สอง process `prepare_setup` พร้อมกันบน DB ว่าง → ได้ token ตัวเดียว (อีกตัวได้ `None`); มีผู้ใช้แล้ว → `None` และ token ถูกลบ
- [x] `complete_setup` ด้วย token ถูกสร้างผู้ใช้คนแรก + session; ใช้ซ้ำ → `SETUP_COMPLETED`; token ผิด → `SETUP_TOKEN_INVALID`
- [x] username ซ้ำแบบต่างตัวพิมพ์ → `CONFLICT`; ลบพร้อมกันสองคนจากสองคน → หนึ่งสำเร็จ หนึ่ง `CONFLICT`

**Verification:**
- [x] `uv run pytest tests/auth/test_setup.py tests/auth/test_users.py -m db -q`

**Dependencies:** T1, T2
**Files likely touched:** `db/migrations/0002_auth.sql`, `auth/{__init__,service}.py`, `tests/auth/{conftest,test_setup,test_users}.py`
**Estimated scope:** M

### Checkpoint A

- [x] tests T1–T3 ผ่าน (รวม `db` บน VM), test เดิมของ template-store ผ่าน, ruff สะอาด

## Phase 2: session และ API key

### T4: login, session, เปลี่ยนรหัส

**Description:** `login` (นับผิดต่อ username+IP 5 ครั้ง/15 นาที → `RATE_LIMITED`; ไม่มีผู้ใช้ก็ verify กับ dummy hash; rehash เมื่อ `needs_rehash`; ลบ session หมดอายุของคนนั้น), `logout`, `authenticate` (`jrs_` → ตรวจ + ต่ออายุเมื่อเหลือ < 6 ชม. ไม่เกิน 7 วัน; `jrk_` → API key ที่ยังไม่เพิกถอน), `change_password` (รหัสเดิมผิด → `UNAUTHORIZED` และนับในเกณฑ์เดียวกัน; สำเร็จ → เพิกถอน session อื่น)

**Acceptance criteria:**
- [x] ผิดครั้งที่ 6 จาก IP เดียวใน 15 นาที → `RATE_LIMITED` แม้รหัสถูก; IP อื่น login ได้; ครบ 15 นาทีแล้ว login ได้
- [x] ใช้ session ตอนเหลือ 5 ชม. → expires ใหม่ = +12 ชม. (เขียน DB); ตอนเหลือ 8 ชม. → ไม่เขียน; ต่อเกิน 7 วันไม่ได้; หมดอายุ → `UNAUTHORIZED`
- [x] หลังเปลี่ยนรหัส: session อื่นใช้ไม่ได้, session นี้ใช้ได้, รหัสใหม่ login ได้; ข้อความ error ไม่มี password/token

**Verification:**
- [x] `uv run pytest tests/auth/test_sessions.py -m db -q`

**Dependencies:** T3
**Files likely touched:** `auth/service.py`, `tests/auth/test_sessions.py`
**Estimated scope:** M

### T5: API key, กู้บัญชี, contract

**Description:** `create_api_key` (คืน secret ครั้งเดียว), `list_api_keys` (ไม่มี secret, มี revoked), `revoke_api_key`; `lastUsedAt` เขียนไม่บ่อยกว่านาทีละครั้งใน `authenticate`; `reset_password` + `auth/__main__.py` (`reset-password <username>` อ่าน `DATABASE_URL`, พิมพ์รหัสใหม่ครั้งเดียว); เพิ่ม `PUT /v1/auth/password` ใน `public-api.yaml`

**Acceptance criteria:**
- [x] secret ไม่อยู่ใน DB (มีแค่ sha256) และไม่อยู่ใน `list_api_keys`; เพิกถอนแล้ว `authenticate` → `UNAUTHORIZED`
- [x] เรียก `authenticate` ด้วย key เดิม 3 ครั้งภายใน 1 นาที → เขียน `last_used_at` ครั้งเดียว
- [x] `reset_password` → รหัสใหม่ login ได้, รหัสเดิมไม่ได้, ทุก session ถูกเพิกถอน; คำสั่ง `python -m jester_api.auth reset-password` ทำงานกับ DB จริง

**Verification:**
- [x] `uv run pytest tests/auth -m db -q --cov=jester_api.auth` ≥ 90%

**Dependencies:** T4
**Files likely touched:** `auth/{service,__main__}.py`, `tests/auth/test_api_keys.py`, `tests/auth/test_reset.py`, `openapi/public-api.yaml`
**Estimated scope:** M

### Checkpoint B

- [x] Success criteria 1–5 ของ spec ผ่าน (32 tests db บน VM, coverage auth 99%)
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป
