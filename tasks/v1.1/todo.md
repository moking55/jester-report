# Tasks v1.1: Foundations

แผน: [plan.md](plan.md) · สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** (ปรับตาม interview)

กติกา (interview 18 พ.ย. 2026): commit ทุก task, ไม่ push ระหว่าง phase; ผู้ใช้ทบทวนที่ checkpoint;
อนุมัติ checkpoint แล้วติด tag + push `master` และ tag; ไม่สร้าง GitHub Release; ไม่รอ CI (H2); VM เป็นเครื่องทดสอบล้วน

คำสั่งตรวจที่ใช้ซ้ำ:
- api: `cd apps/api && uv run ruff check . && uv run pytest -q` (+ `-m "db or storage"` ผ่าน tunnel ไป VM)
- studio: `cd apps/studio && npm run lint && npm run typecheck && npm test && npm run build`
- contract: `npm run gen:api` แล้ว `git diff --exit-code lib/types.gen.ts` ต้องไม่มี diff ที่ไม่ได้ตั้งใจ
- deploy VM: `git archive HEAD apps infra | ssh root@10.0.1.29 'cd /opt/jester-stack && tar -x && cd infra && docker compose build <svc> && docker compose up -d <svc>'`

## Phase 0: Hygiene

- [x] **T1 H1: Next.js 16.4.6** (18 พ.ย. 2026: 4 คำสั่งผ่าน, audit prod สะอาด, E2E 2 spec ผ่านบน stack ใหม่ ครั้งแรกล้มบน stack ที่เพิ่ง build จับสาเหตุไม่ได้)
  - Acceptance: `next` และ `eslint-config-next` = 16.4.6; `npm audit --omit=dev` ไม่มี advisory ของ `next`
  - Verify: studio ครบ 4 คำสั่ง, E2E 2 spec เดิมผ่านบน stack ใหม่
  - Files: `apps/studio/package.json`, `package-lock.json`

## Phase A: Lifecycle

- [x] **T2 A3 store: archive**
  - Acceptance: migration 0006; `set_archived`, `list(include_archived)`; ทุกเมธอดเขียน → `ARCHIVED`; อ่าน/export/duplicate ได้; archive แข่งกับ `put_file` ไม่มีการเขียนหลัง archive
  - Verify: `pytest tests/template_store -m db`, migration บน DB ที่มีข้อมูล v1 รายงานเดิมไม่ถูก archive
  - Files: `db/migrations/0006_template_archive.sql`, `template_store/store.py`, `errors.py`, `tests/template_store/test_store_lifecycle.py`
- [x] **T3 A3 render-service + api: 410 และ endpoint archive**
  - Acceptance: render/preview/validate ของรายงานที่ archive → 410 `TEMPLATE_ARCHIVED` + run failed; `setTemplateArchived`; `?includeArchived`; เขียน → 409
  - Verify: pytest render_service + public_api, contract test
  - Files: `render_service/service.py`, `openapi/public-api.yaml`, `public_api/routes/templates.py`, tests ที่เกี่ยวข้อง
- [x] **T4 A3 studio: archive**
  - Acceptance: `TemplateMenu` (เริ่มจาก archive/unarchive) ใน catalog และ workspace; ตัวสลับ "แสดงที่ archive" + badge; workspace ที่ archive มีแถบแจ้ง editor อ่านอย่างเดียว ปุ่มแก้/Preview/Render ปิด
  - Verify: studio 4 คำสั่ง + เบราว์เซอร์บน VM
  - Files: `components/TemplateMenu.tsx`, `app/(app)/page.tsx`, `components/Workspace.tsx`, `lib/actions/templates.ts`, `lib/messages.ts`
- [x] **T5 A2 store + api: ทำสำเนา**
  - Acceptance: `duplicate` จาก draft หรือ version; id ซ้ำ → `CONFLICT`/409; ไม่มี blob ใหม่; `duplicateTemplate` 201 draft revision 1
  - Verify: pytest template_store + public_api
  - Files: `store.py`, `public-api.yaml`, `routes/templates.py`, tests
- [x] **T6 A2 studio: ทำสำเนา**
  - Acceptance: เมนู ⋯ → `DuplicateDialog` (id ใหม่ + ชื่อ) → ไป workspace ของสำเนา; จาก version ใน Versions panel ได้
  - Verify: studio 4 คำสั่ง + เบราว์เซอร์
  - Files: `components/DuplicateDialog.tsx`, `TemplateMenu.tsx`, `VersionsPanel.tsx`, `lib/actions/templates.ts`
