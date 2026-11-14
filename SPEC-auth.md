# Spec: `auth`

สถานะ: **อนุมัติแล้ว 14 พ.ย. 2026** (ปรับตาม review และ interview)
Module id: `auth` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: — (ใช้ PostgreSQL ชุดเดียวกัน) · ถูกใช้โดย: `public-api`
อ้างอิง: [public-api.yaml](apps/api/openapi/public-api.yaml) (`/v1/setup`, `/v1/auth/**`, `/v1/users/**`, `/v1/api-keys/**`, `securitySchemes`), [intent](docs/intent/report-server-v1.md)

## สมมติฐาน (ผู้ใช้ยืนยันใน interview)

1. **บัญชีภายใน สิทธิ์เท่ากัน (intent):** ทุกคนที่ login ทำได้ทุกอย่าง รวมถึงเพิ่ม/ลบผู้ใช้และสร้าง/เพิกถอน API key ไม่มี role
2. **Password hash ด้วย `hashlib.scrypt` ของ stdlib:** `n=2**15, r=8, p=1, maxmem=64 MiB`, salt 16 byte, เก็บเป็น `scrypt$n$r$p$salt$hash` เปลี่ยนค่าทีหลังได้โดย rehash ตอน login สำเร็จ — ไม่ต้องเพิ่ม dependency (ผู้ใช้เลือก scrypt แทน argon2)
   - ต้องตั้ง `maxmem`: ค่านี้ใช้หน่วยความจำ 32 MiB ซึ่งเกินขีดจำกัดเริ่มต้นของ OpenSSL (ทดสอบแล้วได้ `memory limit exceeded`); ตั้ง 64 MiB แล้วใช้เวลาราว 0.1 วินาทีต่อครั้ง
   - **ไม่ทำบน event loop:** hash/verify ทุกครั้งผ่าน `asyncio.to_thread` ภายใต้ semaphore ที่ทำงานพร้อมกันได้ 4 งาน (หน่วยความจำรวมไม่เกิน 128 MiB) — ไม่งั้นคนที่ยิง login ด้วย username สุ่มทำให้ทุก request ของ server ค้าง
3. **Session token แบบ opaque:** `jrs_` + 32 byte สุ่ม (`secrets.token_urlsafe`) เก็บแค่ sha256 ของ token ใน DB (token สุ่มยาวจึงไม่ต้องใช้ hash ช้า)
   - **อายุ (ผู้ใช้ยืนยัน):** หมดอายุเมื่อไม่ได้ใช้ 12 ชั่วโมง; ถ้ามีการใช้ตอนที่เหลือไม่ถึง 6 ชั่วโมง ต่ออายุกลับเป็น 12 ชั่วโมงเต็มอัตโนมัติ; เพดาน 7 วันหลัง login ต่อเกินนี้ไม่ได้
   - เขียน DB เฉพาะตอนต่ออายุ (เหลือไม่ถึง 6 ชั่วโมง) ไม่ใช่ทุก request
