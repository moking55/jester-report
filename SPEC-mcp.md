# Spec: `mcp`

สถานะ: **ร่าง 23 พ.ย. 2026** (intent ยืนยันแล้ว; Open Questions ปิดครบ; รอผู้ใช้อนุมัติ spec ทั้งฉบับ)
Module id: `mcp` (เพิ่มใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หลังอนุมัติ) · ขึ้นกับ: `public-api` ผ่าน HTTP เท่านั้น · ถูกใช้โดย: claude.ai (custom connector) ของคนทำรายงาน
อ้างอิง: [intent](docs/intent/mcp-report-authoring.md), [public-api.yaml](apps/api/openapi/public-api.yaml), [SPEC-auth.md](SPEC-auth.md), skill [to-jester](.claude/skills/to-jester/SKILL.md) และ [format.md](.claude/skills/to-jester/references/format.md)

## สมมติฐาน (ยังไม่ยืนยัน ยกเว้นที่ระบุ)

1. **Remote MCP หลัง proxy เดิม (ผู้ใช้ยืนยัน):** service ใหม่ `mcp` ใน `infra/compose.yaml` ใช้ transport Streamable HTTP; reverse proxy ของทีมที่เปิด HTTPS ออก internet ส่งต่อมาที่ service นี้ เพราะ claude.ai เรียก connector จาก cloud ของ Anthropic ไม่ใช่จากเครื่องผู้ใช้
   - **subdomain แยก (ผู้ใช้ยืนยัน)** เช่น `https://mcp.<โดเมนทีม>/mcp` เพราะ OAuth metadata ต้องอยู่ที่ `/.well-known/…` ของ host; วางใต้ path ของ Studio ทำให้ discovery ยุ่ง
   - **ทุกบัญชีใช้ได้ (ผู้ใช้ยืนยัน):** ไม่มี allow-list ของ username; ใครที่ login Studio ได้ก็เพิ่ม connector ได้
2. **เป็น client ของ API:** `mcp` เรียก `public-api` ทาง network ภายในของ compose (`http://api:8000`) ตาม contract เท่านั้น ไม่ import `jester_api` ไม่ต่อ Postgres/S3; ของเดิมที่ต้องแก้มีอย่างเดียวคือ session อายุยาว (ข้อ 4a) ไม่มีไฟล์ใน `apps/studio` เปลี่ยน
3. **OAuth: MCP เป็น authorization server เอง (แต่ละคนใช้บัญชีตัวเอง — ผู้ใช้ยืนยัน):**
   - ใช้ส่วน auth ของ `mcp` Python SDK (metadata RFC 8414/9728, `/authorize`, `/token`, `/register` dynamic client registration, PKCE) — ต้องยืนยันใน prototype ว่า SDK เวอร์ชันที่ pin ทำได้ครบกับ claude.ai
   - `/authorize` แสดงหน้า login ภาษาไทยของ MCP เอง (HTML ฟอร์มเดียว ไม่มี JS) → ส่ง username/รหัสผ่านไป `POST /v1/auth/login` ของ API → ได้ Jester session → ออก authorization code
   - **Dynamic registration รับเฉพาะ redirect URI ใน allow-list** (ค่าเริ่มต้น callback ของ claude.ai/claude.com) กันคนสร้าง client ปลอมมาหลอกเก็บ code
   - ส่งต่อ IP ของ browser ด้วย `X-Jester-Client-IP` + `X-Jester-Studio-Key` (กลไกเดิมของ Studio) เพื่อให้ rate limit ของ login นับต่อคนจริง ไม่ใช่ต่อ IP ของ container `mcp`; IP ของ browser อ่านจาก header ของ proxy ที่ตั้งใน env (`JESTER_MCP_CLIENT_IP_HEADER`)
4. **Token ของ MCP ไม่ใช่ session ของ Jester:** claude.ai ได้ access token ที่ MCP ออกเอง (`jmc_` + สุ่ม 32 byte) ใช้ได้กับ `/mcp` เท่านั้น; session ของ Jester อยู่ใน MCP ไม่ออกไปนอก server
   - เหตุผล: Jester ไม่มี role — session จริงเรียก API ได้ทุกอย่าง (ลบผู้ใช้, ออก key); ถ้า token รั่วจากฝั่ง client จะได้แค่ tool ระดับ draft
   - เก็บใน SQLite (stdlib) บน volume ของ `mcp`: `sha256(access token)` → Jester session token, username, หมดอายุ; ตาราง client ที่ลงทะเบียน; code อยู่ในหน่วยความจำ อายุ 5 นาที ใช้ได้ครั้งเดียว
   - ไม่มี refresh token: access token มี `expires_in` = 90 วัน แต่ใช้ได้จริงเท่าที่ session ของ Jester ยังใช้ได้; เมื่อ API ตอบ `401` (ไม่ได้ใช้เกิน 30 วัน, ครบ 90 วัน, ผู้ใช้ถูกลบ, เปลี่ยนรหัส) MCP ลบแถวแล้วตอบ `401` + `WWW-Authenticate` ให้ claude.ai พาไป login ใหม่
