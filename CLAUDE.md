# Project notes

## Design rules (forever)
- **No pills.** Never use fully-rounded / pill-shaped buttons or chips. Buttons
  are rounded rectangles — use `border-radius: 6px`. (Circular icon buttons like
  the ♥/✕ curate toggles and dots are fine; the rule is about pill-shaped text
  buttons.)

## Communication
- **Always use clickable links.** Whenever you mention a URL — app pages,
  dashboards, docs, external tools — write it as a full clickable link
  (`https://…`), never bare text or a fragment the user has to assemble.
- **Always include clickable testing links.** When a change is shipped/ready to
  test, give the live URL(s) to test it on as full clickable links — the deployed
  app page for the feature (e.g. `https://incaseofamnesia.com/xi`), plus the PR
  link. Don't make the user hunt for where to look.
- **Copy-paste / handoff messages = one code block.** When the user asks for a
  message to copy-paste, forward, or hand off to another chat, put the ENTIRE
  message inside a single fenced code block so it copies in one tap — no
  commentary mixed in, never split across sections or styled headers.
- **No military / 24-hour time.** Always write times in 12-hour format with
  am/pm (e.g. "5:08 pm", not "17:08" or "22:08 UTC"). Convert before showing.
- **User's timezone is US Pacific (PT).** Show times in Pacific time (PDT in
  summer / PST in winter), not UTC. e.g. CI timestamps in UTC → convert to PT.
- **Deliverables go last.** When a message includes a generated file — audio,
  image, video, or any downloadable deliverable — send it as the final item,
  after all explanatory text, so it's easy to find and never buried
  mid-message.

## Spending (July 2026)
- **State the estimated cost before launching any paid batch job, and ASK first
  if the estimate exceeds $3.** Single small calls (a few cents) don't need a
  prompt, but nothing above the line runs on an inferred "probably fine." This
  rule exists because a ~$19 batch (erasing handwriting from ~330 drawings via
  gpt-image-1 edits) was run without ever surfacing the price.

## Working style
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
