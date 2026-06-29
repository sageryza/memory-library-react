# voice-memo-sorter

A small **standalone** tool that takes a folder of iPhone voice memos, transcribes
each one with OpenAI, and auto-sorts them into categories (ideas / dreams / songs /
to-dos / journal / quotes / notes / other).

> **Fully separate from the memory library.** This tool never touches Firebase or
> your memories. It only reads audio files and writes plain output files (JSON +
> Markdown) that you keep wherever you want. Its `output/` is gitignored, so your
> private transcripts are never committed.

---

## What you get out

In your chosen `--out` folder:

- **`index.md`** — summary with counts per category.
- **`by-category/*.md`** — readable transcripts grouped by category, with titles,
  tags, recording date, and a 🎵 melody note for musical ones.
- **`review.md`** — the low-confidence / ambiguous ones to eyeball by hand.
- **`transcripts.json`** — the full structured data.
- **`.cache.json`** — internal resume cache (skip on re-runs). Safe to delete to
  force a full re-run.

---

## Step 1 — export your voice memos on the Mac

Apple gives no bulk *transcript* export, but you can bulk-export the **audio**:

1. On your Mac, open the **Voice Memos** app (it syncs from your iPhone via iCloud).
2. `Cmd+A` to select all recordings.
3. Drag them into a Finder folder, e.g. `~/VoiceMemos`. (Or **File → Export**.)

You now have a folder of `.m4a` files. That folder is the input.

## Step 2 — install

Requires **Node 18+**. From this directory:

```bash
npm install
```

Optional but recommended: **ffmpeg**, so memos over 25 MB get auto-compressed
instead of skipped:

```bash
brew install ffmpeg
```

## Step 3 — get an OpenAI API key

Create a key at https://platform.openai.com/api-keys and export it:

```bash
export OPENAI_API_KEY=sk-...
```

(Your ImageForge project already uses an `OPENAI_API_KEY` — same kind of key.)

## Step 4 — do a small test run first

Process just 5 files so you can sanity-check the sorting before committing to
hundreds:

```bash
node transcribe-sort.mjs --in ~/VoiceMemos --out ./output --limit 5
```

Open `output/index.md` and `output/by-category/*.md` and see how it did.

## Step 5 — run the whole batch

```bash
node transcribe-sort.mjs --in ~/VoiceMemos --out ./output
```

It's **resumable** — already-processed files are cached, so you can Ctrl-C and
re-run anytime; it picks up where it left off.

---

## Options

| Flag | Default | What it does |
|---|---|---|
| `--in <dir>` | _(required)_ | Folder of audio files (searched recursively). |
| `--out <dir>` | `./output` | Where to write results. |
| `--limit <n>` | all | Only process the first N new files. Great for testing. |
| `--concurrency <n>` | `4` | How many files to process at once. |
| `--hear-songs` / `--no-hear-songs` | on | For musical memos, also run an audio pass (`gpt-4o-audio`) that describes the melody / humming / mood — not just the words. |
| `--transcribe-model` | `gpt-4o-transcribe` | Transcription model (alt: `whisper-1`). |
| `--sort-model` | `gpt-4o-mini` | The model that picks the category. |
| `--audio-model` | `gpt-4o-audio-preview` | The model used for the song "listen" pass. |
| `--dry-run` | off | List what would be processed; make no API calls. |

## Categories

Defined at the top of `transcribe-sort.mjs` in the `CATEGORIES` array — edit the
list or descriptions to change how things get bucketed. `other` is the catch-all.

## Cost

Transcription is roughly **$0.006/minute** of audio. A few hundred short memos
typically lands in the low single-digit dollars. The optional song "listen" pass
only runs on memos detected as musical.

## Privacy

Audio is sent to OpenAI for transcription. Nothing is uploaded anywhere else, and
output stays on your machine. The `output/` folder is gitignored.
