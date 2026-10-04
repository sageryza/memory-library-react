# Little Book of Miracles — handoff (for polishing the details)

Everything a fresh chat needs to iterate on the **Miracles** app: what it is, where
the code lives, how the AI pipeline works, how to ship a change, and the open
design questions. For the *iOS build/TestFlight mechanics* (signing, compliance,
the API tricks), see **`docs/ios-from-linux-playbook.md`**.

---

## What it is

A keepsake "Little Book of Miracles": dated pages, each with a 2×2 grid of boxes.
You write a tiny daily miracle in a box, tap **draw**, and an AI turns it into a
single drawing by Sophie's **helpy** LoRA (FLUX on Replicate, since 2026-10-04). The
clever bit: a **middleman LLM call** distills the moment into the *one* most
drawable, evocative image + a short caption — not a literal retelling.

There are **two front-ends sharing one Firebase backend**:
- **Web** (React/Vite) — live at https://incaseofamnesia.com/miracles (and `/xi`, etc.)
- **Native iOS** (SwiftUI) — on TestFlight as "Little Book of Miracles" (build 15+)

---

## File map

**Web**
- `src/components/miracles/Miracles.jsx` — the whole web UI (cover, pages, boxes,
  draw, undo/redo, version stamp `book v… · built … · engine …`).
- `src/components/miracles/Miracles.css` — passport cover, gold foil, **ruled
  caption lines** (`repeating-linear-gradient … #e3d8bf` every 28px), fonts
  (**Caveat** handwriting, **Cormorant Garamond** serif via Google Fonts `@import`).

**iOS** (`ios/Miracles/`)
- `MiraclesApp.swift` — `@main`; registers bundled fonts (Caveat, Cormorant from
  `ios/Miracles/Fonts/`), configures Firebase (bundled plist + explicit fallback).
- `MiraclesStore.swift` — book state, local JSON cache + **Firestore cloud sync**
  (`miracleBooks/{uid}`, last-write-wins).
- `MiraclesService.swift` — anon auth + calls the `illustrateMiracle` function.
- `Models.swift` — `MiracleBox` (text + drawing `history` for undo/redo), `MiraclePage`.
- `BoxView.swift` — the drawing frame + draw/undo/redo controls + ruled-line caption.
- `BookView.swift` — date header, 2-col grid, page nav.
- `CoverView.swift`, `Theme.swift`.

**Backend** (`functions/index.js`)
- `exports.illustrateMiracle` — the draw endpoint (details below).

---

## The AI pipeline (functions/index.js)

```
user text → (distill: Claude Opus 4.8) → {caption, drawing}
          → prompt = "hlpy {drawing}."   (nothing after — the look is in the LoRA)
          → Replicate LoRA  sageryza/helpy  v2, pinned (lora_scale 1, 28 steps, 1:1, png)
          → kept as LOSSLESS webp in Storage  miracles/{uid}/{id}/{uuid}.webp
          → { url, caption, drawing, id, version: 'v9-helpy', engine: 'helpy' }
```