- [x] **T7 A1 bundle: zip แบบ pure**
  - Acceptance: เขียน/อ่าน zip + `jester.json` (`formatVersion` 1, entry deterministic); ทุกแถวในตารางความปลอดภัยถูกปฏิเสธ (25 MB, 101 entry, `/` `\`, symlink, ขนาดนับจากที่อ่านจริง, UTF-8, sha256 ตรง manifest)
  - Verify: `pytest tests/template_store/test_bundle.py` หนึ่ง test ต่อแถว
  - Files: `template_store/bundle.py`, `tests/template_store/test_bundle.py`
- [x] **T8 A1 store + api: export/import**
  - Acceptance: `export_zip` (draft หรือ version), `import_zip` (`created`); import ทับต้องมี `If-Match` (ไม่มี → 409, ผิด → 412); 26 MB `BodyLimit` เฉพาะ route นี้; zip อันตรายไม่เขียนอะไรลง DB
  - Verify: round-trip ไฟล์และ asset ตรงทุก byte; pytest public_api
  - Files: `store.py`, `public-api.yaml`, `routes/templates.py`, `public_api/app.py` (BodyLimit), tests
- [x] **T9 A1 studio: export/import**
  - Acceptance: Route Handler `templates/[id]/export` และ `templates/import`; ปุ่ม "นำเข้า (.zip)" + `ImportDialog` (id ซ้ำ → ถามทับหรือ id ใหม่, Studio อ่าน revision เอง); export ในเมนู ⋯ และต่อ version; browser ไม่เรียก api ตรง
  - Verify: studio 4 คำสั่ง + เบราว์เซอร์ (ดู network)
  - Files: `app/templates/[id]/export/route.ts`, `app/templates/import/route.ts`, `components/ImportDialog.tsx`, `TemplateMenu.tsx`, `app/(app)/page.tsx`
- [x] **T10 A4: ตั้งรหัสผ่านให้ผู้อื่น (auth → api → studio)**
  - Acceptance: `set_password(user_id, new, by)`; ตั้งให้ตัวเอง → 422; session ของเจ้าของถูกเพิกถอน; `setUserPassword` 204; API key → 401; `SetPasswordDialog` ต่อแถวใน ตั้งค่า › ผู้ใช้
  - Verify: pytest auth -m db + public_api; studio 4 คำสั่ง + เบราว์เซอร์
  - Files: `auth/service.py`, `public-api.yaml`, `routes/users_keys.py`, `components/SetPasswordDialog.tsx`, `UsersPanel.tsx`

บันทึก 18 พ.ย. 2026 (T2–T10): commit รวมเป็น `be54d56` (api), `b128378` (studio), `41ff8b9`, `f84aac4` (แก้หลัง E2E)
เพราะไฟล์ store/route ใช้ร่วมกันหลาย task — ไม่ได้แยก commit ต่อ task ตามแผน
- api: 576 passed, 3 skipped (รันบน VM), coverage รวม 96% (store 97%, bundle 96%, auth/service 99%), ruff สะอาด
- studio: lint, typecheck, 52 test, build ผ่าน
- ต่างจาก spec (อัปเดต spec แล้ว): route ของ zip เป็น `/export/[id]` และ `/import` (ไม่ใช่ใต้ `/templates/`
  เพราะ `/templates/import` จะชนกับรายงาน id `import`); `export_zip` คืน `ZipExport(data, filename)`;
  ค่าจำกัดย้ายไป `template_store/limits.py` ให้ store และ bundle ใช้ร่วมกัน; dialog นำเข้าอ่าน `jester.json`
  ใน browser (`lib/zip.ts`) เพื่อรู้ id ก่อนถามว่าจะทับ draft
- E2E: ต้องรอ api healthy และ load ของ VM < 4 ก่อนรัน; ตอน VM IO wait สูง api start ไม่ขึ้นและ test ล้มแบบไม่เกี่ยวกับโค้ด

### Checkpoint A
- [x] api: ruff + pytest ทั้งหมด (รวม db/storage) ผ่าน, coverage template_store/auth ≥ 90% (576 passed, 96%)
- [x] studio: 4 คำสั่งผ่าน; E2E ขั้นใหม่ 1–4 และ 6 ผ่านบน stack ใหม่ แล้ว `down -v` (18 พ.ย. 2026: แยกเป็น
  `e2e/lifecycle.spec.ts` แทนการต่อท้าย `full-flow.spec.ts`; 3 spec ผ่าน 30.9 วินาที)
- [x] ผู้ใช้ทบทวนก่อนเริ่ม Phase B (18 พ.ย. 2026: "ผ่าน ปล่อย v1.1.0")
- [x] ผู้ใช้อนุมัติแล้ว: เลข version api/studio/compose → 1.1.0, tag `v1.1.0`, push `master` + tag

## Phase B: Production readiness

- [x] **T11 B1 auth: วันหมดอายุ + รายการรายงานของ key**
  - Acceptance: migration 0007 (`expires_at`, `templates`, `rate_limit_per_minute`, ตาราง `api_key_usage`); `authenticate` ปฏิเสธ key หมดอายุด้วยข้อความเดียวกับ key ที่เพิกถอน; ตรวจค่าตอนสร้าง (อดีต/เกิน 5 ปี/ว่าง/เกิน 100/id ผิด); key เดิมไม่จำกัด
  - Verify: pytest auth -m db ด้วย `clock` จำลอง
  - Files: `db/migrations/0007_api_key_limits.sql`, `auth/service.py`, `tests/auth/test_api_key_limits.py`
- [x] **T12 B1 render-service + api: 403 และ body สร้าง key**
  - Acceptance: `TEMPLATE_NOT_ALLOWED` 403 ก่อน store และก่อนกินช่องคิว (b, archive, ไม่มี ได้ผลเหมือนกัน) + run failed; `Principal.templates` default None; สร้าง key รับ 3 ช่องใหม่
  - Verify: pytest render_service + public_api; 20 คำขอ 403 พร้อมกันไม่บล็อก render ปกติ
  - Files: `render_service/service.py`, `public-api.yaml`, `routes/users_keys.py`, tests
- [x] **T13 B2: rate limit ต่อ key**
  - Acceptance: `consume_render_quota` → `Quota(allowed, retry_after_s)` (UPSERT…RETURNING, ลบแถวเก่าเมื่อ count == 1, comment `shortcut:` เรื่อง fixed window); render เกิน → 429 + `Retry-After` 1–60 ก่อนอ่าน body, ไม่มี run ใหม่; key/session ที่ไม่ตั้งไม่มี query เพิ่ม
  - Verify: 10 task พร้อมกันกับ limit 5 ผ่าน 5 พอดี; request ใหญ่ที่เกินโควตาได้ 429 ไม่ใช่ 413
  - Files: `auth/service.py` (quota), `routes/render.py`, `public-api.yaml`, tests
- [x] **T14 B1+B2 studio: ฟอร์ม API key**
  - Acceptance: `lib/keys.ts` (วันที่ → `…T23:59:59+07:00`, ตรวจช่อง, ไม่เลือกรายงาน = `undefined`); ฟอร์มมีวันหมดอายุ, checkbox รายงาน, limit ต่อนาที; ตารางมีคอลัมน์ใหม่; ข้อความ 403/429/410 ใน `messages`
  - Verify: Vitest `tests/keys.test.ts`; studio 4 คำสั่ง + เบราว์เซอร์
  - Files: `lib/keys.ts`, `tests/keys.test.ts`, `components/ApiKeysPanel.tsx`, `lib/actions/settings.ts`, `lib/messages.ts`
- [x] **T15 B3: CLI `jester_api.ops.blobs`**
  - Acceptance: `export` อ่านรายการจากตาราง `blobs` เขียน tar ชื่อ entry = sha256, object หาย → exit ≠ 0; `import` สร้าง bucket ถ้าไม่มี, ตรวจ sha256 ทุก entry, ปฏิเสธชื่อแปลก
  - Verify: `pytest tests/ops` (MemoryBlobStore + db marker), ruff
  - Files: `ops/__init__.py`, `ops/blobs.py`, `tests/ops/test_blobs.py`
- [x] **T16 B3: สคริปต์ backup/restore + restore drill**
  - Acceptance: `infra/backup.sh`, `infra/restore.sh` ตาม SPEC-infra (ตรวจ sha256, DB ต้องว่าง, backup ใหม่กว่า image = หยุด, `umask 077`); README หัวข้อ Backup and restore + cron
  - Verify: shellcheck; drill บน VM: e2e stack → backup → `down -v` → restore เข้า project ใหม่ → login, รายการรายงาน, asset sha256, render 200; restore ทับ stack ที่มีข้อมูลถูกปฏิเสธ; บันทึกผลพร้อมวันที่ในไฟล์นี้
  - Files: `infra/backup.sh`, `infra/restore.sh`, `infra/README.md`

บันทึก 18 พ.ย. 2026 (T11–T16): commit `916a912` (api), `3328ed2` (studio), `92bd3e2` + `aa48fe0` (infra), `a72710e` (`.gitattributes`)
- api: 587 passed, 3 skipped + `tests/ops` และ `test_api_key_limits` 17 passed (บน VM); coverage auth/service 99%,
  routes/render 99%, ops/blobs 79% (ส่วนที่ต่อ S3 จริงครอบด้วย drill)
- studio: lint, typecheck, 70 test, build ผ่าน
- ต่างจากแผน: E2E ขั้น 5 อยู่ใน `lifecycle.spec.ts`; test 429 ใช้ body ที่ไม่ใช่ JSON แทน body ใหญ่ (BodyLimit ตอบ 413
  จาก Content-Length ก่อนถึง route จึงพิสูจน์ "ไม่อ่าน body" ด้วย 429 แทน 422); `set_password` รับ `by` เป็น user id
- เจอระหว่าง drill: `git archive` บนเครื่อง Windows ที่ตั้ง `core.autocrlf` ทำให้ `*.sh` เป็น CRLF จนรันไม่ได้ → เพิ่ม `.gitattributes`
- แก้ bug ที่ผู้ใช้แจ้งระหว่าง Phase B (`a5d1161`): autocomplete ใน `{{ }}`/`{% %}` (fmt., params., lists., totals.) และปุ่ม export ใน Versions

### Checkpoint B
- [x] E2E ขั้น 5 (key จำกัดรายงาน → 403) ผ่าน พร้อมขั้นเดิมทั้งหมด (3 spec ผ่าน 37 วินาที)
- [x] restore drill ผ่านและบันทึกผลแล้ว — 18 พ.ย. 2026 บน VM: backup e2e stack (ไม่หยุดระบบ) → `down -v` →
  backup ที่ถูกแก้ db.dump ถูกปฏิเสธ → restore เข้า project ใหม่ `jester-restore` → login ผู้ใช้เดิมได้, รายการรายงาน 3 รายการ
  ตรงกัน, `logo.png` sha256 เดิม, render v1 ได้ 200 PDF → restore ซ้ำเข้า stack ที่มีข้อมูลถูกปฏิเสธ → `down -v`
- [ ] ผู้ใช้ทบทวนก่อนเริ่ม Phase C
- [ ] ผู้ใช้อนุมัติแล้ว: เลข version → 1.2.0, tag `v1.2.0`, push `master` + tag

## Phase C: เอกสารไทย

- [ ] **T17 C1 data-prep: `fmt.qr` / `fmt.barcode` / `fmt.promptpay`**
  - Acceptance: เพิ่ม `segno==1.6.6`, `python-barcode==0.16.1`; คืน `Markup` SVG เท่านั้น ไม่มี `<text>`; PromptPay EMVCo + CRC-16/CCITT-FALSE ตรง test vector; ทุกขอบในตารางกติกามี test
  - Verify: `pytest tests/data_prep`, coverage ≥ 90%, ruff
  - Files: `data_prep/codes.py`, `data_prep/prepare.py`, `pyproject.toml` + `uv.lock`, `tests/data_prep/test_codes.py`
- [ ] **T18 C1 binder: test SVG**
  - Acceptance: test 4 ข้อใน SPEC-binder v1.1 ผ่านโดยไม่แก้โค้ด binder (ถ้าต้องแก้ = หยุดถามผู้ใช้)
  - Verify: `pytest tests/binder`
  - Files: `tests/binder/test_codes_svg.py`
- [ ] **T19 C2: starter `tax-invoice`**
  - Acceptance: 7 ฟิลด์ตาม ม.86/4; คำเตือนใน README ของ starter และ comment ใน `template.html` ว่าไม่มีผู้เชี่ยวชาญภาษีตรวจ ผู้ใช้ต้องตรวจกับสรรพากรเอง; golden test มูลค่ารวม, VAT 7%, ยอดสุทธิ, บาทตัวอักษร; มี QR PromptPay; ปรากฏในตัวเลือก starter ของ Studio และ contract
  - Verify: pytest template_store + public_api flow (สร้าง → validate → publish → render ด้วย key จำกัด → PDF); เบราว์เซอร์สร้างจาก starter แล้ว preview ได้
  - Files: `template_store/starters/tax-invoice/*`, `public-api.yaml`, `components/CreateTemplate.tsx`, tests

### Checkpoint C (ปิด v1.1)
- [ ] api + studio ครบทุกคำสั่ง, E2E 2 spec ผ่านบน stack ใหม่, `down -v`
- [ ] **ผู้ใช้:** สแกน QR PromptPay จาก PDF จริงด้วยแอปธนาคาร 2 แอป เห็นผู้รับและยอดถูก; barcode อ่านได้
- [ ] อัปเดต CAPABILITY_MAP และหัวข้อ v1.1 ของ spec ตามที่เปลี่ยนระหว่างทำ
- [ ] ผู้ใช้อนุมัติแล้ว: เลข version → 1.3.0, tag `v1.3.0`, push `master` + tag
