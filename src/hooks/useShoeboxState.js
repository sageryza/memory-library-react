import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Shoebox board state: which memories are pinned to the corkboard, where each
// one sits, and its place in the play order. Stored at
// users/{uid}/preferences/shoebox (the preferences subcollection is already
// owner read/write in firestore.rules, so no rules change is needed) with a
// localStorage fallback for signed-out use. A pin is
// { id: memoryId, x, y, seq: number|null }.
export default function useShoeboxState(userId) {
  const [pins, setPinsRaw] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const latest = useRef([]);
  const dirty = useRef(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (userId) {
        try {
          const snap = await getDoc(doc(db, 'users', userId, 'preferences', 'shoebox'));
          if (dead) return;
          const p = (snap.exists() && Array.isArray(snap.data().pins)) ? snap.data().pins : [];
          latest.current = p;
          setPinsRaw(p);
          setLoaded(true);
          return;
        } catch (e) {
          console.warn('shoebox: load failed', e);
        }
      }
      try {
        const raw = window.localStorage.getItem('shoeboxPins');
        const p = raw ? JSON.parse(raw) : [];
        if (!dead) { latest.current = p; setPinsRaw(p); }
      } catch {
        if (!dead) setPinsRaw([]);
      }
      if (!dead) setLoaded(true);
    })();
    return () => { dead = true; };
  }, [userId]);

  const write = useCallback((p) => {
    dirty.current = false;
    if (userId) {
      setDoc(
        doc(db, 'users', userId, 'preferences', 'shoebox'),
        { pins: p, updatedAt: serverTimestamp() },
        { merge: true },
      ).catch((e) => console.warn('shoebox: save failed', e));
    } else {
      try { window.localStorage.setItem('shoeboxPins', JSON.stringify(p)); } catch { /* ignore */ }
    }
  }, [userId]);

  // Every update saves, debounced so a drag doesn't write per-move.
  const setPins = useCallback((next) => {
    const p = typeof next === 'function' ? next(latest.current) : next;
    latest.current = p;
    dirty.current = true;
    setPinsRaw(p);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => write(p), 700);
  }, [write]);

  // A pending save must survive her leaving the page mid-debounce.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      clearTimeout(saveTimer.current);
      write(latest.current);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [write]);

  return { pins, setPins, loaded };
}
