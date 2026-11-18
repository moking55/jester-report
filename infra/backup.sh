#!/usr/bin/env bash
# Back up a running Jester stack: infra/backup.sh [destination]   (default: ./backups)
# Writes <destination>/jester-backup-YYYYMMDD-HHMMSS/ with db.dump, blobs.tar and manifest.json.
# No downtime: pg_dump is one consistent snapshot, then the asset bytes it can refer to are copied
# (assets are written before their database row and never deleted, so nothing it names is missed).
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

echo "assets..." >&2
"${compose[@]}" exec -T api python -m jester_api.ops.blobs export >"$dest/blobs.tar"
count=$(tar -tf "$dest/blobs.tar" | grep -c . || true)

db_sha=$(sha256sum "$dest/db.dump" | cut -d' ' -f1)
blobs_sha=$(sha256sum "$dest/blobs.tar" | cut -d' ' -f1)
cat >"$dest/manifest.json" <<EOF
{
  "formatVersion": 1,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "lastMigration": "$last",
  "blobCount": $count,
  "dbSha256": "$db_sha",
  "blobsSha256": "$blobs_sha"
}
EOF
done=1
echo "backup written to $dest ($count assets)" >&2
