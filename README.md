# Jester Reports

<img src="apps/studio/public/jester-logo.webp" alt="Jester Reports" height="64">

An open-source report server for Thai business documents. Write a report once as HTML + a small
`report.json`, publish it, and let any system turn JSON data into a PDF with one HTTP call.

ระบบออกรายงาน PDF แบบ open source สำหรับเอกสารธุรกิจภาษาไทย: เขียน template ด้วย HTML ใน Studio,
publish แล้วให้ระบบอื่นส่งข้อมูล JSON มาขอ PDF ผ่าน API

## What it does

- **Studio** (browser): first-run setup, report catalog, a workspace with files, a CodeMirror editor, live PDF
  preview, automatic validation with problems at the line, prepared-data and provenance views, versions with
  publish / rollback / reset, render history, users, API keys and team themes.
- **API**: `POST /v1/render` renders a published version to PDF with an API key. Data comes only from the
  caller; drafts are never rendered by the public endpoint.
- **Thai first**: money and numbers as exact decimals, Buddhist-era dates, baht in words, TH Sarabun New
  bundled in the engine so headers and footers render Thai too.
- **Safe templates**: Jinja2 in a sandbox, auto-escaping, no JavaScript in the engine, and a renderer that may
  load only the files sent with the request.

## Architecture

Five services in Docker Compose:

| Service | What |
| --- | --- |
| `studio` | Next.js. Server Components and Server Actions; the browser talks only to Studio |
| `api` | FastAPI. Contract in [`apps/api/openapi/public-api.yaml`](apps/api/openapi/public-api.yaml) |
| `gotenberg` | Chromium to PDF ([`jester/gotenberg`](infra/gotenberg/README.md): Gotenberg 9.4.1 + TH Sarabun New) |
| `postgres` | Templates, versions, users, runs |
| `rustfs` | S3-compatible storage for assets (images, fonts); any S3 endpoint works |

## Quick start

```bash
cp infra/.env.example infra/.env        # replace every value: openssl rand -hex 24
docker compose -f infra/compose.yaml up -d --build
docker compose -f infra/compose.yaml logs api   # copy the one-time setup token
```

Open Studio on port 3000, enter the setup token and create the first user. Studio's session cookie is `Secure`:
serve it over HTTPS, or set `JESTER_COOKIE_SECURE=false` to try it over plain http.
[infra/README.md](infra/README.md) covers the reverse proxy, `JESTER_TRUST_PROXY` and storage.

## Render from another system

Create an API key in Studio (Settings › API keys), then:

```bash
curl -X POST "$JESTER_API/v1/render" \
  -H "Authorization: Bearer jrk_…" \
  -H "Content-Type: application/json" \
  -d '{"template":{"id":"quotation","version":"published"},"params":{"quoteId":"Q-1"},"data":{}}' \
  -o report.pdf
```

Studio's **API** page and the **Render…** dialog build this request with each report's own params and sample
data. Errors are `application/problem+json` with a `code`, the `problems` found and a `runId` for the history.

## Development

```bash
# api (Python 3.11+, uv)
cd apps/api
uv sync
uv run ruff check . && uv run pytest -q

# studio (Node 24)
cd apps/studio
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npm run gen:api      # after changing the contract: regenerate lib/types.gen.ts
```

Tests that need PostgreSQL, RustFS or Gotenberg are skipped unless their URL is set; start them with
`docker compose -f infra/compose.dev.yaml up -d` (see [infra/README.md](infra/README.md#dev-stack)).
The Playwright suite in `apps/studio/e2e` runs against a full compose stack:
`STUDIO_E2E_URL=… STUDIO_E2E_API_URL=… STUDIO_E2E_SETUP_TOKEN=… npx playwright test`.

## Documentation

| Where | What |
| --- | --- |
| [CAPABILITY_MAP.md](CAPABILITY_MAP.md) | Modules, their dependencies and what v1 leaves out |
| `SPEC-<module>.md` | One spec per module (Thai), e.g. [SPEC-studio.md](SPEC-studio.md), [SPEC-public-api.md](SPEC-public-api.md) |
| [tasks/](tasks/) | Plans and task lists per module |
| [docs/intent](docs/intent/report-server-v1.md), [docs/research](docs/research/README.md) | Why it is built this way |

Not in v1: SSO, roles, async jobs and schedules, PDF/A and signatures, XLSX/DOCX export, data connectors,
a drag-and-drop designer.

## License

[MIT](LICENSE). The bundled TH Sarabun New font is GPL-2.0-or-later with a font exception
([license](infra/gotenberg/fonts/THSarabunNew-LICENSE.txt)), so PDFs that embed it are not covered by the GPL.