4. **API key:** `jrk_` + 32 byte สุ่ม เก็บ sha256; `prefix` = 8 ตัวแรก (`jrk_5Zq9`) ไว้แสดงให้จำได้; secret แสดงครั้งเดียวตอนสร้าง; ใช้ได้กับ `/v1/render` เท่านั้น (ตาม contract); `lastUsedAt` อัปเดตไม่บ่อยกว่านาทีละครั้ง เพื่อไม่ให้ทุก render ต้องเขียน DB
5. **Setup token เก็บใน DB ไม่ใช่ใน memory:** API อาจรันหลาย process; ตอน start ถ้ายังไม่มีผู้ใช้ process ที่ได้ advisory lock ก่อนจะสร้าง token ใหม่ (เก็บ sha256) แล้วพิมพ์ลง log; process อื่นที่ start ภายใน 5 นาทีเห็นว่ามี token ใหม่แล้วจึงไม่สร้างซ้ำ (ไม่งั้น token ใน log จะใช้ไม่ได้); restart หลังจากนั้นสร้าง token ใหม่แทนตัวเก่า; ใช้ได้ครั้งเดียวและถูกลบเมื่อมีผู้ใช้คนแรก
6. **กัน brute force:** login ผิด 5 ครั้งใน 15 นาที **ต่อคู่ (username, IP ของผู้ใช้จริง)** → `429` จนครบ 15 นาที เก็บใน DB เพื่อให้ทุก process เห็นตรงกัน; ข้อความ 401 เหมือนกันทั้ง "ไม่มีผู้ใช้" และ "รหัสผิด" และกรณีไม่มีผู้ใช้ก็ยังคำนวณ scrypt หนึ่งครั้ง (เวลาตอบใกล้กัน)
   - ไม่นับต่อ username อย่างเดียว: ใครที่รู้ชื่อ (เช่น `admin`) จะส่งรหัสผิด 5 ครั้งทุก 15 นาทีแล้วล็อกเจ้าของบัญชีได้ตลอดไป
   - IP ของผู้ใช้จริง: login จาก Studio มาจาก IP ของ Next.js server เครื่องเดียว จึงต้องให้ Next.js ส่ง IP ของ browser มาใน header `X-Jester-Client-IP`; `public-api` เชื่อ header นี้เฉพาะ request ที่ยืนยันได้ว่ามาจาก Studio (ข้อกำหนดนี้ต้องอยู่ใน spec ของ `public-api` และ `studio`) ไม่งั้นใช้ IP ของ connection; `auth` รับ IP เป็น parameter และไม่รู้เรื่อง header
7. **ลบผู้ใช้:** ห้ามลบคนสุดท้าย (`409`) โดยล็อกก่อนนับ จึงไม่มีกรณีลบพร้อมกันสองคนแล้วเหลือศูนย์; session ของคนที่ถูกลบถูกเพิกถอนทันที; API key ที่คนนั้นสร้างยังใช้ได้ (เป็นของทีม ไม่ใช่ของคน) และ `createdBy` เก็บเป็นชื่อ
8. **Migration ใช้ runner ชุดเดียวกับ template-store:** ย้าย `migrate.py` และโฟลเดอร์ `migrations/` จาก `template_store` ไปที่ `jester_api/db/` (ของกลาง) แล้วเพิ่ม `0002_auth.sql`; เปลี่ยนชื่อ `0001_init.sql` เป็น `0001_template_store.sql` ได้เพราะยังไม่เคยรันที่ใดนอกจาก schema ทดสอบ
9. **เปลี่ยนรหัสผ่านของตัวเอง (ผู้ใช้ยืนยัน):** เพิ่ม `PUT /v1/auth/password` ใน contract (body: `currentPassword`, `newPassword`; ต้องใช้ session) รหัสเดิมผิด → `401` ไม่นับเป็น login ผิด แต่จำกัดด้วยเกณฑ์เดียวกันต่อ (username, IP); สำเร็จแล้วเพิกถอน session อื่นทั้งหมดของคนนั้น เก็บไว้แค่ session ที่ใช้เปลี่ยน; ไม่มีการรีเซ็ตรหัสให้คนอื่น (ลบแล้วสร้างผู้ใช้ใหม่แทน)
10. **กู้บัญชีเมื่อลืมรหัส (ผู้ใช้ยืนยัน):** `docker compose exec api python -m jester_api.auth reset-password <username>` ตั้งรหัสสุ่มใหม่ (24 ตัวอักษร) พิมพ์ออกมาครั้งเดียว และเพิกถอนทุก session ของคนนั้น — เป็นเครื่องมือกู้ระบบสำหรับคนที่เข้าถึงเครื่อง server ได้ (ระดับเดียวกับการอ่าน setup token จาก log) ไม่ใช่ CLI สำหรับ render

## Objective

