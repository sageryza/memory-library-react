import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// The XI engine stores curation under xiSettings/state, mirrored to localStorage:
//   • excluded      : role-keyed removed cards ("ev:5", "tw:12")  [xi2_excluded]
//   • disabledDecks : deck ids toggled off in Curate              [xi2_disabledDecks]
// These helpers let the React board/versus screens honor the same choices.

function readSet(userId, key) {
  try {
    const v = JSON.parse(localStorage.getItem(`xi_${userId || 'anon'}_${key}`) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch { return new Set(); }
}

function readBool(userId, key) {
  try { return JSON.parse(localStorage.getItem(`xi_${userId || 'anon'}_${key}`) || 'false') === true; }
  catch { return false; }
}

export function readDeckFilter(userId) {
  return {
    excluded: readSet(userId, 'xi2_excluded'),
    disabledDecks: readSet(userId, 'xi2_disabledDecks'),
    loved: readSet(userId, 'xi2_loved'),
    lovedOn: readBool(userId, 'xi2_lovedOn'),
  };
}

// Indices of `cards` (boardDeck.events or .twists) still in play for `role`
// ('ev' | 'tw'): not removed (✕), and either in an enabled deck OR loved while
// the loved deck is on.
export function allowedIndices(cards, role, excluded, disabledDecks, loved, lovedOn) {
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    const key = `${role}:${i}`;
    if (excluded.has(key)) continue;
    const sourceOn = !disabledDecks.has(cards[i].deck);
    const lovedInPlay = lovedOn && loved && loved.has(key);
    if (sourceOn || lovedInPlay) out.push(i);
  }
  return out;
}

// React hook: the deck filter for this user — instant from localStorage, then
// refined from Firestore for signed-in users (so it works across devices).
export function useDeckFilter(userId) {
  const [state, setState] = useState(() => readDeckFilter(userId));
  useEffect(() => {
    setState(readDeckFilter(userId));
    if (!userId) return undefined;
    let alive = true;
    getDoc(doc(db, 'users', userId, 'xiSettings', 'state'))
      .then((s) => {
        if (!alive || !s.exists()) return;
        const d = s.data();
        setState({
          excluded: new Set(Array.isArray(d.excluded) ? d.excluded : []),
          disabledDecks: new Set(Array.isArray(d.disabledDecks) ? d.disabledDecks : []),
          loved: new Set(Array.isArray(d.loved) ? d.loved : []),
          lovedOn: d.lovedOn === true,
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  return state;
}

export default useDeckFilter;
