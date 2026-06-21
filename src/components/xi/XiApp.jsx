import React, { useEffect, useRef, useReducer, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dailyDeck, boardDeck } from '../../xi/decks';
import { initXi } from '../../xi/xiEngine';
import { makeXiStorage } from '../../xi/xiStorage';
import { XI_MARKUP } from './xiMarkup';
import './XiApp.css';

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// --- TEMPORARY on-device diagnostics -------------------------------------
// Module-level so the log survives a remount of <XiApp/> (which is exactly the
// thing we're trying to detect). Renders a small overlay; remove once the
// save→Card-of-the-Day bounce is understood.
let mountSeq = 0;
const dbgLog = [];
function pushDbg(msg) {
  const t = new Date().toISOString().slice(11, 23);
  dbgLog.push(t + ' ' + msg);
  while (dbgLog.length > 14) dbgLog.shift();
}
function probeLocalStorage() {
  try {
    const k = '__xi_probe__';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok ? 'ok' : 'readback-fail';
  } catch (e) {
    return 'FAIL:' + (e && e.name);
  }
}

// XI — the standalone app, ported in faithfully. The exact markup is injected
// as raw HTML and the original game engine drives it; only the storage layer is
// swapped so memories persist to the shared archive (Firestore) and the
// bottom-nav "Library" button opens the real archive.
//
// Deck pools map straight onto the engine's four pools:
//   ev/tw = daily deck events/twists, be/bw = board deck events/twists.
export default function XiApp({ memories = [], addMemory, userId }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const engineRef = useRef(null);
  // Keep the latest memories accessible to the (mount-once) engine/adapter.
  const memoriesRef = useRef(memories);
  memoriesRef.current = memories;

  const [, force] = useReducer((c) => c + 1, 0);
  const log = useCallback((msg) => { pushDbg(msg); force(); }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Inject the engine markup ONCE, imperatively. Using dangerouslySetInnerHTML
    // lets React re-apply the markup on later re-renders (e.g. the diagnostics
    // force-update or a memories change), which wipes everything the engine drew
    // into #cardSlot / #center and leaves a blank screen. Owning innerHTML here
    // keeps React out of the engine's DOM entirely.
    root.innerHTML = XI_MARKUP;

    mountSeq += 1;
    log('MOUNT #' + mountSeq + ' auth=' + (userId ? 'y' : 'n') + ' ls=' + probeLocalStorage());

    const POOL = {
      ev: dailyDeck.events,
      tw: dailyDeck.twists,
      be: boardDeck.events,
      bw: boardDeck.twists,
    };

    const storage = makeXiStorage({
      userId,
      getMemories: () => memoriesRef.current,
      addMemory,
      POOL,
      log,
    });

    engineRef.current = initXi(root, {
      POOL,
      storage,
      onOpenLibrary: () => navigate('/archive'),
      log,
    });

    // Pull saved per-user state (pair/board/misses/screen) from Firestore once,
    // then re-apply the saved screen. This matters when local storage is
    // unavailable (iOS tracking prevention): boot defaulted to Today, and this
    // is what returns the user to the screen they were actually on.
    storage.hydrateFromFirestore(() => engineRef.current && engineRef.current.restoreScreen());

    return () => { log('UNMOUNT #' + mountSeq); engineRef.current = null; };
    // Mount once; the engine reads live memories via memoriesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When Firestore memories change, re-render the current screen so collected
  // counts, saved memories, and board dots stay live.
  useEffect(() => {
    if (engineRef.current) engineRef.current.refresh();
  }, [memories]);

  // Surface any uncaught error / promise rejection in the on-screen log, so a
  // blank screen on the device tells us *why* (e.g. storage blocked by Safari).
  useEffect(() => {
    const onErr = (ev) => {
      const m = ev.message || (ev.reason && (ev.reason.message || String(ev.reason))) || 'error';
      log('JS ERR ' + m);
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onErr);
    };
  }, [log]);

  return (
    <>
      <div className="xi-app" ref={rootRef} />
      <div className="xi-build-stamp">build {BUILD_ID}</div>
      <div className="xi-debug">{dbgLog.map((l, i) => <div key={i}>{l}</div>)}</div>
    </>
  );
}
