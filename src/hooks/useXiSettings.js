import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Per-user XI state (NOT authored deck content). Stored at
// users/{userId}/xiSettings/state. Holds:
//   excludedCards : string[]   - card ids the user hid via Curate
//   boardLayout   : { eventIds:[], twistIds:[] } - current board arrangement
//   dailyPair     : { eventId, twistId, date }   - current Card of the Day
//   pastPairs     : [{ eventId, twistId, date }] - recent daily pairs (newest first)
//   misses        : { [pairKey]: count }         - "I got nothing" tallies per pairing
const DEFAULT_SETTINGS = {
  excludedCards: [],
  boardLayout: null,
  dailyPair: null,
  pastPairs: [],
  misses: {},
};

export default function useXiSettings(userId) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    const ref = doc(db, 'users', userId, 'xiSettings', 'state');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...snap.data() });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
        setLoading(false);
      },
      (error) => {
        console.error('[useXiSettings] Error loading settings:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Merge a partial update into the settings document. Applies optimistically
  // to local state first so the UI updates instantly (and keeps working even if
  // the user is signed out or the write is rejected — e.g. before security
  // rules are deployed); the snapshot listener reconciles with the server when
  // the write succeeds.
  const update = useCallback(
    async (partial) => {
      setSettings((prev) => ({ ...prev, ...partial }));
      if (!userId) return;
      const ref = doc(db, 'users', userId, 'xiSettings', 'state');
      try {
        await setDoc(ref, partial, { merge: true });
      } catch (error) {
        console.error('[useXiSettings] Error saving settings:', error);
      }
    },
    [userId]
  );

  const setDailyPair = useCallback((dailyPair) => update({ dailyPair }), [update]);

  const pushPastPair = useCallback(
    (pair) => {
      const filtered = (settings.pastPairs || []).filter(
        (p) => !(p.eventId === pair.eventId && p.twistId === pair.twistId)
      );
      const next = [pair, ...filtered].slice(0, 30);
      return update({ pastPairs: next });
    },
    [update, settings.pastPairs]
  );

  const setBoardLayout = useCallback((boardLayout) => update({ boardLayout }), [update]);

  const toggleExcluded = useCallback(
    (cardId) => {
      const current = settings.excludedCards || [];
      const next = current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId];
      return update({ excludedCards: next });
    },
    [update, settings.excludedCards]
  );

  const recordMiss = useCallback(
    (key) => {
      const misses = { ...(settings.misses || {}) };
      misses[key] = (misses[key] || 0) + 1;
      return update({ misses });
    },
    [update, settings.misses]
  );

  return {
    settings,
    loading,
    update,
    setDailyPair,
    pushPastPair,
    setBoardLayout,
    toggleExcluded,
    recordMiss,
  };
}
