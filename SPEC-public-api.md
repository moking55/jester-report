# Spec: `public-api`

สถานะ: **อนุมัติแล้ว 14 พ.ย. 2026** (ปรับตาม interview)
Module id: `public-api` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · ขึ้นกับ: `render-service`, `template-store`, `auth` · ถูกใช้โดย: `studio` (Next.js server) และระบบภายนอก
อ้างอิง: [public-api.yaml](apps/api/openapi/public-api.yaml) (contract 42 operation + `GET /v1/openapi.yaml`; ที่เพิ่มหลัง spec นี้ — prepared data, theme, อ่าน asset ของ draft — อยู่ใน [SPEC-studio.md](SPEC-studio.md)), [SPEC-auth.md](SPEC-auth.md) (`X-Jester-Client-IP`), [SPEC-render-service.md](SPEC-render-service.md) (ลำดับ route ของ `/v1/runs/retention`), [intent](docs/intent/report-server-v1.md)

## สมมติฐาน (ผู้ใช้ยืนยันใน interview)
1. **การติดตั้ง (ผู้ใช้ยืนยัน):** ระบบภายนอกเรียก api ผ่าน reverse proxy ของทีม (TLS อยู่ที่ proxy); Studio คุยกับ api ผ่าน network ภายในของ compose; พอร์ตที่เปิดออกนอก compose มีแค่ของ api (postgres, rustfs, gotenberg ไม่เปิด); IP ที่ api เห็นจาก connection จึงเป็นของ proxy — v1 ไม่เชื่อ `X-Forwarded-For` (rate limit ของ login ใช้ `X-Jester-Client-IP` จาก Studio อยู่แล้ว)
2. **เป็นชั้นบาง ๆ ตาม contract:** ทุก operation ใน `public-api.yaml` เป็น route ของ FastAPI ที่แปลง HTTP → เรียก module → แปลงผล/ error กลับเป็น HTTP ไม่มี business logic ใหม่ใน module นี้ (กติกาอยู่ใน module ที่ทำไปแล้ว)
3. **Contract คือความจริง:** ใช้ไฟล์ `public-api.yaml` ที่เขียนเองเป็นหลัก ไม่ใช้ OpenAPI ที่ FastAPI สร้างอัตโนมัติ — มี test ที่เทียบว่า route ที่ FastAPI มีตรงกับ path + method ใน contract ครบ และ response ตัวอย่างผ่าน schema ของ contract (ตรวจด้วย `jsonschema` ที่มีอยู่แล้ว)
4. **ตัวตน:** ทุก route ยกเว้น `/v1/setup`, `/v1/auth/login`, `/v1/health` ต้องมี `Authorization: Bearer …`
   - session (`jrs_`) ใช้ได้ทุก route; API key (`jrk_`) ใช้ได้กับ `POST /v1/render` เท่านั้น ที่อื่น → `401`
   - ผู้เรียกที่ไม่มีสิทธิ์เห็น object ได้ `404` เหมือนไม่มี (contract) — v1 ทุกคนเห็นทุกอย่าง จึงเกิดเฉพาะกรณีไม่มีจริง
