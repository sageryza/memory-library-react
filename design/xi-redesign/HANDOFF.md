# XI redesign — handoff bundle (not yet implemented)

Exported from Claude Design (claude.ai/design) on 2026-08-16. These are **prototypes,
not production code** — recreate the visual output, don't copy the prototype's DOM.

Nothing in this folder has been implemented in `src/` yet.

## Read in this order

1. `chats/chat1.md` — the full user ↔ design-assistant back-and-forth. This is where the
   intent lives; the HTML is just the output.
2. `project/XI Redesign Directions.dc.html` — the design the user had open at handoff.
   Four turns, newest first (turn 4 at the top, turn 1 at the bottom).
3. `project/XI Current Screens.dc.html` — faithful recreation of the *current* screens,
   for before/after comparison.
4. `project/github.md` — screen → repo file map.

`project/support.js` is the Claude Design canvas runtime (React bootstrapper). It contains
no design content — nothing to port from it.

## Where the user landed

Options are addressed by turn + letter (`2a`, `4b`, …) matching the anchors in the HTML.

| Screen | Option | Status |
| --- | --- | --- |
| Today / Card of the Day | **`2a`** ("deco tarot, refined") | Settled — three rounds of notes applied |
| Private library (Archive) | `3a` or `4a` | **Open question — see below** |
| Pin board (Conspiracy Board) | `3b` or `4b` | **Open question — see below** |
| Versus | — | Never designed in the new language |
| Stories feed | — | Never designed in the new language |

**Open question:** the library and pin board each got two rounds. The user asked to "retry
those last two screens," producing `4a`/`4b`, and `3a`/`3b` were kept below "for
comparison." The user never said which pair won. Turn 4 is the latest, but that is not the
same as a decision — **confirm before building either.**

The `2a` design language, as converged after the user's notes:

- Background cream `#f8f1e3`, ink `#191411`, gilt `#b08c36`, oxblood `#6e1423`, card
  surface `#fffdf6`, nav gold `#e5b84b`
- Double frame: `1.5px #d9c9a6` at `inset:10px`, `1px #b08c36` at `inset:14px`
- EB Garamond for body, Marcellus for small caps / letterspaced labels
- All outlines are the light `#d9c9a6`, **not** black (explicit user note)
- Today's card pair is tilted ±2.5°, keeps its border, and has **no** `EVENT`/`TWIST`
  labels and **no** repeated prompt sentence underneath
- `redraw` / `nothing` are quiet italic links — no borders, no underlines
- The gold fill bar (not diamonds) sits **above** the write box, 5 ticks, 40% filled
- Save button is lowercase italic EB Garamond on an ink background
- Collected memories are **straight** (no tilt), light outline, no shadow, each its own card
- Nav is icon-only: sun · overlapping circles · four squares · open book

## Target files

Per `project/github.md`:

| Screen | Repo files |
| --- | --- |
| Today / Card of the Day | `src/components/xi/xiMarkup.js`, `src/xi/xiEngine.js`, `src/components/xi/XiApp.{jsx,css}` |
| Versus | `src/components/xi/XiVersus.{jsx,css}`, `src/components/xi/XiBoardGrid.jsx` |
| Library (in-XI) | `src/xi/xiEngine.js` (`renderLibrary`), `src/components/xi/XiApp.css` |
| Stories feed | `src/components/xi/XiStories.{jsx,css}` |
| Nav bar | `src/components/xi/XiNavBar.{jsx,css}` |
| Deck data | `src/xi/decks.js`, `src/data/xi/deckTrial.json`, `src/xi/renderTextCard.js` |
| Archive (`3a`/`4a`) | `src/components/archive/styles/Archive.css`, `.../MemoryCard.css` |
| Conspiracy Board (`3b`/`4b`) | `src/components/conspiracy-board/ConspiracyBoard.css`, `.../Connections.css` |

## Viewing the prototypes

The `.dc.html` files need `support.js` as a sibling (it already is) and pull Google Fonts
from the network. Open them directly in a browser — no build step. Each screen is a
390×812 fixed-size frame.
