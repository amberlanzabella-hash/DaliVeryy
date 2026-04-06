#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND_DIR="$SCRIPT_DIR/../backend"
DUMP_FILE=${1:-sqlite-export.json}
ENV_FILE="$BACKEND_DIR/.env"

if [ -z "${DATABASE_URL:-}" ] && ! grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  printf 'DATABASE_URL is not set in the shell or %s. Point it to your PostgreSQL database first.\n' "$ENV_FILE" >&2
  exit 1
fi

cd "$BACKEND_DIR"

python3 manage.py migrate
python3 manage.py loaddata "$DUMP_FILE"
python3 manage.py check

printf 'PostgreSQL import complete using %s\n' "$DUMP_FILE"
