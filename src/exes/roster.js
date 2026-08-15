// roster.js — who fights. The SHAPE of an ex, and nothing about anyone real.
//
// WHY THIS FILE HOLDS NO REAL PEOPLE: this repo is public and deploys to
// incaseofamnesia.com. Sophie's own roster is derived from private recordings,
// so it does not live in git — it goes in through `makeEx()` at runtime and is
// stored with her saves. The examples below are invented.
//
// THE SHIP PLAN, and the reason it costs Sophie no extra work: her exes go in
// through the SAME door everyone else's will. An ex is a name, three dials and
// one line — there is no per-person code anywhere in this game, and no level
// hard-codes a fighter. So building her roster IS building the creator. When
// she ships it, other people fill the same four fields and nothing has to be
// generalised after the fact.
//
// The three dials, and what each one actually changes in a fight:
//
//   ego     1..5  how much your attention goes to his head. A 5 swells the
//                 moment you look at him and rages the moment you don't — he
//                 is the most fun to play and the easiest to steer. A 1 barely
//                 registers that you're in the room.
//   temper  1..5  how hard he swings once he's angry. A 5 ends fights. A 1
//                 mostly just stands there being annoyed.
//   stamina 1..5  whether he's still upright at beat 50. A 5 outlasts a 5
//                 temper; that matchup is the long grinding one.
//
//   signature     one line, fired ONCE, when his rage passes 75 — the thing he
//                 always ends up saying. This is where a real person survives
//                 into the game, and it should be a quote, not a description.

// `0 || 3` is 3, so a slider actually sitting at zero must not be mistaken for
// an unset one — only a non-number falls back to the middle.
const dial = (v) => {
  const n = Number(v);
  return Math.max(1, Math.min(5, Math.round(Number.isFinite(n) ? n : 3)));
};

// Build an ex. Everything but a name has a middling default, so a half-filled
// creator still produces someone who fights.
export function makeEx({ id, name, ego, temper, stamina, signature, note }) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('an ex needs a name');
  return {
    id: id || clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name: clean,
    ego: dial(ego),
    temper: dial(temper),
    stamina: dial(stamina),
    signature: (signature || '').trim() || null,
    note: (note || '').trim() || null,   // for her, never shown mid-fight
  };
}

// What the creator screen renders: four fields, and the dials explain
// themselves in terms of what they DO, not in adjectives.
export const DIALS = [
  { key: 'ego', label: 'Ego',
    low: 'barely notices you', high: 'performs the second you look' },
  { key: 'temper', label: 'Temper',
    low: 'sulks', high: 'ends it' },
  { key: 'stamina', label: 'Stamina',
    low: 'burns out', high: 'still going at the end' },
];

// Invented examples — placeholders for the creator screen, and what the tests
// fight with. Nobody here is a real person.
export const EXAMPLE_EXES = [
  makeEx({ name: 'The One Who Performs', ego: 5, temper: 2, stamina: 3,
    signature: 'Everyone here agrees with me, actually.' }),
  makeEx({ name: 'The One Who Sulks', ego: 2, temper: 5, stamina: 4,
    signature: "I wasn't even going to say anything." }),
  makeEx({ name: 'The One Who Will Not Fight', ego: 1, temper: 1, stamina: 5,
    signature: "I don't think this is about me." }),
];

// A roster is just a list, and a fight needs two of them.
export const canFight = (roster) => Array.isArray(roster) && roster.length >= 2;
