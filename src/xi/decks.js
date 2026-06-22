// XI decks — five sources combined into the daily (ev/tw) and board (be/bw)
// pools. A deck is either INTERCHANGEABLE (no event/twist role — every card can
// be either, and the twist slot just walks the deck in reverse) or SPLIT (real,
// separate event and twist lists).
//
//   1. midjourney — illustrated, caption at the bottom        (interchangeable)
//   2. internet   — illustrated, hand-lettered caption        (interchangeable)
//   3. dreams     — plain-text cards from dreams              (interchangeable)
//   4. claude     — plain-text, from life stories            (split)
//   5. chatgpt    — illustrated, the original "day one" deck  (split)
//
// Stable ids preserve historical archive memories. Ids are `${ns}-${kind}-${base}`
// where ns is 'daily' or 'board' — kept from when Claude WAS the daily deck and
// ChatGPT WAS the board deck, so their old pairKeys still resolve. Trial cards
// carry their own id (nt*), so they stay `daily-event-nt5` etc. as before.

import rawTrial from '../data/xi/deckTrial.json';
import rawClaude from '../data/xi/deckDaily.json';   // the Claude plain-text deck
import rawChatgpt from '../data/xi/deckBoard.json';  // the ChatGPT illustrated deck
import rawDreams from '../data/xi/deckDreams.json';

// Slugify a caption into a stable id, e.g. "INTERRUPTED A GOOD TIME" -> "interrupted-a-good-time"
export function slugifyCaption(cap) {
  return String(cap || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The five decks, IN POOL ORDER. Interchangeable decks come first so that a
// card's event-index equals its twist-index (the curate ✕ relies on this to
// remove an interchangeable card from both roles at once); split decks follow.
// `nick` labels the Curate checkbox; `split` selects draw/curation behavior.
export const DECKS = [
  { id: 'midjourney', nick: 'midjourney', split: false },
  { id: 'internet', nick: 'internet', split: false },
  { id: 'dreams', nick: 'dreams', split: false },
  { id: 'claude', nick: 'claude', split: true },
  { id: 'chatgpt', nick: 'chatgpt', split: true },
];

const trial = rawTrial.cards || [];
const SOURCES = {
  // trial.json is Midjourney (0..86) then internet (87..146) — see the import.
  midjourney: { cards: trial.slice(0, 87) },
  internet: { cards: trial.slice(87) },
  dreams: { cards: rawDreams.cards || [] },
  claude: { ev: rawClaude.ev || [], tw: rawClaude.tw || [] },
  chatgpt: { ev: rawChatgpt.ev || [], tw: rawChatgpt.tw || [] },
};

function mkCard(src, kind, ns, deckId) {
  const cap = src.cap || '';
  const base = src.id ? src.id : slugifyCaption(cap);
  return { id: `${ns}-${kind}-${base}`, cap, img: src.img || null, kind, deck: deckId };
}

// Build one pool ('daily' or 'board'). Interchangeable decks contribute the same
// source card to both events and twists at the same position; split decks
// contribute their real event and twist lists.
function buildPool(ns) {
  const events = [];
  const twists = [];
  for (const def of DECKS) {
    const s = SOURCES[def.id];
    if (def.split) {
      s.ev.forEach((c) => events.push(mkCard(c, 'event', ns, def.id)));
      s.tw.forEach((c) => twists.push(mkCard(c, 'twist', ns, def.id)));
    } else {
      s.cards.forEach((c) => {
        events.push(mkCard(c, 'event', ns, def.id));
        twists.push(mkCard(c, 'twist', ns, def.id));
      });
    }
  }
  return { events, twists };
}

export const dailyDeck = buildPool('daily');
export const boardDeck = buildPool('board');

// Flat lookup of every card by id across both pools (for resolving art/captions
// from ids stored on memories or per-user settings).
const allCardsById = new Map();
for (const deck of [dailyDeck, boardDeck]) {
  for (const card of [...deck.events, ...deck.twists]) {
    allCardsById.set(card.id, card);
  }
}

export function getCardById(id) {
  return allCardsById.get(id) || null;
}

// Resolve a stored card reference ({ id, cap }) back to its full card (with art).
// Falls back to the stored caption if the id is no longer in the deck.
export function resolveCard(ref) {
  if (!ref) return null;
  const found = ref.id ? getCardById(ref.id) : null;
  if (found) return found;
  return { id: ref.id || null, cap: ref.cap || '', img: null };
}

export default { DECKS, dailyDeck, boardDeck, getCardById, resolveCard, slugifyCaption };
