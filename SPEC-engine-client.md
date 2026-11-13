# Spec: `engine-client` + Spike M0

สถานะ: **draft (ปรับตาม interview) — รอผู้ใช้อนุมัติ** (13 พฤศจิกายน 2026)
Module id: `engine-client` ใน [CAPABILITY_MAP.md](CAPABILITY_MAP.md) · Intent: [docs/intent/report-server-v1.md](docs/intent/report-server-v1.md)
อ้างอิงหลัก: [T07 Gotenberg contract](docs/research/findings/07-gotenberg-contract.md), [T28 §3 spike](docs/research/findings/28-quality-strategy.md), [T18 error taxonomy](docs/research/findings/18-api-contract.md)

## สมมติฐาน (แก้ได้ก่อนอนุมัติ)

1. Python ≥3.11 (เครื่อง dev มี 3.11 จึงไม่ดาวน์โหลด 3.12) และใช้ `uv` จัดการ dependency/venv (ผู้ใช้ยืนยัน)
2. HTTP client คือ `httpx` (async); model คือ `pydantic` v2; test คือ `pytest` + `respx` (mock HTTP) + `pytest-asyncio`; lint/format คือ `ruff`
3. Engine คือ image `jester/gotenberg:9.4.1-th1` ([infra/gotenberg](infra/gotenberg/Dockerfile)) = Gotenberg `9.4.1` + TH Sarabun New เป็น system font (ผู้ใช้เลือกหลัง spike M0 รอบแรก) รันด้วย `--chromium-auto-start=true --chromium-start-timeout=60s` digest `sha256:7d790c081a944f4d30cacb59a2cdccbe71569532af691b93c36551f6a877b4fc` บน VM `10.0.1.29` ผูก `127.0.0.1:3000` และเครื่อง dev เข้าถึงผ่าน SSH tunnel `localhost:3000`
4. ฟอนต์ (ผู้ใช้ยืนยัน 13 พ.ย. 2026):
   - ค่าเริ่มต้น: **TH Sarabun New** และ **TH SarabunPSK** ถ้าตรวจ license จากต้นทาง (SIPA) แล้วแจกต่อใน repo/Docker image ได้
   - ถ้าแจกต่อไม่ได้: ใช้ **Sarabun** (Google Fonts, OFL) เป็นค่าเริ่มต้นแทน และให้ทีมอัปโหลด TH Sarabun New เองเป็น asset
   - Fallback ที่มากับระบบเสมอ: **Noto Sans Thai** (OFL) แทน Tahoma; Tahoma เป็นฟอนต์ลิขสิทธิ์ ไม่แจกไปกับโปรเจกต์ ทีมที่มีสิทธิ์อัปโหลดเองได้
   - ทุกไฟล์ฟอนต์ pin sha256 และเก็บไฟล์ license ไว้ข้างกัน
5. PDF text extraction ใน spike ใช้ `pypdf` (BSD) ส่วนภาพหน้าใช้ `pdftoppm` จาก `poppler-utils` บน VM (ผู้ใช้อนุญาตติดตั้ง; ถอนด้วย `apt remove poppler-utils`) เป็นเครื่องมือ dev เท่านั้น ไม่แจกไปกับผลิตภัณฑ์
6. ยังไม่มี git repository; สร้างเมื่อเริ่ม implement

## Objective

`engine-client` คือ adapter บาง ๆ ระหว่าง Jester กับ Gotenberg ทำหน้าที่:
- ส่งชุดไฟล์ HTML ที่ประกอบแล้ว (index/header/footer + assets) ไป `POST /forms/chromium/convert/html`
- ได้ PDF กลับมา หรือได้ error ที่แปลเป็น taxonomy ของ Jester แล้ว
- เปิด safety options ทุกครั้ง และเก็บข้อมูล provenance ของ engine

ไม่รู้จัก report, template, data หรือภาษาไทย ทำงานกับไฟล์และ options เท่านั้น

**Spike M0** ใช้ `engine-client` render รายงานอ้างอิง 3 แบบผ่าน Gotenberg จริง เพื่อตอบความเสี่ยงที่กำหนดสถาปัตยกรรม (R04/R05/R12) ก่อนเขียน spec ของ `binder`

### User stories

