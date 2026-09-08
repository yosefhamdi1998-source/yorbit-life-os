"""
Generates "2 - What You Need To Do Next.pdf". The 8 action items and their
costs come from business_facts.py (see that file's header for why those
specific facts are hand-maintained rather than derived) — but whether each
one is ALREADY DONE is checked against the live repo where that's honestly
possible, so a completed step doesn't sit around forever claiming to still
be open.

Usage: python3 todo_next.py <output_path>
"""
import sys
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable, ListFlowable,
                                 ListItem, PageBreak, KeepTogether)

sys.path.insert(0, os.path.dirname(__file__))
from pdf_common import (covertitle, coversub, kicker, stepnum, steptitle,
                         stepmeta, body, small, mono, h2, label, cell, cellb,
                         GOLD, GOLDDK, RULE, INK, BADGE, ChapterBar,
                         cost_chip, code_box, footer_fn)
import repo_facts
import business_facts

OUT = sys.argv[1] if len(sys.argv) > 1 else r"C:\YORBIT\todo_next.pdf"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

flags = repo_facts.feature_flags()
asc = repo_facts.app_store_config_state()
today = repo_facts.today_str()


def is_done(item):
    check = item.get("auto_check")
    if check == "signup_open":
        return _signup_actually_open()
    if check == "app_store_and_revenuecat":
        return asc["app_store_id_set"] and asc["revenuecat_key_set"]
    return False


def _signup_actually_open():
    # The allowlist trigger was dropped 2026-09-07 via a migration, not a
    # feature flag — the honest signal is that migration's presence.
    return any("open_signup" in m for m in repo_facts.migrations())


doc = SimpleDocTemplate(OUT, pagesize=LETTER, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                         topMargin=0.65 * inch, bottomMargin=0.7 * inch,
                         title="Yorbit — What You Need To Do", author="Yorbit")
F = []

# ---- Cover ----
F.append(Spacer(1, 0.75 * inch))
F.append(HRFlowable(width="34%", thickness=1, color=GOLD, hAlign="CENTER", spaceAfter=12))
F.append(Paragraph("YORBIT", covertitle))
F.append(Spacer(1, 4))
F.append(Paragraph("WHAT YOU NEED TO DO", kicker))
F.append(Spacer(1, 12))
F.append(HRFlowable(width="34%", thickness=1, color=GOLD, hAlign="CENTER", spaceAfter=14))
F.append(Paragraph(
    "The code is done. Everything from here is accounts, approvals and paperwork — "
    "regenerated from the live repo, so anything already finished shows as done instead "
    "of sitting here forever.", coversub))
F.append(Spacer(1, 26))
F.append(HRFlowable(width="100%", thickness=0.6, color=RULE, spaceAfter=6))
F.append(Paragraph(f"Regenerated {today} for Yosef Hamdi. Cost figures verified "
                    f"{business_facts.VERIFIED_ON} — see the note at the end.", small))
F.append(PageBreak())

# ---- The steps ----
F.append(ChapterBar("", "The order that actually works"))
F.append(Spacer(1, 10))


def step(item):
    n = item["n"]
    done = is_done(item)
    right_col = [Paragraph(item["title"], steptitle),
                 Paragraph(item["timeframe"].upper(), stepmeta),
                 Paragraph(item["body"], body)]
    if item.get("extra"):
        right_col.append(item["extra"])
    if done:
        chip = Table([[Paragraph("\u2713 DONE", label)]], colWidths=[1.05 * inch])
        chip.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#2E7D4F")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
    else:
        chip = cost_chip(item["cost"], urgent=item.get("urgent", False))
    row = Table([[Paragraph(str(n), stepnum), right_col, chip]],
                colWidths=[0.5 * inch, 4.85 * inch, 1.15 * inch])
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "TOP"), ("VALIGN", (1, 0), (1, 0), "TOP"), ("VALIGN", (2, 0), (2, 0), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("LEFTPADDING", (1, 0), (1, 0), 6), ("LEFTPADDING", (2, 0), (2, 0), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE),
    ]))
    return KeepTogether(row)


for item in business_facts.ACTION_ITEMS:
    extra = None
    if item.get("n") == 4:
        extra = code_box("app.yorbit.pro.monthly<br/>app.yorbit.pro.yearly")
    F.append(step({**item, "extra": extra}))

# ---- Cost summary ----
F.append(Spacer(1, 8))
F.append(ChapterBar("", "What this actually costs"))
F.append(Spacer(1, 10))
F.append(Paragraph(
    f"Sourced {business_facts.VERIFIED_ON} from each company's own pricing page — "
    "not re-verified automatically by this script (no live web check), so re-confirm "
    "if it's been a while.", body))
F.append(Spacer(1, 4))

rows = [[Paragraph("Item", label), Paragraph("Cost", label), Paragraph("When", label)]]
for item in business_facts.ACTION_ITEMS:
    done = is_done(item)
    cost_text = "Done" if done else item["cost"]
    rows.append([Paragraph(item["title"], cell), Paragraph(cost_text, cellb), Paragraph(str(item["n"]), cell)])
ct = Table(rows, colWidths=[3.25 * inch, 2.35 * inch, 0.9 * inch], repeatRows=1)
ct.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK),
    ("TOPPADDING", (0, 0), (-1, 0), 7), ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 1), (-1, -1), 6.5), ("BOTTOMPADDING", (0, 1), (-1, -1), 6.5),
    ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BADGE]),
    ("BOX", (0, 0), (-1, -1), 0.6, RULE),
]))
F.append(KeepTogether(ct))
F.append(Spacer(1, 5))
F.append(Paragraph(
    "*Apple Developer Program membership continues on its existing $99/year cycle — "
    "converting to an Organization account doesn't charge again.", small))

doc.build(F, onFirstPage=footer_fn("YORBIT  \u2014  WHAT YOU NEED TO DO"),
          onLaterPages=footer_fn("YORBIT  \u2014  WHAT YOU NEED TO DO"))
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
