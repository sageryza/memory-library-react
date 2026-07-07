# Journal Timeline — Handoff

## What this is
A single-file, scrollable HTML visualization of Sophie's handwritten journal (Jan 31 – Feb 17, 2025). Each journal page is a vertical colored block; block **height** ≈ how much was written, block **color** = type of content. Tapping a block shows the actual **typed text** for that whole same-color run. Tapping a legend color isolates and reads just that type across the journal.

Intended destination: embed as a tab/icon in Sophie's iOS journaling app (see "Integrating into the app").

**Current file:** `journal_timeline_v9_p2-68.html` — self-contained, no backend. All the text and structure live in the `sections` array inside it.

## The 6 categories (colors are fixed)
- `day` — day details / scenes / memories / emotion — pastel orange `#e8cda6`
- `dreams` — lilac `#d3c7e2`
- `ideas` — ideas / making / projects — sage `#c5d3b9`
- `abstract` — thinking-about-thinking — slate blue `#c0d1dd`
- `todos` — lists / logistics — grey `#d6d1c6`
- `drawings` — dusty rose `#e2c4c6`

Paper `#ede4d0`, ink `#5a1e22`, fonts EB Garamond / Cinzel.

## Data model
The HTML holds `const sections=[ ... ]`. Each entry:
```
{page: 8, type: "abstract", lines: 14, date: "Feb 2", text: "..."}
```
- `page` — position label (repeated for each band on the same page).
- `type` — one of the 6 categories.
- `lines` — relative height (≈ text length / 47).
- `date` — the reliable anchor (see caveats).
- `text` — the raw typed journal text for that band (verbatim from Sophie's Notion entries).

A page split into several bands = several entries with the same `page` number, in order.

## Source of truth (important)
Text comes ONLY from the raw chronological Notion entries: **"January 15 – ?"** (holds the Jan 31 tail = pages 2–5) and **"February"** (Feb 1–28 = pages 6 on). The raw entries mark handwritten page breaks with `---`.
**Do NOT use the "Journal Index" database.** Its Type/Themes tags were made by an earlier AI pass, not by Sophie — she asked to ignore it entirely.

## Status
- **Pages 2–23 (Jan 31 – Feb 3):** done — finely split into within-page bands. ✅
- **Pages 24–40 (Feb 4 – Feb 8):** done — finely banded. ✅
- **Pages 41–68 (Feb 9 – Feb 17):** NOT done — still ONE color per page (a first-pass single classification). **28 pages remain to be banded.**

## How to continue (carefully)
For each remaining page 41–68, in order:
1. Open its entry(ies) in the `sections` array — the full typed `text` is already there.
2. Read it and find where the topic/color shifts mid-page.
3. Replace that one entry with several entries (same `page`), each a band: split the `text` at the shift, assign the right `type`, set `lines ≈ len/47`, keep the correct `date` (carry the day forward; a page can start on one date and cross into the next).
4. Keep text verbatim — never paraphrase the journal.
5. Work in small batches (a few days at a time) and confirm with Sophie before continuing.

Preserve the existing UI (segment-click, color filter, date-in-meta) — only edit the `sections` array.

## Known limits (leave these honest, don't fake them)
- **Page numbers past ~p23 are transcription-order, not exact scan pages.** The typed entry skips the blank pages Sophie leaves between entries and merges some days, so labels run lower than the 99 physical scans. **Dates are the reliable anchor.**
- **Heights are estimated from text length,** not measured from the handwriting, so drawing-heavy pages read shorter than they sit in the notebook (e.g. the Feb 13–15 block is tall because the typing ran three days together).

## Next steps / what's missing
1. Finish banding pages 41–68 (Feb 9–17) — the main remaining task.
2. (Optional, heavier) Verify true scan page numbers + real page-fill proportions against the scan PDF (`January_31st_-_February_17th_2025.pdf`, included). Note: the handwriting is hard to OCR, so this is slow and manual.
3. Integrate into the iOS app.

## Integrating into the app
The HTML is standalone and can be loaded in a `WKWebView` as a tab. Only external dependency: it pulls **EB Garamond** from Google Fonts — bundle the font locally if it needs to work offline.

## Files in this package
- `journal_timeline_v9_p2-68.html` — the current timeline (art + all data).
- `January_31st_-_February_17th_2025.pdf` — the raw handwritten scans (input for step 2).
- `HANDOFF.md` — this doc.
