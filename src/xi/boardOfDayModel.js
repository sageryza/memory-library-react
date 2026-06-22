// boardOfDayModel.js — deterministic daily "Board of the Day" generation.
//
// Each day everyone gets the SAME board: a connected, crossword-like cluster of
// cards on the 5×5 checkerboard with empty spaces around it. Because events sit
// on cream cells and twists on white ones, every orthogonal adjacency is an
// event×twist pairing — i.e. every touching pair is a valid "times i…" prompt.
//
// Boards are addressed by a day number, so past days can be revisited.

import { cellKind, neighbors, shuffle } from './versusModel.js';
import { pairScore } from './boardAffinity.js';

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

const keyOf = (r, c) => r + ',' + c;

// Grow a connected, crossword-like cluster of `targetCards` cells out from the
// centre, choosing random frontier cells. Deterministic for a given rand.
function growCluster(rand, targetCards) {
  const taken = new Set([keyOf(2, 2)]);
  const cells = [[2, 2]];
  let guard = 0;
  while (cells.length < targetCards && guard++ < 500) {
    const frontier = [];
    for (const [r, c] of cells) {
      for (const [a, b] of neighbors(r, c)) {
        if (!taken.has(keyOf(a, b))) frontier.push([a, b]);
      }
    }
    if (!frontier.length) break;
    const [r, c] = frontier[Math.floor(rand() * frontier.length)];
    if (taken.has(keyOf(r, c))) continue;
    taken.add(keyOf(r, c));
    cells.push([r, c]);
  }
  return cells;
}

// Breadth-first ordering of the cluster from the centre — used so the greedy
// card assignment always extends from already-placed neighbours.
function bfsOrder(cells) {
  const inSet = new Set(cells.map(([r, c]) => keyOf(r, c)));
  const seen = new Set([keyOf(2, 2)]);
  const queue = [[2, 2]];
  const order = [];
  while (queue.length) {
    const [r, c] = queue.shift();
    order.push([r, c]);
    for (const [a, b] of neighbors(r, c)) {
      const k = keyOf(a, b);
      if (inSet.has(k) && !seen.has(k)) { seen.add(k); queue.push([a, b]); }
    }
  }
  // Any cell BFS didn't reach (shouldn't happen — cluster is connected) tacked on.
  for (const [r, c] of cells) if (!seen.has(keyOf(r, c))) order.push([r, c]);
  return order;
}

// Lay event/twist cards onto the cluster so every adjacency is a strong prompt.
// Greedy placement in BFS order (each cell takes the unused card that best fits
// its already-placed neighbours) followed by a few same-kind swap passes that
// only keep swaps which raise the board's total affinity. Deterministic.
function smartAssign(cells, evCaps, twCaps, rand, allowedEv, allowedTw) {
  const candE = shuffle(allowedEv.slice(), rand);
  const candT = shuffle(allowedTw.slice(), rand);
  const scoreIdx = (ei, ti) => pairScore(evCaps[ei], twCaps[ti]);

  const assign = new Map(); // cellKey -> { d, i }
  const usedE = new Set();
  const usedT = new Set();
  for (const [r, c] of bfsOrder(cells)) {
    const isEvent = cellKind(r, c) === 'event';
    const pool = isEvent ? candE : candT;
    const used = isEvent ? usedE : usedT;
    const nbrs = neighbors(r, c).map(([a, b]) => assign.get(keyOf(a, b))).filter(Boolean);
    let best = null;
    let bestScore = -Infinity;
    for (const idx of pool) {
      if (used.has(idx)) continue;
      let s = 0;
      for (const nb of nbrs) s += isEvent ? scoreIdx(idx, nb.i) : scoreIdx(nb.i, idx);
      if (s > bestScore) { bestScore = s; best = idx; }
    }
    used.add(best);
    assign.set(keyOf(r, c), { d: isEvent ? 'be' : 'bw', i: best });
  }

  // Adjacency edges as [eventCellKey, twistCellKey] for total-score evaluation.
  const edges = [];
  for (const [r, c] of cells) {
    if (cellKind(r, c) !== 'event') continue;
    for (const [a, b] of neighbors(r, c)) {
      if (assign.has(keyOf(a, b)) && cellKind(a, b) === 'twist') edges.push([keyOf(r, c), keyOf(a, b)]);
    }
  }
  const total = () => edges.reduce((sum, [ek, tk]) => sum + scoreIdx(assign.get(ek).i, assign.get(tk).i), 0);

  // Same-kind swap passes: keep any swap that strictly improves the total.
  const cellKeys = cells.map(([r, c]) => keyOf(r, c));
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let x = 0; x < cellKeys.length; x++) {
      for (let y = x + 1; y < cellKeys.length; y++) {
        const A = assign.get(cellKeys[x]);
        const B = assign.get(cellKeys[y]);
        if (A.d !== B.d) continue;
        const before = total();
        const ai = A.i; A.i = B.i; B.i = ai;
        if (total() > before) improved = true;
        else { const t = A.i; A.i = B.i; B.i = t; } // revert
      }
    }
    if (!improved) break;
  }

  return cells.map(([r, c]) => ({ r, c, ...assign.get(keyOf(r, c)) }));
}

