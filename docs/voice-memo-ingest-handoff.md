# Handoff: pull NEW voice recordings into JournalReader (share → transcribe → file → index)

Goal: let Sage select recordings in the iOS **Voice Memos** app, **Share → JournalReader**,
and have them automatically transcribed, filed with the existing 993 memos, and
made searchable — no manual file wrangling. Assume you know nothing; here's the
whole picture, what already exists, the plan, and the decisions still open.

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

## The plan (recommended)

The heavy lifting is one **server-side ingest function**, identical for both front
doors below. Build it first — it's ~80% of the value.

### 1. Ingest function (the core)
- New audio arrives at an **inbox** path in Storage, e.g. `memo-inbox/<uuid>.m4a`.
- A **Storage-triggered function** (`onObjectFinalized` on `memo-inbox/`) then:
  1. Transcribes (`gpt-4o-transcribe`) and categorizes/titles/keywords
     (`gpt-4o-mini`) — reuse `transcribe-sort.mjs` prompts.
  2. Assigns an `id` + `date` (see the date caveat), moves the file to
     `memo-audio/<id>.m4a`.
  3. Appends the memo to `memo-audio/manifest.json`.
  4. **Incrementally embeds** just that one item into `search-index/archive.json`
     (append + re-upload; do NOT re-embed all 2,280 — see `patch-archive.mjs` for
     the read-mutate-upload pattern, and `build-archive-index.mjs` for the embed
     call).
- Result: the memo shows up in the Voice-notes list and in search automatically.

### 2. The front door — TWO options (pick with Sage)

**Option A — iOS Share Extension** (native; "JournalReader" literally in the share
sheet). It's a **new app-extension target** in `ios-journal/project.yml`: own
bundle id, an **App Group** (to share Firebase config/auth with the main app), and
a **second provisioning profile** on the `ios-journal-testflight.yml` pipeline.
The extension just needs to upload the shared audio to `memo-inbox/` (anonymous
Firebase auth). The provisioning/signing setup is the only higher-risk part.

**Option B — Apple Shortcut → HTTPS ingest** (lightweight; ship in days). An
`onRequest`/callable HTTPS function accepts an uploaded audio blob; a Shortcut Sage
installs once appears in the share sheet, grabs the audio, and POSTs it. **No new
Xcode target, no provisioning, no app rebuild.** Slightly less "native" (shortcut's
name, not the app's).

Sage's leaning: build the ingest function, then start with **B** (fast, low-risk),
and graduate to **A** later if she wants the fully-native finish. Nothing about B
is wasted if you later do A (same ingest function).

## The one open decision: recording DATE

Memos are sorted/slotted by their **original recording date**. A memo shared after
the fact may not carry that date in the `.m4a`. **Check what date Voice Memos puts
on a shared file** (filename is the memo's title, not a date; look at the audio
container's creation metadata). If the original date is unavailable, options:
(a) use the share date, (b) read it from file metadata if present, or (c) let Sage
confirm/edit the date in-app after import. Confirm with her before committing.

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
