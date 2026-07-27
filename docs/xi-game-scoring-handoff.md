# Handoff: XI game scoring by meaning (semantic)

Implement point-scoring for a played memory in the XI "times i" board game, using
the already-deployed semantic backend. Assume you know nothing; here's everything.

## Goal

In the game, you're dealt a **pairing** of two cards (an *event* + a *twist*) and
you write a **new** memory that fits them. Today that memory is just saved/counted
— there's no notion of *how well* it fits. Add scoring:

- Score the written memory against **each** of the two cards, by **meaning**.
- **1 point per card it matches**, so: matches one card → **1 point**, matches
  both → **2 points**, neither → **0**.
- It must work on meaning, not keywords — a memory about feeling powerless should
  match a "felt helpless" card even without the word "helpless."

The memory being scored is the **freshly-written one** (players tell a new memory;
they don't pull from their library). So score the text live at save time.

## What already exists (deployed, do not rebuild)

A Cloud Function is **already deployed** to the live Firebase project
`membry-df528` (callable, region default us-central1):

**`scorePlay`** — request/response:

```
request.data = {
  text: String,                       // the memory the player just wrote
  cards: [{ id: String, caption: String }],   // the 2 dealt cards (event, twist)
  threshold?: Number                  // match cutoff, default 0.28
}
returns = {
  scores: [{ id, caption, similarity: Double (0..1), match: Bool }],
  points: Int                          // count of cards with match == true (0..2)
}
```

It embeds the text + each card caption with OpenAI `text-embedding-3-small` and
compares by cosine similarity; `match = similarity >= threshold`. The OpenAI key
is read server-side from Firestore `config/*` (already configured). Cost is a
fraction of a cent per play.

Sibling functions from the same work (context): `semanticSearch` (Archive search),
`embedMemory` (auto-embeds saved memories), `backfillMemoryVectors`. Source lives
in `functions/index.js`. These are on branch
`claude/google-drive-memory-import-gvr0kn` (PR #152) and already deployed.

## Where to integrate (the exact spot)

- **`ios-xi/XI/ComposerSheet.swift`** — this is the composer for a pairing. It has:
  - `let pairing: Pairing` → `pairing.event` and `pairing.twist` are `XICard`
    (each has `.id` and `.cap`, the caption).
  - `@State private var text` → the memory the player writes.
  - `private func save()` → calls `XIService.shared.saveMemory(...)`.
  This is where to call `scorePlay(text, [event, twist])` — on save (or a
  "score" tap) — then show the result and persist it.

- **`ios-xi/XI/XIService.swift`** — add a `scorePlay` wrapper next to the existing
  `semanticSearch`/`backfillVectors` (added on PR #152). Pattern:

```swift
struct PlayScore { let points: Int; let perCard: [(id: String, match: Bool, similarity: Double)] }

func scorePlay(text: String, cards: [(id: String, caption: String)]) async -> PlayScore {
    do {
        let payload: [String: Any] = ["text": text,
            "cards": cards.map { ["id": $0.id, "caption": $0.caption] }]
        let res = try await functions.httpsCallable("scorePlay").call(payload)
        let d = res.data as? [String: Any]
        let points = (d?["points"] as? Int) ?? 0
        let scores = (d?["scores"] as? [[String: Any]]) ?? []
        let per = scores.map { (($0["id"] as? String) ?? "",
                                ($0["match"] as? Bool) ?? false,
                                ($0["similarity"] as? Double) ?? 0) }
        return PlayScore(points: points, perCard: per)
    } catch { return PlayScore(points: 0, perCard: []) }
}
```
  (`functions` already exists on XIService as `Functions.functions()` — don't
  redeclare it.)

## Design decisions (already settled with Sage)

- **Scoring is automatic** for the game — no "confirm" step (that confirm idea is
  for a *different*, separate feature: auto-tagging library memories to cards and
  confirming before a public feed. NOT part of this task.)
- **Live** scoring of the just-written memory; do not use the library index.
- **Threshold 0.28** is the starting cutoff — tune by feel (try 0.25–0.35).
- Show the result simply (e.g. points + which card(s) matched). Persisting the
  points on the memory doc (a `points`/`score` field via `saveMemory`) is
  recommended so scores survive and can feed any leaderboard, but confirm the
  exact schema field with Sage — the web app + iOS share the `users/{uid}/memories`
  schema, so add the field in both or coordinate.

## Coordination / gotchas

- The backend (`scorePlay`) is **already live**, so you can call it immediately.
- The XIService semantic wrappers + `functions/index.js` source live on **PR #152**
  (branch `claude/google-drive-memory-import-gvr0kn`). Base your work on that branch
  (or on main **after** #152 merges) so you get the `functions` handle + patterns
  and don't duplicate them.
- **Versioning:** XI is live on the App Store; the current TestFlight build is
  **1.2 (build 2)**. Bump `CURRENT_PROJECT_VERSION` in `ios-xi/project.yml` above 2
  for your build, or you'll get a duplicate-build upload rejection.
- Ship via the **`ios-xi-testflight.yml`** workflow (workflow_dispatch). It also
  compile-checks. XI app changes only reach the public App Store after Apple review;
  TestFlight is for Sage's testing.
- A separate chat is adding a **microphone** feature to XI on another branch —
  coordinate so two TestFlight builds don't clobber each other's features (whoever
  uploads last wins the slot; rebase onto the other's merged work first).
