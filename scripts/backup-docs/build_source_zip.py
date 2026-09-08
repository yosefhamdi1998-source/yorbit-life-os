"""
Builds "4 - Hand This To AI.zip" (and its unzipped twin) from `git ls-files`
— every file git tracks, plus .env.example explicitly, since that file is a
safe template that documents which environment variables the app expects.
Using the tracked-files list instead of a hand-maintained exclude list means
this can never silently include node_modules/dist/build artifacts (git
already doesn't track them) and never silently include a real .env (git
already refuses to track it, per .gitignore).

Usage: python3 build_source_zip.py <output_zip_path>
"""
import sys
import os
import subprocess
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = sys.argv[1] if len(sys.argv) > 1 else r"C:\YORBIT\yorbit-life-os-source.zip"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

tracked = subprocess.run(
    ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
).stdout.strip().split("\n")
tracked = [f for f in tracked if f]

# .env.example is deliberately untracked-by-convention in some setups but
# safe to include (placeholder values only) — add it if present even if
# `git ls-files` doesn't list it. Never add a real .env; git wouldn't list
# one anyway (it's gitignored), so there is nothing to accidentally catch.
extra = []
env_example = os.path.join(ROOT, ".env.example")
if os.path.isfile(env_example) and ".env.example" not in tracked:
    extra.append(".env.example")

count = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for rel in tracked + extra:
        full = os.path.join(ROOT, rel)
        if not os.path.isfile(full):
            continue  # deleted-but-still-staged edge case
        zf.write(full, arcname=os.path.join("yorbit-life-os", rel))
        count += 1

print(f"Archived {count} git-tracked files")
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
