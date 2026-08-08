# XI Dice Edition — the original design, recovered from Google Drive

Sage designed a dice version of XI years ago, printed exactly one copy, and gave
it to her brother. The design survives only inside Google Drawings, where the
face text is stored as **glyph outlines, not text** — so it can't be grepped,
copied, or found by a Drive search. This file is the recovered transcription so
it never has to be read off a picture again.

## The Drive files

- **Sticker faces (the real one, Dec 2018)** —
  [XI DICE STICKER SQUARES TO PRINT](https://docs.google.com/drawings/d/1vIyKXfF4Rk-OU0b3x1MHnDZRqWtgv5bMFJlxdDx6ZiA/edit)
  36 one-inch squares, 6 across × 6 down, printed twice on one 8.5×11 sheet
  (plus rotated overflow copies down the right margin). **One row = one die.**
- **Box top** —
  [xi dice edition top of box to print out](https://docs.google.com/drawings/d/13CfhvMVB7dG4yiXIKMSQvTyG1H9I4iW39gxXgmI1-v8/edit)
  The illuminated ornate `XI` in a square frame, with `DICE EDITION` set
  vertically beside it. Two copies to a sheet.
- **"Copy of XI DICE STICKER SQUARES TO PRINT" (2017)** —
  [same title, different file](https://docs.google.com/drawings/d/1RyEO1J_OZFdrsYnEI18cBq3n0OoWCkomkvqb3sP_6ZY/edit).
  **Not an earlier sticker set** — the file was reused and now holds a collage
  of grocery photographs. Nothing to recover; don't go looking again.

**There are no dice rules.** A full-Drive search for anything mentioning dice
returns only the three drawings above. Every instructions document
(XI instructions 2017, xi instructions for kit 2019, how to play xi 2023,
XI INSTRUCTION MANUAL slides, the shared XI Rules doc) is for the **card** game.
The dice rules were never written down.

## The 36 faces, by die

Rows top-to-bottom on the sheet. The category names are read off the content —
they are not printed anywhere.

**Die 1 — EVENT (inward / to me)**
dared myself · unlocked a secret · solved a mystery · made a decision ·
someone scared me · felt out of place

**Die 2 — WHY (motive)**
because I felt like it · though I didn't want to · so I could be by myself ·
in order to win · so that everyone could see · unlike everyone else

**Die 3 — HOW (circumstance)**
by accident · because I said so · despite the best advice ·
it was part of the plan · against my will · to everyone's surprise

**Die 4 — WHERE (setting)**
in class · during a vacation · at a birthday party · in a place of worship ·
at the scene of a crime · during a romantic dinner

**Die 5 — EVENT (with other people)**
told a lie · did something daring · watched someone cry · someone saved me ·
got in a fight · tricked someone

**Die 6 — EVENT (social / self-image)**
felt foolish · learned a lesson · told a white lie · cursed someone ·
kissed someone · wore a costume

## The combination math

Every die is a different category, so all six are distinguishable and no roll
is a duplicate of another.

- Roll all six: **6⁶ = 46,656** distinct rolls.
- Roll six, then use any subset: **7⁶ − 1 = 117,648** distinct prompts.
- Choose k dice up front and use all of them (expert mode): C(6,k) × 6ᵏ —
  36 at k=1, 540 at k=2, 4,320 at k=3, 19,440 at k=4, 46,656 at k=5,
  46,656 at k=6.

## The design problem (and the fix)

Combinations are not the constraint. **Grammar is.** Dice 1, 5 and 6 are all the
same part of speech — all events — so a must-use-everything roll demands a
single memory containing three unrelated events at once (*dared myself* AND
*got in a fight* AND *kissed someone*), plus a why, a how and a where. That is
usually impossible, not merely hard, which is why expert mode never worked.

Proposed fix: make each die a **slot in one sentence**, so every roll composes.
Keep dice 1–4 (event / why / how / where) as they are; replace the two surplus
event dice with:

- **WHO** — with a stranger · with my mother · alone · in front of a crowd ·
  with someone I'd just met · with someone I was afraid of
- **WHEN** — before I could read · in middle school · the year I moved ·
  the summer everything changed · last week · a time I can't place

Then a full roll reads as one sentence: *times I dared myself, in front of a
crowd, because I said so, so that everyone could see, at a birthday party, the
summer everything changed.* All 46,656 rolls become playable, and how many dice
you use is a difficulty dial rather than the line between possible and
impossible. The 12 event phrases displaced from dice 5 and 6 become the variant
pool.

## Physical note

The stickers are **exactly 1 inch square** (384 units on a 384-units-per-inch
sheet), and the longest phrases — *so that everyone could see*, *at the scene of
a crime*, *though I didn't want to* — already fit legibly at that size. So a
2 inch die is generous; 1¼–1½ inch works and keeps six dice rollable in one
throw instead of in batches.
