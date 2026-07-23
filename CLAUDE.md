# Project notes

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
- **Answer questions FIRST.** If Sophie's message contains a question, answer
  it at the top of the reply, before doing or reporting on any tasks from the
  same message.
- **Small question → short answer.** When Sophie asks a quick or small
  question, reply with just the answer — no suggestions about what to do next,
  no updates on work already done, no recaps. Save those for when she asks.
- **Always use clickable links.** Whenever you mention a URL — app pages,
  dashboards, docs, external tools — write it as a full clickable link
  (`https://…`), never bare text or a fragment the user has to assemble.
- **Always include clickable testing links.** When a change is shipped/ready to
  test, give the live URL(s) to test it on as full clickable links — the deployed
  app page for the feature (e.g. `https://incaseofamnesia.com/xi`), plus the PR
  link. Don't make the user hunt for where to look.
- **Delivered files/images go at the END of the message**, below any clickable
  links — never above the text.
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
