#!/usr/bin/env bash
# Daily backup of the Project Expense Manager: PostgreSQL dump + uploaded receipts/logo.
#
#   ./scripts/backup.sh                 # run once
#
# Cron (every night at 02:30, keep a log):
#   30 2 * * * /opt/project-expense-manager/scripts/backup.sh >> /var/log/pem-backup.log 2>&1
#
# Settings (read from the app's .env, override with environment variables):
#   DATABASE_URL     postgresql://user:pass@host:5432/dbname?schema=public
#   UPLOAD_DIR       where receipts are stored (default ./uploads)
#   BACKUP_DIR       where backups are written (default ./backups)
#   BACKUP_KEEP_DAYS how many days of backups to keep (default 30)
#
# Restore:
#   gunzip -c backups/db-YYYY-MM-DD_HHMM.sql.gz | psql "<DATABASE_URL without ?schema=…>"
#   tar -xzf backups/uploads-YYYY-MM-DD_HHMM.tar.gz -C /path/to/app
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# Load .env without overriding variables that are already set
if [[ -f .env ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    key="$(echo "$key" | xargs)"
    value="${value%\"}"; value="${value#\"}"
    [[ -z "${!key:-}" ]] && export "$key=$value"
  done < .env
fi

: "${DATABASE_URL:?DATABASE_URL is not set}"
UPLOAD_DIR="${UPLOAD_DIR:-./uploads}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

if [[ "$DATABASE_URL" != postgres* ]]; then
  echo "$(date '+%F %T') ERROR: backup.sh is for PostgreSQL (DATABASE_URL=$DATABASE_URL)" >&2
  exit 1
fi

command -v pg_dump >/dev/null || {
  echo "$(date '+%F %T') ERROR: pg_dump not found — install the PostgreSQL client tools" >&2
  exit 1
}

# Never leave half-written files behind if anything fails
trap 'rm -f "$BACKUP_DIR"/*.tmp' EXIT

# pg_dump does not understand Prisma's ?schema=… parameter
PG_URL="${DATABASE_URL%%\?*}"
STAMP="$(date '+%Y-%m-%d_%H%M')"
mkdir -p "$BACKUP_DIR"
umask 077 # backups contain financial data — owner-only permissions

DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
echo "$(date '+%F %T') dumping database -> $DB_FILE"
pg_dump --no-owner --no-privileges "$PG_URL" | gzip -9 > "$DB_FILE.tmp"
mv "$DB_FILE.tmp" "$DB_FILE"

if [[ -d "$UPLOAD_DIR" ]]; then
  UP_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
  echo "$(date '+%F %T') archiving $UPLOAD_DIR -> $UP_FILE"
  tar -czf "$UP_FILE.tmp" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
  mv "$UP_FILE.tmp" "$UP_FILE"
fi

echo "$(date '+%F %T') removing backups older than $BACKUP_KEEP_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime "+$BACKUP_KEEP_DAYS" -delete

echo "$(date '+%F %T') backup finished"
