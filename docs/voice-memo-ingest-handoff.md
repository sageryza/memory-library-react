# Handoff: pull NEW voice recordings into JournalReader (share → transcribe → file → index)

Goal: automatically pull Sage's **new** voice recordings into JournalReader —
transcribed, filed with the existing 993 memos, and made searchable — with no
manual file wrangling. Assume you know nothing; here's the whole picture, what
already exists, the plan, and the one decision still open.

## ✅ DECISION (chosen by Sage — build THIS)

**Option C: a daily auto-sync job on Sage's Mac.** A `launchd` LaunchAgent runs a
script once a day (and catches up on the next wake/boot if the Mac was off) that
reads new recordings straight from the **macOS Voice Memos folder** (they sync
there from her iPhone via iCloud), dedupes against what's already uploaded, and
runs each new one through the existing transcribe → file → index pipeline.

Why this won over the share-sheet ideas: it's fully automatic (nothing to select
or share), needs **no iOS target / provisioning / app rebuild**, reuses the whole
existing pipeline, and — because it reads files off disk — it **preserves each
memo's true recording date**, which fixes the date problem the share-sheet routes
had. Options A and B below are kept for reference but are **not** the plan.

## The user's ask (settled — build toward this)

- A **share-sheet connector** so sharing memos from Voice Memos lands them in the
  right place automatically. Voice Memos shares plain `.m4a` audio, so this works.
- NOT the ImageForge/Deck Factory "dump area" — wrong repo, no audio. Ignore it.
- New memos should show up in the JournalReader **Voice-notes list** AND in the
  **semantic search** (memos/journal/both) that already ships.

## What already exists (reuse — do NOT rebuild)

### The transcription + categorization logic
- **`voice-memo-sorter/transcribe-sort.mjs`** — the standalone CLI that produced
  the original 993. It transcribes with `gpt-4o-transcribe` and sorts into
  categories with `gpt-4o-mini`. **Reuse its prompts + `CATEGORIES` list** so new
  memos are categorized/titled the same way. Categories in use (from the live
  manifest): `original, idea, journal, conversation, other, dream, quote, cover,
  note, empty, toolong, todo, transcription`.

### The data already in Firebase (project `membry-df528`)
- Storage `memo-audio/<id>.m4a` — the ~1,000 recordings.
- Storage `memo-audio/manifest.json` — `{ version, count, memos: [ {id, file,
  date "yyyy-MM-dd", cat, title, desc, keywords[], dur (sec), transcript} ] }`.
- Storage `search-index/archive.json` — the semantic index the search reads. Array
  of items. **Memo items now carry `file` + `dur`** (added so playback streams from
  a hit directly): `{ source:'memo', id, file, dur, date, title, cat, snippet,
  text, vector[512] }`. Journal items: `{ source:'journal', id:'p<page>-<i>',
  date, type, snippet, text, vector[512] }`.
- Storage rule: `memo-audio/**` is **read**-allowed for any signed-in user
  (anonymous auth qualifies); writes are server-only. See `storage.rules`.

### The backend (deployed) — `functions/index.js`
- **`searchArchive`** (onCall) — embeds the query, ranks `archive.json` by cosine
  similarity, returns `{ results: [{source,id,file,dur,date,title,cat,type,
  snippet,score}] }`. Helpers you'll reuse: `loadOpenAIKey()` (reads the key from
  Firestore `config/*`), `embedText`, `cosineSim`, `loadArchiveIndex`.
- Also present from the same work: `semanticSearch`, `embedMemory`
  (onDocumentWritten auto-embed of library memories), `scorePlay`.

### The index builder
- **`voice-memo-sorter/firebase/build-archive-index.mjs`** — rebuilds the WHOLE
  index from the manifest + journal timeline and uploads `archive.json`. This is
  the thing to make **incremental** (see plan). Takes the service-account JSON as
  argv; `OPENAI_API_KEY` from env. Cost of a full rebuild: ~1–2 cents.
- **`voice-memo-sorter/firebase/inspect-archive.mjs`** — prints index stats / a
  sample item (read-only). Handy for verifying shape.
- **`voice-memo-sorter/firebase/patch-archive.mjs`** — example of reading
  `archive.json`, mutating items, and re-uploading WITHOUT re-embedding (this is
  how `file`/`dur` were backfilled). Good template for incremental edits.

### The JournalReader client (SwiftUI, `ios-journal/JournalReader/`)
- `VoiceEntriesStore.swift` / `VoiceEntriesView.swift` — loads the manifest, lists
  2024+ dream/journal memos, streams audio (`VoicePlayer`).
- `ArchiveSearchView.swift` — the semantic search sheet (memos/journal/both toggle)
  opened from the 🔍 on the Timeline; plays memo hits, jumps journal hits to the
  timeline. No new UI is needed for ingest unless you add a confirm step.

## The plan

The pipeline for each new memo is the same regardless of front door — transcribe →
file → manifest → incrementally embed. For the **chosen Mac route (Option C)** this
runs **entirely on the Mac** (it already has the OpenAI + service-account keys); no
Cloud Function is needed. (Only the reference Options A/B would need a server-side
inbox function — described at the end.)