4a. **Session อายุยาวสำหรับ MCP (ผู้ใช้ยืนยัน 23 พ.ย. 2026; แก้ `auth` + `public-api` = R1, release เป็น minor):**
   - **อายุ:** หมดเมื่อไม่ได้ใช้ **30 วัน**; ใช้ตอนเหลือไม่ถึง 15 วัน → ต่อเป็น 30 วันเต็ม; **เพดาน 90 วัน** หลัง login (session ของ Studio คง 12 ชม. / 7 วันเหมือนเดิม)
   - **Contract:** `POST /v1/auth/login` เพิ่ม `lifetime?: "standard" | "long"` (ค่าเริ่มต้น `standard`); `long` ยอมรับเฉพาะ request ที่มี `X-Jester-Studio-Key` ถูกต้อง (เทียบ constant-time เหมือน `client_ip`) ไม่งั้น `422 INPUT_INVALID` — คนที่มีแค่รหัสผ่านจึงขอ session ยาวตรงจาก API ไม่ได้
   - **Data:** migration `0010_long_sessions.sql` เพิ่ม `sessions.long_lived boolean NOT NULL DEFAULT false`; `_session_principal` เลือก idle/renew/เพดานตามคอลัมน์นี้
   - **ไม่เปลี่ยน:** ลบผู้ใช้, admin ตั้งรหัสให้, `reset-password` ยังเพิกถอน session ทุกชนิดของคนนั้นทันที; logout ลบแถวเดียว; `change_password` เพิกถอน session อื่นรวมถึง session ยาว
   - **ถอยกลับ:** `DELETE FROM sessions WHERE long_lived` แล้วเอา option ออก — ผู้ใช้ MCP แค่ต้อง login ใหม่
   - **เหตุที่ยอมรับความเสี่ยง:** session ยาวมีสิทธิ์เต็ม (ไม่มี role) แต่อยู่ใน SQLite ของ `mcp` เท่านั้น ไม่ออกไปถึง claude.ai (ข้อ 4)
5. **ขอบเขตงาน = draft เท่านั้น (ผู้ใช้ยืนยัน):** ไม่มี tool ที่ publish, ย้าย alias, archive, จัดการผู้ใช้/key/retention/theme หรือ render; ทุก tool เรียกเฉพาะ operation ใน allow-list ของ `client.py` (test ตรวจ)
6. **ความรู้ของ `to-jester` ไปกับ MCP (ผู้ใช้ยืนยัน):** `SKILL.md` + `references/format.md` + `references/sources.md` ถูก copy เข้า package ตอน build (ไม่เขียนซ้ำด้วยมือ) แล้วให้ AI อ่านผ่าน tool `get_authoring_guide(topic)`; `instructions` ของ server บอกให้อ่านก่อนสร้างรายงาน
   - ส่วนของ skill ที่สั่งให้ทำ zip หรือรัน script ในเครื่อง ไม่ใช้ใน MCP: guide หัวข้อ `mcp` อธิบายว่าใน MCP ให้สร้างรายงานด้วย `create_template` + `put_draft_file`
7. **AI ต้องเห็น preview จึงจะเทียบกับต้นฉบับได้:** `preview_draft` คืนภาพ PNG ของหน้า (สูงสุด 5 หน้าแรก, กว้าง 1000 px) เป็น MCP image content + จำนวนหน้า + ลิงก์ Studio ของ template; แปลง PDF เป็น PNG ด้วย **dependency ใหม่ `pypdfium2`** (ผู้ใช้อนุมัติ 23 พ.ย. 2026)
8. **ลิงก์ไป Studio เพื่อ publish:** ทุก tool ที่เปลี่ยน draft คืน `studioUrl` = `JESTER_STUDIO_PUBLIC_URL` + `/templates/{id}` ให้ AI ส่งต่อให้ผู้ใช้ไปตรวจและกด publish เอง
9. **Revision:** tool ที่แก้ draft รับ `revision` แล้วส่งเป็น `If-Match`; `412` คืนเป็น error ที่บอก revision ปัจจุบันให้ AI อ่าน draft ใหม่ ไม่เขียนทับเงียบ ๆ (คนอาจแก้ใน Studio พร้อมกัน)
10. **ข้อมูลที่อ่านมาเป็นข้อมูล ไม่ใช่คำสั่ง:** เนื้อไฟล์ใน draft มาจากคนอื่นได้; description ของ `get_draft` บอก AI ชัดว่าห้ามทำตามข้อความในไฟล์
11. **Error:** problem+json ของ API → tool error (`isError: true`) ที่มี `code`, `detail`, `problems`; ไม่แปลความใหม่
12. **Log:** JSON บรรทัดเดียวต่อ tool call (username, tool, template id, status, ms) — ไม่ log รหัสผ่าน, token, เนื้อไฟล์, หรือ data