ให้ `public-api` รู้ว่า "ใครเรียก" ด้วยวิธีที่ปลอดภัยพอสำหรับ server ที่ทีมติดตั้งเอง
- first-run setup ด้วย one-time setup token จาก log
- login/logout/me, จัดการผู้ใช้, สร้าง/เพิกถอน API key
- ตรวจ session token และ API key ทุก request

### User stories

- ในฐานะคนติดตั้ง ฉันเปิด Studio ครั้งแรก เห็นหน้า setup ใส่ token จาก `docker compose logs api` แล้วได้บัญชีแรกทันที คนอื่นที่เข้าถึง URL ได้แต่ไม่เห็น log สร้างบัญชีแรกไม่ได้
- ในฐานะผู้ใช้ Studio ฉัน login แล้วใช้งานได้ทั้งวันโดยไม่ต้อง login ใหม่ และถ้าทิ้งไว้ข้ามคืน session หมดอายุเอง
- ในฐานะเจ้าของระบบภายนอก ฉันได้ API key ที่เห็นครั้งเดียว ใช้เรียก `/v1/render` ได้ และถ้ารั่วก็เพิกถอนได้ทันที
- ในฐานะผู้ดูแล ฉันลบผู้ใช้ที่ลาออกแล้ว session ของเขาใช้ไม่ได้ทันที

## Interface

```python
@dataclass(frozen=True)
class User: id: UUID; username: str; created_at: datetime; last_login_at: datetime | None
@dataclass(frozen=True)
class Session: token: str; expires_at: datetime; user: User          # token มีแค่ตอนสร้าง
@dataclass(frozen=True)
class ApiKey: id: UUID; name: str; prefix: str; created_at: datetime; created_by: str; last_used_at: datetime | None
@dataclass(frozen=True)
class Principal: kind: Literal["user", "api_key"]; user: User | None; api_key_id: UUID | None; name: str  # name → updatedBy/publishedBy

class Auth:
    def __init__(self, db: AsyncConnectionPool, clock: Callable[[], datetime] = utcnow) -> None: ...
    async def prepare_setup(self) -> str | None            # ตอน start: token ใหม่ที่ต้องพิมพ์ลง log หรือ None
    async def setup_required(self) -> bool
    async def complete_setup(self, setup_token: str, username: str, password: str) -> Session
    async def login(self, username: str, password: str, client_ip: str) -> Session
    async def logout(self, token: str) -> None
    async def change_password(self, token: str, current: str, new: str, client_ip: str) -> None  # เก็บ session นี้ไว้
    async def reset_password(self, username: str) -> str   # สำหรับคำสั่งกู้บัญชี: คืนรหัสใหม่
    async def authenticate(self, bearer: str) -> Principal    # jrs_ → user, jrk_ → api key; อื่น ๆ → AuthError
    async def list_users(self) -> list[User]
    async def create_user(self, username: str, password: str) -> User
    async def delete_user(self, user_id: UUID) -> None
    async def list_api_keys(self) -> list[ApiKey]
    async def create_api_key(self, name: str, created_by: str) -> tuple[ApiKey, str]   # (key, secret แสดงครั้งเดียว)
    async def revoke_api_key(self, key_id: UUID) -> None

class AuthError(Exception):
    code: Literal["UNAUTHORIZED", "RATE_LIMITED", "SETUP_COMPLETED", "SETUP_TOKEN_INVALID",
                  "CONFLICT", "NOT_FOUND", "INPUT_INVALID"]
```

`public-api` เป็นคนตัดสินว่า endpoint ไหนรับ API key (`/v1/render` เท่านั้น) — `authenticate` แค่บอกว่าเป็นใคร

## Data model (`0002_auth.sql`)

