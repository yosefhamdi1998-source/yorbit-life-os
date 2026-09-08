"""
Generates "1 - App Status Report.pdf" from LIVE repository state — the
automation described in update-backup-docs.sh's header. Every number on the
cover and in the appendix is computed at run time; nothing here is a copy
of what was true on 2026-09-07.

Usage: python3 status_report.py <output_path>
"""
import sys
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                 HRFlowable, ListFlowable, ListItem,
                                 PageBreak, KeepTogether, Table, TableStyle)

sys.path.insert(0, os.path.dirname(__file__))
from pdf_common import (covertitle, coversub, kicker, h2, body, small, label,
                         GOLD, GOLDDK, RULE, INK, ChapterBar, two_col_table,
                         section, footer_fn)
import repo_facts
import business_facts

OUT = sys.argv[1] if len(sys.argv) > 1 else r"C:\YORBIT\status_report.pdf"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

stats = repo_facts.git_stats()
migs = repo_facts.migrations()
funcs = repo_facts.edge_functions()
routes = repo_facts.routes()
flags = repo_facts.feature_flags()
asc = repo_facts.app_store_config_state()
day_commits = repo_facts.dated_commits()
today = repo_facts.today_str()

doc = SimpleDocTemplate(OUT, pagesize=LETTER, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                         topMargin=0.65 * inch, bottomMargin=0.7 * inch,
                         title="Yorbit — Full Project Status", author="Yorbit")
F = []

# ---- Cover ----
F.append(Spacer(1, 0.6 * inch))
F.append(HRFlowable(width="34%", thickness=1, color=GOLD, hAlign="CENTER", spaceAfter=12))
F.append(Paragraph("YORBIT", covertitle))
F.append(Spacer(1, 4))
F.append(Paragraph("FULL PROJECT STATUS", kicker))
F.append(Spacer(1, 12))
F.append(HRFlowable(width="34%", thickness=1, color=GOLD, hAlign="CENTER", spaceAfter=14))
F.append(Paragraph(
    "Every account, every screen, everything built, everything still open, and exactly "
    "what to do next — regenerated from the live repository, not a copy of an earlier day.",
    coversub))
F.append(Spacer(1, 22))

GOLD_HEX, GOLDDK_HEX = "#AD8A2E", "#8A6D1F"
stat_row = Table([[
    Paragraph(f'<font size=22 color="{GOLD_HEX}"><b>{stats["working_days"]}</b></font><br/>'
              f'<font size=8 color="{GOLDDK_HEX}"><b>WORKING DAYS</b></font>', small),
    Paragraph(f'<font size=22 color="{GOLD_HEX}"><b>{stats["total_changes"]}</b></font><br/>'
              f'<font size=8 color="{GOLDDK_HEX}"><b>CHANGES SHIPPED</b></font>', small),
    Paragraph(f'<font size=22 color="{GOLD_HEX}"><b>{len(migs)}</b></font><br/>'
              f'<font size=8 color="{GOLDDK_HEX}"><b>DATABASE MIGRATIONS</b></font>', small),
]], colWidths=[2.1 * inch] * 3)
stat_row.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
F.append(stat_row)
F.append(Spacer(1, 24))
F.append(HRFlowable(width="100%", thickness=0.6, color=RULE, spaceAfter=6))
F.append(Paragraph(f"Regenerated {today} for Yosef Hamdi — every figure below computed from the "
                    "repository at generation time.", small))
F.append(PageBreak())

# ---- Section: what actually exists (derived from code, not memory) ----
F.append(ChapterBar("01", "What's actually built"))
F.append(Spacer(1, 10))
routes_table = Table([[Paragraph(", ".join(routes), body)]], colWidths=[6.7 * inch])
routes_table.setStyle(TableStyle([
    ("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 4),
]))
F.append(section(f"App routes ({len(routes)})", routes_table))
F.append(Spacer(1, 10))

func_rows = [(f, "Live edge function") for f in funcs]
F.append(section(f"Server functions ({len(funcs)})", two_col_table(func_rows)))
F.append(Spacer(1, 10))

flag_rows = [(k, "Enabled" if v else "Disabled") for k, v in sorted(flags.items())]
F.append(section("Feature flags", two_col_table(flag_rows)))
F.append(Spacer(1, 6))
F.append(Paragraph(
    "App Store Connect wiring: "
    + ("API key + numeric App Store ID are set." if (asc["app_store_id_set"] and asc["revenuecat_key_set"])
       else "still using placeholder values in src/lib/appStoreConfig.js — RevenueCat isn't wired in yet."),
    small))

# ---- Section: what's honestly still open ----
F.append(Spacer(1, 8))
F.append(ChapterBar("02", "What's honestly still open"))
F.append(Spacer(1, 10))
open_items = []
if not (asc["app_store_id_set"] and asc["revenuecat_key_set"]):
    open_items.append(("RevenueCat not wired in", "appStoreConfig.js placeholders are still blank — see What You Need To Do #4."))
if flags.get("launchChecklist"):
    open_items.append(("Launch checklist flag is ON", "FEATURES.launchChecklist must be false before App Store release — it's currently true."))
uncommitted = repo_facts.uncommitted_changes()
if uncommitted:
    open_items.append((f"{len(uncommitted)} uncommitted change(s)", "The working tree has real edits not yet committed — check `git status`."))
# Not code-observable — an iPhone build either ran on Codemagic or it
# didn't, and this script has no API call to check. Kept as a plain,
# clearly-labeled line rather than faked as something derived from the repo.
open_items.append(("iPhone build status: unverified by this script", "Check Codemagic's own dashboard — this is a real gap this automation cannot close."))
F.append(KeepTogether(two_col_table(open_items)))

# ---- Appendix: day-by-day, entirely from git log ----
F.append(PageBreak())
F.append(ChapterBar("03", "Appendix — the complete build log"))
F.append(Spacer(1, 8))
F.append(Paragraph(
    "Every change made to Yorbit, in the order it happened, grouped by day. Regenerated "
    "from `git log` at build time — this section cannot go stale.", small))
F.append(Spacer(1, 8))
for d, msgs in day_commits:
    F.append(Paragraph(f"<b>{d}</b>  &nbsp; {len(msgs)} change{'s' if len(msgs) != 1 else ''}", h2))
    F.append(ListFlowable(
        [ListItem(Paragraph(m, body)) for m in msgs],
        bulletType="bullet", start="\u2022", bulletColor=GOLDDK,
        bulletFontSize=10, leftIndent=16, bulletIndent=0,
    ))
F.append(Spacer(1, 8))
F.append(Paragraph(
    f"{stats['total_changes']} recorded changes across {stats['working_days']} working days "
    f"({stats['first_day']} \u2192 {stats['last_day']}). {len(migs)} database migrations applied.",
    small))

doc.build(F, onFirstPage=footer_fn("YORBIT  \u2014  FULL PROJECT STATUS"),
          onLaterPages=footer_fn("YORBIT  \u2014  FULL PROJECT STATUS"))
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
