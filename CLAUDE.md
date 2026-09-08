# Instructions for Claude

## End of every working session

Run `./scripts/update-backup-docs.sh` (or double-click `scripts/Update Backup.bat`)
before ending a session that touched this repo. It regenerates all 5 backup
documents from live repo/session state and writes identical copies to both
`C:\Users\Yosef\iCloudDrive\YORBIT\` and `C:\Users\Yosef\OneDrive\Desktop\Yorbit Backup\`,
so Yosef's Desktop and iCloud copies stay current without having to ask for
them. It exits non-zero and names the exact file if anything fails — read
that output rather than assuming it worked.
