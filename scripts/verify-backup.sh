#!/bin/bash
# Prove a backup is actually restorable.
#
# Decrypts the newest backup, checks the JSON parses end-to-end, counts the
# rows in every table, then deletes the decrypted copy. Answers the only two
# questions that matter about a backup file:
#   1. Does your password actually open it?
#   2. Is the snapshot complete, or did it get truncated?
#
# A backup nobody has ever opened is a guess, not a backup.

set -e

BACKUP_DIR="${1:-/c/Users/Yosef/iCloudDrive/Yorbit Backups}"
# Decrypt into local non-synced space, never into the cloud folder — the
# whole point of the backup design is that plaintext never touches a
# directory a sync client is watching.
STAGING="${2:-/c/Users/Yosef/yorbit-backups}"
mkdir -p "$STAGING"

FILE=$(ls -1t "$BACKUP_DIR"/*.enc 2>/dev/null | head -1)
if [ -z "$FILE" ]; then
  echo "No .enc backup found in: $BACKUP_DIR"
  exit 1
fi

echo "Checking: $(basename "$FILE")"
echo "Size: $(wc -c < "$FILE") bytes"
echo ""

PLAIN="$STAGING/.verify-$$.json"
# Always remove the decrypted copy, including on Ctrl-C or any error.
trap 'rm -f "$PLAIN"' EXIT INT TERM

# openssl reads its passphrase from the terminal, not stdin, so a piped
# password can't drive it — which makes the interactive path untestable
# without this hatch. Same escape valve backup.sh uses, and same reason:
# so the path real users take is the one that got exercised in testing.
if [ -n "$YORBIT_BACKUP_PASSWORD" ]; then
  DECRYPT_OK=0
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "$FILE" -out "$PLAIN" \
    -pass env:YORBIT_BACKUP_PASSWORD 2>/dev/null || DECRYPT_OK=1
else
  echo "==================================================="
  echo "  Enter the password you used for this backup."
  echo "  Nothing shows on screen while you type."
  echo "==================================================="
  DECRYPT_OK=0
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "$FILE" -out "$PLAIN" 2>/dev/null || DECRYPT_OK=1
fi

if [ "$DECRYPT_OK" -ne 0 ]; then
  echo ""
  echo "FAILED - that password does not open this file."
  echo ""
  echo "The file itself is fine. Either the password was different from what"
  echo "you think you typed, or there's a typo. If you can't remember it,"
  echo "this backup is unrecoverable - run a new one with a password you"
  echo "save to your password manager first."
  exit 1
fi

echo ""
echo "Password OK - file decrypted."
echo ""

node -e '
const fs = require("fs");
let raw;
try { raw = fs.readFileSync(process.argv[1], "utf8"); }
catch (e) { console.log("Could not read decrypted file:", e.message); process.exit(1); }

let data;
try { data = JSON.parse(raw); }
catch (e) {
  console.log("INCOMPLETE - the decrypted file is not valid JSON.");
  console.log("This means the snapshot was truncated. Do not rely on it.");
  console.log("Parser said:", e.message);
  process.exit(1);
}

// backup_query.sql returns ONE row with ONE column named full_backup, so
// the file looks like [{ "full_backup": { profiles: [...], ... } }].
// Counting the outer object reports "1 table, 1 row" no matter what is
// actually inside — which looks like a pass and proves nothing. Unwrap it.
let snap = Array.isArray(data) ? data[0] : data;
if (snap && snap.full_backup) snap = snap.full_backup;

const takenAt = snap ? snap.backup_taken_at : null;
// Every table is a JSON array; backup_taken_at is the one scalar and is
// metadata, not a table.
const tables = Object.keys(snap || {}).filter(k => Array.isArray(snap[k])).sort();
if (!tables.length) { console.log("EMPTY - no tables found inside the snapshot."); process.exit(1); }

if (takenAt) console.log("Taken at: " + takenAt);
console.log("");

let total = 0; const empty = [];
console.log("Tables in this backup:");
for (const t of tables) {
  const n = snap[t].length;
  total += n;
  if (n === 0) empty.push(t);
  console.log("  " + String(n).padStart(7) + "  " + t);
}
console.log("");
console.log("Tables: " + tables.length + "   Total rows: " + total.toLocaleString());
if (empty.length) console.log("Empty tables (fine if you never used them): " + empty.join(", "));

// A snapshot that parses but holds no transactions is not a useful backup
// of a finance app, and is the shape a silently-failing query would take.
const txCount = Array.isArray(snap.transactions) ? snap.transactions.length : 0;
if (txCount === 0) {
  console.log("");
  console.log("WARNING - this backup contains ZERO transactions.");
  console.log("It decrypts and parses, but there is nothing worth restoring.");
  process.exit(1);
}

console.log("");
console.log("VERIFIED - decrypts, parses completely, and holds "
  + txCount.toLocaleString() + " transactions.");
' "$PLAIN"

RESULT=$?
rm -f "$PLAIN"
echo ""
echo "Decrypted copy deleted. Nothing readable left on disk."
exit $RESULT