5. **IP ของผู้ใช้จริงสำหรับ rate limit (ตาม SPEC-auth, ผู้ใช้ยืนยันค่าลับร่วม):** Next.js ส่ง `X-Jester-Client-IP` พร้อม `X-Jester-Studio-Key: <ค่าลับร่วม>` (env `JESTER_STUDIO_KEY` ตั้งเหมือนกันทั้ง api และ studio); ถ้าค่าลับตรง (เทียบแบบ constant-time) เชื่อ header IP ไม่งั้นใช้ IP ของ connection — ระบบภายนอกปลอม IP ไม่ได้
6. **ตัวเลขในข้อมูลเป็นทศนิยมแม่นยำ:** body ของ `render` และ `preview` parse เองด้วย `json.loads(parse_float=Decimal)` ไม่ใช่ parser ปกติของ FastAPI (ที่ให้ float) แล้วตรวจรูปร่างด้วย pydantic
7. **ขนาด request:** ไม่เกิน `JESTER_MAX_REQUEST_BYTES` (ค่าเริ่มต้น 10 MB) ตรวจจาก `Content-Length` และนับระหว่างอ่าน body → `413`; ไฟล์ข้อความ/asset ใช้ขีดจำกัดของ template-store
8. **Error เป็น RFC 9457 (`application/problem+json`):** `type` = `https://jester-report.dev/errors/<code-kebab>`, `code` ตาม `ErrorCode` ของ contract, `problems` ตาม `ValidationProblem`, `retryable` และ `runId` เมื่อมี; ทุก exception ของ module (`StoreError`, `AuthError`, `RenderError`) map ในที่เดียว; error ที่ไม่คาดคิด → `500` ข้อความกลาง ๆ + log แบบมี stack (ไม่มีค่าจาก request)
9. **Revision ใน header:** route ที่แก้ draft อ่าน `If-Match` (เช่น `"12"`) ถ้าไม่มีหรือไม่ใช่ตัวเลข → `428`/`422`; publish ใช้ revision จาก `If-Match` ตรวจด้วย `validate` ก่อนแล้วส่งต่อให้ `publish` (draft ไม่ผ่าน → `422 DRAFT_INVALID` พร้อม problems)
10. **Start-up:** อ่าน config จาก env → เปิด psycopg pool → `migrate()` → `auth.prepare_setup()` ถ้าได้ token พิมพ์ลง log เป็นบรรทัดเด่น → `S3BlobStore.ensure_bucket()`; shutdown ปิด pool และ engine client
11. **Deploy (ผู้ใช้ยืนยัน):** `apps/api/Dockerfile` (Python 3.12-slim, `uv sync --frozen`, user ไม่ใช่ root) และ `infra/compose.yaml` ใน module นี้: api + postgres + rustfs + gotenberg (image ของเราพร้อม args ที่ปิด JS และ allow-list) — studio เพิ่มภายหลัง
   - ค่าลับทั้งหมด (รหัส DB, S3, `JESTER_STUDIO_KEY`) มาจาก `.env` ที่สร้างจาก `infra/.env.example`; ไม่มีค่าลับจริงใน repo
   - **uvicorn 2 workers เป็นค่าเริ่มต้น** ตั้งได้ด้วย `JESTER_API_WORKERS` (render พร้อมกันสูงสุด 12 ขณะที่ Gotenberg รับ 6 ที่เหลือรอที่ Gotenberg ภายใน timeout 30 วินาที); เครื่อง 1 CPU ตั้งเป็น 1
   - ฝั่ง Windows dev ตั้ง selector event loop ใน entrypoint
12. **Log:** JSON หนึ่งบรรทัดต่อ request (method, path template, status, ms, run id, request id) ไม่ log body, header `Authorization`, token หรือค่าจาก data
13. **Docs (ผู้ใช้ยืนยัน):** ปิด `/docs`, `/redoc`, `/openapi.json` ที่ FastAPI สร้างเอง (ไม่ตรงกับ contract เช่น body ของ render ที่ parse เป็น Decimal) แล้วเสิร์ฟไฟล์ `public-api.yaml` ที่ `GET /v1/openapi.yaml` โดยไม่ต้อง login — เพิ่ม operation นี้ใน contract

## Objective

เปิด HTTP API ตาม contract ให้ระบบภายนอก render PDF ด้วย API key และให้ Studio ทำทุกอย่างผ่าน session — โดยเป็นแค่ชั้นแปลง HTTP ที่ map error ตรงตาม contract และไม่มีช่องโหว่ระดับ HTTP (ขนาด, ตัวตน, header ปลอม)

### User stories

- ในฐานะระบบภายนอก ฉันส่ง `POST /v1/render` ด้วย `Authorization: Bearer jrk_…` แล้วได้ PDF พร้อม `Jester-Run-Id`, `Jester-Template-Version`, `Content-Disposition` ที่ชื่อไฟล์ภาษาไทยถูกต้อง (RFC 6266/8187); ตัวเลข `1250.5` ใน data ไม่กลายเป็น float
- ในฐานะ Studio (Next.js server) ฉันเรียกทุก operation ด้วย session token และส่ง IP ของ browser ผ่าน header ที่ยืนยันด้วยค่าลับร่วม
- ในฐานะคนติดตั้ง ฉัน `docker compose up` แล้วเห็น setup token ใน log ของ `api` ชัดเจน
- ในฐานะผู้ดูแล ฉันดู `/v1/health` แล้วรู้ว่า db, storage, engine ตัวไหนล่ม

## Interface

```python
def create_app(settings: Settings | None = None) -> FastAPI: ...   # อ่าน env เมื่อไม่ส่ง settings

@dataclass(frozen=True)
class Settings:
    database_url: str
    s3_endpoint: str; s3_bucket: str; s3_access_key: str; s3_secret_key: str
    gotenberg_url: str
    studio_key: str | None              # ไม่ตั้ง = ไม่เชื่อ X-Jester-Client-IP เลย
    max_request_bytes: int = 10 * 1024 * 1024
    engine_image: str = "jester/gotenberg:9.4.1-th1"
    workers: int = 2                    # ใช้ตอนรัน uvicorn ใน container
```

env: `DATABASE_URL`, `JESTER_S3_ENDPOINT`, `JESTER_S3_BUCKET`, `JESTER_S3_ACCESS_KEY`, `JESTER_S3_SECRET_KEY`, `GOTENBERG_URL`, `JESTER_STUDIO_KEY`, `JESTER_MAX_REQUEST_BYTES`, `JESTER_API_WORKERS`

