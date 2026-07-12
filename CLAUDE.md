# Project notes

## Models — always use the newest (forever)
- **Never use `gpt-4`, `gpt-4-turbo`, `gpt-4o`, or `gpt-4o-mini` for any
  reasoning, text-generation, or vision/handwriting task — they are outdated and
  off-limits.** Always default to the **newest available frontier model**. As of
  July 2026 that is **`gpt-5.1`** (use **`gpt-5-pro`** for the hardest jobs).
  Never reach for a familiar old model out of habit; if unsure what's newest,
  check `GET https://api.openai.com/v1/models`. (Specialized audio/image
  endpoints like `gpt-4o-mini-tts` / `gpt-image` are exempt only where no newer
  equivalent exists — check first.)

## Design rules (forever)
- **No pills.** Never use fully-rounded / pill-shaped buttons or chips. Buttons
  are rounded rectangles — use `border-radius: 6px`. (Circular icon buttons like
  the ♥/✕ curate toggles and dots are fine; the rule is about pill-shaped text
  buttons.)

## Journal timeline — banding categories
The in-app timeline (`ios-journal/JournalReader/journal_timeline.html`) bands each
entry into 6 types: day / dreams / ideas / abstract / todos / drawings.
- **`drawings` = ONLY actual drawings/sketches present in the journal itself**
  (confirmable in the scanned PDF) — NOT descriptions of, or references to,
  drawings, and never a drawing that lives in a *different* journal. A passage
  that talks *about* a drawing is `ideas` (or `abstract`), not `drawings`. When
  unsure whether something is a real drawing, the PDF is the source of truth —
  check it or flag it; don't default to `drawings`.
- **Jokey / throwaway "ideas" are not `ideas`.** A bit she's clearly not going to
  build (e.g. "a business about drawing plants") is `abstract` (or `todos` if it's
  literally on a to-do list), not a real product idea.
- Categorize by content; when a passage genuinely blurs two types, pick the
  dominant mode. (Preference so far: literal for what she's concretely doing/
  making, but confirm with Sage when a call is close.)

## Communication
- **TLDR + audio replies (Sophie's rule, July 2026).**
  - **TLDR at the end of every reply, no matter what** — the only exception is
    a really quick reply that fits in ONE iPhone screen (she has an iPhone 13).
  - **Attach an audio version (voice memo)** — TTS via OpenAI `gpt-4o-mini-tts`
    reading the message verbatim (strip markdown/URLs, keep the words) —
    whenever the reply is longer than one iPhone-13 screen (she'd have to
    scroll) OR says something important for her to know: answers to her
    questions, questions for her, new findings, decisions she needs to make.
  - **Skip the audio** when the reply just confirms work she asked for or is
    technical detail with no new information ("built it — here's what
    changed"). TLDR still required.
  - **Answer questions FIRST.** If Sophie's message contains a question, answer
    it at the top of the reply, before doing or reporting on any tasks from the
    same message.
  - **Small question → short answer.** When Sophie asks a quick or small
    question, reply with just the answer — no suggestions about what to do
    next, no updates on work already done, no recaps. Save those for when she
    asks for them.
  - Audio is the LAST thing in the message — after the TLDR and any
    files/images.
- **Always use clickable links.** Whenever you mention a URL — app pages,
  dashboards, docs, external tools — write it as a full clickable link
  (`https://…`), never bare text or a fragment the user has to assemble.
- **Always include clickable testing links.** When a change is shipped/ready to
  test, give the live URL(s) to test it on as full clickable links — the deployed
  app page for the feature (e.g. `https://incaseofamnesia.com/xi`), plus the PR
  link. Don't make the user hunt for where to look.
- **Message order is fixed: body → TL;DR → clickable links → audio LAST.** The
  short TL;DR comes after the body; then the things to click (app pages, PR); then
  any attached audio/file goes at the *very bottom*, below the links — never above
  the text. Images likewise go at the END of the message.
- **Audio recordings: British male voice (`fable`), 1.2× speed** — `illustration-lab/tts.mjs`
  now defaults to both (a non-1.0 speed routes through `tts-1-hd`). Proactively attach
  an audio version for long / multi-question replies; skip it for short ones.
- **Copy-paste / handoff messages = one code block.** When the user asks for a
  message to copy-paste, forward, or hand off to another chat, put the ENTIRE
  message inside a single fenced code block so it copies in one tap — no
  commentary mixed in, never split across sections or styled headers.
- **No military / 24-hour time.** Always write times in 12-hour format with
  am/pm (e.g. "5:08 pm", not "17:08" or "22:08 UTC"). Convert before showing.
- **User's timezone is US Pacific (PT).** Show times in Pacific time (PDT in
  summer / PST in winter), not UTC. e.g. CI timestamps in UTC → convert to PT.

## Saving work (forever — non-negotiable)
- **Never let anything we make live only in the temp scratchpad.** The scratchpad
  is an ephemeral container dir that gets wiped when the session ends — anything
  left there is lost. Every generated artifact (drawings/renders, audio clips,
  galleries, prototypes, prompts, scripts, logs, comparison sheets) MUST be copied
  into the repo and committed **and pushed** so it survives. The archive lives in
  `illustration-lab/`.
- **Always save at full resolution.** Never downscale an image before it's the
  only copy on disk. Save the model's full-size output first; make any smaller
  copies as *extra* files, never as replacements. (This rule exists because early
  renders were shrunk to 560px before saving and the full-res originals were lost.)
- **Commit + push as you go**, not at the end — a batch of renders, an audio set,
  a gallery: save it the moment it exists. Losing work is never acceptable.

## Spending (July 2026)
- **State the estimated cost before launching any paid batch job, and ASK first
  if the estimate exceeds $3.** Single small calls (a few cents) don't need a
  prompt, but nothing above the line runs on an inferred "probably fine." This
  rule exists because a ~$19 batch (erasing handwriting from ~330 drawings via
  gpt-image-1 edits) was run without ever surfacing the price.

## Working style
- **Build only what I asked for — no extra features, buttons, or UI.** Don't add
  reset buttons, legends, toggles, settings, "helpful" panels, or any control I
  didn't request. If something extra seems genuinely useful, mention it and let
  me decide — don't just add it. Match the scope of the request exactly.
- **Claude may merge its own PRs.** Standing permission (July 2026): when a PR
  is ready, merge it without asking — then watch the post-merge workflows
  (deploys, TestFlight) and fix anything that breaks.
- When blocked on a decision but other work can proceed, surface the decision
  and **keep building** in the meantime — don't stop and wait unless the decision
  affects everything. Prefer plain prose for those questions over the in-app
  question picker.
- While I work, the user may be testing and dropping feedback as they find it.
  Treat that feedback as a **running queue to fold in later**, not as interrupts
  to drop everything for — UNLESS it directly contradicts what's being built, or
  is explicitly about prioritization. Keep a visible list of the open items.
