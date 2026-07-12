#!/usr/bin/env python3
"""Map each scanned page to its true-text block from the transcript.

Given a rough OCR draft of a page (any generic HTR is fine — it only needs to
be good enough to fingerprint), find the transcript block it belongs to. This
is the automated replacement for the manual line-by-line pairing that makes
Transkribus ground-truth prep so painful: the divider blocks + fuzzy matching
do it for you.

Usage: python3 match_page_to_block.py blocks.json draft.txt
Prints the best-matching block index + confidence gap to the runner-up.
"""
import sys, re, json
from difflib import SequenceMatcher

def norm(s):
    s = re.sub(r'\(pic\)|<empty-block/>|\[drawing\]|\[\?\]|[*_#>`]', ' ', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s.lower())
    return re.sub(r'\s+', ' ', s).strip()

blocks = json.load(open(sys.argv[1]))
nb = [norm(b) for b in blocks]
draft = norm(open(sys.argv[2]).read())
scored = sorted(((SequenceMatcher(None, draft, b).ratio(), i)
                 for i, b in enumerate(nb)), reverse=True)
best_score, best_i = scored[0]
gap = best_score - (scored[1][0] if len(scored) > 1 else 0)
print(f"best block: {best_i}  (score {best_score:.3f}, gap to runner-up {gap:.3f})")
