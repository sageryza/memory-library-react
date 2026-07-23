// useVersusGame — data layer for XI Versus games (Firestore, real-time).
//
// Mirrors the sharedBoards pattern: a random link id, an onSnapshot live
// subscription, and collaborative writes. Game logic lives in versusModel.js;
// this file only persists/loads it.

import { useEffect, useState } from 'react';
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, runTransaction,
  collection, addDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { boardDeck } from '../xi/decks';
import { seedBoard, PLAYER_COLORS, canPlace } from '../xi/versusModel';
import { buildXiMemoryDoc, pairKey, timesSentence } from '../xi/xiMemory';
import { readDeckFilter, allowedIndices } from '../xi/xiExcluded';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export const HAND_SIZE = 5;
const gameRef = (gameId) => doc(db, 'versusGames', gameId);
const handRef = (gameId, uid) => doc(db, 'versusGames', gameId, 'hands', uid);

// Round-based free-for-all: a move marks you "done" for the round; once everyone
// has moved, the round resets and all may move again. Returns the game-doc
// updates that record this player's completed move.
function withMoveComplete(g, uid, updates) {
  const acted = Array.isArray(g.acted) ? g.acted.slice() : [];
  if (!acted.includes(uid)) acted.push(uid);
  const allUids = (g.players || []).map((p) => p.uid);
  const allDone = allUids.length > 0 && allUids.every((u) => acted.includes(u));
  return allDone
    ? { ...updates, acted: [], round: (g.round || 0) + 1, placedBy: [] }
    : { ...updates, acted };
}

const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
function generateGameId() {
  let id = '';
  for (let i = 0; i < 8; i++) id += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  return id;
}

