#!/usr/bin/env bash
# Regenerates all five backup documents from live repo/session state and
# writes identical copies to both synced folders:
#   C:\Users\Yosef\iCloudDrive\YORBIT\
#   C:\Users\Yosef\OneDrive\Desktop\Yorbit Backup\
#
# Before this script existed, only the transcript (#3) was scriptable —
# the two PDFs, the source folder and the zip were built by hand in a
# single session on 2026-09-07 and were frozen at that day forever after.
# That gap was the actual problem to solve; see scripts/backup-docs/ for
# where each piece now comes from.
#
# Safety, in the order it happens:
#   1. Everything is built in a LOCAL staging folder first (C:\YORBIT\
#      backup-staging — outside both synced folders on purpose: OneDrive/
#      iCloud upload changes within seconds of a write, so anything with a
#      credential in it must never touch either folder even transiently).
#   2. Every generated file is scanned for credential-shaped strings using
#      the same pattern list export-session.js already uses for the
#      transcript (scripts/lib/secretPatterns.js — one source of truth,
#      not a second copy of the regexes).
#   3. Only after every scan comes back clean does anything get copied
#      into iCloud or the Desktop folder.
#   4. Both destinations are then compared byte-for-byte to confirm the
#      copy actually landed the same on both sides.
#
# Usage: ./scripts/update-backup-docs.sh
# Exit code is non-zero on ANY failure, and the failure message names
# exactly which file/step failed — see FAIL() below.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Drive-letter form (C:/...), not the /c/... MSYS shorthand — bash accepts
# both, but native Windows Python resolves a leading /c/ with no drive
# letter as DRIVE-RELATIVE, silently creating a real C:\c\... folder
# instead of erroring. Cost an hour to find; every path below must keep
# the drive letter for exactly this reason.
STAGING="C:/YORBIT/backup-staging"
ICLOUD_DEST="C:/Users/Yosef/iCloudDrive/YORBIT"
DESKTOP_DEST="C:/Users/Yosef/OneDrive/Desktop/Yorbit Backup"
LOGDIR="C:/Users/Yosef/.claude/projects/C--Users-Yosef"

PDF1="1 - App Status Report.pdf"
PDF2="2 - What You Need To Do Next.pdf"
MD3="3 - Full Conversation History.md"
ZIP4="4 - Hand This To AI.zip"
FOLDER4="4 - App Source Code (browse this)"

FAIL() {
  echo "" >&2
  echo "============================================" >&2
  echo "  BACKUP UPDATE FAILED" >&2
  echo "============================================" >&2
  echo "  $1" >&2
  echo "" >&2
  echo "Nothing was copied to iCloud or the Desktop folder — whatever was" >&2
  echo "there before this run is untouched." >&2
  exit 1
}

echo "== Yorbit backup docs — regenerating all 5 =="
echo "Staging in: $STAGING (local only, not synced)"
echo ""

rm -rf "$STAGING"
mkdir -p "$STAGING" || FAIL "could not create staging folder: $STAGING"