## Tech Stack

Python ≥3.11, **dependency ใหม่: `fastapi`, `uvicorn[standard]`** (ทั้งคู่ MIT/BSD; ระบุไว้ใน intent แล้ว), module เดิมทั้งหมด; test ใช้ `httpx.AsyncClient` + `ASGITransport` (มี `httpx` แล้ว)

## Commands

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check .
uv run pytest tests/public_api -q --cov=jester_api.public_api --cov-report=term-missing
JESTER_TEST_DATABASE_URL=… JESTER_TEST_S3_ENDPOINT=… GOTENBERG_URL=… uv run pytest tests/public_api -m "db or engine or storage" -q
uv run uvicorn jester_api.public_api:app --reload     # dev
docker build -t jester/api apps/api
```

## Project Structure

```
apps/api/src/jester_api/public_api/
  __init__.py     → create_app, app (สำหรับ uvicorn)
  settings.py     → Settings จาก env
  app.py          → lifespan (pool, migrate, setup token, bucket), middleware (ขนาด, log), error handler
  security.py     → อ่าน bearer → Principal, session-only / render-allowed, IP ของผู้ใช้จริง
  problems.py     → แปลง StoreError/AuthError/RenderError → problem+json
  routes/         → setup_auth.py, users_keys.py, templates.py, draft.py, versions.py, render.py, runs.py, health.py
apps/api/Dockerfile, apps/api/.dockerignore
infra/compose.yaml                 → api + postgres + rustfs + gotenberg (เปิดพอร์ตแค่ api); studio เพิ่มภายหลัง
infra/.env.example                 → ค่าที่ต้องตั้ง (ไม่มีค่าลับจริง)
apps/api/tests/public_api/
  test_contract.py  test_security.py  test_render.py  test_templates.py  test_auth_routes.py  test_runs_health.py
```

## Code Style

```python
@router.post("/v1/render", responses=..., dependencies=[])
async def render(request: Request, caller: Principal = Depends(render_caller)) -> Response:
    body = RenderRequest.model_validate(await decimal_json(request))      # parse_float=Decimal, size-checked
    outcome = await services(request).render.render(
        body.template.id, body.template.version, body.params or {}, body.data, caller,
        request.headers.get("X-Request-Id"), body.filename,
    )
    return Response(outcome.pdf, media_type="application/pdf", headers={
        "Jester-Run-Id": outcome.run_id,
        "Jester-Template-Version": str(outcome.version),
        "Content-Disposition": content_disposition(outcome.filename),
    })