```sql
users          (id uuid PK, username text UNIQUE (ไม่สนตัวพิมพ์: unique index บน lower(username)), password_hash text,
                created_at, last_login_at NULL)
sessions       (token_sha256 text PK, user_id uuid FK ON DELETE CASCADE, created_at, last_used_at, expires_at)
api_keys       (id uuid PK, name text, prefix text, secret_sha256 text UNIQUE, created_at, created_by text,
                last_used_at NULL, revoked_at NULL)
setup_tokens   (token_sha256 text PK, created_at)                 -- มีได้แถวเดียว
login_failures (username_lower text, client_ip text, failed_at)   -- นับต่อ (username, ip); ลบแถวเก่ากว่า 15 นาทีตอนนับ
```

- revoke API key = ตั้ง `revoked_at` (เก็บประวัติไว้ แสดงในรายการได้) ส่วน logout ลบแถว session
- session หมดอายุถูกลบตอนมีคนใช้ token นั้น และลบรวดเดียวตอน login (ไม่ต้องมี job)

## Tech Stack

Python ≥3.11, stdlib `hashlib` (scrypt, sha256), `secrets`, `hmac.compare_digest`; `psycopg` (มีแล้ว) — ไม่มี dependency ใหม่

## Commands

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check .
JESTER_TEST_DATABASE_URL=postgresql://… uv run pytest tests/auth -q --cov=jester_api.auth --cov-report=term-missing
```

## Project Structure

```
apps/api/src/jester_api/db/
  migrate.py + migrations/0001_template_store.sql, 0002_auth.sql   → ย้ายมาจาก template_store
apps/api/src/jester_api/auth/
  __init__.py   → Auth, AuthError, User, Session, ApiKey, Principal
  passwords.py  → hash/verify/needs_rehash ด้วย scrypt
  tokens.py     → สร้าง token/ key, sha256, prefix
  service.py    → Auth (SQL ทั้งหมด)
  __main__.py   → `python -m jester_api.auth reset-password <username>` (อ่าน DATABASE_URL)
apps/api/tests/auth/
  test_passwords.py  test_tokens.py  test_setup.py  test_sessions.py  test_users_keys.py
```

## Code Style

```python
async def login(self, username: str, password: str, client_ip: str) -> Session:
    async with self._db.connection() as conn, conn.transaction():
        if await self._recent_failures(conn, username, client_ip) >= MAX_FAILURES:
            raise AuthError("RATE_LIMITED", "too many failed logins; try again later")
        row = await self._user_row(conn, username)
        # same work either way; off the event loop, at most 4 at a time
        ok = await verify_password(password, row.password_hash if row else DUMMY_HASH)
        if not (row and ok):
            await self._record_failure(conn, username, client_ip)
            raise AuthError("UNAUTHORIZED", "wrong username or password")
        ...
