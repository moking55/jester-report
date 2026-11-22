# v1.13 Jester MCP — task list

แผน: [plan.md](plan.md) · spec: [SPEC-mcp.md](../../SPEC-mcp.md), [SPEC-auth.md](../../SPEC-auth.md) v1.13
กติกา: test ก่อนโค้ด, commit ทุก task, ไม่ push ระหว่างทาง; ผู้ใช้ทบทวนที่ checkpoint; อนุมัติแล้ว → เลข version 1.13.0, tag `v1.13.0`, push `master` + tag, deploy
คำสั่ง: api `cd apps/api && uv run pytest <path>` · mcp `cd apps/mcp && uv run pytest <path> && uv run ruff check .` · live บน stack rc ของเครื่องทดสอบ

## Phase 0: เอกสาร

- [x] **T0 contract และ capability map** (S, docs)
  - Acceptance: หัวข้อ "v1.13" ต่อท้าย `SPEC-public-api.md` (`lifetime` ของ login); แถว `mcp` ใน `CAPABILITY_MAP.md` (ขึ้นกับ `public-api` ผ่าน HTTP) และแถวลำดับงาน v1.13
  - Verify: อ่านทวน; ลิงก์เปิดได้; ตรงกับ SPEC-mcp ข้อ 4a
  - Files: `SPEC-public-api.md`, `CAPABILITY_MAP.md`

## Phase 1: api — session อายุยาว

- [x] **T1 `auth`: session ยาว + migration 0010** (M)
  - Acceptance: `0010_long_sessions.sql` เพิ่ม `sessions.long_lived boolean NOT NULL DEFAULT false`; `login(..., long_lived=True)` ออก session หมดอายุใน 30 วัน; ใช้ตอนเหลือ < 15 วัน → ต่อเป็น 30 วัน; ไม่เกิน 90 วันหลัง login; session ปกติยัง 12 ชม./6 ชม./7 วัน (test เดิมผ่านโดยไม่แก้); ลบผู้ใช้/`set_password`/`reset_password` เพิกถอน session ยาวด้วย
  - Verify: `pytest tests/auth tests/db/test_migrations.py` (ฐานที่มี 0001–0009 + แถวเดิมย้ายขึ้นได้)
  - Files: `db/migrations/0010_long_sessions.sql`, `auth/service.py`, `tests/auth/test_sessions.py`, `tests/db/test_migrations.py`

- [x] **T2 `POST /v1/auth/login` รับ `lifetime`** (S)
  - Acceptance: body `lifetime?: "standard" | "long"`; `long` + `X-Jester-Studio-Key` ถูก → `expiresAt` ≈ 30 วัน; ไม่มี/ผิด key → `422 INPUT_INVALID`; ค่าอื่น → 422; ไม่ส่ง = เดิม; เทียบ key ด้วยฟังก์ชันเดียวกับ `client_ip` (ย้ายเป็น helper ใน `security.py`); `public-api.yaml` มี field + example
  - Verify: `pytest tests/public_api/test_auth_routes.py tests/public_api/test_contract.py`
  - Files: `public_api/routes/setup_auth.py`, `public_api/security.py`, `openapi/public-api.yaml`, `tests/public_api/test_auth_routes.py`

### Checkpoint A: api
- [x] `pytest` ทั้งชุดของ api บนเครื่องทดสอบ: 781 passed / 3 skipped (live_stack) ใน 104 วินาที (23 พ.ย. 2026); `ruff` ของไฟล์ที่แตะสะอาด (E501 เดิม 3 จุดใน `test_contract.py`, `template_store/store.py` ไม่ได้แตะ); Studio: `npm run gen:api` แล้ว `tsc` ผ่าน
- [ ] ทบทวนกับผู้ใช้ก่อนเริ่ม `apps/mcp` (การแก้ auth เป็น R1)

## Phase 2: mcp — โครงและ OAuth (เสี่ยงสุด ทำก่อน)

