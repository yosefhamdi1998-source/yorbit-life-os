"""Render the current, evidence-based status or owner actions without old business claims."""
import sys,os,subprocess,html
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
root=Path(__file__).resolve().parents[2]
kind,out=sys.argv[1:3]
source=root/('LAUNCH_STATUS.md' if kind=='status' else 'OWNER_ACTIONS.md')
text=source.read_text(encoding='utf-8')
commit=subprocess.check_output(['git','rev-parse','--short','HEAD'],cwd=root,text=True).strip()
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportTitle',fontName='Helvetica-Bold',fontSize=23,leading=28,textColor=colors.HexColor('#152642'),spaceAfter=16))
styles.add(ParagraphStyle(name='ReportSection',fontName='Helvetica-Bold',fontSize=12,leading=16,spaceBefore=13,spaceAfter=5,textColor=colors.HexColor('#244f75')))
styles.add(ParagraphStyle(name='ReportBody',fontName='Helvetica',fontSize=9.5,leading=14,spaceAfter=7))
styles.add(ParagraphStyle(name='ReportBullet',parent=styles['ReportBody'],leftIndent=11,firstLineIndent=-8))
if kind=='next':
 styles['ReportBody'].fontSize=9
 styles['ReportBody'].leading=13
 styles['ReportBody'].spaceAfter=6
 styles['ReportSection'].spaceBefore=11
story=[]
for line in text.splitlines():
 if not line.strip():continue
 name='ReportTitle' if line.startswith('# ') else 'ReportSection' if line.startswith('## ') else 'ReportBullet' if line.startswith('- ') else 'ReportBody'
 value=line[2:] if line.startswith('# ') else line[3:] if line.startswith('## ') else line
 story.append(Paragraph(html.escape(value),styles[name]))
Path(out).parent.mkdir(parents=True,exist_ok=True)
def footer(canvas,doc):
 canvas.saveState();canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#5c6570'))
 canvas.drawString(48,30,'Yorbit | source commit '+commit+' | dated evidence, not launch certification')
 canvas.drawRightString(564,30,str(doc.page));canvas.restoreState()
SimpleDocTemplate(out,pagesize=LETTER,leftMargin=48,rightMargin=48,topMargin=42,bottomMargin=48,title='Yorbit '+kind,author='Yorbit').build(story,onFirstPage=footer,onLaterPages=footer)
print('Created verified '+kind+' report')
