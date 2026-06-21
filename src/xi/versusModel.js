// versusModel.js — pure game logic for XI Versus (no Firebase, no DOM).
//
// Board: a 6×6 checkerboard. Event cards live on "cream" cells (where r+c is
// even), twist cards on "white" cells (r+c odd), so every orthogonal adjacency
// is an event×twist pairing — the same structure as solo Board mode.
//
// The board is stored as a FLAT list of placed cells (Firestore forbids nested
// arrays), each: { r, c, d:'be'|'bw', i, by, color }. Empty cells are omitted.

export const BR = 5;
export const BC = 5;

// Distinct, legible player colours, assigned by join order.
export const PLAYER_COLORS = [
  '#c0392b', // red
  '#2e86de', // blue
  '#27ae60', // green
  '#8e44ad', // purple
  '#e67e22', // orange
  '#16a085', // teal
  '#d81b60', // pink
  '#34495e', // slate
];

export const cellKind = (r, c) => ((r + c) % 2 === 0 ? 'event' : 'twist');
export const deckOf = (kind) => (kind === 'event' ? 'be' : 'bw'); // board pools
export const inBounds = (r, c) => r >= 0 && r < BR && c >= 0 && c < BC;

export function neighbors(r, c) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => inBounds(a, b));
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Seed a fresh board: one event at the centre (2,2 — an event cell on a 6×6)
// plus its four twist neighbours, drawn from the board pools. The rest of the
// pools become the shuffled draw pile. poolSizes = { be, bw }.
export function seedBoard(poolSizes, rng = Math.random) {
  const evIdx = shuffle([...Array(poolSizes.be).keys()], rng);
  const twIdx = shuffle([...Array(poolSizes.bw).keys()], rng);

  const cr = 2;
  const cc = 2;
  const placed = [{ r: cr, c: cc, d: 'be', i: evIdx[0], by: null, color: null }];
  neighbors(cr, cc).forEach((nb, k) => {
    placed.push({ r: nb[0], c: nb[1], d: 'bw', i: twIdx[k], by: null, color: null });
  });

  const pile = [];
  for (let k = 1; k < poolSizes.be; k++) pile.push({ d: 'be', i: evIdx[k] });
  for (let k = 4; k < poolSizes.bw; k++) pile.push({ d: 'bw', i: twIdx[k] });

  return { placed, drawPile: shuffle(pile, rng) };
}

export function gridFromPlaced(placed) {
  const g = Array.from({ length: BR }, () => Array(BC).fill(null));
  for (const p of (placed || [])) if (inBounds(p.r, p.c)) g[p.r][p.c] = p;
  return g;
}

// A card { d, i } may be placed at (r,c) when the cell is empty, its kind
// matches the card's pool, and it touches at least one already-placed card.
export function canPlace(placed, r, c, card) {
  if (!inBounds(r, c) || !card) return false;
  const g = gridFromPlaced(placed);
  if (g[r][c]) return false;
  if (deckOf(cellKind(r, c)) !== card.d) return false;
  return neighbors(r, c).some(([a, b]) => g[a][b]);
}

export function legalCells(placed, card) {
  const cells = [];
  for (let r = 0; r < BR; r++) {
    for (let c = 0; c < BC; c++) if (canPlace(placed, r, c, card)) cells.push([r, c]);
  }
  return cells;
}

// Every orthogonally-adjacent event×twist pairing currently on the board
// (each pair once), as [eventCell, twistCell] — the targets for a story.
export function adjacentPairs(placed) {
  const g = gridFromPlaced(placed);
  const pairs = [];
  for (let r = 0; r < BR; r++) {
    for (let c = 0; c < BC; c++) {
      const cell = g[r][c];
      if (!cell) continue;
      for (const [a, b] of [[r, c + 1], [r + 1, c]]) {
        if (inBounds(a, b) && g[a][b]) {
          const other = g[a][b];
          const ev = cell.d === 'be' ? cell : other;
          const tw = cell.d === 'bw' ? cell : other;
          if (ev.d === 'be' && tw.d === 'bw') pairs.push([ev, tw]);
        }
      }
    }
  }
  return pairs;
}

export function drawCards(drawPile, n) {
  return { taken: (drawPile || []).slice(0, n), rest: (drawPile || []).slice(n) };
}

export const nextTurnIndex = (current, playerCount) => (current + 1) % Math.max(playerCount || 1, 1);
export const isBoardFull = (placed) => (placed || []).length >= BR * BC;

export default {
  BR, BC, PLAYER_COLORS, cellKind, deckOf, inBounds, neighbors, shuffle,
  seedBoard, gridFromPlaced, canPlace, legalCells, adjacentPairs, drawCards,
  nextTurnIndex, isBoardFull,
};