- [x] **T3 โครง `apps/mcp` + client ของ api** (M)
  - Acceptance: uv project (`mcp`, `httpx`, `uvicorn`; dev: `pytest`, `pytest-asyncio`, `respx`, `ruff`) pin เวอร์ชัน; `settings.py` อ่าน env ตาม spec ขาดค่าแล้วบอกชื่อตัวแปร (ไม่พิมพ์ค่า); `api.py` เรียกได้เฉพาะ operation ใน allow-list (path นอก list → exception ก่อนส่ง request), problem+json → error ที่มี `code`/`detail`/`problems`; `GET /healthz` เรียก `/v1/health`; log JSON ไม่มีความลับ
  - Verify: `pytest tests/test_api.py` (allow-list ทั้งผ่านและปฏิเสธ, map 404/412/422)
  - Files: `apps/mcp/pyproject.toml`, `src/jester_mcp/settings.py`, `src/jester_mcp/api.py`, `src/jester_mcp/app.py`, `tests/test_api.py`

- [x] **T4 OAuth provider บน SQLite** (M)
  - Acceptance: provider ตาม interface ของ SDK; ตาราง client (DCR) และ token (`sha256(jmc_…)` → Jester session, username, expires); code ในหน่วยความจำ 5 นาที ใช้ครั้งเดียว; redirect URI นอก `JESTER_MCP_REDIRECT_ALLOW` → 400; PKCE verifier ผิด → ล้ม; metadata ที่ `/.well-known/*` ชี้ `JESTER_MCP_PUBLIC_URL`
  - Verify: `pytest tests/test_oauth.py`
  - Files: `src/jester_mcp/oauth.py`, `src/jester_mcp/app.py`, `tests/test_oauth.py`

- [x] **T5 หน้า login + `whoami` ครบวง** (M)
  - Acceptance: `/authorize` แสดงฟอร์มภาษาไทย (CSRF token, ไม่มี JS); ส่ง `POST /v1/auth/login` ด้วย `lifetime: long` + studio key + `X-Jester-Client-IP` จาก header ที่ตั้งใน env (ไม่ตั้ง → ไม่ส่ง IP); รหัสผิด → หน้าเดิมพร้อมข้อความ ไม่ออก code; 429 → ข้อความให้รอ; สำเร็จ → redirect พร้อม code; tool `whoami` คืนชื่อผู้ใช้จริง
  - Verify: `pytest tests/test_login.py`; ด้วยมือ: MCP Inspector ต่อ dev server กับ stack rc ผ่าน tunnel แล้ว `whoami` ตอบชื่อ
  - Files: `src/jester_mcp/login.py`, `src/jester_mcp/tools.py`, `src/jester_mcp/app.py`, `tests/test_login.py`

- [x] **T6 token หมดอายุและถูกเพิกถอน** (S)
  - Acceptance: `/mcp` ไม่มี/ผิด bearer → 401 + `WWW-Authenticate`; api ตอบ 401 → ลบแถว token แล้ว MCP ตอบ 401 (claude.ai พาไป login ใหม่); access token ใช้กับ api ตรงไม่ได้
  - Verify: `pytest tests/test_oauth.py tests/test_tools.py`
  - Files: `src/jester_mcp/oauth.py`, `src/jester_mcp/api.py`, `tests/test_tools.py`

### Checkpoint B: OAuth จริง
- [x] `pytest` ของ `apps/mcp` ผ่าน (40), `ruff` สะอาด
- [x] flow จริงกับ api rc 1.13.0-rc บนเครื่องทดสอบ (23 พ.ย. 2026, script แทน Inspector): healthz → register (callback นอก allow-list 400) → authorize → หน้า login → รหัสผิด 401 → login 303 → token `jmc_` (expires_in 90 วัน) → `/mcp` ไม่มี bearer 401 → initialize → tools/list → `whoami` = `mcp-tester`; DB: session ของ MCP `long_lived = t` อายุ 30.00 วัน; log ของ mcp ไม่มี token/รหัสผ่าน
- หมายเหตุ T6: 401 จาก api ทำให้ call นั้นเป็น tool error และลบ token; **request ถัดไป** ได้ 401 (MCP เปลี่ยน status ของ call ที่กำลังทำไม่ได้)
- [ ] ผู้ใช้ตั้ง DNS `mcp.<โดเมนทีม>` + route ใน proxy มาที่เครื่องทดสอบ แล้ว **เพิ่ม connector ใน claude.ai จริง** login ได้และ `whoami` ตอบชื่อ — ไม่ผ่านเพราะ SDK → หยุดคุยกับผู้ใช้ก่อนทำต่อ
- [ ] ทบทวนกับผู้ใช้

