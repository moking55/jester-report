# Implementation Plan: `public-api`

สถานะ: **T1–T6 เสร็จ — รอผู้ใช้ที่ Checkpoint B** (14 พฤศจิกายน 2026)
Spec: [SPEC-public-api.md](../../SPEC-public-api.md) · Map: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md) · Task list: [todo.md](todo.md)

## Overview

ทำ FastAPI ชั้นบาง ๆ ตาม contract `public-api.yaml` (34 operation + `GET /v1/openapi.yaml`) บน module ที่ทำเสร็จแล้ว แล้วจบด้วย Dockerfile, `infra/compose.yaml` และ flow เต็มบน VM
เริ่มจากโครง (app, error, ตัวตน, ขนาด) ก่อน แล้วเติม route ตามกลุ่ม และปิดด้วย test ที่เทียบ route กับ contract

## Architecture Decisions

- **`create_app(settings, services=None)`:** production สร้าง pool/store/auth/render-service ใน lifespan; test ส่ง services ที่สร้างเอง (store จริงบน db, engine จำลองด้วย respx) จึงไม่ต้องเปิด uvicorn — ใช้ `httpx.AsyncClient(transport=ASGITransport(app))`
- **ตัวตนเป็น dependency สองแบบ:** `session_caller` (ต้องเป็น `jrs_`) และ `render_caller` (`jrs_` หรือ `jrk_`); แต่ละ route ประกาศว่าใช้แบบไหน — test contract ตรวจว่าทุก route ที่ contract บอกว่าต้อง login มี dependency
- **error กลางที่เดียว:** exception handler ของ `StoreError`, `AuthError`, `RenderError`, `RequestValidationError`, `HTTPException`, และ `Exception` → `problem+json`; ตาราง code → status อยู่ใน `problems.py`
- **body แบบ Decimal:** render/preview อ่าน `await request.body()` เอง (ขนาดถูกตรวจแล้วโดย middleware) → `json.loads(parse_float=Decimal)` → pydantic model ที่ `data: Any`
- **ขนาด request:** middleware ASGI ที่นับ byte ระหว่างรับ (ไม่เชื่อ `Content-Length` อย่างเดียว) → 413 problem
- **`If-Match`:** dependency `expected_revision` อ่าน `"12"`/`12`; ไม่มี → 428, ไม่ใช่ตัวเลข → 422 (contract ใส่ 428 เพิ่มใน responses ของ route ที่แก้ draft)
- **Content-Disposition:** `attachment; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded>` ตาม RFC 6266/8187
- **log:** middleware เขียน JSON ต่อ request (path template ไม่ใช่ path จริง เพื่อไม่ให้ id/ชื่อไฟล์ปนเยอะ) ไม่มี header/body

## Dependency Graph

```
T1 โครง (app, error, ตัวตน, ขนาด, health, openapi.yaml)
 ├── T2 setup/auth/users/api-keys
 ├── T3 templates/draft/versions ──┐
 └── T4 render/preview/validate/runs/retention ──┴── T5 contract test + flow เต็ม ── T6 Docker + compose + VM
```

T2–T4 ขึ้นกับ T1 แต่ไม่ขึ้นกับกัน

## Task List

### Phase 1: โครงและ route
- [x] T1: `settings`, `create_app` + lifespan, error handler, middleware ขนาด/log, ตัวตน (+ ค่าลับ Studio), `/v1/health`, `/v1/openapi.yaml`, ปิด docs อัตโนมัติ; dependency `fastapi`, `uvicorn[standard]`
- [x] T2: route setup, auth (login/logout/me/password), users, api-keys
- [x] T3: route templates, draft (files/assets/reset), versions (publish ต้อง validate ผ่านที่ revision เดียวกัน), published alias

### Checkpoint A
- [x] tests T1–T3 ผ่าน (db), ruff สะอาด

### Phase 2: render และการส่งมอบ
- [x] T4: route render (Decimal, header, Content-Disposition), preview, validate, runs, retention (ประกาศก่อน `/v1/runs/{runId}`)
- [x] T5: test contract (route ครบ/เกิน, response ผ่าน schema) + flow เต็ม setup → render ด้วย API key (engine จำลอง)
- [x] T6: `apps/api/Dockerfile`, `infra/compose.yaml`, `infra/.env.example`; `docker compose up` บน VM → health up และ flow เต็มกับของจริง

### Checkpoint B
- [x] Success criteria 1–5 ของ spec ผ่าน
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม module ถัดไป

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| FastAPI จับ `/v1/runs/retention` เป็น `{runId}` | กลาง | ประกาศ route คงที่ก่อน และมี test |
| uvicorn บน Windows ใช้ proactor loop ทำให้ psycopg async ใช้ไม่ได้ | กลาง | entrypoint ตั้ง selector loop บน Windows; container เป็น Linux |
| forkserver ภายใน uvicorn หลาย worker | ต่ำ | แต่ละ worker มี forkserver ของตัวเอง; ทดสอบใน compose บน VM |
| compose บน VM ชนกับ stack dev (`/opt/jester`) ที่ใช้พอร์ต 5432/9000 | กลาง | compose เต็มไม่เปิดพอร์ต DB/S3 ออกนอก; ใช้ project name ต่างกัน; api ใช้พอร์ต 8000 |
| contract กับ route เพี้ยนกันเงียบ ๆ | สูง | test contract ล้มทันทีเมื่อ path/method หรือ schema ไม่ตรง |

## Open Questions

ไม่มี (ปิดใน interview ของ spec)