```

route สั้น: อ่าน input → เรียก module → สร้าง response; error ไหลไปที่ handler กลาง

## Testing Strategy

- **Contract:** ทุก path+method ใน `public-api.yaml` มี route และไม่มี route เกิน (`/docs`, `/openapi.json` ตอบ 404; `/v1/openapi.yaml` คืนไฟล์ contract); response ของ test หลัก (TemplateSummary, Draft, Version, Run, User, ApiKey, Health, Problem) ผ่าน schema ของ contract
- **Security:** ไม่มี bearer → 401 ทุก route ที่ต้องมี; API key ใช้ได้แค่ render; `X-Jester-Client-IP` ถูกเชื่อเฉพาะเมื่อค่าลับตรง; ไม่มี token/รหัสผ่านใน log ที่จับได้ระหว่าง test
- **Render:** `1250.5` ใน data ถึง data-prep เป็น `Decimal("1250.5")`; header ครบ; ชื่อไฟล์ไทยใน `Content-Disposition` แบบ `filename*=UTF-8''…`; body ใหญ่เกิน → 413
- **Map error:** ตัวอย่างละหนึ่งของทุก code (404, 409, 412, 413, 415, 422, 428, 429, 502, 503, 504) ได้ problem+json ที่ถูกต้อง
- **Flow ครบ (db + engine จำลอง):** setup → login → สร้าง template จาก starter → แก้ไฟล์ (If-Match) → validate → publish → สร้าง API key → render ด้วย key → ดู run
- **Live (VM):** flow เดียวกันกับ engine/db/storage จริง
- Coverage ≥ 90%

## Boundaries

- **Always:** ตาม contract เท่านั้น (เปลี่ยน contract ก่อนเปลี่ยน route), error ผ่าน handler กลาง, body ของ render/preview เป็น Decimal, ไม่ log ความลับหรือข้อมูลลูกค้า
- **Ask first:** เพิ่ม endpoint ที่ไม่อยู่ใน contract, เปิด CORS/ให้ browser เรียกตรง, เปลี่ยนจำนวน worker หรือขีดจำกัดขนาด, เพิ่ม dependency นอกจาก fastapi/uvicorn
- **Never:** business logic ใน route, เชื่อ `X-Jester-Client-IP` โดยไม่มีค่าลับ, คืน stack trace ให้ผู้เรียก, เปิด FastAPI docs อัตโนมัติที่ไม่ตรง contract ใน production

## Success Criteria

1. ทุก operation ใน contract ทำงานและผ่าน test contract (route ครบ, response ตรง schema)
2. Flow ครบตั้งแต่ setup ถึง render ด้วย API key ผ่านทั้งแบบจำลองและบน VM จริง
3. ทุก error code ได้ HTTP status และ problem+json ตาม contract
4. ช่องโหว่ระดับ HTTP ที่ระบุ (ขนาด, API key ผิดที่, IP ปลอม) มี test และปิดได้
5. `docker build` ผ่าน และ `docker compose up` (api + postgres + rustfs + gotenberg) ได้ `/v1/health` = up บน VM; coverage ≥ 90%, `ruff` สะอาด

## Open Questions

ปิดแล้วทั้งหมดจาก interview 14 พ.ย. 2026: เรียกผ่าน reverse proxy และ Studio อยู่ใน network ภายใน, ใช้ค่าลับร่วม `JESTER_STUDIO_KEY`, uvicorn 2 workers (ตั้งได้), ปิด docs อัตโนมัติและเสิร์ฟ `public-api.yaml` ที่ `/v1/openapi.yaml`, ทำ `infra/compose.yaml` (ไม่มี studio) ใน module นี้

## Out of scope

Studio UI, CORS/browser เรียกตรง, rate limit ต่อ API key, metrics/Prometheus, OpenAPI client generation, TLS (ให้ reverse proxy ทำ), async render/webhook

---

# v1.1: Foundations (A1–A4, B1, B2, C2)

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.1 และหัวข้อ v1.1 ของ [template-store](SPEC-template-store.md), [render-service](SPEC-render-service.md), [auth](SPEC-auth.md)
หัวข้อ v1 ด้านบนยังใช้ทั้งหมด (ยังเป็นชั้นบางตาม contract); ข้อ "rate limit ต่อ API key" ใน Out of scope ย้ายเข้ามาในรอบนี้

## สมมติฐาน v1.1

1. **contract ก่อนเสมอ:** แก้ `public-api.yaml` → test contract บังคับ route ครบ → `npm run gen:api` ให้ Studio (ตามวิธีเดิม)
2. **endpoint ใหม่ทั้งหมดใช้ session เท่านั้น**; API key ยังใช้ได้แค่ `POST /v1/render`
3. **`TEMPLATE_ARCHIVED` code เดียว สอง status:** การแก้ไขจาก Studio ได้ **409** (เป็นสถานะที่ขัดกับการกระทำ เหมือน `CONFLICT`); render/preview/validate ได้ **410** ตามที่ `render-service` กำหนด (ผู้ใช้ตัดสินแล้วสำหรับ render)
4. **rate limit ตรวจก่อนอ่าน body:** request ที่เกินโควตาจึงไม่ต้อง parse JSON ขนาดใหญ่ ไม่มี run และไม่เข้าคิว render
5. **import มีขีดจำกัดขนาดเฉพาะ route:** zip ≤ 25 MB ตาม template-store มากกว่าค่าเริ่มต้นของทั้ง api (10 MB) จึงให้ `BodyLimit` ใช้ 26 MB เฉพาะ `POST /v1/templates/import` (เผื่อ multipart) — route อื่นเหมือนเดิม

## Contract ที่เพิ่ม/เปลี่ยน

**operation ใหม่ (5 ตัว; contract จาก 42 เป็น 47 + `GET /v1/openapi.yaml`)**

| operation | request | response |
| --- | --- | --- |
| `GET /v1/templates/{templateId}/export` `exportTemplate` | query `version` = `draft` (ค่าเริ่มต้น) หรือเลข | `200 application/zip`; `Content-Disposition` = `<id>-v<N>.zip` หรือ `<id>-draft-r<revision>.zip` |
| `POST /v1/templates/import` `importTemplate` | `multipart/form-data`: `file` (zip), `templateId` (เลือกใส่); header `If-Match` เมื่อทับรายงานเดิม | `201` (สร้างใหม่) / `200` (ทับ draft): `{template: TemplateSummary, revision, created}` |
| `POST /v1/templates/{templateId}/duplicate` `duplicateTemplate` | `{id, name, version?: "draft" \| integer}` | `201 TemplateSummary` |
| `PUT /v1/templates/{templateId}/archived` `setTemplateArchived` | `{archived: boolean}` | `200 TemplateSummary` |
| `PUT /v1/users/{userId}/password` `setUserPassword` | `{newPassword}` (12–200 ตัว) | `204` |

**operation ที่เปลี่ยน**

- `GET /v1/templates` เพิ่ม query `includeArchived` (boolean, ค่าเริ่มต้น `false`)
- `POST /v1/templates` body `starter` เพิ่มค่า `tax-invoice`
- `POST /v1/api-keys` body เพิ่ม `expiresAt` (date-time), `templates` (array ของ `TemplateId`, 1–100), `rateLimitPerMinute` (integer 1–10000) — ทั้งสามเลือกใส่ได้
- `POST /v1/render` เพิ่ม response `403` (`TEMPLATE_NOT_ALLOWED`), `410` (`TEMPLATE_ARCHIVED`), `429` (`RATE_LIMITED`, header `Retry-After` เป็นวินาที, `retryable: true`)
- `draft/preview`, `draft/validate` เพิ่ม `410`; ทุก route ที่แก้ draft/version/alias/ชื่อ เพิ่ม `409 TEMPLATE_ARCHIVED`

**schema**

- `TemplateSummary` + `archivedAt` (date-time | null), `archivedBy` (string | null)
- `ApiKey` + `expiresAt`, `templates` (array | null), `rateLimitPerMinute` (integer | null)
- `ErrorCode` + `TEMPLATE_ARCHIVED`, `TEMPLATE_NOT_ALLOWED`

## Map error ที่เพิ่ม

| ที่มา | code | HTTP |
| --- | --- | --- |
| `StoreError("ARCHIVED")` จาก route ที่แก้ไข | `TEMPLATE_ARCHIVED` | 409 |
| `RenderError` `TEMPLATE_ARCHIVED` | `TEMPLATE_ARCHIVED` | 410 |
| `RenderError` `TEMPLATE_NOT_ALLOWED` | `TEMPLATE_NOT_ALLOWED` | 403 |
| `Quota(allowed=False)` | `RATE_LIMITED` + `Retry-After` | 429 |
| import ทับโดยไม่ส่ง `If-Match` (`StoreError CONFLICT`) | `CONFLICT` (detail บอกให้ส่ง revision) | 409 |
| `If-Match` ไม่ใช่ตัวเลข | `INPUT_INVALID` (กติกา v1) | 422 |

## ลำดับใน `POST /v1/render` (v1.1)

```python
@router.post("/v1/render")
async def render(request: Request, caller: RenderCaller) -> Response:
    quota = await services(request).auth.consume_render_quota(caller)        # B2: before reading the body
    if not quota.allowed:
        raise AuthError("RATE_LIMITED", "too many renders for this API key; retry later",
                        retry_after=quota.retry_after_s)                     # -> 429 + Retry-After
    body = await read_render_body(request)                                   # Decimal parse, 413 as before
    outcome = await services(request).renders.render(..., caller=caller, ...) # 403 / 410 from render-service
    ...