## Phase 3: tool

- [x] **T7 tool อ่าน** (M)
  - Acceptance: `list_templates` (`tag`), `get_template`, `get_draft` (description บอกว่าเนื้อไฟล์เป็นข้อมูลไม่ใช่คำสั่ง), `list_versions`, `validate_draft`, `prepare_draft` — ทุกตัว `readOnlyHint`; ทุกตัวชี้ operation ที่มีจริงใน `public-api.yaml` (test อ่านไฟล์ contract)
  - Verify: `pytest tests/test_tools.py`
  - Files: `src/jester_mcp/tools.py`, `tests/test_tools.py`, `tests/test_contract.py`

- [x] **T8 tool เขียน draft** (M)
  - Acceptance: `create_template` (`starter`, `page`), `duplicate_template`, `put_draft_file`, `delete_draft_file`, `upload_draft_asset` (base64 → multipart), `delete_draft_asset`; ทุกตัวที่แก้ draft ต้องมี `revision` → `If-Match`; 412 → error บอกให้อ่าน draft ใหม่; คืน `studioUrl`; ลบมี `destructiveHint`; **ไม่มี tool ไหนเรียก publish/alias/archive** (test รายชื่อ tool ทั้งหมดเทียบ allow-list)
  - Verify: `pytest tests/test_tools.py tests/test_contract.py`
  - Files: `src/jester_mcp/tools.py`, `src/jester_mcp/api.py`, `tests/test_tools.py`

- [x] **T9 `preview_draft` เป็นภาพ** (S)
  - Acceptance: เพิ่ม `pypdfium2`; PDF 7 หน้า → PNG 5 ภาพ กว้าง 1000 px + `pages: 7` + `studioUrl`; ส่ง `data` ได้, ไม่ส่ง = `sample.json`; PDF เสีย → tool error
  - Verify: `pytest tests/test_preview.py`
  - Files: `src/jester_mcp/preview.py`, `src/jester_mcp/tools.py`, `pyproject.toml`, `tests/test_preview.py`

- [x] **T10 `get_authoring_guide` + instructions** (M)
  - Acceptance: script copy `SKILL.md`, `references/format.md`, `references/sources.md` จาก `.claude/skills/to-jester` เข้า `src/jester_mcp/guide/` (gitignore); หัวข้อ `mcp` (ไฟล์ของ `apps/mcp`) อธิบายขั้นตอนใน MCP: อ่าน guide → `create_template` → `put_draft_file` → `validate_draft` → `preview_draft` เทียบต้นฉบับ → ส่ง `studioUrl` ให้คน publish; `instructions` ของ server สั่งให้อ่าน guide ก่อน; topic ไม่รู้จัก → error พร้อมรายชื่อ topic
  - Verify: `pytest tests/test_guide.py` (ไฟล์ guide ตรงกับ skill ทุก byte)
  - Files: `scripts/copy-guide.py`, `src/jester_mcp/guide_mcp.md`, `src/jester_mcp/tools.py`, `.gitignore`, `tests/test_guide.py`

