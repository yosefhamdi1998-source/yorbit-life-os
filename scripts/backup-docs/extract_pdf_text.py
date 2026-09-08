"""Dumps a PDF's full text to stdout, so update-backup-docs.sh can pipe it
through the same secret scanner used on everything else. Usage:
python3 extract_pdf_text.py <pdf_path>"""
import sys
import fitz

doc = fitz.open(sys.argv[1])
for page in doc:
    print(page.get_text())