```

## Testing Strategy v1.1

- **contract:** 47 operation มี route ครบและไม่มีเกิน; response ใหม่ผ่าน schema (`TemplateSummary` ที่มี `archivedAt`, `ApiKey` ที่มี limit, ผลของ import)
- **export/import ผ่าน HTTP:** export draft → import เป็น id ใหม่ → `GET draft` ไฟล์และ asset ตรงกัน; import ทับด้วย `If-Match` ถูก → 200 `created: false`; ไม่มี `If-Match` → 409; `If-Match` ผิด → 412; zip 25.5 MB ผ่าน `BodyLimit` แต่ template-store ปฏิเสธ → 413; zip 27 MB ถูกตัดที่ `BodyLimit` → 413; route อื่นที่ส่ง 11 MB ยังได้ 413 เหมือนเดิม
- **archive:** archive แล้ว `PUT …/files/x` → 409 `TEMPLATE_ARCHIVED`; `POST /v1/render` → 410; `GET /v1/templates` ไม่เห็น, `?includeArchived=true` เห็นพร้อม `archivedAt`; unarchive แล้วกลับมาครบ
- **duplicate:** 201 พร้อม draft revision 1; id ซ้ำ → 409
- **ตั้งรหัสผ่าน:** 204 แล้วเจ้าของบัญชี login ด้วยรหัสใหม่ได้ และ session เดิมของเขาได้ 401; ตั้งให้ตัวเอง → 422; API key เรียก → 401
- **API key แบบจำกัด:** สร้างด้วย `templates: ["a"]` แล้ว render `b` → 403 `TEMPLATE_NOT_ALLOWED`; `expiresAt` ในอดีต → 422; key หมดอายุ (นาฬิกาจำลอง) → 401
- **rate limit:** key ที่ `rateLimitPerMinute: 2` → request ที่ 3 ได้ 429 พร้อม `Retry-After` 1–60 และไม่มี run ใหม่; body ที่ใหญ่เกินของ request ที่เกินโควตาไม่ถูกอ่าน (ได้ 429 ไม่ใช่ 413); key ที่ไม่ตั้งไม่ถูกจำกัด
- **flow ครบ (db + engine จำลอง):** สร้างจาก starter `tax-invoice` → validate ผ่าน → publish → render ด้วย key ที่จำกัดรายงานนี้ → ได้ PDF
- coverage ≥ 90%

## Boundaries v1.1

- **Always:** แก้ contract ก่อน route; rate limit ก่อนอ่าน body; ขีดจำกัดขนาดพิเศษเฉพาะ route import
- **Ask first:** ให้ API key ใช้ export/import (เช่นสำหรับ CI ของทีม), เพิ่มขีดจำกัดขนาดของ route อื่น
- **Never:** บอกผู้ถือ key ว่ารายงานที่ไม่มีสิทธิ์มีอยู่หรือไม่, ใส่รายละเอียดของโควตาคนอื่นใน error

## Success Criteria v1.1

1. ทุก operation ใหม่และที่เปลี่ยนตรง contract และผ่าน test contract
2. ย้ายรายงานระหว่างสองเครื่องได้ด้วย `curl` สองคำสั่ง (export แล้ว import)
3. key ที่จำกัดรายงาน/หมดอายุ/เกินโควตาได้ 403/401/429 ตามตาราง และ key เดิมทำงานเหมือนเดิม
4. coverage ≥ 90%, `ruff` สะอาด

## Open Questions v1.1

ไม่มี

---

# v1.5: เก็บเอกสารที่ออก (D2)

สถานะ: **อนุมัติ 19 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.5, [SPEC-render-service.md](SPEC-render-service.md) หัวข้อ v1.5

## สมมติฐาน v1.5

1. **contract ก่อนเสมอ** (เหมือน v1.1): แก้ `public-api.yaml` → test contract → `npm run gen:api`
2. **session เท่านั้น** (ผู้ใช้ตัดสิน: ไม่มี API ให้ระบบอื่นดึงใบเดิม) — API key เรียกสอง operation นี้ได้ 401/403 เหมือน endpoint session อื่น
3. **ไม่มี role:** ผู้ใช้ Studio ทุกคนเห็นเอกสารทุกรายงาน (เหมือน v1.4)

## Contract ที่เพิ่ม/เปลี่ยน

| operation | request | response |
| --- | --- | --- |
| `GET /v1/documents` `listDocuments` | query `templateId?`, `q?` (1–100 ตัวอักษร), `limit` 1–200 (ค่าเริ่มต้น 50), `before?` | `200 {items: DocumentSummary[], next: string \| null}` |
| `GET /v1/documents/{runId}` `getDocument` | — | `200 application/pdf` + `Content-Disposition` จากชื่อไฟล์ที่เก็บ (`content_disposition()` เดิม); ไม่มี → `404 NOT_FOUND` |

- `DocumentSummary`: `runId`, `createdAt`, `templateId`, `version`, `caller` (`type`/`id`/`name` แบบ `Run`), `filename`, `pages`, `params`
- `Run` เพิ่ม `hasDocument: boolean` (required) — หน้าประวัติใช้แสดงลิงก์ดาวน์โหลด
- run ที่ถูกลบตาม retention → เอกสารหายด้วย → `getDocument` ได้ 404; มีแถวแต่ PDF หายจาก object storage หรือ sha256 ไม่ตรง → 404 เช่นกัน (api log error)
- `RunRetention` เพิ่ม `wouldDeleteDocuments: integer | null` (มีเฉพาะเมื่อส่ง `previewDays` เหมือน `wouldDelete`)
- `renderReport`: เขียน PDF ลง object storage ไม่ได้ → `503 SERVICE_UNAVAILABLE` (มีใน contract อยู่แล้ว ไม่เพิ่ม code ใหม่)

## Testing Strategy v1.5

- contract: route ครบ 50 operation (48 + 2) และ response ผ่าน schema
- session เห็นรายการ, ค้นหา, paging และดาวน์โหลดได้ไบต์ตรง; API key ได้ 401/403 ทั้งสอง operation
- `q` ว่างหรือยาวเกิน 100 → 422; `runId` ที่ไม่มีหรือเป็น preview → 404

## Success Criteria v1.5

1. Studio ดึงรายการและดาวน์โหลดเอกสารผ่าน contract ได้ และ API key เข้าไม่ได้
2. coverage ≥ 90%, `ruff` สะอาด, test contract ผ่าน

# v1.8: สร้างรายงานพร้อม `page` (L5)

สถานะ: **อนุมัติ 20 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.8

- `POST /v1/templates` รับ `page` (optional) รูปแบบเดียวกับ `report.json` → `page`; ใช้ได้กับ starter `blank` เท่านั้น
- ไม่มี endpoint ใหม่อื่น; ขนาดกระดาษเปลี่ยนทีหลังด้วย `putDraftFile` ของ `report.json` ตามเดิม
- contract test + OpenAPI อัปเดต (`PageSpec` schema)
- `TemplateSummary.page` (รายการรายงาน, `GET /v1/templates`) บอกกระดาษจริงของ draft: `size`, `orientation`, `layout`, และ `rollWidthMm` เมื่อเป็นม้วน (เดิมเป็น `A4` เสมอ) — เพิ่ม field เท่านั้น; การ์ดในแคตตาล็อกแสดงตามนี้

---

# v1.11: tag และสี

สถานะ: **อนุมัติ 22 พ.ย. 2026** · ที่มา: [docs/ideas/tags-v1-11.md](docs/ideas/tags-v1-11.md)

| operation | request | response |
| --- | --- | --- |
| `PUT /v1/templates/{id}/tags` `setTemplateTags` | `{tags: string[]}` (Studio session) | `200 {tags}`; tag ผิด → `422` บอกว่า tag ไหน; ไม่มี id → `404`; API key → `401` |
| `PUT /v1/documents/{runId}/tags` `setDocumentTags` | `{tags: string[]}` (Studio session เท่านั้น) | `200 {tags}`; `runId` ไม่มี → `404`; API key → `401` |
| `GET /v1/tags` `listTags` | — | `200 [{tag, color, templates, documents}]` เรียงตามจำนวนใช้รวม แล้วชื่อ |
| `PUT /v1/tag-colors` `setTagColor` | `{tag, color}` | `200 {tag, color}`; `color` นอกชุด → `422`; `gray` = ลบแถวสี; tag ที่ไม่มีใครใช้ก็ตั้งสีได้ (Studio session เท่านั้น) |

- `TemplateSummary` และ `DocumentSummary` เพิ่ม `tags: string[]` (required); `GET /v1/templates` และ `GET /v1/documents` รับ `?tag=` ซ้ำได้ (ต้องมีทุก tag);
  `q` ของเอกสารค้น tag ด้วย
- `POST /v1/render` รับ `tags?: string[]` (API key ได้) — ไม่ส่ง = สำเนา tag ของรายงาน; tag ผิด → `422` ก่อน render
- ชุดสี: `gray red orange yellow green teal blue purple pink`
- `apps/api/openapi/public-api.yaml` ปรับพร้อมกัน; Studio สร้าง `lib/types.gen.ts` ด้วย `npm run gen:api`

## Testing Strategy v1.11

- contract test ผ่านกับ operation ใหม่; กรองหลาย tag; PUT แทนทั้งชุด; API key แก้ tag ไม่ได้ (403); สีนอกชุด 422; `gray` ลบแถว; `/v1/tags` นับถูก

---

# v1.12: contract เป็น API docs

สถานะ: **อนุมัติ 23 พ.ย. 2026** · Studio: หัวข้อ v1.12 ใน [SPEC-studio.md](SPEC-studio.md)

- ทุก operation ใน `public-api.yaml` มี `summary` และ `description`; ทุก body ที่เป็น JSON หรือ problem+json มี example (ยกเว้น multipart, PDF, zip, asset และ YAML ของ contract)
- error ที่ใช้ร่วม (`components/responses`) มี example ครั้งเดียว ใช้ได้ทุก operation; `InputInvalid` มี 3 แบบ: param ขาด (`PARAM_REQUIRED` ที่ `/params/…`), data ผิด schema (`DATA_INVALID` ที่ `/data/…`), body ไม่ตรง contract
- `info` และ `servers` บอกของจริง (เวอร์ชันตาม release, server เป็น variable `JESTER_API`)

## Testing Strategy v1.12

- `test_contract`: ทุก operation มี summary/description; ทุก JSON body มี example; ทุก example ผ่าน schema ของตัวเอง (validate ผ่าน pointer ใน contract เพื่อให้ `$ref` ภายใน resolve ได้)

---

# v1.13: session อายุยาวสำหรับ MCP

สถานะ: **อนุมัติ 23 พ.ย. 2026** · ที่มา: [SPEC-mcp.md](SPEC-mcp.md) ข้อ 4a · auth: หัวข้อ v1.13 ใน [SPEC-auth.md](SPEC-auth.md)

## Contract ที่เปลี่ยน

- `POST /v1/auth/login` body เพิ่ม `lifetime` (`"standard"` | `"long"`, ไม่บังคับ, ค่าเริ่มต้น `standard`) — `additionalProperties: false` เดิมคงไว้
- `long` ต้องมาพร้อม `X-Jester-Studio-Key` ที่ตรงกับ `JESTER_STUDIO_KEY` (เทียบแบบ constant-time ด้วย helper เดียวกับ `client_ip`); ไม่มี/ผิด หรือ api ไม่ได้ตั้งค่าลับ → `422 INPUT_INVALID` (ไม่ใช่ 401 เพราะรหัสผ่านยังไม่ถูกตรวจ และไม่ให้เดาได้ว่ารหัสถูกไหม)
- response เหมือนเดิม (`Session`); `expiresAt` ของ session ยาวห่างจากตอนนี้ 30 วัน

## Testing Strategy v1.13

- `lifetime: long` + key ถูก → 200, `expiresAt` ≈ +30 วัน; ไม่มี key / key ผิด / api ไม่ตั้งค่าลับ → 422 และไม่นับเป็น login ผิด; `lifetime` ค่าอื่น → 422; ไม่ส่ง → session ปกติ
- `test_contract` ผ่าน (example ใหม่ผ่าน schema)

---

# v1.14: ฟอร์มเปล่า

สถานะ: **รออนุมัติ** · กติกาการเตรียมข้อมูล: หัวข้อ v1.14 ใน [SPEC-data-prep.md](SPEC-data-prep.md)

## Contract ที่เปลี่ยน

- `POST /v1/render` รับ query param `allowEmpty` (boolean, ไม่บังคับ, ค่าเริ่มต้น `false`; รับ `true`/`false` เท่านั้น ค่าอื่น → `422 INPUT_INVALID`)
  - `true` → render service เรียก `prepare(..., blank=True)`: ข้ามช่องบังคับ ยอดที่คำนวณไม่ได้เว้นว่าง `meta.blank` เป็น `true`
  - body, response, header, การนับ quota, การเก็บเอกสาร และ run history เหมือนเดิมทุกอย่าง (เอกสารเปล่าเป็นเอกสารที่ออกตามปกติ)
- คำอธิบายของ operation และ example ใน `apps/api/openapi/public-api.yaml` ระบุ `allowEmpty` และตัวอย่าง body `{"template":…,"params":{},"data":{}}`
- `POST /v1/templates/{templateId}/draft/preview` และ `.../draft/prepared` รับ `allowEmpty` แบบเดียวกัน (คนออกแบบดูฟอร์มเปล่าก่อน publish)
- Studio route `/issue/<id>` ส่ง `?allowEmpty=true` ต่อให้ api เมื่อผู้ใช้ติ๊กฟอร์มเปล่า (route เดิม ไม่มี endpoint ใหม่)

## Testing Strategy v1.14

- รายงานที่มีช่องบังคับ: ไม่ส่ง `allowEmpty` + `data={}` → 422 เหมือนเดิม; `?allowEmpty=true` + `data={}` → 200 PDF และมี run ใน history
- `?allowEmpty=yes` → 422
- `draft/preview?allowEmpty=true` + `data={}` บน draft ที่มีช่องบังคับ → 200 PDF
- API key ที่จำกัดรายงาน (allow-list) และ rate limit ทำงานเหมือนเดิมกับ `allowEmpty`
- `test_contract` ผ่าน (param ใหม่มี description, example ผ่าน schema)

---

# v1.15: นำเข้าแบบฟอร์ม Word (.docx)

สถานะ: **รออนุมัติ** · การแปลง: หัวข้อ v1.15 ใน [SPEC-template-store.md](SPEC-template-store.md)

## Contract ที่เปลี่ยน

- `POST /v1/templates/import` (multipart เดิม) รับ `file` เป็น .docx ได้ด้วย: แยกจาก zip ของ Jester ด้วยเนื้อใน (มี `word/document.xml`, ไม่มี `jester.json`) ไม่ใช่นามสกุล
  - .docx ต้องมี `templateId` (ไม่มี manifest ให้เอา id) และรับ field ใหม่ `name` (ไม่บังคับ; ไม่ใส่ = ชื่อไฟล์)
  - .docx + `If-Match` (ทับ draft) → `422 INPUT_INVALID` "นำเข้า Word ได้เฉพาะเป็นรายงานใหม่"
  - id ซ้ำ → `409 CONFLICT` เหมือน zip
- response เพิ่ม `warnings: Problem[]` (ว่างเสมอสำหรับ zip) รูปเดียวกับ `problems` ของ validate
- OpenAPI: description และ example ของ .docx; `test_contract` ผ่าน

## Testing Strategy v1.15

- .docx ใหม่ → 201 + `warnings`; ไม่มี `templateId` → 422; มี `If-Match` → 422; ไฟล์ที่ไม่ใช่ทั้งสองแบบ → 422; test ของ zip เดิมผ่านทั้งหมดโดยไม่แก้
