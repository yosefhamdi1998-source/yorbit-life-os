"""
Shared ReportLab styling for the two backup-doc PDFs, factored out of the
ad-hoc scripts written by hand on 2026-09-07 so update-backup-docs.sh can
regenerate both from one place instead of two frozen one-off files.

Import from status_report.py / todo_next.py; nothing here builds a PDF on
its own.
"""
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (Paragraph, Spacer, Table, TableStyle,
                                 HRFlowable, ListFlowable, ListItem,
                                 PageBreak, KeepTogether, Flowable)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

SERIF, SERIF_R = "Helvetica-Bold", "Helvetica"
try:
    pdfmetrics.registerFont(TTFont("Georgia", r"C:\Windows\Fonts\georgia.ttf"))
    pdfmetrics.registerFont(TTFont("Georgia-Bold", r"C:\Windows\Fonts\georgiab.ttf"))
    SERIF, SERIF_R = "Georgia-Bold", "Georgia"
except Exception:
    pass

INK, MUTED, GOLD, GOLDDK, RULE = (
    colors.HexColor("#15181F"), colors.HexColor("#5B6270"),
    colors.HexColor("#AD8A2E"), colors.HexColor("#8A6D1F"), colors.HexColor("#E4E0D5"))
BADGE = colors.HexColor("#F5F1E6")


def S(name, **kw):
    base = dict(name=name, fontName=SERIF_R, fontSize=9.8, leading=14.2, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(**base)


covertitle = S("ct", fontName=SERIF, fontSize=34, leading=38, alignment=TA_CENTER)
coversub = S("cs", fontSize=11.5, leading=16, textColor=MUTED, alignment=TA_CENTER)
kicker = S("kk", fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=GOLDDK, alignment=TA_CENTER)
stepnum = S("sn", fontName=SERIF, fontSize=22, leading=24, textColor=GOLD, alignment=TA_CENTER)
steptitle = S("st", fontName="Helvetica-Bold", fontSize=12.5, leading=15.5, textColor=INK, spaceAfter=3)
stepmeta = S("sm", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=GOLDDK, spaceAfter=6)
body = S("bd", fontSize=10, leading=15, spaceAfter=4)
small = S("smm", fontSize=8.8, leading=12.6, textColor=MUTED)
mono = S("mo", fontName="Courier", fontSize=8.6, leading=12.2, textColor=INK)
h2 = S("h2", fontName="Helvetica-Bold", fontSize=10.4, leading=13, textColor=INK, spaceBefore=8, spaceAfter=4)
label = S("lb", fontName="Helvetica-Bold", fontSize=8.4, leading=11.5, textColor=colors.white)
costbadge = S("cb", fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=colors.white, alignment=TA_CENTER)
cell = S("ce", fontSize=9.3, leading=13)
cellb = S("ceb", fontName="Helvetica-Bold", fontSize=9.3, leading=13)


class ChapterBar(Flowable):
    """Gold-on-ink section header bar, the visual spine of both documents."""
    def __init__(self, num, title, width=7.0 * inch, height=0.4 * inch):
        super().__init__()
        self.num, self.title, self.width, self.height = num, title, width, height

    def wrap(self, aw, ah):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        c.setFillColor(INK)
        c.rect(0, 0, self.width, self.height, fill=1, stroke=0)
        c.setFillColor(GOLD)
        c.rect(0, 0, 0.05 * inch, self.height, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColor(GOLD)
        c.drawString(0.2 * inch, self.height / 2 - 3, self.num)
        c.setFont(SERIF, 12.5)
        c.setFillColor(colors.white)
        # Real & characters only — canvas.drawString never parses HTML
        # entities the way Paragraph does. Learned the hard way 2026-09-07.
        c.drawString(0.56 * inch, self.height / 2 - 4.2, self.title)


def cost_chip(text, urgent=False):
    t = Table([[Paragraph(text, costbadge)]], colWidths=[1.05 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#8A2E2E") if urgent else GOLDDK),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def code_box(text):
    t = Table([[Paragraph(text, mono)]], colWidths=[5.3 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BADGE), ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def two_col_table(rows, col_widths=(2.3 * inch, 4.4 * inch)):
    """Plain Table, no self-KeepTogether — see section() for why doubling
    that up backfired on 2026-09-07 (shoved a table with room to spare onto
    a fresh, mostly-blank page)."""
    data = [[Paragraph(a, S("t1", fontName="Helvetica-Bold", fontSize=9.4)),
             Paragraph(b, cell)] for a, b in rows]
    t = Table(data, colWidths=list(col_widths))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ]))
    return t


def section(title_text, table_flowable):
    """The ONLY KeepTogether wrapper for a heading+table pair — combining a
    heading and its table into one atomic unit is what stops a page break
    landing between them."""
    return KeepTogether([Paragraph(title_text, h2), Spacer(1, 2), table_flowable])


def footer_fn(title_text):
    def footer(canv, doc):
        if doc.page == 1:
            return
        canv.saveState()
        canv.setStrokeColor(RULE)
        canv.setLineWidth(0.5)
        canv.line(0.75 * inch, 0.58 * inch, LETTER[0] - 0.75 * inch, 0.58 * inch)
        canv.setFont(SERIF_R, 8)
        canv.setFillColor(MUTED)
        canv.drawString(0.75 * inch, 0.42 * inch, title_text)
        canv.setFont("Helvetica-Bold", 8)
        canv.setFillColor(GOLDDK)
        canv.drawRightString(LETTER[0] - 0.75 * inch, 0.42 * inch, str(doc.page - 1))
        canv.restoreState()
    return footer
