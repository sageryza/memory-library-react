import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Shoebox state: MULTIPLE boards, each its own corkboard — pins (where each
// memory sits and its play order), strings (constellations, {ids:[...]} —
// Firestore forbids nested arrays), and the board's own canvas size. New
// boards are PORTRAIT (phone-shaped); the original board was landscape. A
// board also carries its own PAPER (`bg` — cork, star paper): the picker
// lives in the Boards sheet and every board keeps its own.
// Everything lives in ONE doc, users/{uid}/preferences/shoebox (the
// preferences subcollection is already owner read/write in firestore.rules):
// { boards: [{id, name, w, h, pins, strings}], current, pins, strings }
// — the top-level pins/strings MIRROR the current board so an older cached
// page still renders. localStorage mirrors the same shape signed out.

const newId = () => Math.random().toString(36).slice(2, 8);
export const PORTRAIT = { w: 1600, h: 2600 };
const LEGACY = { w: 2600, h: 1700 };
const chainIds = (c) => (c && c.ids) || (Array.isArray(c) ? c : []);

const normBoard = (b) => ({
  id: b.id || newId(),
  name: String(b.name || 'Board').slice(0, 60),
  w: Number(b.w) > 0 ? Number(b.w) : LEGACY.w,
  h: Number(b.h) > 0 ? Number(b.h) : LEGACY.h,
  pins: Array.isArray(b.pins) ? b.pins : [],
  // The paper is just a stored id — which papers exist is the page's
  // business (papers.js), so an id this build doesn't know survives a
  // round trip instead of being erased by an older page.
  bg: typeof b.bg === 'string' && b.bg ? b.bg.slice(0, 20) : 'cork',
  strings: (Array.isArray(b.strings) ? b.strings : []).map((c) => ({ ids: chainIds(c) })),
});

// Accept every shape this doc has ever had: the multi-board one, and the
// original single-board {pins, strings}.
const fromRaw = (d) => {
  if (d && Array.isArray(d.boards) && d.boards.length) {
    const boards = d.boards.map(normBoard);
    const current = boards.some((b) => b.id === d.current) ? d.current : boards[0].id;
    return { boards, current };
  }
  const legacy = normBoard({
    id: 'b1', name: 'Memories', ...LEGACY,
    pins: d && d.pins, strings: d && d.strings,
  });
  return { boards: [legacy], current: legacy.id };
};

export default function useShoeboxState(userId) {
  const [state, setState] = useState({ boards: [], current: '' });
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const latest = useRef(state);
  const dirty = useRef(false);
  const timer = useRef(null);
  // A signed-in load that FAILED must never let a later save clobber the
  // real boards with the blank default — writes stay blocked until a load
  // succeeds (found live: an empty landscape board on a doc that was fine).
  const blocked = useRef(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (userId) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const snap = await getDoc(doc(db, 'users', userId, 'preferences', 'shoebox'));
            if (dead) return;
            const st = fromRaw(snap.exists() ? snap.data() : null);
            blocked.current = false;
            latest.current = st;
            setState(st);
            setLoadFailed(false);
            setLoaded(true);
            return;
          } catch (e) {
            console.warn('shoebox: load failed', e);
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            if (dead) return;
          }
        }
        // Signed in but unreadable: show the blank default read-only rather
        // than falling through to this device's signed-out pile.
        blocked.current = true;
        if (!dead) { setLoadFailed(true); setLoaded(true); }
        return;
      }
      let st = null;
      try {
        const raw = window.localStorage.getItem('shoeboxData');
        if (raw) st = fromRaw(JSON.parse(raw));
      } catch { /* ignore */ }
      if (!st) {
        try {
          st = fromRaw({
            pins: JSON.parse(window.localStorage.getItem('shoeboxPins') || '[]'),
            strings: JSON.parse(window.localStorage.getItem('shoeboxStrings') || '[]'),
          });
        } catch { st = fromRaw(null); }
      }
      if (!dead) { blocked.current = false; latest.current = st; setState(st); setLoaded(true); }
    })();
    return () => { dead = true; };
  }, [userId]);

  const write = useCallback((st) => {
    dirty.current = false;
    if (blocked.current) {
      console.warn('shoebox: not saving — the boards never loaded');
      return;
    }
    const cur = st.boards.find((b) => b.id === st.current) || st.boards[0] || { pins: [], strings: [] };
    if (userId) {
      setDoc(doc(db, 'users', userId, 'preferences', 'shoebox'), {
        boards: st.boards,
        current: st.current,
        pins: cur.pins,       // mirror for older cached pages
        strings: cur.strings, // mirror for older cached pages
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch((e) => console.warn('shoebox: save failed', e));
    } else {
      try {
        window.localStorage.setItem('shoeboxData', JSON.stringify({ boards: st.boards, current: st.current }));
        window.localStorage.setItem('shoeboxPins', JSON.stringify(cur.pins));
        window.localStorage.setItem('shoeboxStrings', JSON.stringify(cur.strings));
      } catch { /* ignore */ }
    }
  }, [userId]);

  const update = useCallback((fn) => {
    const st = fn(latest.current);
    if (!st || st === latest.current) return;
    latest.current = st;
    dirty.current = true;
    setState(st);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => write(st), 700);
  }, [write]);

  // A pending save survives her leaving the page mid-debounce.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      clearTimeout(timer.current);
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

  const board = state.boards.find((b) => b.id === state.current)
    || state.boards[0]
    || normBoard({ id: 'b1', name: 'Memories', ...LEGACY });

  const patchBoard = useCallback((patch) => update((st) => ({
    ...st,
    boards: st.boards.map((b) => (b.id === st.current ? { ...b, ...patch(b) } : b)),
  })), [update]);

  const setPins = useCallback((next) => patchBoard((b) => ({
    pins: typeof next === 'function' ? next(b.pins) : next,
  })), [patchBoard]);

  const setStrings = useCallback((next) => patchBoard((b) => ({
    strings: typeof next === 'function' ? next(b.strings) : next,
  })), [patchBoard]);

  // Paper is set from the Boards sheet, where every board's swatches are on
  // screen at once — so it names its board rather than patching the current
  // one.
  const setBoardPaper = useCallback((boardId, id) => update((st) => ({
    ...st,
    boards: st.boards.map((b) => (b.id === boardId ? { ...b, bg: String(id || 'cork').slice(0, 20) } : b)),
  })), [update]);

  const selectBoard = useCallback((id) => update((st) => (
    st.boards.some((b) => b.id === id) ? { ...st, current: id } : st
  )), [update]);

  const createBoard = useCallback((name) => {
    const b = normBoard({ id: newId(), name: name || `Board ${latest.current.boards.length + 1}`, ...PORTRAIT });
    update((st) => ({ ...st, boards: [...st.boards, b], current: b.id }));
    return b.id;
  }, [update]);

  const deleteBoard = useCallback((id) => update((st) => {
    if (st.boards.length <= 1) return st;
    const boards = st.boards.filter((b) => b.id !== id);
    return { ...st, boards, current: st.current === id ? boards[0].id : st.current };
  }), [update]);

  return {
    boards: state.boards, current: state.current, board,
    pins: board.pins, strings: board.strings,
    setPins, setStrings, setBoardPaper,
    selectBoard, createBoard, deleteBoard, loaded, loadFailed,
  };
}
