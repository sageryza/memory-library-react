import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { dailyDeck, boardDeck, DECKS } from '../../xi/decks';
import { initXi } from '../../xi/xiEngine';
import { makeXiStorage } from '../../xi/xiStorage';
import { useGeneratedCards } from '../../hooks/useGeneratedCards';
import useDeckExtras from '../../hooks/useDeckExtras';
import useAuth from '../../hooks/useAuth';
import { XI_MARKUP } from './xiMarkup';
import XiNavBar from './XiNavBar';
import XiGenerator from './XiGenerator';
import './XiApp.css';

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// Who may build their own deck. Owner-only for now; add emails (or open it up)
// here to let others generate decks later.
const GENERATOR_OWNERS = ['sageryza@gmail.com'];

// Namespaced pool entries for the user's generated ("yours") deck. Interchangeable
// (each card can be event or twist), appended after the static decks.
const genPool = (ns, kind, gen) =>
  gen.map((c) => ({ id: `${ns}-${kind}-${c.id}`, cap: c.cap, img: c.img, kind, deck: 'generated' }));

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

  const { user } = useAuth();
  const canGenerate = !!(user && user.email && GENERATOR_OWNERS.includes(user.email));
  const [genOpen, setGenOpen] = useState(false);
  const { cards: genCards, addCards } = useGeneratedCards(userId);
  // Re-init the engine only when the SET of generated cards changes. ids are
  // stable, so this signature is stable — empty for users with no generated deck
  // (so they get a single, immediate init with no extra wait), and it changes
  // once when a generated deck loads or the user adds cards.
  const genSig = genCards.map((c) => c.id).join(',');
  // Shared deck extras (Sage's remote additions/removals for everyone) — the
  // pools mutate in place; this signature re-inits the engine when they change.
  const extrasSig = useDeckExtras();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    // Inject the engine markup, imperatively, so React never manages — and
    // therefore can't wipe — the DOM the engine draws into.
    root.innerHTML = XI_MARKUP;

    const POOL = {
      ev: [...dailyDeck.events, ...genPool('daily', 'event', genCards)],
      tw: [...dailyDeck.twists, ...genPool('daily', 'twist', genCards)],
      be: [...boardDeck.events, ...genPool('board', 'event', genCards)],
      bw: [...boardDeck.twists, ...genPool('board', 'twist', genCards)],
    };
    const decks = genCards.length ? [...DECKS, { id: 'generated', nick: 'yours', split: false }] : DECKS;

    const storage = makeXiStorage({
      userId,
      getMemories: () => memoriesRef.current,
      addMemory,
      POOL,
    });

    engineRef.current = initXi(root, {
      POOL,
      decks,
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

    // The URL (?s=) is the source of truth for which screen shows, so just
    // re-render with the hydrated data rather than restoring a saved screen.
    storage.hydrateFromFirestore(() => engineRef.current && engineRef.current.refresh());

    return () => { engineRef.current = null; };
    // Re-inits when the generated deck loads/changes; reads live memories via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genSig, extrasSig]);

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
      {screen === 'curate' && canGenerate && (
        <button className="xi-genbtn" onClick={() => setGenOpen(true)}>✨ Generate cards from memories</button>
      )}
      {canGenerate && (
        <XiGenerator
          open={genOpen}
          onClose={() => setGenOpen(false)}
          memories={memories}
          onAdd={addCards}
        />
      )}
      <XiNavBar />
      <div className="xi-build-stamp">build {BUILD_ID}</div>
    </>
  );
}
