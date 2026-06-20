// XI decks — authored content bundled as static assets.
//
// The raw JSON (deckDaily.json, deckBoard.json) holds card captions (`cap`)
// and illustrations (`img`, a base64 webp data URL). Cards have no stored id,
// so we derive a stable id by slugifying the caption. Captions are unique and
// authored, so the slug is stable across builds and safe to persist on memories.

import rawDaily from '../data/xi/deckDaily.json';
import rawBoard from '../data/xi/deckBoard.json';

// Slugify a caption into a stable id, e.g. "INTERRUPTED A GOOD TIME" -> "interrupted-a-good-time"
export function slugifyCaption(cap) {
  return String(cap || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCard(card, kind, deck) {
  const cap = card.cap || '';
  return {
    id: `${deck}-${kind}-${slugifyCaption(cap)}`,
    cap,
    img: card.img || null,
    kind, // 'event' | 'twist'
    deck, // 'daily' | 'board'
  };
}

function buildDeck(raw, deckName) {
  return {
    events: (raw.ev || []).map((c) => normalizeCard(c, 'event', deckName)),
    twists: (raw.tw || []).map((c) => normalizeCard(c, 'twist', deckName)),
  };
}

export const dailyDeck = buildDeck(rawDaily, 'daily');
export const boardDeck = buildDeck(rawBoard, 'board');

// Flat lookup of every card by id across both decks (for resolving art/captions
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

export default { dailyDeck, boardDeck, getCardById, resolveCard, slugifyCaption };