- ในฐานะ `render-service` ฉันส่งชุดไฟล์และ page setup แล้วได้ PDF bytes พร้อม trace/duration หรือได้ `EngineError` ที่บอกว่า retry ได้ไหม
- ในฐานะ operator ฉันตรวจว่า engine พร้อมไหมและเป็นเวอร์ชันอะไร ผ่าน `health()`
- ในฐานะเจ้าของโปรเจกต์ ฉันได้รายงาน spike ที่บอกว่าหัวตารางซ้ำ, ไทยใน header/footer และ oversized row ผ่านหรือไม่ พร้อมหลักฐาน เพื่อตัดสินทางเดินของ `binder`

## Tech Stack

- Python ≥3.11, `httpx` ≥0.27, `pydantic` ≥2.7 (pin exact ตอน implement ใน `uv.lock`)
- Dev: `pytest`, `pytest-asyncio`, `respx`, `ruff`; spike: `pypdf`
- Gotenberg 9.4.1 (pin by digest)

## Commands

```bash
cd apps/api
uv sync                                   # ติดตั้ง dependency
uv run ruff check . && uv run ruff format --check .
uv run pytest tests/engine_client -q      # unit tests (mock HTTP, ไม่ต้องมี engine)
GOTENBERG_URL=http://localhost:3000 uv run pytest tests/engine_client -m engine -q   # live tests ผ่าน tunnel
```

```bash
ssh -N -L 3000:127.0.0.1:3000 root@10.0.1.29          # เปิด tunnel ไป Gotenberg
cd apps/api && GOTENBERG_URL=http://localhost:3000 uv run python ../../spikes/m0/run_spike.py --runs 3
```

## Project Structure

```
apps/api/
  pyproject.toml
  src/jester_api/engine_client/
    __init__.py        → public exports: EngineClient, PageSetup, RenderFile, EngineResult, EngineError, ErrorCode
    client.py          → EngineClient (convert_html, health)
    models.py          → PageSetup, RenderFile, EngineResult, EngineHealth
    errors.py          → ErrorCode, EngineError, map_response()
  tests/engine_client/
    test_request.py    → multipart fields/files ที่ส่งออก
    test_errors.py     → mapping HTTP status/network error → ErrorCode
    test_validation.py → ชื่อไฟล์ซ้ำ, path, ขนาด
    test_live.py       → @pytest.mark.engine กับ Gotenberg จริง
spikes/m0/
  fixtures/sp-a/ sp-b/ sp-c/   → index.html, header.html, footer.html, data.json
  fonts/                       → ฟอนต์ค่าเริ่มต้น + Noto Sans Thai (pinned sha256 + ไฟล์ license); ไม่ commit ฟอนต์ที่ license ไม่อนุญาต
  run_spike.py                 → render ทุก case × N รอบ, เก็บ manifest
  out/                         → PDF, page images, manifest.json (ไม่ commit)
  REPORT.md                    → ผล spike + การตัดสินใจ
```

## Interface (contract ที่ module อื่นพึ่ง)

```python
class PageSetup(BaseModel):
    paper: Literal["A4"] = "A4"
    landscape: bool = False
    margin_top_mm: Decimal = Decimal("20")
    margin_bottom_mm: Decimal = Decimal("20")
    margin_left_mm: Decimal = Decimal("15")
    margin_right_mm: Decimal = Decimal("15")

@dataclass(frozen=True)
class RenderFile:
    name: str          # basename เท่านั้น เช่น "logo.png"
    content: bytes

@dataclass(frozen=True)
class EngineResult:
    pdf: bytes
    trace: str | None          # header Gotenberg-Trace
    duration_ms: int
    options: dict[str, str]    # form fields ที่ส่งจริง (สำหรับ provenance)

class EngineClient:
    def __init__(self, base_url: str, *, timeout_s: float = 30.0,
                 basic_auth: tuple[str, str] | None = None,
                 max_request_bytes: int = 20 * 1024 * 1024) -> None: ...
    async def convert_html(self, index_html: bytes, *, page: PageSetup,
                           header_html: bytes | None = None, footer_html: bytes | None = None,
                           assets: Sequence[RenderFile] = (),
                           wait_for_expression: str | None = None) -> EngineResult: ...
    async def health(self) -> EngineHealth: ...   # GET /health + GET /version
```

### กฎของ request (ทำทุกครั้ง ผู้เรียกปิดไม่ได้)

