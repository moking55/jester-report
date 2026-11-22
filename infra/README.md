# Infrastructure

| Path | What |
| --- | --- |
| [gotenberg/](gotenberg/README.md) | `jester/gotenberg` image (Gotenberg 9.4.1 + TH Sarabun New) and its hardened run flags |
| [compose.dev.yaml](compose.dev.yaml) | PostgreSQL + RustFS for development and the `db` / `storage` tests |
| [compose.yaml](compose.yaml) | The server: studio + api + PostgreSQL + RustFS + Gotenberg (+ mcp, optional) |
| [backup.sh](backup.sh), [restore.sh](restore.sh) | Back up a running server; restore into a new one (see below) |

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

## MCP connector (claude.ai, optional)

The `mcp` service (profile `mcp`, [SPEC-mcp.md](../SPEC-mcp.md)) lets people build report drafts from claude.ai with
their own Jester account. It can create and edit drafts, validate and preview them; it cannot publish, manage users
or API keys, or render for other systems.

1. Give it its own public HTTPS host on your reverse proxy, e.g. `https://mcp.example.com` → `mcp:8100`
   (`JESTER_MCP_PORT`). It must be reachable from the internet: claude.ai calls it from Anthropic's servers.
   A host of its own, not a path under Studio, because OAuth metadata lives at `/.well-known/` of the host.
2. In `infra/.env`: `COMPOSE_PROFILES=mcp`, `JESTER_MCP_PUBLIC_URL` (that host), `JESTER_STUDIO_PUBLIC_URL`
   (links people open to publish), and `JESTER_MCP_CLIENT_IP_HEADER` = the header your proxy puts the browser IP in
   (its last entry is used, as with `JESTER_TRUST_PROXY`). Without it every connector login counts from one address.
3. `docker compose -f infra/compose.yaml up -d --build`, then `curl https://mcp.example.com/healthz`.
4. In claude.ai: Settings → Connectors → Add custom connector → `https://mcp.example.com/mcp`. Each person signs in
   with their Jester username and password on the connector's own page.

Each sign-in creates a long Jester session (30 days idle, at most 90) that stays in the `mcp-data` volume; claude.ai
only gets a token for this service. Deleting a user or setting their password ends it at once. Back the volume up
or not as you like (losing it only means everyone signs in again), but protect it like the database.

## Backup and restore

```bash
infra/backup.sh                                        # -> ./backups/jester-backup-YYYYMMDD-HHMMSS/
infra/restore.sh backups/jester-backup-20261118-020000 # into a NEW stack only
```

| In the backup | Not in the backup |
| --- | --- |
| `db.dump`: PostgreSQL (`pg_dump -Fc`): reports, drafts, versions, users, sessions, API keys (hashed), runs, themes, issued documents (params and data) | `infra/.env`: the secrets. Keep a copy yourself; a restore works with new secrets too |
| `blobs.tar`: every asset's bytes (logos, fonts), named by sha256, and the PDF of every issued document, named `documents/<run id>` | |
| `manifest.json`: date, last migration, sha256 of both files, `blobCount` (assets) and `documentCount` | |

- **No downtime.** `pg_dump` takes one consistent snapshot, then the script copies the assets and document
  PDFs it can name. If one is missing from storage the backup fails instead of finishing incomplete.
  A document that retention deletes during the backup is restored without its PDF (it was past its keep date).
- **Restore never writes over data.** It checks both sha256s first, then stops unless the database is
  empty. It also stops when the backup is newer than the api image (update the image first). An older
  backup into a newer image is fine: the api applies the newer migrations when it starts.
- **Restore into a new stack.** On a new machine: copy `infra/` and your `infra/.env`, then run
  `infra/restore.sh <dir>`. It starts postgres and rustfs, restores, then starts everything.
- **The files are sensitive** (password hashes, report data and, since v1.5, every issued document with the
  customer data in it); the script writes them readable by you only. `blobs.tar` grows with every document. Encrypt before they leave the machine, e.g. `tar -c jester-backup-… | age -r <key> > backup.tar.age`.
- **Other stacks:** both scripts honour `COMPOSE_PROJECT_NAME`.

Daily at 02:00, keeping 14 days (crontab of the user that runs docker):

```bash
0 2 * * * cd /opt/jester && infra/backup.sh /var/backups/jester && find /var/backups/jester -maxdepth 1 -name 'jester-backup-*' -mtime +14 -exec rm -rf {} +
```

Once a day, delete document PDFs that have no row (a render whose database write failed, a retention
delete that failed). Files younger than an hour are left alone:

```bash
30 3 * * * cd /opt/jester && docker compose -f infra/compose.yaml exec -T api python -m jester_api.ops.blobs sweep-documents
```

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
