// boardAffinity.js — authored "how good is this prompt?" scores for every
// event×twist pairing in the board deck.
//
// Every event ("times i broke the news") combines grammatically with every
// twist ("at the worst moment"), so the daily board can't go wrong on grammar.
// What varies is narrative tension: "lost everything on a whim" sings, while
// "stole the show all by myself" is flat. These tiers capture that judgement so
// the Board-of-the-Day generator can lay cards whose every adjacency is a
// strong prompt.
//
// Scoring: base pairing = 1. A "great" pairing (vivid / ironic / high-tension)
// = GREAT. A "weak" pairing (redundant, flat, or a dull contradiction) = WEAK.
// Captions are matched verbatim against the deck (uppercase), so keep them in
// sync with deckBoard.json.

export const GREAT = 3;
export const BASE = 1;
export const WEAK = 0;

// For each event: twists that make a GREAT prompt, and twists that make a WEAK one.
const TIERS = {
  'TOOK A RISK': {
    great: ['WITH NOTHING TO LOSE', 'AGAINST THE ODDS', 'FOR THE THRILL OF IT', 'ON A WHIM', "DESPITE EVERYONE'S ADVICE"],
    weak: ['ALL BY MYSELF', 'WITH PERFECT TIMING'],
  },
  'GOT AWAY': {
    great: ['AT THE LAST SECOND', 'AGAINST THE ODDS', 'WITH NOTHING TO LOSE', 'IN A PANIC', 'WHEN NO ONE WAS LOOKING'],
    weak: ['ALL BY MYSELF', 'TO MY SURPRISE'],
  },
  'LOST EVERYTHING': {
    great: ['ON A WHIM', 'IN A PANIC', 'AT THE WORST MOMENT', 'WITHOUT THINKING', 'FOR THE THRILL OF IT'],
    weak: ['WITH PERFECT TIMING', 'ALL BY MYSELF', 'FOR THE FIRST TIME'],
  },
  'KEPT A PROMISE': {
    great: ['AGAINST THE ODDS', 'WITH GREAT DIFFICULTY', 'AT THE LAST SECOND', "DESPITE EVERYONE'S ADVICE", 'IN SECRET'],
    weak: ['FOR THE THRILL OF IT', 'ON A WHIM', 'WITHOUT THINKING'],
  },
  'CHANGED MY MIND': {
    great: ['AT THE LAST SECOND', 'ONCE AND FOR ALL', "DESPITE EVERYONE'S ADVICE", 'UNDER PRESSURE', 'TO MY SURPRISE'],
    weak: ['ALL BY MYSELF', 'FOR THE THRILL OF IT', 'IN SECRET'],
  },
  'MADE AN ENEMY': {
    great: ['BY ACCIDENT', 'WITHOUT THINKING', 'FOR THE FIRST TIME', 'IN SECRET', 'WITHOUT PERMISSION'],
    weak: ['WITH PERFECT TIMING', 'WITH GREAT DIFFICULTY', 'AGAINST THE ODDS'],
  },
  'MISSED MY CHANCE': {
    great: ['AT THE LAST SECOND', 'BY ACCIDENT', 'IN A PANIC', 'WITHOUT THINKING', 'AT THE WORST MOMENT'],
    weak: ['FOR THE THRILL OF IT', 'ALL BY MYSELF'],
  },
  'CAUSED A SCENE': {
    great: ['IN A PANIC', 'AT THE WORST MOMENT', 'WITHOUT THINKING', 'ON A WHIM', 'FOR THE THRILL OF IT'],
    weak: ['WITH GREAT DIFFICULTY', 'AGAINST THE ODDS', 'IN SECRET'],
  },
  'FOLLOWED A HUNCH': {
    great: ['AGAINST THE ODDS', "DESPITE EVERYONE'S ADVICE", 'ON A WHIM', 'AT THE WORST MOMENT', 'FOR THE THRILL OF IT'],
    weak: ['WITH GREAT DIFFICULTY', 'ALL BY MYSELF'],
  },
  'LOST MY TEMPER': {
    great: ['AT THE WORST MOMENT', 'IN A PANIC', 'WITHOUT THINKING', 'FOR THE FIRST TIME', 'WHEN NO ONE WAS LOOKING'],
    weak: ['WITH PERFECT TIMING', 'WITH GREAT DIFFICULTY', 'AGAINST THE ODDS'],
  },
  'HELD A GRUDGE': {
    great: ['IN SECRET', 'FOR THE FIRST TIME', 'ONCE AND FOR ALL', 'ALL BY MYSELF', "DESPITE EVERYONE'S ADVICE"],
    weak: ['WITH PERFECT TIMING', 'AT THE LAST SECOND', 'FOR THE THRILL OF IT'],
  },
  'WON SOMEONE OVER': {
    great: ['AGAINST THE ODDS', 'WITH GREAT DIFFICULTY', 'AT THE LAST SECOND', "DESPITE EVERYONE'S ADVICE", 'TO MY SURPRISE'],
    weak: ['ALL BY MYSELF', 'IN A PANIC', 'IN SECRET'],
  },
  'PAID THE PRICE': {
    great: ['AT THE WORST MOMENT', 'ONCE AND FOR ALL', 'WITH GREAT DIFFICULTY', 'FOR THE FIRST TIME', 'TO MY SURPRISE'],
    weak: ['FOR THE THRILL OF IT', 'WITH PERFECT TIMING', 'ON A WHIM'],
  },
  'BROKE THE NEWS': {
    great: ['AT THE WORST MOMENT', 'IN SECRET', 'BY ACCIDENT', 'AT THE LAST SECOND', 'WITH PERFECT TIMING'],
    weak: ['AGAINST THE ODDS', 'WITH GREAT DIFFICULTY', 'FOR THE THRILL OF IT'],
  },
  'WON MY FREEDOM': {
    great: ['AGAINST THE ODDS', 'AT THE LAST SECOND', 'ONCE AND FOR ALL', 'WITH GREAT DIFFICULTY', 'IN SECRET'],
    weak: ['BY ACCIDENT', 'WITH PERFECT TIMING', 'TO MY SURPRISE'],
  },
  'FACED MY FEAR': {
    great: ['ALL BY MYSELF', 'FOR THE FIRST TIME', 'AGAINST THE ODDS', 'WITH NOTHING TO LOSE', 'ONCE AND FOR ALL'],
    weak: ['BY ACCIDENT', 'WITH PERFECT TIMING', 'FOR THE THRILL OF IT'],
  },
  'DROPPED MY GUARD': {
    great: ['AT THE WORST MOMENT', 'FOR THE FIRST TIME', 'WITHOUT THINKING', 'TO MY SURPRISE', 'BY ACCIDENT'],
    weak: ['AGAINST THE ODDS', 'WITH GREAT DIFFICULTY', 'WITH PERFECT TIMING'],
  },
  'TOOK A STAND': {
    great: ["DESPITE EVERYONE'S ADVICE", 'AGAINST THE ODDS', 'FOR THE FIRST TIME', 'UNDER PRESSURE', 'WITH NOTHING TO LOSE'],
    weak: ['BY ACCIDENT', 'WITHOUT THINKING', 'ON A WHIM'],
  },
  'STOLE THE SHOW': {
    great: ['WITHOUT THINKING', 'BY ACCIDENT', 'TO MY SURPRISE', 'AT THE LAST SECOND', 'WITH PERFECT TIMING'],
    weak: ['ALL BY MYSELF', 'IN SECRET', 'WITH GREAT DIFFICULTY'],
  },
  'MADE A FOOL OF MYSELF': {
    great: ['AT THE WORST MOMENT', 'FOR THE FIRST TIME', 'WITHOUT THINKING', 'TO MY SURPRISE', 'WITH PERFECT TIMING'],
    weak: ['AGAINST THE ODDS', 'WITH GREAT DIFFICULTY', 'ONCE AND FOR ALL'],
  },
};

// Pre-index into Sets for O(1) lookup.
const INDEX = {};
for (const [ev, t] of Object.entries(TIERS)) {
  INDEX[ev] = { great: new Set(t.great || []), weak: new Set(t.weak || []) };
}

// Score one event×twist prompt. Unknown captions fall back to BASE.
export function pairScore(eventCap, twistCap) {
  const t = INDEX[String(eventCap || '').toUpperCase()];
  if (!t) return BASE;
  const tw = String(twistCap || '').toUpperCase();
  if (t.great.has(tw)) return GREAT;
  if (t.weak.has(tw)) return WEAK;
  return BASE;
}

export default { pairScore, GREAT, BASE, WEAK };