- ส่ง `paperWidth`/`paperHeight` (A4 = 8.27 × 11.7 นิ้ว; Gotenberg 9 ใช้สอง field นี้ ไม่มี `paperSize`), `landscape` และ margin ทั้ง 4 ด้านชัดเจน ไม่พึ่ง default ของ Gotenberg (default คือ Letter)
- `failOnResourceLoadingFailed=true`
- `failOnResourceHttpStatusCodes` ครอบ 4xx/5xx (ค่าที่ถูกต้องของ field ต้องยืนยันใน spike)
- `failOnConsoleExceptions=true`
- ไม่ expose `downloadFrom`, `archives` หรือ URL ภายนอกใด ๆ
- ชื่อไฟล์ต้องเป็น basename ไม่มี `/`, `\` หรือ `..` และห้ามซ้ำกัน รวมทั้งชื่อสงวน `index.html`, `header.html`, `footer.html` (Gotenberg ตัด path ออก ชื่อซ้ำจะทับกันเงียบ ๆ)
- ขนาดรวมเกิน `max_request_bytes` ให้ปฏิเสธก่อนส่ง

### Error taxonomy (สอดคล้อง T18)

| ErrorCode | เกิดเมื่อ | retryable |
| --- | --- | --- |
| `RENDER_INPUT_INVALID` | ตรวจไฟล์ก่อนส่งไม่ผ่าน, Gotenberg 400/415/413 | ไม่ |
| `RENDER_RESOURCE_FAILED` | Gotenberg 409 (asset โหลดไม่ได้, console exception, main page fail) | ไม่ |
| `RENDER_TIMEOUT` | Gotenberg 503 หรือ client timeout | ได้ (จำกัดครั้งโดยผู้เรียก) |
| `SERVICE_UNAVAILABLE` | เชื่อมต่อไม่ได้, 429 | ได้ |
| `ENGINE_MISCONFIGURED` | 401/403/404 (auth, egress policy, route/version ผิด) | ไม่ |
| `RENDER_FAILED` | 500 หรือ status อื่นที่ไม่รู้จัก | ไม่ |

`EngineError` เก็บ `code`, `http_status`, `message` (ตัดความยาว ไม่มีเนื้อหา input), `trace` และ `retryable` client ไม่ retry เอง ให้ `render-service` ตัดสินใจ

## Spike M0

### Cases (จาก T28 §3.1, ข้อมูลสังเคราะห์จาก `research/specimens/`)

| Spike | รายงาน | Variation | คำถามที่ต้องตอบ |
| --- | --- | --- | --- |
| SP-B (ทำก่อน) | Sales grouped S01–S04 + ชุดขยาย | 0, 1, 50 แถว (500 แถวถ้าทรัพยากรพอ); portrait และ landscape; `<thead>` ซ้ำ | หัวตารางซ้ำทุกหน้าและไม่ทับข้อมูลหรือไม่ แถวหาย/ซ้ำไหม ทับ footer ไหม |
| SP-A | ใบเสนอราคา Q-DEMO-001 | header/footer ภาษาไทย + เลขหน้า; ฟอนต์ค่าเริ่มต้นฝังผ่าน `@font-face` ใน body และใน header/footer; รอบที่ตัดฟอนต์หลักออกเพื่อทดสอบ fallback Noto Sans Thai | วรรณยุกต์และสระถูกต้องใน body และ header/footer หรือไม่ ฟอนต์ถูกฝังไหม copy/search ข้อความไทยได้ไหม ยอด 3,210.00 extract ได้ไหม เมื่อฟอนต์หลักหาย fallback ทำงานโดยไม่เป็นตัวสี่เหลี่ยมหรือไม่ |
| SP-C | PO master-detail | `long-detail` ที่ทำให้แถวสูงเกินหน้า; PO02 ไม่มี detail | ข้อความในแถวสูงเกินหน้าหายหรือถูกแบ่ง Chromium ทำอย่างไร |

### สิ่งที่ต้องบันทึกต่อรอบ (`out/manifest.json`)

image digest, Gotenberg version จาก `/version`, options ที่ส่ง, sha256 ของทุกไฟล์ input และฟอนต์, sha256 ของ PDF, page count, ข้อความที่ extract, trace, duration, ผลแต่ละเช็ก

### การตรวจ (ตาม T28 §2)

- **L1 semantic:** row ID ทุกตัวปรากฏครบและไม่ซ้ำใน text ที่ extract ได้
- **L2 numeric:** ยอดตาม specimen (D01 3,210.00; North 2,000.00; South 400.00; grand 2,400.00; PO01 350.00) ตรงใน text
- **L3 Thai text:** สตริงไทยอ้างอิงตรงหลัง NFC normalize; ฟอนต์ที่ฝังใน PDF ตรงกับที่ตั้งใจ (ค่าเริ่มต้น หรือ Noto Sans Thai ในรอบ fallback); ไม่มี `.notdef` glyph
- **L4 visual:** ภาพทุกหน้า (`pdftoppm`) ให้คนตรวจหัวตารางซ้ำ/ทับซ้อน/วรรณยุกต์ แล้วบันทึกผลใน REPORT.md
- **Determinism:** รัน input เดิม 3 รอบ เทียบ page count และ text (ไม่เทียบ PDF bytes เพราะมี timestamp/ID)

### Exit และการตัดสินใจ

`REPORT.md` ต้องสรุปผลราย case เป็น ผ่าน/ไม่ผ่าน พร้อมหลักฐาน และระบุการตัดสินใจที่เปิดให้ผู้ใช้เลือกตาม T28 §3.1:
- หัวตารางซ้ำไม่ผ่าน → แบ่งหน้าที่ชั้นแอป / จำกัดรูปแบบตาราง
- ไทยใน header/footer ไม่ผ่าน → วิธีฝังฟอนต์อื่น / ย้ายข้อมูลออก / เปลี่ยนฟอนต์
- oversized row ข้อความหาย → reject หรือแบ่งแถวที่ชั้นแอป

ผ่านทั้งหมดยืนยันเฉพาะ 3 รายงานบน environment ที่บันทึก ไม่ใช่ production ready

## Code Style

```python
async def convert_html(self, index_html: bytes, *, page: PageSetup, ...) -> EngineResult:
    files = _collect_files(index_html, header_html, footer_html, assets)  # validates names/size
    started = time.monotonic()
    try:
        resp = await self._http.post(CONVERT_HTML, data=_form_fields(page, wait_for_expression), files=files)
    except httpx.TimeoutException as exc:
        raise EngineError(ErrorCode.RENDER_TIMEOUT, message="engine timed out", retryable=True) from exc
    except httpx.TransportError as exc:
        raise EngineError(ErrorCode.SERVICE_UNAVAILABLE, message="engine unreachable", retryable=True) from exc
    if resp.status_code != 200:
        raise map_response(resp)
    return EngineResult(pdf=resp.content, trace=resp.headers.get("Gotenberg-Trace"),
                        duration_ms=int((time.monotonic() - started) * 1000), options=_form_fields(page, wait_for_expression))
