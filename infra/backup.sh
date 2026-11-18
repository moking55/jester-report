#!/usr/bin/env bash
# Back up a running Jester stack: infra/backup.sh [destination]   (default: ./backups)
# Writes <destination>/jester-backup-YYYYMMDD-HHMMSS/ with db.dump, blobs.tar and manifest.json.
# No downtime: pg_dump is one consistent snapshot, then object storage is copied (SPEC-infra.md v1.5):
# - assets are written before their database row and never deleted, so nothing the dump names is missed;
# - document PDFs are listed after the dump. One that retention deletes in between is in db.dump without
#   its PDF (it was past its keep date anyway: a 404 after restore, then deleted by the next retention
#   round); one rendered after the dump has a PDF but no row, which `sweep-documents` removes.
# infra/.env (secrets) is NOT in the backup: keep a copy of it somewhere safe yourself.
# Another stack: COMPOSE_PROJECT_NAME=jester-e2e infra/backup.sh /tmp/backups
set -euo pipefail
umask 077 # the files hold password hashes and report data

here="$(cd "$(dirname "$0")" && pwd)"
compose=(docker compose -f "$here/compose.yaml")
dest="${1:-./backups}/jester-backup-$(date -u +%Y%m%d-%H%M%S)"
done=0
cleanup() { [ "$done" = 1 ] || rm -rf "$dest"; } # never leave half a backup behind
trap cleanup EXIT
mkdir -p "$dest"

echo "database..." >&2
"${compose[@]}" exec -T postgres pg_dump -U jester -d jester -Fc >"$dest/db.dump"
last=$("${compose[@]}" exec -T postgres psql -U jester -d jester -Atc "SELECT max(name) FROM schema_migrations")

echo "assets and documents..." >&2
"${compose[@]}" exec -T api python -m jester_api.ops.blobs export >"$dest/blobs.tar"
names=$(tar -tf "$dest/blobs.tar" 2>/dev/null || true) # GNU tar warns about our pax header
count=$(printf '%s\n' "$names" | grep -c -v -e '^documents/' -e '^$' || true)
documents=$(printf '%s\n' "$names" | grep -c '^documents/' || true)

db_sha=$(sha256sum "$dest/db.dump" | cut -d' ' -f1)
blobs_sha=$(sha256sum "$dest/blobs.tar" | cut -d' ' -f1)
cat >"$dest/manifest.json" <<EOF
{
  "formatVersion": 2,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "lastMigration": "$last",
  "blobCount": $count,
  "documentCount": $documents,
  "dbSha256": "$db_sha",
  "blobsSha256": "$blobs_sha"
}
EOF
done=1
echo "backup written to $dest ($count assets, $documents documents)" >&2
