// Dream entry schema for the Group Dream Journal.
//
// Design decision (see TODO.md → "GROUP DREAM JOURNAL"): a dream is a SPECIALIZED
// KIND OF CARD, not a memory. It shares a card "base" (title, content, tags, date)
// so the existing card / keyword / chronology machinery can be reused, plus a
// dream-specific extension. `symbols` and `emotions` are FIRST-CLASS structured
// arrays (not freetext / generic hashtags) because that is what makes the later
// cross-user aggregation ("200 people dreamt of water") and Postgres/pgvector
// backfill clean. Keep this shape stable before accumulating data.

import { ensureStringId } from './generateId';

// Discriminator so a dream can be told apart from a memory if they ever share a view.
export const ENTRY_TYPE_DREAM = 'dream';

// Suggested emotion vocabulary. Kept as an open list — entries may contain values
// outside this set, but offering a canonical set keeps aggregation tidy.
export const DREAM_EMOTIONS = [
  'joy',
  'fear',
  'anxiety',
  'peace',
  'confusion',
  'wonder',
  'grief',
  'anger',
  'love',
  'nostalgia',
];

/**
 * Normalize a free list of strings into clean, lowercased, de-duplicated tokens.
 * Used for `symbols`, `emotions`, and `tags` so aggregation keys stay consistent.
 */
export const normalizeTokens = (values) => {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    if (raw == null) continue;
    const token = String(raw).trim().toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
};

/**
 * Build a dream entry document body (without server-managed fields like
 * createdAt/updatedAt, which the hook adds via serverTimestamp()).
 *
 * @param {object} input
 * @param {string} input.authorId        - uid of the member posting the dream (required by rules)
 * @param {string} [input.authorName]    - display name for attribution in the feed
 * @param {string} [input.title]
 * @param {string} [input.content]       - the dream narrative
 * @param {string[]} [input.tags]
 * @param {string} [input.date]          - logged date (ISO); when the entry was recorded
 * @param {object} [input.dream]         - dream-specific extension fields (see below)
 * @returns {object} a plain object ready to write to Firestore
 */
export const createDreamEntry = ({
  authorId,
  authorName = '',
  title = '',
  content = '',
  tags = [],
  date = new Date().toISOString(),
  dream = {},
} = {}) => {
  if (!authorId) {
    throw new Error('createDreamEntry: authorId is required');
  }

  const {
    sleepDate = null, // ISO date the dream was actually dreamt (distinct from logged `date`)
    lucid = false, // was the dreamer aware they were dreaming?
    vividness = null, // optional 1–5 scale
    recurring = false, // is this a recurring dream?
    symbols = [], // FIRST-CLASS: structured symbols, e.g. ['water', 'flying']
    emotions = [], // FIRST-CLASS: structured emotions, e.g. ['fear', 'wonder']
    people = [], // who appeared in the dream
    wakingTriggers = [], // waking-life things that may have seeded the dream
  } = dream || {};

  return {
    // ---- shared card base (reuses existing card/keyword/chronology machinery) ----
    type: ENTRY_TYPE_DREAM,
    authorId: ensureStringId(authorId),
    authorName,
    title,
    content,
    tags: normalizeTokens(tags),
    date,

    // ---- dream-specific extension ----
    dream: {
      sleepDate,
      lucid: !!lucid,
      vividness: vividness == null ? null : Number(vividness),
      recurring: !!recurring,
      symbols: normalizeTokens(symbols),
      emotions: normalizeTokens(emotions),
      people: normalizeTokens(people),
      wakingTriggers: normalizeTokens(wakingTriggers),
    },
  };
};

export default createDreamEntry;
