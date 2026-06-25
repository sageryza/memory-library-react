// The Little Book of Miracles — write tiny lovely moments on the lines; each is
// drawn as a simple Sketchy-style doodle. Per-box generation never blocks your
// typing; opening the book riffles through pages you've already made; turn the
// page to start a fresh one.
//
// v1 persistence is localStorage (per device); the drawings themselves are saved
// permanently in Firebase Storage by the backend.

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import useAuth from '../../hooks/useAuth';
import { functions } from '../../firebase';
import './Miracles.css';

/* global __BUILD_ID__ */
const illustrateMiracleFn = httpsCallable(functions, 'illustrateMiracle');

const UI_VERSION = 'v5'; // bump when the Miracles page changes
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// Wipe the cached app (service worker + caches) and reload — a reliable "get
// the latest" that beats close-and-reopen on stubborn PWAs.
async function forceRefresh() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
  window.location.reload();
}

const STORE_KEY = 'miraclesBook';
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () =>
  (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const newBox = () => ({ id: uid(), text: '', url: '', status: 'idle' });
const newPage = (date) => ({ id: uid(), date, boxes: [newBox(), newBox(), newBox(), newBox()] });

// Test seed — the four miracles, so we can just press draw.
const SAMPLE_MIRACLES = [
  'It was my birthday and we went to get cake but the shop was closed — we told them and they let us in anyway',
  "I ran into a guy I'd run into twice before — last time he'd taken a picture of a book I dropped",
  'My mom got me a Mini Brands surprise ball, and the food inside was strawberry whipped-cream pancakes',
  "I almost fainted in the bathroom and a girl named Hope got me water — she has a doctor's appointment for fainting tomorrow",
];

// Book is an ordered array of pages: { id, date, boxes:[4] }. Migrate the old
// { [date]: boxes[] } shape so existing drawings aren't lost.
const loadBook = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) return raw;
    if (raw && typeof raw === 'object') {
      const pages = Object.entries(raw)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, boxes]) => ({
          id: uid(),
          date,
          boxes: Array.isArray(boxes) ? boxes : newPage(date).boxes,
        }));
      if (pages.length) return pages;
    }
  } catch { /* ignore */ }
  return [newPage(todayStr())];
};

const prettyDate = (d) => {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      month: 'long', day: 'numeric',
    });
  } catch { return d; }
};

