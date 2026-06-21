// useVersusGame — data layer for XI Versus games (Firestore, real-time).
//
// Mirrors the sharedBoards pattern: a random link id, an onSnapshot live
// subscription, and collaborative writes. Game logic lives in versusModel.js;
// this file only persists/loads it.

import { useEffect, useState } from 'react';
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { boardDeck } from '../xi/decks';
import { seedBoard, PLAYER_COLORS, canPlace, nextTurnIndex } from '../xi/versusModel';

export const HAND_SIZE = 5;
const gameRef = (gameId) => doc(db, 'versusGames', gameId);
const handRef = (gameId, uid) => doc(db, 'versusGames', gameId, 'hands', uid);

const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
function generateGameId() {
  let id = '';
  for (let i = 0; i < 8; i++) id += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  return id;
}

// Guests (anonymous auth) have no profile doc, so fall back to a name they
// typed in (stashed in localStorage by the join UI).
const guestName = () => {
  try { return (localStorage.getItem('xiVersusName') || '').trim(); } catch { return ''; }
};
const playerName = (profile) => (profile?.firstName || profile?.displayName || guestName() || 'Player');

// Create a new game seeded from the board deck; the creator is player 0.
export async function createVersusGame(user, profile) {
  if (!user?.uid) throw new Error('Sign in to start a Versus game.');
  const gameId = generateGameId();
  const { placed, drawPile } = seedBoard({
    be: boardDeck.events.length,
    bw: boardDeck.twists.length,
  });
  const creator = { uid: user.uid, name: playerName(profile), color: PLAYER_COLORS[0], order: 0 };

  await setDoc(doc(db, 'versusGames', gameId), {
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'active',
    players: [creator],
    currentTurnIndex: 0,
    placed,
    drawPile,
    stats: { [user.uid]: { placed: 0, stories: 0 } },
  });
  return gameId;
}

// Add the current user to a game if they're not already in it.
export async function joinVersusGame(gameId, user, profile) {
  if (!user?.uid) throw new Error('Sign in to join.');
  const ref = doc(db, 'versusGames', gameId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Game not found.');
  const data = snap.data();
  if ((data.players || []).some((p) => p.uid === user.uid)) return; // already joined

  const order = (data.players || []).length;
  const player = {
    uid: user.uid,
    name: playerName(profile),
    color: PLAYER_COLORS[order % PLAYER_COLORS.length],
    order,
  };
  await updateDoc(ref, {
    players: [...(data.players || []), player],
    [`stats.${user.uid}`]: { placed: 0, stories: 0 },
    updatedAt: serverTimestamp(),
  });
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

// Place a card from your hand at (r,c). Validates turn + legality, lays it with
// your colour, refills your hand by one, advances the turn — all atomically.
export async function placeCard(gameId, user, card, r, c) {
  if (!user?.uid) throw new Error('Sign in to play.');
  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gameRef(gameId));
    if (!gSnap.exists()) throw new Error('Game not found.');
    const g = gSnap.data();
    const players = g.players || [];
    if (players[g.currentTurnIndex]?.uid !== user.uid) throw new Error('Not your turn.');
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

    tx.update(gameRef(gameId), {
      placed,
      drawPile: pile.slice(draw.length),
      currentTurnIndex: nextTurnIndex(g.currentTurnIndex, players.length),
      stats,
      updatedAt: serverTimestamp(),
    });
    tx.set(handRef(gameId, user.uid), { cards: newHand });
  });
}

// Pass your turn (when you can't or don't want to place).
export async function passTurn(gameId, user) {
  if (!user?.uid) return;
  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gameRef(gameId));
    if (!gSnap.exists()) throw new Error('Game not found.');
    const g = gSnap.data();
    const players = g.players || [];
    if (players[g.currentTurnIndex]?.uid !== user.uid) throw new Error('Not your turn.');
    tx.update(gameRef(gameId), {
      currentTurnIndex: nextTurnIndex(g.currentTurnIndex, players.length),
      updatedAt: serverTimestamp(),
    });
  });
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
