// Per-user deck of AI-generated cards. Stored as plain phrases in Firestore
// (users/{uid}/xiSettings/generated, field `cards: [{ id, cap }]`) — no images,
// to stay tiny; the card art is rendered locally on load.

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { renderTextCard } from '../xi/renderTextCard';

const genId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function useGeneratedCards(userId) {
  const [cards, setCards] = useState([]); // { id, cap, img }
  const [loading, setLoading] = useState(true);

  const ref = useCallback(
    () => (userId ? doc(db, 'users', userId, 'xiSettings', 'generated') : null),
    [userId]
  );

  useEffect(() => {
    let alive = true;
    const r = ref();
    if (!r) { setCards([]); setLoading(false); return undefined; }
    setLoading(true);
    getDoc(r)
      .then((snap) => {
        if (!alive) return;
        const raw = (snap.exists() && Array.isArray(snap.data().cards)) ? snap.data().cards : [];
        setCards(raw.map((c) => ({ id: c.id, cap: c.cap, img: renderTextCard(c.cap) })));
      })
      .catch(() => { if (alive) setCards([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ref]);

  // Add accepted phrases (deduped against existing captions). Returns the new list.
  const addCards = useCallback(async (phrases) => {
    const r = ref();
    const have = new Set(cards.map((c) => c.cap.toLowerCase()));
    const fresh = (phrases || [])
      .map((p) => String(p || '').trim())
      .filter((p) => p && !have.has(p.toLowerCase()))
      .map((cap) => ({ id: genId(), cap, img: renderTextCard(cap) }));
    if (!fresh.length) return cards;
    const next = [...cards, ...fresh];
    setCards(next);
    if (r) {
      try {
        await setDoc(r, { cards: next.map((c) => ({ id: c.id, cap: c.cap })) }, { merge: true });
      } catch (e) { console.error('[XI] save generated cards failed', e); }
    }
    return next;
  }, [cards, ref]);

  const removeCard = useCallback(async (id) => {
    const r = ref();
    const next = cards.filter((c) => c.id !== id);
    setCards(next);
    if (r) {
      try { await setDoc(r, { cards: next.map((c) => ({ id: c.id, cap: c.cap })) }, { merge: true }); }
      catch (e) { console.error('[XI] remove generated card failed', e); }
    }
  }, [cards, ref]);

  return { cards, loading, addCards, removeCard };
}

export default useGeneratedCards;
