# Journal HTR — reading Sophie's handwriting

Goal: **transcribe** the handwritten journals (a *reader*, not a handwriting
generator). Sophie has months of journals already transcribed word-for-word in
Notion; those transcripts are ground truth we can align to the scans to train a
reader for the still-untranscribed months.

## The key idea: her Notion transcripts are pre-segmented
Sophie writes a Notion divider (`---`) at each page break. So the transcript is
already split ~one-block-per-page — the tedious part of Transkribus ground-truth
prep (manual line-by-line pairing) is mostly done. We only have to **map each
scanned page image to its transcript block**, which we automate:

1. `render_pages.py` — scan PDF → per-page PNGs.
2. `split_blocks.py` — Notion transcript → list of `---`-delimited blocks.
3. rough OCR draft of a page → `match_page_to_block.py` fuzzy-matches it to the
   right block. Even a messy draft fingerprints the correct block decisively
   (top match far ahead of the runner-up).
4. `transcribe.mjs` — few-shot ("calibrated") reader: show GPT-4o a few of her
   own aligned (page → true text) pairs, then transcribe an unseen page.

The aligned pairs then feed **Transkribus Text-Image Matching** (auto line
alignment, no manual pairing) to train a custom HTR model on her hand.

## Results & the real bottleneck

**The reader works.** On pages whose text is correctly isolated, the calibrated
few-shot GPT-4o reader recovers **~65–75%** of the true words (cold, no examples:
~58%). That's a usable first-pass draft to proofread, and it already beats
HandwritingOCR.com (~60%, no personalization). It's the floor — a trained
Transkribus model goes further.

**The hard part is page-boundary alignment, not reading.** The `---` dividers
are close but not strictly one-per-page (72 blocks vs 87 pages; some blocks hold
two pages, a few mark missing/skipped content). Reliably slicing each *page's*
exact text out of the transcript is genuinely fragile:

- **Block-level matching is reliable** — a page's rough OCR fingerprints the
  right *block* well (`match_page_to_block.py`).
- **Exact page-boundary slicing is not** — three scripted approaches (word-LCS,
  contiguous sliding-window, block-anchored refine) all mis-sliced a meaningful
  fraction of pages, especially confusing *adjacent* pages that share a block.
  Worse, when a mis-sliced page becomes a calibration example, it *poisons* the
  few-shot reader (one run cratered to ~12% mean from corrupted examples while a
  cleanly-aligned page in the same run still scored 68%).

**Outlier filter (a good heuristic):** pages hold similar amounts of text, so the
`---` blocks cluster tightly (November: median 234 words, middle-half 209–270).
Merged multi-page blocks (up to 1102 words) and stub/"(missing)" blocks (~55
words) stick out as obvious outliers. Dropping the 16 outliers leaves 56 clean
~one-page blocks — usable directly as page truth, no fragile slicing. It doesn't
*fully* solve assignment (a page whose own block was an outlier gets force-matched
to a surviving block, and a monotonic-order guard over the resulting gaps is
touchy), but it's the right first pass and it's exactly the cleanup Transkribus
ground-truth wants.

**Verified result:** calibrating on 5 hand-verified clean pairs and testing on 4
held-out clean pages: **63% mean word recovery (52–77%)** — consistent every run.
Whenever a page is correctly paired the reader is solid; every low score traced
to a *pairing* error, never the reading.

**Takeaway:** don't hand-roll the full aligner. Line/page alignment with layout
detection + human-in-the-loop correction is exactly what **Transkribus
Text-Image Matching** is built for. Practical split:
- **In-house reader now:** calibrate on a *handful of hand-verified clean pairs*
  → proofread-ready first-pass drafts of new months (~63% and climbing with more
  clean examples).
- **Trained model later:** apply the outlier filter, feed the clean page-level
  `---` blocks into Transkribus TIM, correct the few straddlers there, train PyLaia.

## Notes
- Private inputs (the scan PDF, page PNGs, the transcript text, and any Firebase
  service-account key) are **gitignored** — never commit them.
- Scans live in Firebase Storage `journal-scans/` on the `membry-df528` project;
  fetch with an authenticated request (service-account token), not the public
  download token (that path 403s — no `manifest.json` is written there).
