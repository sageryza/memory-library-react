# Handoff: voice memos into JournalReader (day-based reader)

Slot Sage's voice recordings into the JournalReader iOS app **by date**, so the
journal reads as a single timeline of days: a day she *wrote* shows its scanned
page; a day she *spoke* shows the **recording in that same spot** — the recording
standing in for the page. Assume you know nothing; here's everything.

## The vision (settled with Sage — build exactly this)

- The reader becomes **day-based**, not bound to one scanned PDF. You move through
  the journal **in date order**.
- A day with a scanned page → show the page (the existing PDF reader).
- A day she spoke instead of wrote → show the **recording** (play button +
  transcript) in place of the page.
- **Voice-only days appear on their own**, even when there's no scanned page for
  that date (her scans are sparse; most voice days have no page). This is the
  whole point — don't hide them.

## What already exists (live — reuse, don't rebuild)

- **Audio + manifest in Firebase Storage** (`membry-df528`), folder `memo-audio/`:
  - `memo-audio/<id>.m4a` — ~1,000 recordings.
  - `memo-audio/manifest.json` — `{ version, count, memos: [ {id, file, date
    "yyyy-MM-dd", cat, title, desc, keywords, dur (sec), transcript} ] }`.
  - Storage rule already deployed: `memo-audio/**` is **read**-allowed for any
    signed-in user (JournalReader's anonymous sign-in already qualifies — no
    login needed). Writes are server-only.
- **`ios-journal/JournalReader/VoiceEntriesStore.swift`** (on PR #152) — already
  loads the manifest via FirebaseStorage, filters to **dreams + journals from
  2024-on**, sorts by date, and streams audio (`audioURL(for:)` → AVPlayer). It
  has `VoiceEntry`, a `VoiceEntriesStore` (phases: idle/loading/ready/failed), and
  a `VoicePlayer`. **Reuse this as the data + playback layer.**
- **`ios-journal/JournalReader/VoiceEntriesView.swift`** (on PR #152) — a `VoiceRow`
  cell that renders one memo (play disc, title, date, category tag, tap-to-expand
  transcript; dreams tint lilac, journals tan). **Reuse `VoiceRow` as the
  "voice day" cell.** (The list view itself was an interim; the day-based reader
  replaces it.)

## The data / scope

- **Slot in:** 34 dreams + 112 journals (2024-onward). Dreams `cat == "dream"`,
  journals `cat == "journal"`.
- **Excluded:** 13 read-aloud duplicates (she was reading old handwritten entries
  aloud — detected by a spoken date that doesn't match the recording day). They're
  tagged `cat == "transcription"` in the archive and are **not** in the 146.
- **Parked (do NOT slot without asking):** ~58 pre-2024 recordings; the ~40 long
  recordings.

## Where to integrate

- **`ios-journal/JournalReader/ContentView.swift`** is the reader. Today it's
  strictly **PDF-page-based**:
  - `@State currentPage: Int`, `totalPages`, `currentPDFDates: [Int: Date]`
    (1-based page → date, parsed from PDF bookmarks).
  - `PDFPageViewer` (a `UIViewRepresentable`) renders `currentPage` and owns the
    swipe/tap gestures that change `currentPage`.
  - Per-page transcription + category tagging live in local state / UserDefaults.
- The **Journal tab** in `RootView` hosts `ContentView`. The `TimelineView` tab is
  a separate hosted web timeline — not this task.

## Recommended approach

Introduce a **merged, date-ordered "day" model** that the reader navigates,
instead of navigating raw PDF page indices:

1. Build `entries: [DayItem]` sorted by date, where a `DayItem` is either:
   - `.page(pdfPageIndex, date)` — from the loaded journal PDF's pages
     (`currentPDFDates`), or
   - `.voice(VoiceEntry)` — from `VoiceEntriesStore` (the 146).
2. Reader state becomes an index into `entries` (not `currentPage`). Swiping moves
   through `entries`.
3. Render per item: `.page` → the existing single-page PDF view (reuse
   `PDFPageViewer` pointed at that page); `.voice` → a full-screen version of
   `VoiceRow` (recording player + transcript) "in place of the page."
4. Keep the existing per-page annotation/category features working for `.page`
   items.

### The hard part (flag for Sage + design carefully)

- `PDFPageViewer` currently drives navigation by mutating `currentPage` from its
  own gestures. To interleave non-PDF days, **navigation must move up to the
  merged `entries` list** — either drive swipes at the `ContentView` level and let
  `PDFPageViewer` render a single fixed page, or refactor the gesture handling.
- The reader opens **one scanned PDF** at a time; voice memos span 2024–2026 across
  dates that mostly have **no** scanned page. Decide the spine: (a) the currently
  open journal's date range with voice memos interleaved, vs (b) a true all-time
  day reader across every scanned journal + all voice days. Sage's vision points at
  (b); confirm scope with her before committing, since (b) means the reader is no
  longer "one PDF."

## Design decisions (settled)

- Recording **in place of the page**, on its date. Voice-only days show on their own.
- Dreams tint **lilac**, journals **tan** (already in `VoiceRow`).
- 2024+ only; read-aloud duplicates excluded; pre-2024 + long recordings parked.
- No login needed (anonymous auth reads `memo-audio/`).

## Coordination / gotchas

- These files are on **PR #152** (branch `claude/google-drive-memory-import-gvr0kn`).
  Base on that branch, or on main **after** #152 merges, so you get
  `VoiceEntriesStore`/`VoiceEntriesView` + the deployed `memo-audio/` rule.
- Ship via **`ios-journal-testflight.yml`** (workflow_dispatch; also compile-checks).
  Bump the JournalReader build/marketing version so the upload isn't a duplicate.
- App Store review applies before public release; TestFlight is for Sage's testing.
