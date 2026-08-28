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
  // Constellations: arrays of memory ids strung together with red string,
  // drawn pin to pin in chain order. Stored beside the pins.
  const [strings, setStringsRaw] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const latest = useRef({ pins: [], strings: [] });
  const dirty = useRef(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (userId) {
        try {
          const snap = await getDoc(doc(db, 'users', userId, 'preferences', 'shoebox'));
          if (dead) return;
          const d = snap.exists() ? snap.data() : {};
          const p = Array.isArray(d.pins) ? d.pins : [];
          const s = Array.isArray(d.strings) ? d.strings : [];
          latest.current = { pins: p, strings: s };
          setPinsRaw(p);
          setStringsRaw(s);
          setLoaded(true);
          return;
        } catch (e) {
          console.warn('shoebox: load failed', e);
        }
      }
      try {
        const p = JSON.parse(window.localStorage.getItem('shoeboxPins') || '[]');
        const s = JSON.parse(window.localStorage.getItem('shoeboxStrings') || '[]');
        if (!dead) { latest.current = { pins: p, strings: s }; setPinsRaw(p); setStringsRaw(s); }
      } catch {
        if (!dead) setPinsRaw([]);
      }
      if (!dead) setLoaded(true);
    })();
    return () => { dead = true; };
  }, [userId]);

  const write = useCallback((cur) => {
    dirty.current = false;
    if (userId) {
      setDoc(
        doc(db, 'users', userId, 'preferences', 'shoebox'),
        { pins: cur.pins, strings: cur.strings, updatedAt: serverTimestamp() },
        { merge: true },
      ).catch((e) => console.warn('shoebox: save failed', e));
    } else {
      try {
        window.localStorage.setItem('shoeboxPins', JSON.stringify(cur.pins));
        window.localStorage.setItem('shoeboxStrings', JSON.stringify(cur.strings));
      } catch { /* ignore */ }
    }
  }, [userId]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => write(latest.current), 700);
  }, [write]);

  // Every update saves, debounced so a drag doesn't write per-move.
  const setPins = useCallback((next) => {
    const p = typeof next === 'function' ? next(latest.current.pins) : next;
    latest.current = { ...latest.current, pins: p };
    setPinsRaw(p);
    scheduleSave();
  }, [scheduleSave]);

  const setStrings = useCallback((next) => {
    const s = typeof next === 'function' ? next(latest.current.strings) : next;
    latest.current = { ...latest.current, strings: s };
    setStringsRaw(s);
    scheduleSave();
  }, [scheduleSave]);

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

  return { pins, strings, setPins, setStrings, loaded };
}