// Remember games you're in (per-device) so you can resume / switch between
// several at once. Newest first, capped, stored in localStorage.
const GAMES_KEY = 'xiVersusGames';
export function listVersusGames() {
  try {
    const arr = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function rememberVersusGame(id, label) {
  if (!id) return;
  try {
    const arr = listVersusGames().filter((g) => g.id !== id);
    arr.unshift({ id, label: label || '', ts: Date.now() });
    localStorage.setItem(GAMES_KEY, JSON.stringify(arr.slice(0, 12)));
  } catch { /* ignore */ }
}

// The last game you were actually viewing — so the Versus nav icon can drop you
// straight back in instead of always showing the lobby.
const LAST_KEY = 'xiVersusLast';
export function getLastVersusGame() {
  try { return localStorage.getItem(LAST_KEY) || ''; } catch { return ''; }
}
export function setLastVersusGame(id) {
  try { if (id) localStorage.setItem(LAST_KEY, id); } catch { /* ignore */ }
}
export function clearLastVersusGame() {
  try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ }
}

// Guests (anonymous auth) have no profile doc, so fall back to a name they
// typed in (stashed in localStorage by the join UI).
const guestName = () => {
  try { return (localStorage.getItem('xiVersusName') || '').trim(); } catch { return ''; }
};
const playerName = (profile) => (profile?.firstName || profile?.displayName || guestName() || 'Player');

// Games created before the waiting room have no status field — treat them as
// already active (playable, but locked to their players like any started game).
const statusOf = (g) => (g && g.status) || 'active';

// Moves are blocked until the creator begins the game (waiting -> active).
function assertStarted(g) {
  if (statusOf(g) === 'waiting') throw new Error("The game hasn't started yet.");
}

// Create a new game seeded from the board deck; the creator is player 0. The
// deck honors the creator's Curate removals (a curated game for everyone in it).
export async function createVersusGame(user, profile, expectedPlayers = 2, invites = []) {
  if (!user?.uid) throw new Error('Sign in to start a Versus game.');
  const gameId = generateGameId();
  const { excluded, disabledDecks, loved, lovedOn } = readDeckFilter(user.uid);
  const beAll = allowedIndices(boardDeck.events, 'ev', excluded, disabledDecks, loved, lovedOn);
  const bwAll = allowedIndices(boardDeck.twists, 'tw', excluded, disabledDecks, loved, lovedOn);
  const { placed, drawPile } = seedBoard({
    be: beAll.length >= 6 ? beAll : boardDeck.events.length, // keep enough to seed + draw
    bw: bwAll.length >= 6 ? bwAll : boardDeck.twists.length,
  });
  const creator = { uid: user.uid, name: playerName(profile), color: PLAYER_COLORS[0], order: 0 };

  await setDoc(doc(db, 'versusGames', gameId), {
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'waiting',
    // The game starts AUTOMATICALLY, for everyone at once, when this many
    // players have joined (creator included). Tracked invites carry a unique
    // link token each, so the waiting room shows exactly who's in.
    expectedPlayers: Math.max(2, expectedPlayers),
    invites: invites.map((i) => ({ token: i.token, name: i.name || '' })),
    players: [creator],
    round: 0,
    acted: [],
    placedBy: [],
    placed,
    drawPile,
    stats: { [user.uid]: { placed: 0, stories: 0 } },
  });
  rememberVersusGame(gameId);
  return gameId;
}

// Add the current user to a game if they're not already in it. New players can
// only come in while the game is still waiting; once it's active it's locked to
// its players (existing players may always re-enter).
export async function joinVersusGame(gameId, user, profile, inviteToken = null) {
  if (!user?.uid) throw new Error('Sign in to join.');
  const ref = doc(db, 'versusGames', gameId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Game not found.');
  const data = snap.data();
  if ((data.players || []).some((p) => p.uid === user.uid)) { // already joined
    rememberVersusGame(gameId);
    return;
  }
  if (statusOf(data) !== 'waiting') {
    throw new Error("This game has already started — it's locked to its players.");
  }
  rememberVersusGame(gameId);

  const order = (data.players || []).length;
  const player = {
    uid: user.uid,
    name: playerName(profile),
    color: PLAYER_COLORS[order % PLAYER_COLORS.length],
    order,
  };
  const update = {
    players: [...(data.players || []), player],
    [`stats.${user.uid}`]: { placed: 0, stories: 0 },
    updatedAt: serverTimestamp(),
  };
  // Tracked invite: mark this seat claimed so the waiting room shows who's in.
  if (inviteToken) {
    const invites = [...(data.invites || [])];
    const i = invites.findIndex((x) => x.token === inviteToken && !x.claimedBy);
    if (i >= 0) { invites[i] = { ...invites[i], claimedBy: user.uid }; update.invites = invites; }
  }
  // Roster complete → the game begins for everyone at this instant.
  const expected = Math.max(2, data.expectedPlayers || 2);
  if ((data.players || []).length + 1 >= expected) update.status = 'active';
  await updateDoc(ref, update);
}

// One-shot summaries for the lobby list. For each remembered game id: its
// status, the OTHER players' names, whether it's your move, and recency.
// Docs that don't exist (or can't be read) are skipped.
export async function fetchGamesSummary(ids, uid) {
  const snaps = await Promise.all(
    (ids || []).map((id) => getDoc(gameRef(id)).catch(() => null)),
  );
  const out = [];
  snaps.forEach((snap, k) => {
    if (!snap || !snap.exists()) return;
    const g = snap.data();
    const status = statusOf(g);
    out.push({
      id: ids[k],
      status,
      players: (g.players || []).filter((p) => p.uid !== uid).map((p) => p.name),
      yourTurn: status === 'active' && !(g.acted || []).includes(uid),
      updatedAtMillis: g.updatedAt?.toMillis?.() || 0,
    });
  });
  return out;
}

// Top up a player's hidden hand to HAND_SIZE from the shared draw pile.
// Idempotent — a no-op once the hand is full or the pile is empty.
export async function ensureHand(gameId, uid) {
  if (!gameId || !uid) return;
  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gameRef(gameId));
    if (!gSnap.exists()) return;
    const hSnap = await tx.get(handRef(gameId, uid));
    const cards = hSnap.exists() ? (hSnap.data().cards || []) : [];
    if (cards.length >= HAND_SIZE) return;
    const pile = gSnap.data().drawPile || [];
    const take = pile.slice(0, HAND_SIZE - cards.length);
    if (!take.length && hSnap.exists()) return;
    tx.update(gameRef(gameId), { drawPile: pile.slice(take.length), updatedAt: serverTimestamp() });
    tx.set(handRef(gameId, uid), { cards: [...cards, ...take] });
  });
}

