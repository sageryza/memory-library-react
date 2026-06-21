import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { dailyDeck, boardDeck } from '../../xi/decks';
import { initXi } from '../../xi/xiEngine';
import { makeXiStorage } from '../../xi/xiStorage';
import { XI_MARKUP } from './xiMarkup';
import './XiApp.css';

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Inject the engine markup ONCE, imperatively, so React never manages — and
    // therefore can't wipe — the DOM the engine draws into.
    root.innerHTML = XI_MARKUP;

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
    });

    engineRef.current = initXi(root, {
      POOL,
      storage,
      onOpenLibrary: () => navigate('/archive'),
    });

    // Pull saved per-user state (pair/board/misses/screen) from Firestore once,
    // then re-apply the saved screen.
    storage.hydrateFromFirestore(() => engineRef.current && engineRef.current.restoreScreen());

    return () => { engineRef.current = null; };
    // Mount once; the engine reads live memories via memoriesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When Firestore memories change, re-render the current screen so collected
  // counts, saved memories, and board dots stay live.
  useEffect(() => {
    if (engineRef.current) engineRef.current.refresh();
  }, [memories]);

  return (
    <>
      <div className="xi-app" ref={rootRef} />
      <div className="xi-build-stamp">build {BUILD_ID}</div>
    </>
  );
}
