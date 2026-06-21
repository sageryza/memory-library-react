// useVersusGame — data layer for XI Versus games (Firestore, real-time).
//
// Mirrors the sharedBoards pattern: a random link id, an onSnapshot live
// subscription, and collaborative writes. Game logic lives in versusModel.js;
// this file only persists/loads it.

import { useEffect, useState } from 'react';
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { boardDeck } from '../xi/decks';
import { seedBoard, PLAYER_COLORS } from '../xi/versusModel';

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
