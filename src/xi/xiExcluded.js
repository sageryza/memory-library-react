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

export function readDeckFilter(userId) {
  return {
    excluded: readSet(userId, 'xi2_excluded'),
    disabledDecks: readSet(userId, 'xi2_disabledDecks'),
  };
}

// Indices of `cards` (boardDeck.events or .twists) still in play for `role`
// ('ev' | 'tw') — neither removed (✕) nor in a disabled deck.
export function allowedIndices(cards, role, excluded, disabledDecks) {
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    if (excluded.has(`${role}:${i}`)) continue;
    if (disabledDecks.has(cards[i].deck)) continue;
    out.push(i);
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
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  return state;
}

export default useDeckFilter;
