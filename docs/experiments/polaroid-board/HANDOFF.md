# HANDOFF — polaroid memory-board experiment

*Written July 11, 2026 so a fresh chat can pick this up with zero prior
context. Sage's 3am idea: illustrate memories as instant photos and pin them
to the conspiracy board.*

## The idea

Turn memories into illustrated "moments," frame them like real Polaroids, and
pin them to the XI conspiracy board connected by the app's crimson strings —
possibly as an alternate card style for the real board someday.

## What exists (all in this folder)

- `sage-sketch-grid.png` — Sage's own 3×3 grid of nine pencil-sketch
  childhood moments (frog, night drive, grandma's kitchen, lost balloon,
  KEEP OUT fort, principal's office, slept-through-the-party, the gift,
  rain on the glass). She generated this herself; it's the source of truth
  for the current mock.
- `moments/m0.jpg … m8.jpg` — the grid cut into nine tiles (row-major,
  14px inset to drop the gutters).
- `memory-board-mock.html` — a self-contained, draggable board mock:
  the nine tiles in TRUE Polaroid-600 frames (88:107 card, square picture,
  thin white border, wide bottom chin with a handwritten caption), the app's
  crimson pushpins (#dc143c head, #ff6b7a highlight, gray tail) at each
  top-right corner, crimson strings with sag tied pin-to-pin that follow as
  you drag, on a warm paper desk with a lamp-lit dark mode. The photos carry
  a 90s Polaroid-600 film treatment (washed low contrast, warm creamy cast,
  soft vignette, gloss sheen).
- `gpt-image-2-color-grid.png` — an alternative set: nine COLOR polaroid
  moments generated with gpt-image-2 (quality high, ~$0.25/call) from Sage's
  real hashtag vocabulary (christmas chicken, the switcheroo, speaking in
  code, right-all-along…), taken from her CHILDHOOD MEMORIES library's tag
  cloud. Not yet cut apart or boarded.
- Published artifact (same HTML, live + draggable):
  https://claude.ai/code/artifact/ca6f61a8-d814-435b-bc79-34bb29210f37
  — that artifact belongs to the ORIGINAL chat's session; from a new chat,
  publish this HTML as a new artifact (or pass the URL as `url` to update it
  if the tool allows cross-conversation updates with `action: list` → url).

## Decisions Sage has already made (do not re-litigate)

- Frames must be REAL Polaroid proportions — thin even white border, big
  bottom chin. She corrected an earlier version that had even padding.
- Pins are the app's crimson pushpins "like our normal app," at the corner.
- The film look is "the normal kind that was popular in the nineties" —
  Polaroid 600: washed, warm, creamy highlights, soft vignette.
- No pill-shaped buttons anywhere (repo-wide rule; see CLAUDE.md).

## Where this could go next (ask Sage which)

1. Generate more moments — she wants them from her REAL memories. Important:
   chats have NO direct read access to her Firestore (no admin credentials).
   Options: she pastes memories in; or build an in-app "illustrate this
   memory" flow where the app (which IS signed in) sends memory text to an
   image model; or use her hashtags as seeds like the color grid did.
2. Port the polaroid frame + pin + string style into the real app board
   (web ConspiracyBoard and/or iOS ConstellationView) as an optional card
   style.
3. Batch-illustrate: sketch style (like her grid) vs color polaroid style
   (like the gpt-image-2 grid) — she hasn't chosen. Cost note from repo
   rules: state costs before paid batches; ask first above $3
   (gpt-image-2 high ≈ $0.25/image).

## Communication notes (from repo CLAUDE.md)

Long messages = voice memo (gpt-4o-mini-tts, voice "fable", male British,
normal speed) attached at the very END. Clickable links always. 12-hour
Pacific times. Copy-paste handoffs go in ONE code block.