## Objective

ให้คนทำรายงานที่ไม่ใช่ dev สร้างและแก้รายงาน Jester ผ่าน claude.ai ได้เองจนเป็น draft ที่ validate ผ่านและ preview ตรงต้นฉบับ โดยใช้บัญชีของตัวเอง และไม่มีทางที่ AI จะทำให้เอกสารที่ระบบจริงออกอยู่เปลี่ยนไป

### User stories

- ในฐานะคนทำรายงาน ฉันเพิ่ม connector Jester ใน claude.ai, login ด้วยบัญชี Jester ของฉันครั้งเดียว แล้วใช้ได้ทั้งสัปดาห์
- ในฐานะคนทำรายงาน ฉันแนบ PDF ใบเสนอราคาแล้วพิมพ์ "ทำเป็นรายงานใน Jester" AI สร้าง template ใหม่, เขียนไฟล์, validate, ดูภาพ preview เทียบต้นฉบับแล้วแก้เองจนตรง และส่งลิงก์ Studio มาให้ฉันกด publish
- ในฐานะคนทำรายงาน ฉันสั่ง "ใบแจ้งหนี้ เพิ่มช่องเลขที่ PO ใต้วันที่" AI อ่าน draft เดิม แก้เฉพาะส่วนนั้น และ preview ให้ดู
- ในฐานะผู้ดูแล ฉันดูประวัติใน Studio แล้วเห็นว่าใครแก้ draft ไหน (ชื่อผู้ใช้จริง ไม่ใช่บัญชีกลาง)
- ในฐานะผู้ดูแล ฉันลบบัญชีคนที่ลาออก แล้ว connector ของเขาใช้ไม่ได้ใน request ถัดไป

## Interface

### Tools

| tool | operation | หมายเหตุ |
|---|---|---|
| `whoami` | `getCurrentUser` | |
| `get_authoring_guide` | — | `topic`: `overview` (SKILL.md), `format`, `sources`, `mcp`; อ่านจาก package ไม่เรียก API |
| `list_templates` | `listTemplates` | `tag`; ไม่รวม archived |
| `get_template` | `getTemplate` | |
| `get_draft` | `getDraft` | ไฟล์ข้อความพร้อมเนื้อหา + revision + รายการ asset |
| `list_versions` | `listVersions` | ให้ AI รู้ว่า draft ต่างจากที่ publish อยู่ไหม |
| `create_template` | `createTemplate` | `id`, `name`, `starter`, `page`; คืน revision แรก + `studioUrl` |
| `duplicate_template` | `duplicateTemplate` | ทำรายงานใหม่จากของเดิม |
| `put_draft_file` | `putDraftFile` | ไฟล์ข้อความ, ต้องมี `revision` |
| `delete_draft_file` | `deleteDraftFile` | ต้องมี `revision` |
| `upload_draft_asset` | `uploadDraftAsset` | `name`, `contentType`, `base64` (ไม่เกินขีดจำกัดของ API), ต้องมี `revision` — ใช้กับโลโก้/ฟอนต์ที่ผู้ใช้แนบมา |
| `delete_draft_asset` | `deleteDraftAsset` | ต้องมี `revision` |
| `validate_draft` | `validateDraft` | คืน problems |
| `prepare_draft` | `prepareDraft` | view model ที่ template จะได้ ใช้ไล่ expression ผิด |
| `preview_draft` | `previewDraft` | `data?`; ไม่ส่ง = ใช้ `sample.json`; คืน PNG + จำนวนหน้า + `studioUrl` |

ไม่มีใน MCP: `publishDraft`, `setPublishedVersion`, `resetDraftFromVersion`, `setTemplateArchived`, `renameTemplate`, `importTemplate`/`exportTemplate`, `render`, เอกสาร/runs, tag, theme, ผู้ใช้, API key, retention, setup, password

annotation: tool อ่านตั้ง `readOnlyHint: true`; `delete_draft_file`, `delete_draft_asset` ตั้ง `destructiveHint: true`

