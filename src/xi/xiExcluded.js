import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// The XI engine stores a user's removed (✕'d) card indices under
// xiSettings/state.excluded, mirrored to localStorage as xi_<uid>_xi2_excluded.
// These helpers let the React board/versus screens honor the same choices.

export function readExcludedSet(userId) {
  try {
    const v = JSON.parse(localStorage.getItem(`xi_${userId || 'anon'}_xi2_excluded`) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch { return new Set(); }
}

// React hook: excluded indices for this user — instant from localStorage, then
// refined from Firestore for signed-in users (so it works across devices).
export function useXiExcluded(userId) {
  const [excluded, setExcluded] = useState(() => readExcludedSet(userId));
  useEffect(() => {
    setExcluded(readExcludedSet(userId));
    if (!userId) return undefined;
    let alive = true;
    getDoc(doc(db, 'users', userId, 'xiSettings', 'state'))
      .then((s) => { if (alive && s.exists() && Array.isArray(s.data().excluded)) setExcluded(new Set(s.data().excluded)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  return excluded;
}

export default useXiExcluded;
