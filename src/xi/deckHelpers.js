// Small pure helpers for selecting and shuffling deck cards.

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Filter out cards the user has excluded via Curate.
export function playable(cards, excludedIds) {
  const excluded = new Set(excludedIds || []);
  return cards.filter((c) => !excluded.has(c.id));
}

export function pickRandom(cards, excludedIds) {
  const pool = playable(cards, excludedIds);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