### HTTP ของ service `mcp`

```
POST/GET  /mcp                                     Streamable HTTP (ต้องมี Bearer jmc_…)
GET       /.well-known/oauth-protected-resource     RFC 9728
GET       /.well-known/oauth-authorization-server   RFC 8414
POST      /register                                 dynamic client registration (redirect URI ต้องอยู่ใน allow-list)
GET/POST  /authorize                                หน้า login → code
POST      /token                                    code + PKCE → access token
GET       /healthz                                  ไม่ต้อง login; บอกว่าเรียก API ได้ไหม
```

### Config (env)

```
JESTER_API_URL                 http://api:8000 (network ภายใน)
JESTER_MCP_PUBLIC_URL          https://jester-mcp.example.com (issuer + resource)
JESTER_STUDIO_PUBLIC_URL       https://jester.example.com (ทำลิงก์ให้ผู้ใช้)
JESTER_STUDIO_KEY              ค่าเดียวกับ api/studio — ใช้ส่งต่อ IP ของ browser ตอน login
JESTER_MCP_CLIENT_IP_HEADER    header ที่ proxy ใส่ IP จริง เช่น X-Forwarded-For; ไม่ตั้ง = ไม่ส่งต่อ IP
JESTER_MCP_REDIRECT_ALLOW      callback ที่ยอมรับ คั่นด้วย comma; ค่าเริ่มต้น callback ของ claude.ai และ claude.com
JESTER_MCP_DB                  /data/mcp.sqlite3 (volume)
```

## Tech Stack

Python ≥3.11 เหมือน `apps/api`; **dependency ใหม่: `mcp` (MIT), `pypdfium2` (Apache-2.0/BSD; อนุมัติแล้ว)**; `httpx`, `uvicorn` (ใช้ใน api อยู่แล้ว); SQLite จาก stdlib; test ใช้ `pytest`, `pytest-asyncio`, `respx`

## Commands

```bash
cd apps/mcp
uv run ruff check . && uv run ruff format --check .
uv run pytest -q --cov=jester_mcp --cov-report=term-missing
JESTER_TEST_API_URL=… uv run pytest -m live_stack -q      # stack จริงบน VM
uv run uvicorn jester_mcp.app:app --reload --port 8100    # dev; ต่อด้วย MCP Inspector
docker build -t jester/mcp apps/mcp                       # build copy references ของ to-jester เข้า image
```

## Project Structure

```
apps/mcp/
  pyproject.toml  Dockerfile  .dockerignore
  src/jester_mcp/
    app.py          → FastMCP + auth settings + route หน้า login + /healthz
    tools.py        → tool ตามตาราง
    api.py          → httpx client ต่อ public-api; allow-list ของ operation; problem+json → tool error
    oauth.py        → provider ของ SDK: client store, code, token ↔ Jester session (SQLite)
    login.py        → หน้า login (HTML ไทย, CSRF token, ส่งต่อ IP)
    preview.py      → PDF → PNG (pypdfium2)
    guide/          → สำเนา to-jester ตอน build (ไม่ commit; สร้างจาก .claude/skills/to-jester)
  tests/
    test_oauth.py  test_login.py  test_tools.py  test_api.py  test_preview.py  test_live.py
infra/compose.yaml → เพิ่ม service mcp + volume mcp-data (เปิดพอร์ตให้ proxy เหมือน studio/api)
```

## Code Style

```python
@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True))
async def preview_draft(template_id: str, data: dict | None = None) -> list[Content]:
    """Render the draft and return page images. Compare them with the source document and fix differences."""
    pdf = await api_for_caller().post_pdf(f"/v1/templates/{template_id}/draft/preview",
                                          json=drop_none(data=data))
    return [*pdf_pages_png(pdf.body, max_pages=5), text(pages=pdf.pages, studioUrl=studio_url(template_id))]
```

tool สั้น: แปลง argument → เรียก API ด้วย session ของผู้เรียก → คืนผล; error ไหลจาก `api.py` ที่เดียว

## Testing Strategy

