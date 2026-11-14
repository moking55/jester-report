# Tasks: `public-api`

แผน: [plan.md](plan.md) · Spec: [SPEC-public-api.md](../../SPEC-public-api.md)
คำสั่ง test: `cd apps/api && uv run ruff check . && uv run pytest tests -q --cov=jester_api.public_api --cov-report=term-missing`
DB: `JESTER_TEST_DATABASE_URL=… uv run pytest tests/public_api -m db -q` (ผ่าน SSH tunnel ไป VM)

## Phase 1: โครงและ route

### T1: โครง

**Description:** เพิ่ม `fastapi`, `uvicorn[standard]`; `Settings.from_env()`; `create_app(settings, services=None)` + lifespan (pool, migrate, พิมพ์ setup token, bucket); exception handler กลาง → problem+json; middleware จำกัดขนาด (นับระหว่างรับ) และ log JSON; dependency ตัวตน (`session_caller`, `render_caller`, IP ของผู้ใช้จริงจาก `X-Jester-Client-IP` เมื่อ `X-Jester-Studio-Key` ตรง); `GET /v1/health`, `GET /v1/openapi.yaml`; ปิด `/docs`, `/redoc`, `/openapi.json`

**Acceptance criteria:**
- [x] body เกินขีดจำกัด (ทั้งมีและไม่มี `Content-Length`) → 413 problem+json
- [x] `/docs` → 404; `/v1/openapi.yaml` คืนไฟล์ contract; health ตอบตาม `Health` schema
- [x] client IP: ค่าลับตรง → ใช้ header; ผิด/ไม่มี → ใช้ IP ของ connection (เทียบแบบ constant-time)

**Verification:**
- [x] `uv run pytest tests/public_api/test_app.py -q`

**Dependencies:** None
**Files likely touched:** `public_api/{__init__,settings,app,security,problems}.py`, `routes/health.py`, `tests/public_api/test_app.py`, `pyproject.toml`
**Estimated scope:** M

### T2: setup, auth, users, api-keys

**Description:** route `/v1/setup` (GET/POST), `/v1/auth/login|logout|me|password`, `/v1/users` (+ `{userId}`), `/v1/api-keys` (+ `{keyId}`) ตาม contract; login/password ใช้ IP ของผู้ใช้จริง

**Acceptance criteria:**
- [x] setup → session; ซ้ำ → 409 `SETUP_COMPLETED`; token ผิด → 403
- [x] login ผิด 5 ครั้งจาก IP เดียว (ผ่าน `X-Jester-Client-IP` + ค่าลับ) → 429; header IP ที่ไม่มีค่าลับไม่ทำให้หลบ limit ได้
- [x] สร้าง API key → `secret` ครั้งเดียว; API key เรียก `/v1/users` → 401; ลบคนสุดท้าย → 409

**Verification:**
- [x] `uv run pytest tests/public_api/test_auth_routes.py -m db -q`

**Dependencies:** T1
**Files likely touched:** `routes/{setup_auth,users_keys}.py`, `tests/public_api/test_auth_routes.py`
**Estimated scope:** M

### T3: templates, draft, versions

**Description:** route templates (list/create/get/rename + `lastRun` จาก render-service), draft (get, files PUT/DELETE, assets POST multipart/DELETE, reset), versions (list, publish, get), published alias; `If-Match` → expected revision; publish = validate ที่ revision นั้นก่อน แล้ว publish

**Acceptance criteria:**
- [x] ไม่มี `If-Match` → 428; revision ไม่ตรง → 412 `REVISION_CONFLICT`
- [x] publish draft ที่ validate ไม่ผ่าน → 422 `DRAFT_INVALID` พร้อม problems; ผ่าน → 201 `Version`
- [x] อัปโหลด `.png` ที่เป็น HTML → 415; asset ซ้ำ → 409; ไฟล์ใหญ่ → 413

