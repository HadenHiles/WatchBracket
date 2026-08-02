#!/bin/sh
set -eu

ENV_FILE="${1:-.env.production}"
DESTINATION="${2:-backups}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$DESTINATION"
chmod 700 "$DESTINATION"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$DESTINATION/watchbracket-$STAMP.dump"

docker compose --env-file "$ENV_FILE" -f compose.prod.yml exec -T postgres \
  sh -c 'exec pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTPUT"
chmod 600 "$OUTPUT"

if [ ! -s "$OUTPUT" ]; then
  echo "Backup is empty: $OUTPUT" >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f compose.prod.yml exec -T postgres \
  sh -c 'exec pg_restore --list' < "$OUTPUT" > /dev/null

echo "$OUTPUT"