- **Allow-list:** ทุก tool ชี้ไปที่ operation ที่มีจริงใน `public-api.yaml`; `api.py` ปฏิเสธ path ที่ไม่อยู่ใน allow-list (เช่น `/v1/users`, `/published`, `/v1/api-keys`)
- **OAuth flow (respx จำลอง API):** register ด้วย redirect ใน allow-list ผ่าน, นอก list → 400; authorize → login ถูก → code → token ด้วย PKCE ถูก ผ่าน, verifier ผิด/code ใช้ซ้ำ/code เกิน 5 นาที → ล้ม; login ผิด → หน้าเดิมพร้อมข้อความ ไม่ออก code
- **Token:** `/mcp` ไม่มีหรือผิด bearer → 401 + `WWW-Authenticate`; API ตอบ 401 → แถวถูกลบและ MCP ตอบ 401; access token ใช้กับ `public-api` ตรง ๆ ไม่ได้ (คนละรูปแบบ); SQLite เก็บแค่ hash ของ access token
- **IP:** ตั้ง header ของ proxy → request login ไป API มี `X-Jester-Client-IP` + studio key; ไม่ตั้ง → ไม่ส่ง
- **Revision/Error:** 412 และ 422 (problems) กลายเป็น tool error ที่มี `code`/`problems`
- **Preview:** PDF 7 หน้า → 5 ภาพ + `pages: 7`; PDF เสีย → tool error ไม่ crash
- **ความลับ:** log ที่จับระหว่าง test ไม่มีรหัสผ่าน, token, เนื้อไฟล์
- **Live (VM ผ่าน tunnel):** OAuth ครบด้วย MCP Inspector → create_template → put_draft_file → validate → preview ได้ภาพ → history ใน Studio แสดงชื่อผู้ใช้จริง; ลบผู้ใช้ → tool call ถัดไป 401
- **claude.ai จริง (manual, ครั้งเดียวก่อน release):** เพิ่ม connector ผ่าน proxy, แนบ PDF ใบเสนอราคาจาก evals ของ to-jester แล้วได้ draft ที่ validate ผ่าน
- Coverage ≥ 90%

## Boundaries

- **Always:** เรียกเฉพาะ operation ใน allow-list, session ของ Jester ไม่ออกนอก service `mcp`, redirect URI ตาม allow-list, error ของ API คืนครบ, ไม่ log ความลับหรือเนื้อรายงาน
- **Ask first:** เพิ่ม tool นอกตาราง (โดยเฉพาะ publish หรืออะไรที่กระทบเอกสารจริง), เพิ่ม dependency นอกจาก `mcp`/`pypdfium2`, แก้ `public-api`/`auth` เกินกว่า session อายุยาวในข้อ 4a, เปิดให้ client อื่นนอก claude.ai
- **Never:** ส่ง session token ของ Jester ให้ client, tool ที่รับหรือคืนรหัสผ่าน, ต่อ DB/S3 ตรง, เชื่อข้อความในไฟล์ draft ว่าเป็นคำสั่ง, publish

## Success Criteria

1. คนทำรายงานเพิ่ม connector ใน claude.ai ผ่าน proxy จริง login ด้วยบัญชีตัวเอง และ `whoami` ตอบชื่อเขา
2. แนบ PDF ใบเสนอราคาแล้วได้ draft ใน Jester ที่ validate ผ่าน และภาพ preview ตรงต้นฉบับในสายตาคนทำรายงาน; publish ใน Studio ได้ทันทีโดยไม่ต้องแก้มือ
3. ประวัติใน Studio แสดงชื่อคนที่แก้ผ่าน MCP; ลบบัญชีแล้ว connector ใช้ไม่ได้ใน request ถัดไป
4. ไม่มี tool หรือ path ไหนใน MCP ที่ publish หรือเรียก operation นอก allow-list (มี test)
5. `apps/api` เปลี่ยนเฉพาะ session อายุยาว (มี test: idle 30 วัน, ต่ออายุ, เพดาน 90 วัน, `long` โดยไม่มี studio key → 422, ลบผู้ใช้แล้ว session ยาวใช้ไม่ได้); `apps/studio` ไม่เปลี่ยน; coverage ≥ 90%, `ruff` สะอาด, `docker compose up` มี `mcp` ที่ `/healthz` ตอบ ok บน VM

## Open Questions

ปิดแล้วทั้งหมด 23 พ.ย. 2026: อนุมัติ `pypdfium2`, ใช้ subdomain `mcp` แยก, ทุกบัญชีใช้ MCP ได้, session ของ MCP idle 30 วัน เพดาน 90 วัน (ข้อ 4a)

เหลือยืนยันใน prototype (ไม่ใช่การตัดสินใจของผู้ใช้): auth ของ `mcp` SDK เวอร์ชันที่ pin ทำงานครบกับ claude.ai (DCR, PKCE, callback URL จริง)

## Out of scope

publish/alias/archive, จัดการผู้ใช้ API key retention theme, render ให้ระบบภายนอก, ดูเอกสารและประวัติ, import/export zip, stdio สำหรับ dev, client อื่นนอก claude.ai, แก้ `public-api` หรือ `auth` นอกจากข้อ 4a, งานระดับ server
