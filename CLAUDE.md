# Project notes

## App Store Connect — this repo holds the keys for EVERY app
The ASC secrets (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`) live here, so the
build/ship workflows for the other repos' apps run here too — including the ones
whose source is in `sageryza/imageforge` (that workflow checks the other repo
out; `imageforge_ref` picks the branch). Every workflow takes a **bundle id**,
so none of them is tied to one app.
- **`ios-*-testflight.yml`** — build + upload a build.
- **`asc-metadata.yml`** (`ci/asc_metadata.py`) — read or write the App Store
  listing: description, keywords, subtitle, promotional text, What's New, and
  the App Review contact / demo account / notes. **Always run it with `dry_run`
  ON first** — it prints the current values and names the app + version a write
  would land on, which is the guard against editing the wrong app. Anything
  without its own input (supportUrl, marketingUrl, privacyPolicyUrl, demo
  account…) goes through `fields_json`, where `""` CLEARS a field. Writes save
  on the version but do NOT submit it. Offline test: `python3
  ci/test_asc_metadata.py` (stubs the API — no secrets, touches no real app).
- **`asc-submit.yml`** (`ci/asc_submit_release.py`) — attach a build, set
  What's New, submit to review. `resubmit:true` cancels an in-queue submission
  first — and since 2026-08-14 also a REJECTED one (state
  `UNRESOLVED_ISSUES`), which otherwise blocks forever: it counts as "open"
  so the script reused it, but only `READY_FOR_REVIEW` ever gets submitted,
  so every run ended "nothing to do". Re-run safe. **Apple's cancellation is
  ASYNC (measured live 2026-08-14):** the run right after the cancel can 409
  with `ITEM_PART_OF_ANOTHER_SUBMISSION` while the old submission finishes
  canceling — that is not a failure of the fix; re-run the workflow once
  (~1 min later, resubmit can be false then) and it goes through. That exact
  sequence resubmitted Secretly a Witch after the 4.3(b) rejection.
  **A first release (version 1.0 never shipped) has no What's New** — leave
  `whats_new` empty on both workflows or risk a 409; Apple only shows the
  field on updates.
- **`asc-status.yml` / `check-review-status.yml`** — where a version or a build
  currently stands.
A version that failed review is editable again (state `REJECTED` /
`METADATA_REJECTED` / `DEVELOPER_REJECTED`), so reworking and resubmitting is
metadata + submit, no new version needed. **Two things Apple does NOT expose in
the API**: the reviewer's rejection message and any Resolution Center reply —
those stay with Sophie, so ask her to paste the message rather than guessing.
Screenshot upload is possible via the API but is NOT built.

## Design rules (forever)
- **No pills.** Never use fully-rounded / pill-shaped buttons or chips. Buttons
  are rounded rectangles — use `border-radius: 6px`. **And a circle is not the
  default for an icon button either (Sophie, 2026-08-24: "i prefer rounded
  squares for buttons, or plain icons, rather than circles")** — a rounded
  square at the house 6px, or the bare glyph; small round DOTS that are a mark
  rather than a button (a status dot, a colour chip) are not this. This line
  used to bless circular icon buttons as fine; that exception is retired —
  imageforge's CLAUDE.md (*No pills* under Design rules) is the canonical copy
  of this rule.

## ShouldiMakeThis.com — the preorder / validation site (`shouldimakethis/`)
The product-validation site: browse things Sophie is considering making, vote
👍/👎, heart, preorder, invest a token amount — the point is the demand signal,
which she reads on the private `/results` route. Original brief:
`shouldimakethis/BRIEF.md`. It is **built and live** — Vite + React, real Google
sign-in, Cloud-Function-maintained aggregates.

- **Live at https://shouldimakethis.web.app** — a second Hosting site inside the
  SAME Firebase project as the games (`membry-df528`), target `shouldimakethis`
  in `firebase.json` / `.firebaserc`. `npm run build` in `shouldimakethis/`, then
  `firebase deploy --only hosting:shouldimakethis`.
- **Everything is namespaced `simt*`** so it can share the games' project without
  colliding: `simtProducts/{pid}` aggregates plus per-user
  `simtVotes|simtHearts|simtPreorders|simtInvestments/{uid}` subcollections, and
  `simtSubmissions`. Storage uploads land in `simt-submissions/{uid}/`.
- **Clients may NEVER write an aggregate.** `simtProducts/{pid}` is locked in
  `firestore.rules`; the counts are maintained by atomic increments in
  `functions/simt.js`. A client writes only the doc whose id is its own uid.
- **The catalog is hardcoded** in `shouldimakethis/src/catalog.js` — by request.
  Only interactions are stored. Product ids are permanent; renaming one orphans
  every vote against it.
- **User submissions default to `status:"pending"`** and are invisible until
  approved from `/results`. Approve/reject lives there.
- **`/results` is gated on `ADMIN_EMAIL` (`Results.jsx`)**, not on a uid — so it
  survives a re-auth. It is not linked from the public nav.
- **`authDomain` stays `membry-df528.firebaseapp.com`.** The project's Google
  OAuth client only accepts the firebaseapp.com redirect helper — the same setup
  incaseofamnesia.com uses. See the comment in `src/firebase.js` before changing
  it.

### The custom domain (Firebase side DONE 2026-08-20 — waiting on DNS)
Sophie owns **shouldimakethis.com**. The Firebase half is finished; what remains
is three records at Hover and one removal at Render, neither of which a chat can
reach (no Hover API, no Render API key in the environment).

**Already done, via the Firebase Hosting + Identity Toolkit APIs with
`STORY_FIREBASE_SERVICE_ACCOUNT`:**
- `shouldimakethis.com` and `www.shouldimakethis.com` are custom domains on the
  `shouldimakethis` Hosting site, `www` carrying `redirectTarget:
  shouldimakethis.com` so it folds into the apex.
- Both hostnames are in Auth's **authorized domains**, so Google sign-in works
  the moment DNS lands. (Skipping this is the trap youwereinmydreams.com hit —
  it fails with nothing in the UI to explain it.)

**The exact records Firebase asks for**, read back from `requiredDnsUpdates`
rather than remembered — Firebase issues these per domain:
- `A` `shouldimakethis.com` -> **`199.36.158.100`** (replacing `216.24.57.1`)
- `TXT` `shouldimakethis.com` -> **`hosting-site=shouldimakethis`**
- `CNAME` `www.shouldimakethis.com` -> **`shouldimakethis.web.app`** (replacing
  `imageforge-q125.onrender.com`)

That A record is the same IP `shouldimakethis.web.app` itself resolves to, which
is the sanity check that it is Firebase Hosting's front door and not a guess.

**Still to do, both Sophie's:**
1. **Hover -> DNS** (https://www.hover.com/domain/shouldimakethis.com) — the
   three records above. The `MX` records (`mx.hover.com.cust.hostedemail.com`)
   carry her email — **never touch them.**
2. **Render -> ImageForge service -> Settings -> Custom Domains -> remove**
   `shouldimakethis.com` and `www`. Sophie pointed the domain at Render herself
   before the site had a home, and Render holds a live cert for it — which is
   why the apex currently serves the ImageForge hub page.

Until step 1 lands both domains sit at `hostState: HOST_MISMATCH`,
`ownershipState: OWNERSHIP_MISSING`. That is expected, not an error. Re-read the
state with `GET firebasehosting.googleapis.com/v1beta1/projects/membry-df528/sites/shouldimakethis/customDomains`.

**Do not take "a chat already added it to Firebase" at face value for any OTHER
domain** — a chat did exactly that on 2026-08-18/19, but for
`youwereinmydreams.com`, and that work fills the feed around those dates. Read
the API before believing a step is done.

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
  - **Hard-wrap copy boxes.** Insert real line breaks (~80 chars) so the block
    flows DOWN the screen (vertical scroll), never one long line that scrolls
    sideways. Sage's default — she shouldn't have to ask.
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

## I'm almost never at my desktop — batch desktop tasks (Aug 2026)
- **Never ask me to go to my computer.** I work from my phone, so "can you run
  this on your Mac?" lands weeks late or never. A task that can only run there
  gets **written down and batched**, not asked for.
- **THE ONE LIST is `docs/desktop-tasks.md` in `sageryza/imageforge`** — one
  queue for every chat in every repo, living in my Mac checkout (`~/imageforge`)
  so the machine that has to run it already has it. It carries the entry
  template and the rules; append to **OPEN** at the bottom with exact
  copy-pasteable commands, no secrets, commit and push the same turn.
  Working in THIS repo? Attach imageforge with `add_repo` and append there. If
  you genuinely can't, put the finished task block verbatim in your reply and
  say it still needs queueing.
- **Say one line that you queued it** — I should know the pile grew without
  having to ask, and without it turning into an ask. Then carry on with
  everything that doesn't depend on it.
- **When I'm at the computer** I say "open `docs/desktop-tasks.md` and run the
  queue" and the terminal chat works it top to bottom.
- **URGENT is the only interrupt** — I'm blocked without it, or it expires. Say
  so plainly AND queue it anyway. "It would be faster" is not urgent.
- **Desktop-only means:** my logged-in browser / keychain / Photos library, a
  plugged-in device, files that live only on the Mac, big uploads that need
  chunking on my home connection. Anything a cloud session can do, a cloud
  session does.
- **YouTube downloads came OFF that list on 2026-08-23.** This said "cloud IPs
  are bot-blocked", and that sentence is why nobody built the endpoint. Measured
  on the live Render box that day: metadata, a 3.4MB m4a and a 9.1MB 360p mp4,
  all clean, no cookies. Send a video url to
  `POST https://imageforge-q125.onrender.com/api/ytdl/grab {url, kind}` instead
  of queueing it. It can regress — the blocking is YouTube's to change — and
  then the grab answers `blocked:true` and the desktop queue is the fallback
  again. `GET /api/ytdl/status?probe=1` re-measures. Full rules: the *Grab a
  video* section of imageforge's CLAUDE.md.

## Working style
- **Build only what I asked for — no extra features, buttons, or UI.** Don't add
  reset buttons, legends, toggles, settings, "helpful" panels, or any control I
  didn't request. If something extra seems genuinely useful, mention it and let
  me decide — don't just add it. Match the scope of the request exactly.
- **Claude may merge its own PRs.** Standing permission (July 2026): when a PR
  is ready, merge it without asking — then watch the post-merge workflows
  (deploys, TestFlight) and fix anything that breaks.
- **Don't park PRs as drafts waiting for me to test.** Other chats work these
  repos in parallel and need the work in `main` to build on — a lingering draft
  blocks them (and invites merge clashes). Merge as soon as CI is green; I test
  on TestFlight *after* the merge and you fold any fixes into a follow-up PR.
- When blocked on a decision but other work can proceed, surface the decision
  and **keep building** in the meantime — don't stop and wait unless the decision
  affects everything. Prefer plain prose for those questions over the in-app
  question picker.
- While I work, the user may be testing and dropping feedback as they find it.
  Treat that feedback as a **running queue to fold in later**, not as interrupts
  to drop everything for — UNLESS it directly contradicts what's being built, or
  is explicitly about prioritization. Keep a visible list of the open items.

## Reply format (forever)
- **TLDR first.** Start every substantive reply with a 1-3 line TLDR that answers
  the question(s) directly, before any detail.
- **Current link(s) at the very bottom.** End every reply with the working link(s)
  for whatever is being built — the live page/artifact and the open PR — as full
  clickable links, so the latest link is always the last thing in the message.
- **No voice notes.** Long replies used to also ship as an mp3 (British male,
  1.2x). Retired Aug 2026 — the Chats app renders any reply in the neural voice
  on a ▶ tap, so generating one is duplicate work. Don't re-add it.

## Voice memo archive (where the data lives)
- Sage's 993 transcribed voice memos (2021-2026) — transcripts, categories,
  titles, keywords, descriptions — live in a PRIVATE Claude artifact on her
  account: https://claude.ai/code/artifact/adf1cb87-4d20-4a79-afdb-9bb721dc5b33
  Fetch that page (WebFetch works with her login) and parse the JSON in the
  `<script id="archive" type="application/json">` block. Do NOT commit the
  transcripts to this repo — it is public.
- The browsable search page is a separate artifact:
  https://claude.ai/code/artifact/66e91d44-9565-41b3-a024-af796bf2909e
