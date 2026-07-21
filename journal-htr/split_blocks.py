#!/usr/bin/env python3
"""Split a month's Notion transcript into per-page blocks on `---` dividers.

Sophie writes a Notion divider (`---`) at each page break in her transcripts,
so the dividers already segment the text into ~one-block-per-page. This turns
that into a JSON list of blocks we can align page images against.

Usage: python3 split_blocks.py transcript.txt blocks.json
Input is the plain transcript text (paste/export the Notion page body).
"""
import sys, re, json

text = open(sys.argv[1]).read()
# a divider is a line that is exactly ---
blocks = [b.strip() for b in re.split(r'\n---\n', text) if b.strip()]
json.dump(blocks, open(sys.argv[2], "w"), ensure_ascii=False, indent=0)
print(f"{len(blocks)} blocks written to {sys.argv[2]}")
