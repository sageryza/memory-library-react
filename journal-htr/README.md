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

## First result (November, 2-example calibration, no training)
Scored as % of the true words recovered on a held-out November page:

- Cold GPT-4o, no examples: **~58%**
- Calibrated with just **2** of her own example pages: **~67%**

+9 points from two examples and zero training cost — the floor, not the ceiling.
A model trained on all of November's 87 transcribed pages (or a Transkribus
PyLaia model) is where it gets genuinely clean. For reference, HandwritingOCR.com
gave her ~60% with no personalization.

November reconciliation: 72 `---` text blocks vs 87 scanned pages — the ~15-page
gap is drawing-only / near-blank pages (43 `(pic)` markers in the month).

## Notes
- Private inputs (the scan PDF, page PNGs, the transcript text, and any Firebase
  service-account key) are **gitignored** — never commit them.
- Scans live in Firebase Storage `journal-scans/` on the `membry-df528` project;
  fetch with an authenticated request (service-account token), not the public
  download token (that path 403s — no `manifest.json` is written there).