// Random assignment (the original behaviour) — used as a comparison baseline.
function randomAssign(cells, allowedEv, allowedTw, rand) {
  const evIdx = shuffle(allowedEv.slice(), rand);
  const twIdx = shuffle(allowedTw.slice(), rand);
  let ei = 0;
  let ti = 0;
  return cells.map(([r, c]) => (
    cellKind(r, c) === 'event'
      ? { r, c, d: 'be', i: evIdx[ei++ % evIdx.length] }
      : { r, c, d: 'bw', i: twIdx[ti++ % twIdx.length] }
  ));
}

// Build the deterministic board for a given day. Returns a flat placed[] of
// { r, c, d, i } — a connected blob of `targetCards` cards; the rest stay empty.
//
// `pools` may be card-caption arrays ({ events, twists }) to enable the
// affinity-aware layout, or just sizes ({ be, bw }) for the random baseline.
// `opts.random` forces the random baseline even when captions are available.
export function dailyBoard(dayNum, pools = {}, opts = {}) {
  const targetCards = opts.targetCards || 13;
  const rand = makeRng((dayNum + 1) * 0x9E3779B1);
  const cells = growCluster(rand, targetCards);

  const evCaps = pools.events;
  const twCaps = pools.twists;
  const haveCaps = Array.isArray(evCaps) && Array.isArray(twCaps) && evCaps.length && twCaps.length;
  const ne = haveCaps ? evCaps.length : (pools.be || pools.bw || 0);
  const nt = haveCaps ? twCaps.length : (pools.bw || pools.be || 0);

  // Event/twist pools can differ in size, and the caller may pass explicit
  // allowed-index lists (cards still in play after Curate removals + deck
  // toggles). Fall back to the full set per axis if too few remain to fill it.
  const evCells = cells.filter(([r, c]) => cellKind(r, c) === 'event').length;
  const twCells = cells.length - evCells;
  let allowedEv = Array.isArray(opts.allowedEv) ? opts.allowedEv : [...Array(ne).keys()];
  let allowedTw = Array.isArray(opts.allowedTw) ? opts.allowedTw : [...Array(nt).keys()];
  if (allowedEv.length < evCells) allowedEv = [...Array(ne).keys()];
  if (allowedTw.length < twCells) allowedTw = [...Array(nt).keys()];

  if (haveCaps && !opts.random) return smartAssign(cells, evCaps, twCaps, rand, allowedEv, allowedTw);
  return randomAssign(cells, allowedEv, allowedTw, rand);
}

// "Today", "Yesterday", or a short date for the day-nav label.
export function dayLabel(dayNum, today = dayNumber()) {
  if (dayNum === today) return 'Today';
  if (dayNum === today - 1) return 'Yesterday';
  const d = new Date((dayNum * 86400000) + (new Date().getTimezoneOffset() * 60000));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default { dayNumber, dailyBoard, dayLabel };