// Place ONE card from your hand at (r,c) as your move this round. Validates you
// haven't gone yet + the spot is legal, lays it with your colour, refills your
// hand, and marks you done for the round.
export async function placeCard(gameId, user, card, r, c) {
  if (!user?.uid) throw new Error('Sign in to play.');
  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gameRef(gameId));
    if (!gSnap.exists()) throw new Error('Game not found.');
    const g = gSnap.data();
    assertStarted(g);
    const players = g.players || [];
    if (!players.some((p) => p.uid === user.uid)) throw new Error('Join the game first.');
    if ((g.acted || []).includes(user.uid)) throw new Error('You’ve already gone this round — wait for the others.');
    if ((g.placedBy || []).includes(user.uid)) throw new Error('You’ve already placed — write its story to finish your move.');
    if (!canPlace(g.placed || [], r, c, card)) throw new Error('That spot isn’t legal.');

    const hSnap = await tx.get(handRef(gameId, user.uid));
    const cards = hSnap.exists() ? (hSnap.data().cards || []) : [];
    const idx = cards.findIndex((k) => k.d === card.d && k.i === card.i);
    if (idx < 0) throw new Error('That card isn’t in your hand.');

    const me = players.find((p) => p.uid === user.uid);
    const placed = [...(g.placed || []), { r, c, d: card.d, i: card.i, by: user.uid, color: me?.color || null }];

    const pile = g.drawPile || [];
    const draw = pile.slice(0, 1);
    const newHand = [...cards.slice(0, idx), ...cards.slice(idx + 1), ...draw];

    const stats = { ...(g.stats || {}) };
    const mine = stats[user.uid] || { placed: 0, stories: 0 };
    stats[user.uid] = { ...mine, placed: (mine.placed || 0) + 1 };

    // Placing does NOT end your move — you owe a story about it. Mark that you've
    // placed this round (so you can't place twice); writing the story completes it.
    tx.update(gameRef(gameId), {
      placed,
      drawPile: pile.slice(draw.length),
      stats,
      placedBy: [...(g.placedBy || []), user.uid],
      updatedAt: serverTimestamp(),
    });
    tx.set(handRef(gameId, user.uid), { cards: newHand });
  });
}

// Undo your most recent card placement — as long as it's still the last card on
// the board (no one has built on top of it). Returns the card to your hand,
// rolls back your stat, and lets you act again this round. Stories aren't undone.
export async function undoLastMove(gameId, user) {
  if (!user?.uid) throw new Error('Sign in first.');
  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gameRef(gameId));
    if (!gSnap.exists()) throw new Error('Game not found.');
    const g = gSnap.data();
    assertStarted(g);
    const placed = g.placed || [];
    const last = placed[placed.length - 1];
    if (!last || last.by !== user.uid) throw new Error('Nothing of yours to undo.');

    const hSnap = await tx.get(handRef(gameId, user.uid));
    const cards = hSnap.exists() ? (hSnap.data().cards || []) : [];
    const card = { d: last.d, i: last.i };
    let drawPile = g.drawPile || [];
    let newHand = cards;
    // Return the card to your hand; if it's full, slide it back onto the pile.
    if (cards.length < HAND_SIZE) newHand = [...cards, card];
    else drawPile = [card, ...drawPile];

    const stats = { ...(g.stats || {}) };
    const mine = stats[user.uid] || { placed: 0, stories: 0 };
    stats[user.uid] = { ...mine, placed: Math.max(0, (mine.placed || 0) - 1) };

    tx.update(gameRef(gameId), {
      placed: placed.slice(0, -1),
      drawPile,
      stats,
      acted: (g.acted || []).filter((u) => u !== user.uid),
      placedBy: (g.placedBy || []).filter((u) => u !== user.uid),
      updatedAt: serverTimestamp(),
    });
    tx.set(handRef(gameId, user.uid), { cards: newHand });
  });
}

// Skip your move for this round (counts as having gone).
export async function skipTurn(gameId, user) {
  if (!user?.uid) return;
  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gameRef(gameId));
    if (!gSnap.exists()) return;
    const g = gSnap.data();
    assertStarted(g);
    if (!(g.players || []).some((p) => p.uid === user.uid)) return;
    if ((g.acted || []).includes(user.uid)) return;
    tx.update(gameRef(gameId), withMoveComplete(g, user.uid, { updatedAt: serverTimestamp() }));
  });
}

