// boardOfDayModel.js — deterministic daily "Board of the Day" generation.
//
// Each day everyone gets the SAME board: a connected, crossword-like cluster of
// cards on the 5×5 checkerboard with empty spaces around it. Because events sit
// on cream cells and twists on white ones, every orthogonal adjacency is an
// event×twist pairing — i.e. every touching pair is a valid "times i…" prompt.
//
// Boards are addressed by a day number, so past days can be revisited.

import { cellKind, neighbors, shuffle } from './versusModel.js';

// Local day number (days since the unix epoch in the viewer's timezone).
export function dayNumber(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

// A small, stable PRNG (mulberry32) seeded from an integer.
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the deterministic board for a given day. Returns a flat placed[] of
// { r, c, d, i } — a connected blob of `targetCards` cards; the rest stay empty.
export function dailyBoard(dayNum, poolSizes, targetCards = 13) {
  const rand = makeRng((dayNum + 1) * 0x9E3779B1);
  const key = (r, c) => r + ',' + c;
  const taken = new Set();
  const cells = [[2, 2]]; // grow out from the centre (an event cell)
  taken.add(key(2, 2));

  // Grow a connected cluster: repeatedly add a random empty cell adjacent to it.
  let guard = 0;
  while (cells.length < targetCards && guard++ < 500) {
    const frontier = [];
    for (const [r, c] of cells) {
      for (const [a, b] of neighbors(r, c)) {
        if (!taken.has(key(a, b))) frontier.push([a, b]);
      }
    }
    if (!frontier.length) break;
    const [r, c] = frontier[Math.floor(rand() * frontier.length)];
    if (taken.has(key(r, c))) continue;
    taken.add(key(r, c));
    cells.push([r, c]);
  }

  // Assign cards: events to cream cells, twists to white cells, deterministically.
  const evIdx = shuffle([...Array(poolSizes.be).keys()], rand);
  const twIdx = shuffle([...Array(poolSizes.bw).keys()], rand);
  let ei = 0;
  let ti = 0;
  return cells.map(([r, c]) => (
    cellKind(r, c) === 'event'
      ? { r, c, d: 'be', i: evIdx[ei++ % evIdx.length] }
      : { r, c, d: 'bw', i: twIdx[ti++ % twIdx.length] }
  ));
}

// "Today", "Yesterday", or a short date for the day-nav label.
export function dayLabel(dayNum, today = dayNumber()) {
  if (dayNum === today) return 'Today';
  if (dayNum === today - 1) return 'Yesterday';
  const d = new Date((dayNum * 86400000) + (new Date().getTimezoneOffset() * 60000));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default { dayNumber, dailyBoard, dayLabel };
