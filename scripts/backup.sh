#!/bin/bash
# Yorbit database backup — run this any time you want a fresh snapshot.
#
# Usage:
#   ./scripts/backup.sh
#
# You'll be prompted for a password to encrypt the backup. Use a real
# password you'll remember — there is no way to recover the backup without
# it, by design (that's what makes it safe to store off this machine).
#
# What this produces:
#   yorbit-backup-YYYY-MM-DD-HHMMSS.json.enc
# A single encrypted file containing every row in every table. The
# unencrypted .json is deleted immediately after encryption — it never
# sits on disk unencrypted for longer than the few seconds this takes.

set -e

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
OUT_DIR="${1:-$HOME/Desktop/yorbit-backups}"
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/yorbit-backup-$TIMESTAMP.json"
ENCRYPTED="$RAW.enc"

echo "Linking to project..."
npx supabase link --project-ref pvjiialxboslqyiiybpe > /dev/null 2>&1

echo "Taking snapshot..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
npx supabase db query --linked -f "$SCRIPT_DIR/backup_query.sql" --output-format json > "$RAW" 2>/dev/null

ROWS=$(grep -oE '"transactions":\s*\[' "$RAW" | wc -l)
if [ "$ROWS" -eq 0 ]; then
  echo "Something went wrong — the snapshot looks empty. Not encrypting an empty/broken file."
  rm -f "$RAW"
  exit 1
fi

SIZE=$(wc -c < "$RAW")
echo "Snapshot taken: $SIZE bytes."
echo ""
if [ -n "$YORBIT_BACKUP_PASSWORD" ]; then
  # Only meant for scripted/automated runs (e.g. this being tested).
  # Normal interactive use should always hit the prompt below instead —
  # typing it interactively means the password never touches shell
  # history or a saved script.
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -in "$RAW" -out "$ENCRYPTED" -pass env:YORBIT_BACKUP_PASSWORD
else
  echo "Now encrypting. You'll be asked for a password TWICE (enter, confirm)."
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -in "$RAW" -out "$ENCRYPTED"
fi

# The unencrypted copy existed only long enough to be encrypted — remove it now.
rm -f "$RAW"

echo ""
echo "Done: $ENCRYPTED"
echo ""
echo "NEXT STEP — this file still needs to leave this machine:"
echo "  Upload $ENCRYPTED to a cloud drive (Google Drive, iCloud, Dropbox —"
echo "  whichever you already use), in a folder that isn't shared publicly."
echo "  The file is encrypted, so even if that cloud account were ever"
echo "  compromised, the backup itself is still protected by your password."
echo ""
echo "To restore this backup later, see scripts/restore.sh"
