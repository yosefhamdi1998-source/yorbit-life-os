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

# $1 = local staging directory. The snapshot is written here as PLAINTEXT
#      before being encrypted, so this must NOT be inside a synced folder
#      (OneDrive, iCloud, Dropbox). Otherwise the sync client can upload
#      the unencrypted file — every transaction plus password hashes — in
#      the seconds before it's deleted.
# $2 = optional final destination for the ENCRYPTED file only. Safe to put
#      in cloud storage, because by then it's just ciphertext.
OUT_DIR="${1:-$HOME/yorbit-backups}"
FINAL_DEST="${2:-}"
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/yorbit-backup-$TIMESTAMP.json"
ENCRYPTED="$RAW.enc"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_REF="pvjiialxboslqyiiybpe"
LINK_FILE="$SCRIPT_DIR/../supabase/.temp/project-ref"

# `supabase link` prompts for the DATABASE password when the project isn't
# already linked. This used to run unconditionally with `> /dev/null 2>&1`,
# which threw the prompt away — the script looked frozen at "Linking to
# project..." with an invisible question waiting on stdin, and the password
# typed there went to the Supabase CLI instead of to the encryption step.
# Never hide this command's output, and skip it entirely when already linked
# (which is the normal case — linking is a one-time setup step).
if [ -f "$LINK_FILE" ] && [ "$(tr -d '[:space:]' < "$LINK_FILE")" = "$PROJECT_REF" ]; then
  echo "Project already linked. Skipping link step."
else
  echo "Linking to project..."
  echo "NOTE: if this asks for a password, that is your SUPABASE DATABASE"
  echo "password, not the backup password. The backup password comes later."
  npx supabase link --project-ref "$PROJECT_REF"
fi

echo "Taking snapshot..."
# stderr goes to a file rather than /dev/null so a real failure can be shown
# instead of silently producing an empty snapshot.
ERRLOG="$OUT_DIR/.backup-stderr-$TIMESTAMP.log"
if ! npx supabase db query --linked -f "$SCRIPT_DIR/backup_query.sql" --output-format json > "$RAW" 2>"$ERRLOG"; then
  echo ""
  echo "The snapshot command failed. What it reported:"
  echo "----------------------------------------------"
  cat "$ERRLOG"
  echo "----------------------------------------------"
  rm -f "$RAW" "$ERRLOG"
  exit 1
fi
rm -f "$ERRLOG"

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
  echo "==================================================="
  echo "  THIS is the backup password prompt."
  echo "  Choose a password. You'll type it twice."
  echo "  Nothing shows on screen while you type - that's normal."
  echo "==================================================="
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -in "$RAW" -out "$ENCRYPTED"
fi

# The unencrypted copy existed only long enough to be encrypted — remove it
# now, before anything gets copied anywhere.
rm -f "$RAW"

if [ -n "$FINAL_DEST" ]; then
  mkdir -p "$FINAL_DEST"
  mv "$ENCRYPTED" "$FINAL_DEST/"
  FINAL_FILE="$FINAL_DEST/$(basename "$ENCRYPTED")"
  echo ""
  echo "Done. Your backup is saved to:"
  echo "  $FINAL_FILE"
  echo ""
  echo "It is encrypted, and it's in your cloud folder, so it will sync off"
  echo "this computer on its own. Nothing else to do."
  echo ""
  echo "Only the encrypted file was ever placed there — the readable copy"
  echo "was created and deleted locally and never touched cloud storage."
else
  echo ""
  echo "Done: $ENCRYPTED"
  echo ""
  echo "NEXT STEP — this file still needs to leave this machine:"
  echo "  Move it to a cloud drive, in a folder that isn't shared publicly."
  echo "  The file is encrypted, so even if that cloud account were ever"
  echo "  compromised, the backup itself is still protected by your password."
fi
echo ""
echo "If you lose the password, this backup cannot be opened by anyone,"
echo "including you. Keep it in a password manager."
echo ""
echo "To restore this backup later, see scripts/restore.sh"
