#!/usr/bin/env bash
# Restore a backup made by infra/backup.sh into a stack whose database is EMPTY:
#   infra/restore.sh backups/jester-backup-YYYYMMDD-HHMMSS
# It never writes over data: a database that already has Jester tables stops it before anything changes.
# Order: check the files -> start postgres + rustfs -> check the database is empty and the api image knows
# the backup's last migration -> pg_restore (one transaction) -> asset bytes -> start the whole stack
# (the api then applies any newer migrations itself).
# Another stack: COMPOSE_PROJECT_NAME=jester-restore infra/restore.sh <dir>
set -euo pipefail
umask 077

dir="${1:?usage: infra/restore.sh <backup directory>}"
here="$(cd "$(dirname "$0")" && pwd)"
compose=(docker compose -f "$here/compose.yaml")

for file in manifest.json db.dump blobs.tar; do
  [ -f "$dir/$file" ] || { echo "missing $dir/$file" >&2; exit 1; }
done
field() { sed -n "s/.*\"$1\": *\"\{0,1\}\([^\",]*\)\"\{0,1\},\{0,1\}$/\1/p" "$dir/manifest.json"; }
[ "$(field formatVersion)" = 1 ] || { echo "unknown backup format" >&2; exit 1; }
[ "$(sha256sum "$dir/db.dump" | cut -d' ' -f1)" = "$(field dbSha256)" ] || { echo "db.dump does not match manifest.json" >&2; exit 1; }
[ "$(sha256sum "$dir/blobs.tar" | cut -d' ' -f1)" = "$(field blobsSha256)" ] || { echo "blobs.tar does not match manifest.json" >&2; exit 1; }
last=$(field lastMigration)

echo "starting postgres and rustfs..." >&2
"${compose[@]}" up -d --wait postgres rustfs

psql() { "${compose[@]}" exec -T postgres psql -U jester -d jester -Atc "$1"; }
if [ "$(psql "SELECT to_regclass('public.schema_migrations') IS NULL")" != t ]; then
  echo "this stack's database is not empty; restore only into a new stack (nothing was changed)" >&2
  exit 1
fi
if ! "${compose[@]}" run --rm --no-deps -T api python -c \
  "import sys; from jester_api.db.migrate import MIGRATIONS; sys.exit(0 if (MIGRATIONS / '$last').exists() else 1)"; then
  echo "the backup is newer than this api image ($last unknown); update the image first (nothing was changed)" >&2
  exit 1
fi

echo "database..." >&2
"${compose[@]}" exec -T postgres pg_restore -U jester -d jester --single-transaction --no-owner <"$dir/db.dump"

echo "assets..." >&2
"${compose[@]}" run --rm --no-deps -T api python -m jester_api.ops.blobs import <"$dir/blobs.tar"

echo "starting the stack..." >&2
"${compose[@]}" up -d
echo "restored from $dir" >&2