// Write a story on a pairing (two adjacent placed cells, event×twist) as your
// move this round. Records it in the game (shown live, with attribution) AND in
// the author's own archive as a versus memory, and bumps the stories stat.
export async function writeStory(gameId, user, cells, text) {
  if (!user?.uid) throw new Error('Sign in to write.');
  const t = (text || '').trim();
  if (!t) return;
  const evCell = (cells || []).find((x) => x.d === 'be');
  const twCell = (cells || []).find((x) => x.d === 'bw');
  const evCard = evCell ? boardDeck.events[evCell.i] : null;
  const twCard = twCell ? boardDeck.twists[twCell.i] : null;
  const event = evCard ? { id: evCard.id, cap: evCard.cap } : null;
  const twist = twCard ? { id: twCard.id, cap: twCard.cap } : null;
  const pk = pairKey(event, twist);

  const info = await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gameRef(gameId));
    if (!gSnap.exists()) throw new Error('Game not found.');
    const g = gSnap.data();
    assertStarted(g);
    const players = g.players || [];
    if (!players.some((p) => p.uid === user.uid)) throw new Error('Join the game first.');
    if ((g.acted || []).includes(user.uid)) throw new Error('You’ve already gone this round — wait for the others.');
    const me = players.find((p) => p.uid === user.uid) || {};
    const stats = { ...(g.stats || {}) };
    const mine = stats[user.uid] || { placed: 0, stories: 0 };
    stats[user.uid] = { ...mine, stories: (mine.stories || 0) + 1 };
    // Writing the story completes your move (and clears any owed-story flag).
    tx.update(gameRef(gameId), withMoveComplete(g, user.uid, {
      stats,
      placedBy: (g.placedBy || []).filter((u) => u !== user.uid),
      updatedAt: serverTimestamp(),
    }));
    return { name: me.name || 'Player', color: me.color || null };
  });

  // Live, shared record in the game (with author attribution).
  await addDoc(collection(db, 'versusGames', gameId, 'stories'), {
    byUid: user.uid, byName: info.name, color: info.color, pairKey: pk,
    eventCap: event?.cap || '', twistCap: twist?.cap || '', text: t, ts: Date.now(),
  });
  // The author's own copy in their archive (tagged versus).
  try {
    const memRef = await addDoc(collection(db, 'users', user.uid, 'memories'), {
      ...buildXiMemoryDoc({ text: t, event, twist, mode: 'versus' }),
      title: timesSentence(event, twist),
      gameId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // "Stories I tell": Versus stories are public by default — people have
    // stories they tell. Publishing routes through the publishMemory AI
    // safety screen; the synced versusPublic setting (absent = on) opts out.
    try {
      const st = await getDoc(doc(db, 'users', user.uid, 'xiSettings', 'state'));
      if (!st.exists() || st.data().versusPublic !== false) {
        httpsCallable(functions, 'publishMemory')({ memoryId: memRef.id, visibility: 'public' })
          .catch(() => {});
      }
    } catch (e) { /* publish is best-effort */ }
  } catch (e) { console.error('[Versus] archive save failed:', e); }
}

// Live subscription to a game's stories (newest first).
export function useStories(gameId) {
  const [stories, setStories] = useState([]);
  useEffect(() => {
    if (!gameId) { setStories([]); return undefined; }
    const q = query(collection(db, 'versusGames', gameId, 'stories'), orderBy('ts', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => setStories(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setStories([]),
    );
    return unsub;
  }, [gameId]);
  return stories;
}

// Live subscription to MY hidden hand (rules allow only the owner to read).
export function useHand(gameId, uid) {
  const [hand, setHand] = useState([]);
  useEffect(() => {
    if (!gameId || !uid) { setHand([]); return undefined; }
    const unsub = onSnapshot(
      handRef(gameId, uid),
      (snap) => setHand(snap.exists() ? (snap.data().cards || []) : []),
      () => setHand([]),
    );
    return unsub;
  }, [gameId, uid]);
  return hand;
}

// Live subscription to a single game.
export function useVersusGame(gameId) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId) { setLoading(false); return undefined; }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'versusGames', gameId),
      (snap) => {
        if (snap.exists()) { setGame({ id: snap.id, ...snap.data() }); setError(null); }
        else { setGame(null); setError('not-found'); }
        setLoading(false);
      },
      (e) => { setError(e.code || 'error'); setLoading(false); },
    );
    return unsub;
  }, [gameId]);

  return { game, loading, error };
}

export default useVersusGame;
