# Artifact + data-shaping tooling

Builds the private Claude artifacts (the browsable Voice Memo Library and the
machine-readable master data) and the cozy category icons.

## Scripts

- **`rebuild-data.mjs`** — rebuilds the compact `memos-data.json`
  (`{id,t,d,c,k,s,x}` per memo) from the master `transcripts-resorted.json`,
  applying the read-aloud → `transcription` reclassification (from
  `flagged-journal-duplicates.json`).
- **`build-artifact.mjs`** — builds `memo-library.html`: the searchable library
  (category icons, per-category pages, search, a top auto-scroll bar, and an
  in-page recategorize tool that exports your changes). Reads `memos-data.json`
  + `icons/*.png`.
- **`build-data-artifact.mjs`** — builds `memo-archive-data.html`, the canonical
  machine-readable archive (all memos as JSON in a `<script id="archive">` block).
- **`gen-icons.mjs`** / **`gen-songs-tile.mjs`** — regenerate the category tile
  art with OpenAI `gpt-image-2` (needs `OPENAI_API_KEY`).
- **`icons/`** — the committed category tiles (dream, idea, journal, song, …).

## Important

- These builders read/write **private transcript data** (`memos-data.json`,
  `transcripts-resorted.json`, etc.) which is **gitignored** — it lives only in
  the private Claude artifacts + Firebase, never in this public repo. Fetch it
  from the master data artifact (see repo `CLAUDE.md`) into the working dir first.
- Several scripts reference a `SCRATCH`/working-dir constant near the top — point
  it at the folder holding those private data files before running.
