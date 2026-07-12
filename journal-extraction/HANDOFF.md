# HANDOFF — journal drawing extraction (continue the backfill)

*Written July 10, 2026 (evening, PT) so a fresh chat can pick this up with
zero prior context. Read this file plus `README.md` in this directory before
doing anything.*

## What this project is

Sage has scanned PDF journals (one PDF per month) full of handwritten pages
with hand-drawn illustrations mixed in. The job: pull each drawing out as its
own image — cropped on its natural white paper, ink and scan texture
untouched, with only the stray handwriting around it erased. The results are
committed to this repo as PNGs.

## Confirmed state (verified July 10)

- **January is DONE and the drawings are safely in the repo**: 134 cutout
  PNGs, git-tracked at `journal-extraction/output/january/cutouts/`
  (`january_p02_0.png` …), plus `gallery.html` (review page),
  `detection_cache.json` (cached gpt-4o boxes — re-runs cost no API), and
  `review_verdicts.json` / `reviewed_gallery.html` from the human review pass.
- **Remaining months: June, July, August, September, October, November.**
  Sage stopped journaling after that, so this is a one-time backfill — once
  those six are done, the project is finished.
- **Blocker to hand to Sage first (VERIFIED July 10, late evening)**: the
  cloud folder is EMPTY. An authenticated listing of
  `journal-scans/` in the real bucket (`membry-df528.firebasestorage.app`,
  the same one JournalReader writes to; anonymous auth passes the Storage
  rules) returned zero objects — no PDFs, no manifest. Sage believed she had
  uploaded the journals, so her upload silently failed or never finished
  (the PDFs are ~40MB each; the app must stay open until it completes). She
  needs to either (a) re-send from the JournalReader iOS app ("Send journals
  to Claude") and watch for the completion state, or (b) paste direct links
  (Dropbox `?dl=1` works) and use input mode 2 below. To re-check the bucket
  yourself: anonymous sign-in via
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<apiKey from
  src/firebase.js>`, then GET
  `https://firebasestorage.googleapis.com/v0/b/membry-df528.firebasestorage.app/o?prefix=journal-scans%2F`
  with header `Authorization: Firebase <idToken>`.

## How the pipeline works (two tools, one job each)

1. **gpt-4o vision LOCATES the drawings** — per page it returns bounding
   boxes. It never touches pixels.
2. **OpenCV ERASES the handwriting locally (free)** — Otsu-thresholds the
   ink, separates the one big connected drawing blob from the small scattered
   text blobs (connected-components "territory" pass), fills only the text
   with the median paper color. The drawing itself is left exactly as
   scanned.

`pipeline_demo.png` in this directory is a labeled walk-through of one page.
Do NOT reach for a paid image-editing model for the erase step — an earlier
gpt-image-1 approach cost ~$19 for one batch and was replaced by this free
OpenCV pass on purpose (see the Spending rule in the repo's CLAUDE.md: state
costs before paid batches, ask first above $3; this pipeline is ~$0.35 per
journal, all in gpt-4o detection calls).

## Exact steps to continue

1. Environment: Python 3 with `pymupdf` (imported as `fitz`),
   `opencv-python` (`cv2`), `numpy`, `requests`, `Pillow`; plus
   `export OPENAI_API_KEY=…`.
2. Get the PDFs, either way:
   - **Manifest mode** (once the 403 is resolved):
     `python3 fetch_and_extract.py --manifest "<manifest url>"`
     — downloads every listed scan, runs the batch per month, and prints a
     got / missing / duplicate report against `output/_processed.json`.
     A same-month scan with a LARGER size than before is treated as updated
     (pages added) and re-run; identical size is skipped.
   - **Direct-link mode**:
     `python3 fetch_and_extract.py june="https://…?dl=1" july="https://…?dl=1"`
3. Or run one month by hand:
   `python3 batch_month.py "path/to/june.pdf" output/june june`
4. Review: open `output/<month>/gallery.html`. Expect the known rough edges —
   the occasional text-only false positive (a lone word boxed as a
   "drawing") and the spiral binding surviving at page edges inside real
   drawings. January's review flow produced `review_verdicts.json`; mirror
   that pattern (Sage reviews, verdicts recorded, `reviewed_gallery.html`
   regenerated) rather than silently keeping everything.
5. Commit the month's `cutouts/`, `gallery.html`, `detection_cache.json`
   (and review files once they exist) — January's committed layout is the
   template. PNGs are tracked in git on purpose; `__pycache__/` and
   `_incoming/` (downloaded PDFs) are gitignored — do NOT commit the raw
   journal PDFs, they're personal.
6. Tell Sage the per-month count and give her the gallery to review before
   calling a month done. Costs: ~$0.35/month in gpt-4o calls — fine to run
   without asking; anything pricier, ask first.

## Update — July 11, late evening (PT)

- **November: extracted, then deleted on Sage's word.** Her Nov 4–Dec 2 scan
  uploaded fine (the "unknown 400" was only the manifest-index write; fixed
  in JournalReader, which now also uploads over a BACKGROUND URLSession so
  she doesn't have to keep the app open). The pipeline pulled 20 drawings —
  but Sage already had November's drawings from an earlier pass, so the
  cutouts were removed from the repo to avoid confusion. If November ever
  needs re-running, the PDF is still in the bucket and `_det_cache.json`
  logic makes re-runs cheap.
- **She is now uploading MORE journals that are NOT for drawing extraction.**
  They're for the TRANSCRIPTION / timeline side (see below). One is named
  roughly "September big boy": four separate September-2024 journals that
  got intermixed (she wrote in them on different days), which she hand-sorted
  into ONE date-ordered compilation — all of September plus a little of
  October, in the right order. She sorted it specifically so uploads map
  cleanly onto the timeline.

## The NEXT project: corresponding scans to the app's banded timeline

JournalReader's Timeline tab renders `ios-journal/JournalReader/
journal_timeline.html` in a web view: one fully-transcribed journal
(Jan 31 – Feb 17, 2025) as ~104 vertical colored bands — band height ≈ how
much was written, color = kind of content (day / dreams / ideas / abstract /
drawings / todos). Tap a band to read that page's transcribed text. Each
entry in the HTML is a JS object like
`{page: 28, type: "dreams", lines: 17, date: "Feb 5", text: "…"}`.

The job Sage wants next: transcribe the newly uploaded scans (starting with
the September compilation) and extend that banded corpus — same entry shape,
new date ranges — so the timeline covers more of her journals. She has NOT
yet specified UI details (one long timeline vs. per-journal timelines, etc.)
— ask her before inventing anything. Costs: vision transcription of ~90
pages will exceed the $3 ask-first line — estimate and ASK before running.

## What "done" looks like

All six remaining months extracted, reviewed, and committed alongside
January. Downstream use of the drawings (e.g. turning them into XI card art
like the dreams deck) is a SEPARATE decision — ask Sage before doing anything
with the cutouts beyond extracting and committing them.

## Communication notes for the next chat (from the repo CLAUDE.md)

Long messages to Sage go as voice memos (OpenAI `gpt-4o-mini-tts`, voice
"fable", male British, normal speed), attached at the very END of the
message. Always give clickable links. Times in 12-hour Pacific. No
pill-shaped buttons in any UI work.
