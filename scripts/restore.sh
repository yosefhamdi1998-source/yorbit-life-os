#!/bin/bash
# Yorbit database restore — rebuilds every table's data from a backup made
# by scripts/backup.sh.
#
# Usage:
#   ./scripts/restore.sh <path-to-backup.json.enc> [--live]
#
# By default (no --live flag) this restores into a throwaway schema called
# restore_test, verifies every table's row count matches the backup exactly,
# then drops that schema — proving the backup is genuinely restorable
# without touching a single real row. This is the mode to run any time you
# want to confirm a backup is good.
#
# --live is for an ACTUAL disaster: the real database is gone or corrupted.
# It restores directly into the real tables (public schema). Only use it
# after the schema has been recreated first — see the instructions it
# prints.

set -e

ENC_FILE="$1"
MODE="${2:-test}"
if [ -z "$ENC_FILE" ] || [ ! -f "$ENC_FILE" ]; then
  echo "Usage: ./scripts/restore.sh <path-to-backup.json.enc> [--live]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_JSON=$(mktemp --suffix=.json)
trap 'rm -f "$TMP_JSON"' EXIT

echo "Decrypting..."
if [ -n "$YORBIT_BACKUP_PASSWORD" ]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "$ENC_FILE" -out "$TMP_JSON" -pass env:YORBIT_BACKUP_PASSWORD
else
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "$ENC_FILE" -out "$TMP_JSON"
fi
echo "Decrypted OK ($(wc -c < "$TMP_JSON") bytes)."

npx supabase link --project-ref pvjiialxboslqyiiybpe > /dev/null 2>&1

if [ "$MODE" = "--live" ]; then
  echo ""
  echo "LIVE MODE — this restores into your REAL tables (public schema)."
  echo "Only do this after recreating the schema from scratch:"
  echo "  1. Create a new Supabase project (or confirm the current one has"
  echo "     an empty/matching schema)."
  echo "  2. npx supabase link --project-ref <new-ref>"
  echo "  3. npx supabase db push --linked   (replays every migration in"
  echo "     supabase/migrations/ — this is what actually recreates the"
  echo "     schema; the JSON backup is DATA only, never schema)."
  echo "  4. Re-run this script with --live against the new project."
  read -p "Type RESTORE to continue: " confirm
  [ "$confirm" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
  TARGET_SCHEMA="public"
else
  echo ""
  echo "TEST MODE — restoring into a throwaway 'restore_test' schema."
  echo "Nothing in your real data is touched."
  TARGET_SCHEMA="restore_test"
fi

node "$SCRIPT_DIR/restore.cjs" "$TMP_JSON" "$TARGET_SCHEMA"
