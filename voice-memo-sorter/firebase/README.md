# Firebase tooling — upload recordings + manage Storage rules

Pushes the voice-memo recordings and their manifest to Firebase Storage, and
reads/deploys the Storage security rules. All zero-dependency Node (built-in
`fetch` + `crypto`) — no `firebase-admin`, no gcloud needed.

**Project:** `membry-df528` · **bucket:** `membry-df528.firebasestorage.app` ·
**folder:** `memo-audio/`

## Scripts

- **`upload-memos.mjs`** — uploads every `.m4a` in `~/VoiceMemos` (+ the manifest,
  if nearby) to `memo-audio/`, authenticating with a Firebase **service-account
  JSON** it finds automatically (or pass a path).
  `node upload-memos.mjs [serviceAccount.json] [~/VoiceMemos]`
- **`upload-memos-to-firebase.sh`** — same idea via the Google Cloud SDK
  (`gcloud storage` / `gsutil`) instead, if you prefer that toolchain.
- **`fb-list.mjs`** — lists what's under `memo-audio/` (counts .m4a + manifest).
  `node fb-list.mjs serviceAccount.json`
- **`gen-manifest.mjs`** — builds `memo-audio-manifest.json` from the master
  `transcripts-resorted.json` (dreams-transcription reclassification applied).
- **`rules-read.mjs`** — prints the live Storage rules.
- **`rules-deploy.mjs`** — deploys `../../storage.rules` to the live project
  (creates a ruleset + points the release at it).
  `node rules-deploy.mjs serviceAccount.json ../../storage.rules`

## Where the private data lives (NOT in this repo)

The transcripts, the manifest, and the recordings are **private** and are kept
out of this public repo on purpose:
- master data + browsable copies: the private Claude artifacts (see the repo
  `CLAUDE.md` → "Voice memo archive").
- audio + `manifest.json`: Firebase Storage `memo-audio/`.

## Security

- The service-account JSON is a **live admin key** — never commit it (blocked in
  `.gitignore`). The key used during setup was pasted into a chat once, so it
  should be **rotated** (Firebase console → Project settings → Service accounts).
- `memo-audio/` is world-readable to any signed-in app user (matches the existing
  `journal-scans/` posture); writes are server-only.