### 1. The per-memo pipeline (the core)
For each new recording:
  1. Transcribe (`gpt-4o-transcribe`) and categorize/title/keywords (`gpt-4o-mini`)
     — reuse `voice-memo-sorter/transcribe-sort.mjs`.
  2. Assign the `id` + `date` from the recording's real timestamp; upload the audio
     to `memo-audio/<id>.m4a`.
  3. Append the memo to `memo-audio/manifest.json`.
  4. **Incrementally embed** just that one item into `search-index/archive.json`
     (append + re-upload; do NOT re-embed all 2,280 — see `patch-archive.mjs` for
     the read-mutate-upload pattern and `build-archive-index.mjs` for the embed call).
- Result: the memo shows up in the Voice-notes list and in search automatically.
- For Option C, wrap this in the daily LaunchAgent + watermark described below.

### 2. The front door

**✅ CHOSEN — Option C: daily Mac auto-sync (build this).** No app UI at all; it
runs on Sage's Mac.

- **Where the recordings are:** the macOS Voice Memos app stores recordings as
  `.m4a` in a Group Containers path (recent macOS:
  `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/`;
  older: `~/Library/Application Support/com.apple.voicememos/Recordings/`). They
  sync there from her iPhone via iCloud. A `CloudRecordings.db` (SQLite) alongside
  holds titles/dates; the `.m4a`'s own metadata + name also carry the recording
  timestamp — that's how IDs like `2022-04-13_1000_2022-04-13T17_00_40Z` are formed.
  VERIFY the exact path on her macOS version at build time.
- **The schedule:** a **LaunchAgent** plist (`~/Library/LaunchAgents/…plist`) with a
  daily `StartCalendarInterval`. If the Mac is asleep/off at that time, `launchd`
  runs the job **once at the next wake/boot** — exactly Sage's "if it hasn't turned
  on in a day, run as soon as it turns on." (`cron` does NOT catch up missed runs;
  use `launchd`.)
- **Incremental / dedup:** keep a small **state file** (e.g. `~/.journalreader-sync.json`)
  with a high-water mark — the timestamp/ID of the last processed memo. Each run:
  list recordings → take those at/after the mark → **dedup by ID** → process the new
  ones → update the mark.
- **Per new memo:** reuse `voice-memo-sorter/transcribe-sort.mjs` (transcribe +
  categorize/title) and the firebase upload path (upload to `memo-audio/<id>.m4a`,
  append `manifest.json`, **incrementally embed** into `archive.json` — see
  `patch-archive.mjs` for the read-mutate-upload pattern).
- **One-time Mac setup:** iCloud sync for Voice Memos ON; the OpenAI key + a current
  Firebase service-account key stored locally (NOT in repo); **Full Disk Access**
  granted to the job's runner (the Recordings folder is protected).
- **Recording date is solved** by this route: read it from disk (file
  metadata / `CloudRecordings.db` / filename), so memos slot in on their true date.

**Alternatives (NOT chosen — reference only):**

- *Option A — iOS Share Extension:* native "Share → JournalReader"; a new
  app-extension target in `ios-journal/project.yml` (own bundle id, App Group,
  second provisioning profile). Heavier; leaves the recording-date problem below.
- *Option B — Apple Shortcut → HTTPS ingest:* a Shortcut in the share sheet POSTs
  audio to an `onRequest` function. Lighter than A, but still manual and shares the
  date problem.
  - For A/B only, the recording DATE is an open problem: a memo shared after the
    fact may not carry its original date in the `.m4a`, so you'd fall back to
    share-date / file-metadata / confirm-in-app. Option C avoids this entirely.

## Security / gotchas (READ THIS)

- **The Firebase service-account key was pasted into chat and MUST be rotated by
  Sage.** Do NOT commit any service-account JSON. The maintenance scripts take the
  SA path as an argv — you'll get the key from Sage or the Firebase console.
- **This repo is PUBLIC. Never commit transcripts** (or the manifest, which
  contains them). `.gitignore` already blocks transcript JSONs + `*firebase-adminsdk*`.
  Transcripts live only in Firebase + the private Claude artifacts.
- The OpenAI key is read server-side from Firestore `config/*` (already set) — the
  ingest function should use `loadOpenAIKey()`, not an env var.
- Cost per new memo: ~1–2 cents (transcription + one embedding). Silence-trimming
  (see `transcribe-sort.mjs --scan/--min-speech`) keeps long/empty files cheap.

## Coordination

- Work lives on branch **`claude/google-drive-memory-import-gvr0kn`** (PR #152).
  Base on that branch, or on `main` after #152 merges.
- Ship JournalReader via **`ios-journal-testflight.yml`** (workflow_dispatch). The
  Fastfile sets the build number from `GITHUB_RUN_NUMBER`, so no manual version
  bump is needed. App Store review applies before public release; TestFlight is for
  Sage's testing.
