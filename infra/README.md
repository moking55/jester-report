# Infrastructure

| Path | What |
| --- | --- |
| [gotenberg/](gotenberg/README.md) | `jester/gotenberg` image (Gotenberg 9.4.1 + TH Sarabun New) and its hardened run flags |
| [compose.dev.yaml](compose.dev.yaml) | PostgreSQL + RustFS for development and the `db` / `storage` tests |
| [compose.yaml](compose.yaml) | The server: studio + api + PostgreSQL + RustFS + Gotenberg |

## Run the server

```bash
cp infra/.env.example infra/.env        # replace every value: openssl rand -hex 24
docker compose -f infra/compose.yaml up -d --build
docker compose -f infra/compose.yaml logs api   # copy the first-run setup token
curl http://localhost:8000/v1/health
```

Only Studio (`JESTER_STUDIO_PORT`, default 3000) and the api (`JESTER_API_PORT`, default 8000) are published;
PostgreSQL, RustFS and Gotenberg stay on the compose network. Put your reverse proxy (TLS) in front of both.
Studio's session cookie is `Secure`, so open Studio over HTTPS (or set `JESTER_COOKIE_SECURE=false` to try it
over plain http).

Behind that proxy, set `JESTER_TRUST_PROXY=1` (the proxy must append the browser IP to `X-Forwarded-For`).
Without it every Studio login reaches the api from Studio's own address, so failed logins count for the whole
team: anyone can lock a username out for 15 minutes from any machine. Leave it `0` when Studio is reachable
without the proxy, or anyone could fake the header. `infra/.env` holds real secrets and is
git-ignored. The contract is served at `/v1/openapi.yaml`.

## Dev stack

```bash
docker compose -f infra/compose.dev.yaml up -d
```

Ports bind to `127.0.0.1` only. When the stack runs on another host, tunnel the ports:

```bash
ssh -N -L 5432:127.0.0.1:5432 -L 9000:127.0.0.1:9000 -L 3000:127.0.0.1:3000 <host>
```

Then, from `apps/api`:

```bash
JESTER_TEST_DATABASE_URL=postgresql://jester:jester-dev@127.0.0.1:5432/jester \
JESTER_TEST_S3_ENDPOINT=http://127.0.0.1:9000 \
GOTENBERG_URL=http://127.0.0.1:3000 \
uv run pytest -m "db or storage or engine" -q
```

The credentials in `compose.dev.yaml` are for local development only.

## Object storage: RustFS (checked 14 Nov 2026)

| Item | Status |
| --- | --- |
| License | Apache-2.0 (open source, fine to ship as the default) |
| Version | `rustfs/rustfs:1.0.4` (25 Oct 2026), digest `sha256:ed9210d6411d77ffceb70d94b964a3cb7d225983368bc25bebe01e995293dcc2`; 1.0.5 was 4 days old, so not pinned yet |
| Maturity | 1.0.x line, releases about weekly. The project marks core S3 features "Available" and some (S3 Tables, MinIO on-disk compatibility) "Preview"; Jester uses only bucket create/head and object put/head/get |
| Verified | `storage` test (create bucket, put, head, get, missing key) passes against 1.0.4 |

Jester only speaks the S3 API, so switching storage is configuration: point the S3 endpoint and keys at
MinIO, SeaweedFS or a cloud bucket. Switch the default only if RustFS's license stops being open source
or the `storage` tests fail.

PostgreSQL: `postgres:16-alpine`, digest `sha256:f377d590e5474681d4d7838635031a2b50647923b7abfa803ce9b5ff35d5c663` (16.16).
