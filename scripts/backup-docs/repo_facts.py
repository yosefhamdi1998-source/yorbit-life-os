"""
Every fact in here is pulled from the repository itself at run time — no
hardcoded counts, no frozen dates. This is the actual point of this whole
folder: the previous status PDF said "202 changes... 33 migrations" forever,
because those numbers were typed once by hand on 2026-09-07 and never
updated again.

What's deliberately NOT here: business facts no repository could ever
contain (has the LLC been filed? has the domain been bought?) and dollar
figures that require checking a competitor's live pricing page. Those live
in business_facts.py as a small, explicitly-dated config block — see that
file's own header for why that split is honest rather than lazy.
"""
import subprocess
import re
import os
from datetime import datetime, date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout


def git_stats():
    log = _git("log", "--format=%ad|%s", "--date=format:%Y-%m-%d")
    lines = [l for l in log.strip().split("\n") if l]
    days = sorted(set(l.split("|", 1)[0] for l in lines))
    return {
        "working_days": len(days),
        "total_changes": len(lines),
        "first_day": days[0] if days else None,
        "last_day": days[-1] if days else None,
    }


def dated_commits():
    """[(date, [messages...]), ...] in chronological order — the source for
    the day-by-day appendix, same technique as 2026-09-07's version."""
    log = _git("log", "--reverse", "--format=%ad|%s", "--date=format:%Y-%m-%d")
    by_day = {}
    order = []
    for line in log.strip().split("\n"):
        if not line:
            continue
        d, msg = line.split("|", 1)
        if d not in by_day:
            by_day[d] = []
            order.append(d)
        by_day[d].append(msg)
    return [(d, by_day[d]) for d in order]


def migrations():
    mdir = os.path.join(ROOT, "supabase", "migrations")
    files = sorted(f for f in os.listdir(mdir) if f.endswith(".sql"))
    return files


def edge_functions():
    fdir = os.path.join(ROOT, "supabase", "functions")
    return sorted(d for d in os.listdir(fdir)
                  if os.path.isdir(os.path.join(fdir, d)) and not d.startswith("_"))


def routes():
    """Parses App.jsx's <Route path="..."> list directly — this IS the
    routing table, not a description of it, so it can't drift from what
    actually ships."""
    app_jsx = os.path.join(ROOT, "src", "App.jsx")
    with open(app_jsx, "r", encoding="utf-8") as f:
        text = f.read()
    return sorted(set(re.findall(r'<Route path="([^"]+)"', text)))


def feature_flags():
    path = os.path.join(ROOT, "src", "lib", "features.js")
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    flags = {}
    for m in re.finditer(r'^\s*(\w+):\s*(true|false)', text, re.MULTILINE):
        flags[m.group(1)] = m.group(2) == "true"
    return flags


def app_store_config_state():
    """Whether the two placeholders in appStoreConfig.js have real values
    yet — this is a genuine, code-observable signal for whether RevenueCat/
    App Store Connect wiring is actually done, not a guess."""
    path = os.path.join(ROOT, "src", "lib", "appStoreConfig.js")
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    app_store_id = re.search(r"APP_STORE_ID\s*=\s*'([^']*)'", text)
    rc_key = re.search(r"REVENUECAT_API_KEY\s*=\s*'([^']*)'", text)
    return {
        "app_store_id_set": bool(app_store_id and app_store_id.group(1).strip()),
        "revenuecat_key_set": bool(rc_key and rc_key.group(1).strip()),
    }


def uncommitted_changes():
    status = _git("status", "--short")
    # supabase/.temp/* are CLI cache noise, not real work — same filter
    # used by hand all night when deciding what to stage.
    real = [l for l in status.strip().split("\n")
            if l and "supabase/.temp/" not in l]
    return real


def test_suite_summary():
    """Does NOT re-run the suite (this script runs unattended via a
    double-click .bat; a failing test should not silently block someone's
    backup from being written). Reports whether package.json defines one,
    which is itself a fact worth a reader knowing."""
    pkg = os.path.join(ROOT, "package.json")
    with open(pkg, "r", encoding="utf-8") as f:
        text = f.read()
    return '"test"' in text


def today_str():
    return date.today().strftime("%B %-d, %Y") if os.name != "nt" else date.today().strftime("%B %#d, %Y")
