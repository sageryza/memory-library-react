import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { dailyDeck, boardDeck, DECKS } from '../../xi/decks';
import { initXi } from '../../xi/xiEngine';
import { makeXiStorage } from '../../xi/xiStorage';
import { XI_MARKUP } from './xiMarkup';
import XiNavBar from './XiNavBar';
import './XiApp.css';

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// XI — the standalone app, ported in faithfully. The exact markup is injected
// as raw HTML and the original game engine drives it; only the storage layer is
// swapped so memories persist to the shared archive (Firestore).
//
// The engine's internal bottom nav is hidden; the shared <XiNavBar/> drives the
// engine screens via the ?s=<screen> URL param so one nav spans every XI screen.
export default function XiApp({ memories = [], addMemory, userId }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const screen = searchParams.get('s') || 'today';
  const rootRef = useRef(null);
  const engineRef = useRef(null);
  const memoriesRef = useRef(memories);
  memoriesRef.current = memories;
  // Latest URL screen + the screen we've already applied, for loop-free syncing.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const appliedRef = useRef(screen);

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
      decks: DECKS,
      storage,
      onOpenLibrary: () => navigate('/archive'),
      initialScreen: screenRef.current,
      // Mirror the engine's current screen into the URL so the shared nav
      // highlights correctly (only fires on a real change).
      onScreenChange: (name) => {
        if (screenRef.current === name) return;
        appliedRef.current = name;
        setSearchParams((p) => { const np = new URLSearchParams(p); np.set('s', name); return np; }, { replace: true });
      },
    });

    // The URL (?s=) is now the source of truth for which screen shows, so just
    // re-render with the hydrated data rather than restoring a saved screen.
    storage.hydrateFromFirestore(() => engineRef.current && engineRef.current.refresh());

    return () => { engineRef.current = null; };
    // Mount once; the engine reads live memories via memoriesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the engine screen from the URL (nav taps change ?s=).
  useEffect(() => {
    if (engineRef.current && screen !== appliedRef.current) {
      appliedRef.current = screen;
      engineRef.current.goToScreen(screen);
    }
  }, [screen]);

  // When Firestore memories change, re-render the current screen.
  useEffect(() => {
    if (engineRef.current) engineRef.current.refresh();
  }, [memories]);

  const goGallery = () => setSearchParams((p) => {
    const np = new URLSearchParams(p); np.set('s', 'gallery'); return np;
  });

  return (
    <>
      <div className="xi-app" ref={rootRef} />
      {screen === 'today' && (
        <button className="xi-cal" aria-label="Past days" title="Past days" onClick={goGallery}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <rect x="3" y="4.5" width="18" height="17" rx="2" />
            <path d="M16 2.5v4M8 2.5v4M3 9.5h18" />
          </svg>
        </button>
      )}
      <XiNavBar />
      <div className="xi-build-stamp">build {BUILD_ID}</div>
    </>
  );
}
