#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND_DIR="$SCRIPT_DIR/../backend"
OUTPUT_FILE=${1:-sqlite-export.json}

cd "$BACKEND_DIR"

# Force Django to use the local SQLite fallback for export.
DATABASE_URL='' python3 manage.py dumpdata \
  --natural-foreign \
  --natural-primary \
  --exclude contenttypes \
  --exclude auth.permission \
  --exclude admin.logentry \
  --exclude sessions \
  > "$OUTPUT_FILE"

printf 'SQLite data exported to %s\n' "$OUTPUT_FILE"