```

- type hints ครบ, `ruff` default + import sorting, ชื่อ snake_case, ค่าคงที่ UPPER_CASE
- ไม่มี global client; สร้าง `EngineClient` ผ่าน dependency injection ของ FastAPI ภายหลัง
- ไม่ log เนื้อหา HTML/data; log ได้แค่ชื่อไฟล์, ขนาด, trace, status

## Testing Strategy

- **Unit (ไม่ต้องมี engine):** `respx` ตรวจ fields/files ที่ส่งออกทุกกฎใน "กฎของ request", mapping ทุก status ในตาราง error, timeout, connection error, ชื่อไฟล์ผิด/ซ้ำ, เกินขนาด
- **Live (`-m engine`, ข้ามอัตโนมัติถ้าไม่มี `GOTENBERG_URL`):** render HTML ง่าย ๆ ได้ PDF ที่ขึ้นต้นด้วย `%PDF-`; asset ที่อ้างแต่ไม่แนบต้องได้ `RENDER_RESOURCE_FAILED`; `health()` คืนเวอร์ชัน `9.4.1`
- Spike ไม่ใช่ test suite แต่เป็น script ที่ผลิตหลักฐาน
- Coverage ของ `engine_client` ≥ 90% line (เป็น module เล็ก ทุก branch ทดสอบได้ด้วย mock)

## Boundaries

- **Always:** เปิด `failOn*` ทุก request; ส่ง page setup ครบ; รัน `ruff` + unit tests ก่อน commit; บันทึก manifest ทุกรอบ spike; ใช้ข้อมูลสังเคราะห์เท่านั้น
- **Ask first:** เพิ่ม dependency นอกรายการข้างบน; ดาวน์โหลดไฟล์ภายนอกอื่นนอกจากฟอนต์ที่ระบุใน §สมมติฐาน ข้อ 4; commit ฟอนต์ที่ license ยังตรวจไม่ชัด; เปลี่ยนเวอร์ชัน/digest ของ Gotenberg; ติดตั้งอะไรเพิ่มบน VM (เช่น poppler); เปลี่ยน error taxonomy (กระทบ `public-api`)
- **Never:** แจก Tahoma หรือฟอนต์ลิขสิทธิ์ใด ๆ ไปกับ repo/image; เปิด port Gotenberg สู่ network นอก `127.0.0.1`; ส่ง URL ภายนอก/`downloadFrom` ให้ engine; log เนื้อหา input; ใช้ข้อมูลลูกค้าจริงใน spike; ตัดสินผล spike จาก HTTP 200 อย่างเดียว

## Success Criteria

1. Unit tests ผ่านครบทุกกฎ request และทุกแถวในตาราง error; coverage ≥ 90%
2. Live tests ผ่านกับ Gotenberg 9.4.1 บน VM ผ่าน tunnel
3. `run_spike.py` รัน SP-A/B/C ครบ 3 รอบต่อ case และได้ `manifest.json` ที่มีครบทุกฟิลด์ข้างบน
4. `spikes/m0/REPORT.md` ระบุผล L1–L4 และ determinism ราย case พร้อมภาพหน้าที่เกี่ยวข้อง และระบุการตัดสินใจที่ผู้ใช้ต้องเลือก (ถ้ามีข้อไม่ผ่าน)
5. ค่าที่ถูกต้องของ `failOnResourceHttpStatusCodes` และพฤติกรรม 503 ได้รับการยืนยันจากผลจริง และอัปเดตใน spec นี้

## ผลจริงจาก Checkpoint A (13 พ.ย. 2026)

- `failOnResourceHttpStatusCodes=[499,599]` Gotenberg รับ syntax นี้ (ไม่ตอบ 400) แต่ทุก asset ของเราเป็นไฟล์ local ไม่มี HTTP resource จึงยังไม่ได้ทดสอบผลเชิงความหมายของ field นี้
- Asset ที่อ้างแต่ไม่แนบ → Gotenberg ตอบ 409 → `RENDER_RESOURCE_FAILED` (live test ผ่าน)
- Chromium บน VM เปิดตัวช้ากว่า 20 วินาที (ค่า default ของ `--chromium-start-timeout`) ทำให้ request แรกได้ **500** ข้อความ `websocket url timeout reached` และครั้งหนึ่งได้ 503 จาก curl — แก้ที่ deployment: รัน Gotenberg ด้วย `--chromium-auto-start=true --chromium-start-timeout=60s`
- ข้อสังเกตต่อ taxonomy: 500 จาก Chromium start fail เป็นปัญหาชั่วคราว แต่ปัจจุบัน map เป็น `RENDER_FAILED` แบบ retry ไม่ได้ ยังไม่เปลี่ยน mapping เพราะแยกจาก 500 ประเภทอื่นจากข้อความไม่ได้อย่างมั่นใจ — ทบทวนใน spec ของ `render-service`
- พฤติกรรม 503 ยังไม่ยืนยันว่าเท่ากับ API timeout เสมอ

## Open Questions

ปิดแล้วทั้งหมด (ผู้ใช้ยืนยัน 13 พ.ย. 2026): ฟอนต์ตามสมมติฐานข้อ 4, ติดตั้ง `poppler-utils` บน VM ได้, timeout 30 วินาทีและ request สูงสุด 20 MB เป็นค่าตั้งต้น (ปรับหลังมีผลวัด), ใช้ `uv`

ยังค้างเป็นงานตรวจ ไม่ใช่คำถามผู้ใช้: license การแจกจ่ายต่อของ TH Sarabun New / TH SarabunPSK จากต้นทาง — ผลกำหนดว่าค่าเริ่มต้นเป็นฟอนต์แห่งชาติหรือ Sarabun (Google Fonts)

## Out of scope ของ spec นี้

Tahoma, ฟอนต์อื่นนอกจากที่ระบุ, การวัด performance/concurrency, security probes, PDF/A/UA, QR/chart