export default function Miracles() {
  const { user, loading: authLoading } = useAuth();
  const today = todayStr();

  const [book, setBook] = useState(loadBook);
  const [viewIndex, setViewIndex] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [distill, setDistill] = useState(true);
  const [engineVersion, setEngineVersion] = useState('');
  const flipTimer = useRef(null);

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(book)); } catch { /* ignore */ }
  }, [book]);

  useEffect(() => () => clearInterval(flipTimer.current), []);

  // Open the cover, then riffle through the pages and land on the latest.
  const openBook = () => {
    setCoverOpen(true);
    const last = book.length - 1;
    if (last <= 0) { setViewIndex(0); return; }
    setFlipping(true);
    let i = 0;
    setViewIndex(0);
    flipTimer.current = setInterval(() => {
      i += 1;
      if (i > last) {
        clearInterval(flipTimer.current);
        setViewIndex(last);
        setFlipping(false);
      } else {
        setViewIndex(i);
      }
    }, 220);
  };

  const page = book[viewIndex] || book[0];

  const updateBox = (boxId, patch) =>
    setBook((b) => b.map((pg, i) => (i !== viewIndex ? pg : {
      ...pg,
      boxes: pg.boxes.map((bx) => (bx.id === boxId ? { ...bx, ...patch } : bx)),
    })));

  const loadSamples = () =>
    setBook((b) => b.map((pg, i) => (i !== viewIndex ? pg : {
      ...pg,
      boxes: SAMPLE_MIRACLES.map((t) => ({ ...newBox(), text: t })),
    })));

  const pageHasContent = (pg) => pg.boxes.some((bx) => bx.text.trim() || bx.url);
  const canTurnForward = viewIndex < book.length - 1 || pageHasContent(page);

  const turnBack = () => viewIndex > 0 && setViewIndex(viewIndex - 1);
  const turnForward = () => {
    if (viewIndex < book.length - 1) { setViewIndex(viewIndex + 1); return; }
    if (!pageHasContent(page)) return; // don't stack blank pages
    setBook((b) => [...b, newPage(today)]);
    setViewIndex(book.length);
  };

  const illustrate = async (box) => {
    if (!box.text.trim() || box.status === 'drawing') return;
    updateBox(box.id, { status: 'drawing' });
    try {
      const res = await illustrateMiracleFn({ text: box.text, id: box.id, distill });
      updateBox(box.id, { url: res.data.url, status: 'done' });
      if (res.data.version) setEngineVersion(res.data.version);
    } catch (e) {
      const code = e?.code ? String(e.code).replace('functions/', '') : '';
      updateBox(box.id, {
        status: 'error',
        error: [code, e?.message].filter(Boolean).join(' — ') || 'could not draw',
      });
    }
  };

  if (authLoading) return <div className="miracles-root miracles-state">Loading…</div>;
  if (!user) {
    return (
      <div className="miracles-root miracles-state">
        <p>Please sign in to open your book.</p>
        <Link to="/login" className="miracles-btn">sign in</Link>
      </div>
    );
  }

  if (!coverOpen) {
    return (
      <div className="miracles-root miracles-cover-wrap">
        <button type="button" className="miracles-cover" onClick={openBook} aria-label="Open the book">
          <span className="miracles-cover-frame">
            <span className="miracles-cover-title gold-foil">Little<br />Book of<br />Miracles</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="miracles-root">
      <h1 className="miracles-title">The Little Book of Miracles</h1>

      <div className="miracles-version">
        <span>book {UI_VERSION} · built {BUILD_ID} · engine {engineVersion || '— draw to check'}</span>
        <button type="button" className="miracles-refresh" onClick={forceRefresh}>↻ force update</button>
      </div>

      <div className="miracles-mode">
        <button
          type="button"
          className={`miracles-mode-btn${distill ? ' is-on' : ''}`}
          onClick={() => setDistill(true)}
        >
          let it choose the drawing
        </button>
        <button
          type="button"
          className={`miracles-mode-btn${!distill ? ' is-on' : ''}`}
          onClick={() => setDistill(false)}
        >
          draw exactly what I wrote
        </button>
      </div>

      <button type="button" className="miracles-seed" onClick={loadSamples}>
        load sample miracles (test)
      </button>

      <div className={`miracles-page${flipping ? ' is-flipping' : ''}`} key={page.id}>
        <div className="miracles-daterow">
          <span className="miracles-date">{prettyDate(page.date)}</span>
        </div>

        <div className="miracles-grid">
          {page.boxes.map((box) => (
            <div className="miracle-box" key={box.id}>
              <div className="miracle-frame">
                {box.url && <img src={box.url} alt="" className="miracle-img" />}
                {box.status === 'drawing' && <span className="miracle-spinner" />}
                {box.status === 'error' && <span className="miracle-err">!</span>}
              </div>

              <textarea
                className="miracle-caption"
                value={box.text}
                rows={2}
                onChange={(e) => updateBox(box.id, { text: e.target.value })}
              />

              <button
                type="button"
                className="miracle-draw"
                onClick={() => illustrate(box)}
                disabled={!box.text.trim() || box.status === 'drawing'}
              >
                {box.status === 'drawing' ? (
                  'drawing…'
                ) : (
                  <>
                    {box.url ? 'redraw' : 'draw'}
                    <Sparkles size={13} strokeWidth={1.75} />
                  </>
                )}
              </button>

              {box.status === 'error' && box.error && (
                <div className="miracle-errmsg">{box.error}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="miracles-nav">
        <button
          type="button"
          className="miracles-arrow"
          onClick={turnBack}
          disabled={viewIndex <= 0}
        >
          ‹ back
        </button>
        <span className="miracles-pageno">{viewIndex + 1} / {book.length}</span>
        <button
          type="button"
          className="miracles-arrow"
          onClick={turnForward}
          disabled={!canTurnForward}
        >
          turn page ›
        </button>
      </div>
    </div>
  );
}
