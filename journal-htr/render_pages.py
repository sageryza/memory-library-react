#!/usr/bin/env python3
"""Render a journal-scan PDF to per-page PNGs for transcription.

Usage: python3 render_pages.py scan.pdf out_dir [dpi]
"""
import sys, os
import fitz  # PyMuPDF

pdf, out = sys.argv[1], sys.argv[2]
dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 200
os.makedirs(out, exist_ok=True)
doc = fitz.open(pdf)
for i in range(doc.page_count):
    doc[i].get_pixmap(dpi=dpi).save(os.path.join(out, f"p{i:03d}.png"))
print(f"rendered {doc.page_count} pages -> {out} @ {dpi}dpi")
