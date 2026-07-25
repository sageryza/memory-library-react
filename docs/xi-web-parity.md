# Rebuilding the XI website to feel like the app

Sage's ask (July 2026): *"the way the app works feels really clean"* — the web
should be the same experience, not a sibling. One example she gave: when you
pick two cards to write a story on, **the app shows the actual cards; the web
shows only text.**

The root cause of nearly every difference: the web still runs `src/xi/xiEngine.js`,
the imperative engine ported verbatim from the original standalone HTML app. The
iOS app was written fresh in SwiftUI against the same data. So the web isn't
"styled differently" — it's a different program. This list is ordered by how much
each item changes the feel per unit of work.

## 1. Show real cards wherever cards are referenced (highest impact)

- **Versus story composer** — `XiVersus.jsx` renders `storyLabel`, a sentence.
  The app (`ComposerSheet.swift`) renders the two card images side by side with
  the prompt beneath. Do the same: card art first, text second.
- **Versus hand** — already images on web; keep, but match the app's card
  proportions and selected-state gold frame.
- **Stories feed** — the app shows the teller's gold shape + the pair; the web
  shows a coloured dot. Use the same shape set (`playerSymbol`).
- **Library / archive rows** — memory rows should carry their pair's card
  thumbnails, as the app does.

## 2. One visual system

The app's rules, currently only partly true on web:

- **Type**: Crimson Text serif for all body/UI copy; ALL-CAPS monospaced only for
  screen titles ("CARD OF THE DAY"). Web mixes sans in places.
- **Palette**: paper `#faf7f0` background, white cards, gold `#b08d2f` accents,
  ink `#2b2620` text, hairline `#e4ddcf` borders.
- **Shape**: 6px radius everywhere (no pills — house rule), 0.5px borders, no
  drop shadows except the piggy-bar glow.
- **Density**: the app breathes more — 16pt screen margins, 10–14pt stack gaps.

## 3. Navigation

- App: five icon tabs, lowercase labels — today / daily / versus / board / library.
- Web: Today / Curate / Daily / Versus / Library, text-only, and Curate occupies
  a tab the app doesn't give it.
- **Do**: match the app's five tabs, icons included; move Curate behind the
  Today screen's gear (where the app keeps it).

## 4. Screen-by-screen parity

| Screen | Gap to close |
| --- | --- |
| Today | Piggy bar (white track, gold sliver, five ticks) doesn't exist on web at all. Composer/collected/others ordering should match. |
| Card of the day | Shared card logic matches already; the header, day arrows, and redraw affordance should match the app's. |
| Board of the Day | Web grid is close; align cell sizing, the gold pair frame, and the day stepper. |
| Versus | Waiting room, join/kick affordances, and the composer (see §1). |
| Library | The app's filter panel + selection mode are much cleaner than the web archive. Biggest single rebuild. |
| Settings | Web has no equivalent surface for the app's Settings sheet (sharing prefs, account, deletion). |

## 5. The structural decision

Two ways to get there:

- **A — restyle the engine.** Cheaper, but every future change costs double
  because the web logic lives in an imperative file nothing else shares.
- **B — rebuild the XI web screens as React components** against the same
  `src/xi/*` data modules the engine already uses, and retire `xiEngine.js`.
  More work up front; afterwards a change is written once per platform, not
  once per platform *plus* once in the engine.

**Recommendation: B**, done screen by screen — Versus composer first (it's the
example that prompted this), then Today, then Library. Each step ships on its
own; nothing has to land as one big rewrite.