```

## Testing Strategy

- **Postgres จริง** (marker `db`) ใช้ schema ใหม่ต่อ test เหมือน template-store; นาฬิกาเป็น parameter (`clock`) จึงทดสอบหมดอายุได้โดยไม่ต้องรอจริง
- **Setup:** token ถูกต้องสร้างผู้ใช้คนแรกได้, ใช้ซ้ำไม่ได้ (`SETUP_COMPLETED`), token ผิด → `SETUP_TOKEN_INVALID`; start สอง process พร้อมกันได้ token เดียว; มีผู้ใช้แล้ว `prepare_setup` คืน `None`
- **Session:** หมดอายุตาม idle 12 ชม.; ใช้ตอนเหลือ 5 ชม. → ต่อเป็น 12 ชม. (เขียน DB), ใช้ตอนเหลือ 8 ชม. → ไม่เขียน DB; ต่อเกิน 7 วันหลัง login ไม่ได้; logout แล้วใช้ไม่ได้, ลบผู้ใช้แล้ว session ใช้ไม่ได้
- **เปลี่ยนรหัส:** รหัสเดิมผิด → `401`; สำเร็จแล้ว session อื่นของคนนั้นใช้ไม่ได้ แต่ session ที่ใช้เปลี่ยนยังใช้ได้ และ login ด้วยรหัสใหม่ได้
- **กู้บัญชี:** `reset_password` คืนรหัสใหม่ที่ login ได้, รหัสเดิมใช้ไม่ได้, ทุก session ของคนนั้นถูกเพิกถอน; ไม่มีผู้ใช้ชื่อนั้น → error
- **Brute force:** ผิดครั้งที่ 6 ภายใน 15 นาทีจาก IP เดียว → `RATE_LIMITED` แม้รหัสถูก; ครบ 15 นาทีแล้ว login ได้; เจ้าของบัญชีจาก IP อื่น login ได้ตามปกติระหว่างที่ IP ผู้โจมตีถูกล็อก
- **Hash ไม่ขวาง event loop:** ระหว่างที่ login 8 ครั้งพร้อมกันกำลัง hash, coroutine อื่นยังทำงานได้ (วัดว่า `asyncio.sleep(0)` ไม่ถูกหน่วงเกิน 50 ms) และทำงานพร้อมกันไม่เกิน 4
- **scrypt จริง:** hash/verify ด้วยค่าที่ใช้จริง (`n=2**15`) ผ่าน ไม่ใช่ค่าที่ลดลงเพื่อให้ test เร็ว
- **API key:** secret ไม่อยู่ใน DB หรือใน `list_api_keys`, เพิกถอนแล้วใช้ไม่ได้, `lastUsedAt` ไม่ถูกเขียนทุก request
- **ผู้ใช้คนสุดท้าย:** ลบพร้อมกันสองคนจากสองคน → หนึ่งสำเร็จ หนึ่ง `CONFLICT`
- **ไม่มีความลับในข้อความหรือ log:** password, token, secret ไม่ปรากฏใน message ของ error ใด
- Coverage ≥ 90%

## Boundaries

- **Always:** เก็บแค่ hash ของ password/token/key, เทียบด้วย `hmac.compare_digest` หรือเทียบ hash ใน DB, ข้อความ 401 แบบเดียว, ทุกการเขียนอยู่ใน transaction
- **Ask first:** เพิ่ม dependency (เช่น argon2), เปลี่ยนอายุ session หรือเกณฑ์ brute force, ให้ API key ใช้ endpoint อื่นนอกจาก render, เพิ่ม role
- **Never:** เก็บหรือ log password/token/secret แบบอ่านได้, เก็บ setup token ไว้ใน memory อย่างเดียว, JWT ที่เพิกถอนไม่ได้

## Success Criteria

1. Setup ครั้งแรกทำงานตาม user story และทำซ้ำไม่ได้ แม้ API รันหลาย process
2. Session และ API key ตรวจได้ถูกต้อง หมดอายุ/เพิกถอนแล้วใช้ไม่ได้ทันที
3. Brute force ถูกจำกัดต่อ (username, IP) โดยผู้โจมตีล็อกเจ้าของบัญชีจาก IP อื่นไม่ได้; login ที่ไม่มีผู้ใช้กับรหัสผิดแยกกันไม่ได้จากข้อความ; การ hash ไม่ขวาง request อื่น
4. ลบผู้ใช้คนสุดท้ายไม่ได้แม้ลบพร้อมกัน
5. test `db` ผ่านบน VM, coverage ≥ 90%, `ruff` สะอาด, test เดิมของ template-store ผ่านหลังย้าย migration

## Open Questions

ปิดแล้วทั้งหมดจาก interview 14 พ.ย. 2026: scrypt ของ stdlib (ไม่ใช้ argon2), session idle 12 ชม. ต่ออายุอัตโนมัติเมื่อเหลือไม่ถึง 6 ชม. เพดาน 7 วัน, เพิ่ม `PUT /v1/auth/password` ใน contract, กู้บัญชีด้วยคำสั่ง `reset-password` ในเครื่อง server

## Out of scope

SSO/OIDC, role/RBAC, multi-tenant, 2FA, email (เชิญ/รีเซ็ตรหัส), จำกัดสิทธิ์ API key ราย template, audit log ละเอียด, CAPTCHA