**helpy is the default since 2026-10-04** (Sophie: "i want to switch book of
miracles to use my new helpy lora model flux instead of chatgpt"). The apps send
no `engine`, so they get it; the LoRA itself is written up in imageforge's
`docs/loras/helpy.md`.
- `MIRACLE_HELPY` — `sageryza/helpy`, version `8f5daea8…` (v2) **pinned**, so a
  retrain changes the book only when that line changes. Trigger `hlpy`.
- **No quality ladder.** helpy is one model, so the app's background upgrade
  call (a `concept` at tier better/best) is answered with no picture — nothing
  drawn, nothing counted — and no ▲ "Better version" appears. Each tap still
  draws up to three ideas to pick from.
- Errors keep the plain-words contract: Replicate refusing up front (429 busy;
  402/401/404/5xx or no answer, unavailable) drew nothing, so the tap is given
  back; a prediction that ran and failed (FLUX's safety checker = "refused")
  was paid for and counts.
- Still there by name: `engine: 'openai'` (gpt-image + the 7 reference doodles
  in `functions/miracle-refs/`, with the fast → better → best ladder — the
  default until 2026-10-04) and `engine: 'replicate'` (the first
  look, the Sketchy LoRA `sageryza/special` + `MIRACLE_STYLE_GUIDE`).
- `MIRACLE_SYSTEM` — the distill instruction: pick the ONE most recognizable,
  evocative image (an object or tiny two-element scene), return
  `{"caption": "...", "drawing": "..."}`; caption ≤ ~8 words, lowercase.
- Distill uses `claude-opus-4-8`, `thinking:{type:'adaptive'}`,
  `output_config:{effort:'medium'}`. (Always confirm model ids/pricing via the
  `claude-api` skill — never from memory.)
- `distill:false` draws the user's raw text verbatim (the app sends `distill:true`).
- Each draw writes a **unique** Storage path, so redraws don't overwrite — that's
  what powers undo/redo (the box keeps a `history` of URLs).

Secrets live in Firestore `config/*` (scanned by prefix): Replicate token (`r8_…`),
Anthropic key (`sk-ant…`), OpenAI key (`sk-…`).

---

## How to ship a change

All on `main` (merging a PR triggers these automatically):
- **Web** → `firebase-deploy.yml` builds + deploys hosting + Firestore rules/indexes.
- **Functions** → `deploy-functions.yml`.
- **iOS** → `ios-testflight.yml` builds + uploads to TestFlight. **One manual-ish
  step:** a new build uploads with "Missing Compliance"; clear it via the App
  Store Connect API (`PATCH /v1/builds/{id}` `usesNonExemptEncryption:false`) — see
  the iOS playbook. Doing this needs the **ASC API key** (Key ID `H469876M4M`,
  Issuer ID, base64 `.p8`) — have these handy in the new chat (or set as env vars).

Bundle id `com.sageryza.miracles`. Firebase project `membry-df528`.

---

## Design rules (from CLAUDE.md — follow these)

- **No pills.** Buttons are rounded rectangles, `border-radius: 6px`. (Circular
  icon buttons like ♥/✕ and dots are fine.)
- **Always use clickable links** and **always give live testing URLs** when shipping.
- Fonts to match across web + iOS: **Caveat** (dates + captions), **Cormorant
  Garamond** (serif UI). Caption ink `#463f35`, date ink `#5a5043`, ruled line
  `#e3d8bf`, date underline `#ddd0b3`, paper `#f4efe6`, gold `#d4af37`.

---

## Open items / nitty-gritty to work on

1. **Caption vs. prompt editing** (was shelved mid-brainstorm). The function
   returns both a `caption` (shown text) and a `drawing` (the literal prompt that
   gets illustrated). We want the user to edit **both** — the displayed caption
   *and* what gets drawn. Open decision:
   - **A.** user writes long → AI shortens to the shown caption, and they can tweak.
   - **B.** user writes short → AI expands into the drawing prompt.
   Pick A or B (or a hybrid) and design the edit UI.
2. **Show the AI caption** in the box (currently the doodle appears but the warm
   one-line caption the model returns isn't surfaced in the UI).
3. **Style polish** — cover animation, draw-button placement/feel, page-turn,
   spacing, the ✨ icon, date placement. (iOS just got Caveat + ruled lines to
   match web in build 15; eyeball both for parity.)
4. **iOS ↔ web parity** — make sure the two front-ends feel like the same book.

---

## Test it

- Web: https://incaseofamnesia.com/miracles
- iOS: TestFlight → "Little Book of Miracles" (build 15+) — Caveat fonts, ruled
  lines, cloud sync.
- The full draw chain (anon auth → function → Opus distill → Replicate → Storage
  → back) is verified working end-to-end.