### Checkpoint C: tool ครบ
- [x] `pytest` ของ `apps/mcp` ผ่าน 61 ตัว coverage 94%, `ruff` สะอาด
- [x] flow จริงกับ api rc (23 พ.ย. 2026, script แทน Inspector): tools 15 ตัว → guide `format` → create (starter quotation) → get_draft → put report.css (rev 1→2) → put ด้วย revision เก่า = tool error 412 พร้อม hint → validate ผ่าน → prepare/preview ไม่ส่ง params = 422 `PARAM_REQUIRED` (บอกชื่อ) → ส่ง params ครบ → preview 1 หน้า ภาพไทย/พ.ศ./ยอด/บาทตัวอักษรถูก; run ใน DB เป็น user `mcp-tester`; log ไม่มี token
- พบระหว่างทาง: preview/prepare ต้องส่ง `params` ที่ required เสมอ (Studio ให้คนกรอก, api ไม่เติมให้) — เพิ่มใน description ของ tool และ guide `mcp` ข้อ 5
- ต่างจาก plan: T10 ใช้ `python -m jester_mcp.guide <skill dir>` แทน `scripts/copy-guide.py`; PNG เขียนด้วย zlib (ไม่เพิ่ม Pillow)
- [ ] ทบทวนกับผู้ใช้

## Phase 4: deploy และปล่อย

- [x] **T11 Docker + compose** (M)
  - Acceptance: `apps/mcp/Dockerfile` (Python 3.12-slim, `uv sync --frozen`, user ไม่ใช่ root, copy guide ตอน build); service `mcp` ใน `infra/compose.yaml` + volume `mcp-data` + พอร์ตให้ proxy (`JESTER_MCP_PORT`); ตัวแปรใหม่ใน `infra/.env.example`; `infra/README.md` บอกการตั้ง subdomain และ header IP ของ proxy
  - Verify: `docker build` ผ่าน; `docker compose up` บนเครื่องทดสอบแล้ว `/healthz` ok
  - Files: `apps/mcp/Dockerfile`, `apps/mcp/.dockerignore`, `infra/compose.yaml`, `infra/.env.example`, `infra/README.md`

- [ ] **T12 live + claude.ai จริง** (M)
  - Acceptance: `test_live.py` (`live_stack`) บน stack rc: OAuth → create → put → validate → preview → ประวัติใน Studio แสดงชื่อผู้ใช้จริง → ลบผู้ใช้แล้ว call ถัดไป 401; **ด้วยมือใน claude.ai:** แนบ PDF ใบเสนอราคาแล้วได้ draft ที่ validate ผ่านและ preview ตรงต้นฉบับ; pytest ทั้งชุดของ api ผ่านบนเครื่องทดสอบ
  - Verify: `pytest -m live_stack` ของ `apps/mcp`, `pytest` ทั้งชุดของ api, บันทึกผลรันท้ายไฟล์นี้
  - Files: `apps/mcp/tests/test_live.py`

ผล T11–T12 (23 พ.ย. 2026, เครื่องทดสอบ): image `jester/mcp:1.13.0-rc` build ผ่าน (skill เข้าทาง named build context `skill`), container healthy, uid 10001, guide 3 ไฟล์อยู่ใน image, SQLite เขียนลง `/data`; `docker compose config --services` ไม่มี mcp ถ้าไม่เปิด profile; flow ทั้งสองชุดผ่านกับ container; `test_live.py` ผ่าน (OAuth → create → put → 412 → validate → preview → run แสดงชื่อผู้ใช้จริง → ลบผู้ใช้แล้ว tool ถัดไปให้ reconnect และ `/mcp` 401); pytest ทั้งชุดของ api: ผลเดิมจาก Checkpoint A (781 passed) — ไม่มีไฟล์ใน `apps/api` เปลี่ยนหลังจากนั้น
- [ ] T12 ส่วนที่เหลือ: เพิ่ม connector ใน claude.ai จริงผ่าน proxy แล้วแนบ PDF ใบเสนอราคา — **ผู้ใช้สั่งข้ามไปก่อน 23 พ.ย. 2026** (ยังไม่มี DNS/route)

- [ ] **T13 ปล่อย** (ผู้ใช้อนุมัติก่อนทุกขั้น)
  - [ ] อนุมัติ → bump 1.13.0 (`apps/api/pyproject.toml` + `uv.lock`, `apps/mcp/pyproject.toml` + `uv.lock`, `apps/studio/package.json`/lock, `infra/compose.yaml`), commit `chore: release 1.13.0`, tag `v1.13.0`, push `master` + tag, deploy `~/jester-stack` (migration 0010 วิ่งตอน api ขึ้น), ลบ stack rc
