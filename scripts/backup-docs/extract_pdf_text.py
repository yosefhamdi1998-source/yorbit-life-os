"""Dump PDF text for the backup secret scanner; extraction errors fail closed."""
import sys

try:
    import fitz
except ImportError:
    from pypdf import PdfReader
    pages = [page.extract_text() or "" for page in PdfReader(sys.argv[1]).pages]
else:
    with fitz.open(sys.argv[1]) as doc:
        pages = [page.get_text() for page in doc]

if not pages or any(not text.strip() for text in pages):
    raise ValueError("PDF has an empty or unextractable page; refusing an incomplete secret scan")
sys.stdout.reconfigure(encoding="utf-8")
print("\n".join(pages))