**Verification:**
- [x] `uv run pytest tests/public_api/test_templates.py -m db -q`

**Dependencies:** T1
**Files likely touched:** `routes/{templates,draft,versions}.py`, `tests/public_api/test_templates.py`
**Estimated scope:** M

### Checkpoint A

- [x] tests T1–T3 ผ่าน (db), ruff สะอาด

## Phase 2: render และการส่งมอบ

### T4: render, preview, validate, runs, retention

**Description:** `POST /v1/render` (body Decimal, header `Jester-Run-Id`/`Jester-Template-Version`/`Content-Disposition`), `draft/preview`, `draft/validate`, `/v1/runs` (+ cursor), `/v1/runs/retention` GET/PUT ประกาศก่อน `/v1/runs/{runId}`

**Acceptance criteria:**
- [ ] `1250.5` ใน body ถึง data-prep เป็น `Decimal("1250.5")` (ไม่ผ่าน float)
- [ ] ชื่อไฟล์ไทย → `filename*=UTF-8''…` ถูกต้อง; ชื่อผิด pattern → 422
- [ ] `GET /v1/runs/retention` ไม่ถูกตีความเป็น runId; error ของ render-service ได้ status/`runId`/`retryable` ตาม contract

**Verification:**
- [ ] `uv run pytest tests/public_api/test_render_runs.py -m db -q`

**Dependencies:** T1
**Files likely touched:** `routes/{render,runs}.py`, `tests/public_api/test_render_runs.py`
**Estimated scope:** M

### T5: contract + flow เต็ม

**Description:** test ที่โหลด `public-api.yaml` แล้วเทียบ path+method กับ route ของ app (ครบ, ไม่เกิน, route ที่ต้อง login มี dependency) และตรวจ response ของ flow ด้วย schema ของ contract; flow setup → login → template จาก starter → แก้ไฟล์ → validate → publish → API key → render → ดู run

**Acceptance criteria:**
- [ ] route ไม่ตรง contract → test ล้ม (ลองลบ route หนึ่งแล้ว test ต้องล้ม)
- [ ] ทุก response ใน flow ผ่าน schema ของ contract
- [ ] coverage `public_api` ≥ 90%

**Verification:**
- [ ] `uv run pytest tests/public_api -m db -q --cov=jester_api.public_api`

**Dependencies:** T2, T3, T4
**Files likely touched:** `tests/public_api/{test_contract,test_flow}.py`, `openapi/public-api.yaml` (เพิ่ม `/v1/openapi.yaml`, 428)
**Estimated scope:** M

### T6: Docker + compose + VM

**Description:** `apps/api/Dockerfile` (3.12-slim, `uv sync --frozen --no-dev`, user ไม่ใช่ root, `uvicorn --workers $JESTER_API_WORKERS`), `.dockerignore`, `infra/compose.yaml` (api :8000 เท่านั้นที่เปิด; postgres, rustfs, gotenberg ใน network ภายใน), `infra/.env.example`; รันบน VM

**Acceptance criteria:**
- [ ] `docker build` ผ่าน; image ไม่มี dev dependency และไม่รันเป็น root
- [ ] `docker compose up` บน VM → `/v1/health` = up; setup token อยู่ใน log ของ api
- [ ] flow เต็มด้วย HTTP จริงจากเครื่อง dev ผ่าน tunnel ได้ PDF; พอร์ต 5432/9000/3000 ของ stack นี้ไม่เปิดออกนอก

**Verification:**
- [ ] script flow ใน `tests/public_api/test_live.py` (marker `live_stack`) กับ `JESTER_TEST_API_URL`

**Dependencies:** T5; VM `10.0.1.29`
**Files likely touched:** `apps/api/{Dockerfile,.dockerignore}`, `infra/{compose.yaml,.env.example,README.md}`, `tests/public_api/test_live.py`
**Estimated scope:** M

### Checkpoint B

- [ ] Success criteria 1–5 ของ spec ผ่าน
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป
