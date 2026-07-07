# Journal drawing extraction

A one-time backfill pipeline that pulls the hand-drawn illustrations out of
scanned journal PDFs, saving each drawing as its own image — cropped on its
natural white paper, ink and texture untouched, with only the stray
handwriting erased.

## How it works

Two tools, each doing one job:

1. **gpt-4o vision** *locates* the drawings. For each page it returns a
   bounding box around every illustration. It never touches pixels.
2. **OpenCV** (local, no paid service) *erases* the stray handwriting inside
   each crop. It Otsu-thresholds the ink, runs a connected-components
   "territory" pass to tell the one big connected drawing blob apart from the
   small scattered text blobs, and fills only the text with the median paper
   color. The drawing — ink, texture, speckles — is left exactly as scanned.

So: **gpt-4o finds, OpenCV erases.** The separation logic is the custom part;
there is no dedicated handwriting-removal service.

See `pipeline_demo.png` for a labeled walk-through of one page
(original scan → vision boxes → cropped as-scanned → handwriting erased).

## Files

- `extract.py` — the core pipeline. `hires()` renders a page to RGB;
  `detect()` calls gpt-4o for bounding boxes; `tighten()` grows/snaps each box
  to the ink; `cutout()` is the final recipe (keeps original pixels, erases
  only stray text).
- `batch_month.py` — reusable batch runner: `python3 batch_month.py <pdf>
  <out_dir> <tag>`. Caches detections to `_det_cache.json` so re-runs cost no
  API. Dedupes within a page by ink IoU, then builds an HTML gallery + a zip.
- `output/january/` — the first completed month: 134 cutouts, a self-contained
  `gallery.html`, and the `detection_cache.json` for that run.

## Cost

~$0.35 per journal in gpt-4o vision calls. The whole remaining backfill
(June–November) is a few dollars. TTS/demo costs are trivial.

## Running a new month

```bash
export OPENAI_API_KEY=...
python3 batch_month.py "path/to/june.pdf" output/june june
```

Then open `output/june/gallery.html` to review before keeping.

## Status

- **January** — done (134 cutouts).
- **Remaining** — June, July, Aug, Sept, Oct, Nov (user has stopped
  journaling; this is a one-time backfill).

## Known rough edges (as of the January review)

- A few false positives slip through: occasionally a text-only region (a
  single word like "think" / "kind") or a bare stretch of the notebook's
  spiral binding gets boxed as a "drawing."
- The spiral binding also survives inside some real drawings, since the erase
  step only removes disconnected text blobs, not the binding's regular coil
  pattern at the page edge.
