#!/bin/sh
set -eu

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Usage: scripts/verify-restore.sh path/to/watchbracket.dump" >&2
  exit 1
fi

CONTAINER="watchbracket-restore-check-$$"
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=restore_check \
  -e POSTGRES_PASSWORD=restore-check-temporary \
  -e POSTGRES_DB=watchbracket_restore \
  postgres:17.6-alpine >/dev/null

attempt=0
until docker exec "$CONTAINER" pg_isready -U restore_check -d watchbracket_restore >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "Restore-check database did not become ready." >&2; exit 1; fi
  sleep 1
done

docker cp "$DUMP_FILE" "$CONTAINER:/tmp/watchbracket.dump"
docker exec "$CONTAINER" pg_restore --exit-on-error --no-owner --no-acl -U restore_check -d watchbracket_restore /tmp/watchbracket.dump
TABLE_COUNT="$(docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -At -U restore_check -d watchbracket_restore -c \
  "select count(*) from information_schema.tables where table_schema='public' and table_name in ('households','rooms','participants','tournaments','watch_bracket_history');")"
if [ "$TABLE_COUNT" != "5" ]; then
  echo "Restore verification found $TABLE_COUNT of 5 required tables." >&2
  exit 1
fi

echo "Restore verification passed: $DUMP_FILE"