# ---- 1. Newest session transcript (export-session.js redacts internally) ----
SESSION=$(ls -t "$LOGDIR"/*.jsonl 2>/dev/null | head -1)
[ -n "${SESSION:-}" ] || FAIL "no Claude Code session log found in $LOGDIR"
echo "-> $MD3 (from $(basename "$SESSION"))"
node scripts/export-session.js "$SESSION" "$STAGING/$MD3" || FAIL "$MD3 (scripts/export-session.js failed — see its own output above)"

# ---- 2. The two PDFs, generated from live repo state ----
echo "-> $PDF1"
python3 scripts/backup-docs/status_report.py "$STAGING/$PDF1" || FAIL "$PDF1 (status_report.py failed)"

echo "-> $PDF2"
python3 scripts/backup-docs/todo_next.py "$STAGING/$PDF2" || FAIL "$PDF2 (todo_next.py failed)"

# ---- 3. Source zip (from `git ls-files`, so it can't drift from what's
#         actually tracked) plus its unzipped twin ----
echo "-> $ZIP4"
python3 scripts/backup-docs/build_source_zip.py "$STAGING/$ZIP4" || FAIL "$ZIP4 (build_source_zip.py failed)"

echo "-> $FOLDER4"
rm -rf "$STAGING/_extract_tmp"
python3 -c "import zipfile; zipfile.ZipFile('$STAGING/$ZIP4').extractall('$STAGING/_extract_tmp')" || FAIL "$FOLDER4 (could not extract $ZIP4)"
mv "$STAGING/_extract_tmp/yorbit-life-os" "$STAGING/$FOLDER4" || FAIL "$FOLDER4 (extract landed in an unexpected shape)"
rmdir "$STAGING/_extract_tmp" 2>/dev/null || true

# ---- 4. Redaction gate — scan EVERYTHING before anything is copied out ----
echo ""
echo "== Scanning all 5 for credential-shaped strings =="

scan_one() {
  local target_path="$1"
  local display_name="$2"
  local result
  result=$(node scripts/backup-docs/scan_text.mjs "$target_path" 2>&1) \
    || FAIL "could not scan $display_name — $result"
  local leak_count
  leak_count=$(printf '%s' "$result" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).leaks.length))")
  if [ "$leak_count" != "0" ]; then
    FAIL "credential pattern found in $display_name — $result — NOT copied anywhere."
  fi
}

scan_one "$STAGING/$MD3" "$MD3"

python3 scripts/backup-docs/extract_pdf_text.py "$STAGING/$PDF1" > "$STAGING/.scan1.txt" || FAIL "could not extract text from $PDF1 for scanning"
scan_one "$STAGING/.scan1.txt" "$PDF1"
rm -f "$STAGING/.scan1.txt"

python3 scripts/backup-docs/extract_pdf_text.py "$STAGING/$PDF2" > "$STAGING/.scan2.txt" || FAIL "could not extract text from $PDF2 for scanning"
scan_one "$STAGING/.scan2.txt" "$PDF2"
rm -f "$STAGING/.scan2.txt"

# scripts/test-redaction.js deliberately contains fake, secret-SHAPED
# fixture data (the canonical jwt.io example token, synthetic Supabase/
# Anthropic/Stripe-shaped strings) to verify the scanner itself catches
# them. It always will, and should — that's not a leak, it's the test
# doing its job. This is the one, narrow, explicit exception; everything
# else in the source folder is scanned for real.
SKIP_FILES=("$STAGING/$FOLDER4/scripts/test-redaction.js")

while IFS= read -r -d '' f; do
  skip=false
  for s in "${SKIP_FILES[@]}"; do
    [ "$f" = "$s" ] && skip=true && break
  done
  [ "$skip" = true ] && continue
  scan_one "$f" "$f"
done < <(find "$STAGING/$FOLDER4" -type f \( \
    -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o \
    -name "*.mjs" -o -name "*.cjs" -o -name "*.sql" -o -name "*.md" -o \
    -name "*.json" -o -name "*.example" -o -name "*.toml" -o -name "*.yaml" -o \
    -name "*.yml" \) -print0)

echo "Clean — no credential patterns found in any of the 5."

# ---- 5. Only now: copy into both synced folders ----
echo ""
echo "== Writing to both folders =="
for DEST in "$ICLOUD_DEST" "$DESKTOP_DEST"; do
  mkdir -p "$DEST" || FAIL "could not create destination folder: $DEST"
  cp "$STAGING/$PDF1" "$DEST/$PDF1" || FAIL "copying $PDF1 to $DEST"
  cp "$STAGING/$PDF2" "$DEST/$PDF2" || FAIL "copying $PDF2 to $DEST"
  cp "$STAGING/$MD3" "$DEST/$MD3" || FAIL "copying $MD3 to $DEST"
  cp "$STAGING/$ZIP4" "$DEST/$ZIP4" || FAIL "copying $ZIP4 to $DEST"
  rm -rf "$DEST/$FOLDER4"
  cp -r "$STAGING/$FOLDER4" "$DEST/$FOLDER4" || FAIL "copying $FOLDER4 to $DEST"
  echo "  done: $DEST"
done

# ---- 6. Verify both destinations actually match, byte-for-byte ----
echo ""
echo "== Verifying both folders match =="
verify_file() {
  cmp -s "$ICLOUD_DEST/$1" "$DESKTOP_DEST/$1" || FAIL "$1 differs between iCloud and Desktop after copying — copy did not land the same on both sides"
  echo "  match: $1"
}
verify_folder() {
  diff -rq "$ICLOUD_DEST/$1" "$DESKTOP_DEST/$1" >/dev/null || FAIL "$1 differs between iCloud and Desktop after copying"
  echo "  match: $1"
}
verify_file "$PDF1"
verify_file "$PDF2"
verify_file "$MD3"
verify_file "$ZIP4"
verify_folder "$FOLDER4"

echo ""
echo "============================================"
echo "  All 5 backup documents updated and verified"
echo "============================================"
echo "  $ICLOUD_DEST"
echo "  $DESKTOP_DEST"
echo ""
