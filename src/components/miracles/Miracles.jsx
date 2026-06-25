// The Little Book of Miracles — write tiny lovely moments on the lines; each is
// drawn as a simple Sketchy-style doodle. Per-box generation never blocks your
// typing, and opening the book flips quickly through the pages you've already made.
//
// v1 persistence is localStorage (per device); the drawings themselves are saved
// permanently in Firebase Storage by the backend.

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import useAuth from '../../hooks/useAuth';
import { functions } from '../../firebase';
import './Miracles.css';

const illustrateMiracleFn = httpsCallable(functions, 'illustrateMiracle');

const UI_VERSION = 'v2'; // bump when the Miracles page changes
const STORE_KEY = 'miraclesBook';
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () =>
  (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const newBox = () => ({ id: uid(), text: '', url: '', status: 'idle' });
const newPage = () => [newBox(), newBox(), newBox(), newBox()];

// Test seed — the four miracles, so we can just press draw.
const SAMPLE_MIRACLES = [
  'It was my birthday and we went to get cake but the shop was closed — we told them and they let us in anyway',
  "I ran into a guy I'd run into twice before — last time he'd taken a picture of a book I dropped",
  'My mom got me a Mini Brands surprise ball, and the food inside was strawberry whipped-cream pancakes',
  "I almost fainted in the bathroom and a girl named Hope got me water — she has a doctor's appointment for fainting tomorrow",
];

const loadBook = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
};

const prettyDate = (d) => {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch { return d; }
};

export default function Miracles() {
  const { user, loading: authLoading } = useAuth();
  const today = todayStr();

  const [book, setBook] = useState(loadBook);
  const [viewDate, setViewDate] = useState(today);
  const [flipping, setFlipping] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [distill, setDistill] = useState(true);
  const [engineVersion, setEngineVersion] = useState('');
  const flipTimer = useRef(null);

  // Make sure today's page exists.
  useEffect(() => {
    setBook((b) => (b[today] ? b : { ...b, [today]: newPage() }));
  }, [today]);

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(book)); } catch { /* ignore */ }
  }, [book]);

  useEffect(() => () => clearInterval(flipTimer.current), []);

  // Open the cover, then riffle through past pages and land on today.
  const openBook = () => {
    setCoverOpen(true);
    const past = Object.keys(loadBook()).filter((d) => d !== today).sort();
    if (past.length === 0) { setViewDate(today); return; }
    const seq = [...past, today];
    setFlipping(true);
    let i = 0;
    setViewDate(seq[0]);
    flipTimer.current = setInterval(() => {
      i += 1;
      if (i >= seq.length) {
        clearInterval(flipTimer.current);
        setViewDate(today);
        setFlipping(false);
      } else {
        setViewDate(seq[i]);
      }
    }, 220);
  };

  const pages = Object.keys(book).sort();
  const page = book[viewDate] || newPage();
  const idx = pages.indexOf(viewDate);

  const updateBox = (boxId, patch) =>
    setBook((b) => ({
      ...b,
      [viewDate]: (b[viewDate] || newPage()).map((bx) =>
        bx.id === boxId ? { ...bx, ...patch } : bx),
    }));

  const addBox = () =>
    setBook((b) => ({ ...b, [viewDate]: [...(b[viewDate] || newPage()), newBox()] }));

  const loadSamples = () =>
    setBook((b) => ({ ...b, [viewDate]: SAMPLE_MIRACLES.map((t) => ({ ...newBox(), text: t })) }));

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
        <button type="button" className="miracles-cover" onClick={openBook}>
          <span className="miracles-cover-rule" />
          <span className="miracles-cover-emblem">✦</span>
          <span className="miracles-cover-title">The Little Book<br />of Miracles</span>
          <span className="miracles-cover-rule" />
          <span className="miracles-cover-open">tap to open</span>
        </button>
      </div>
    );
  }

  return (
    <div className="miracles-root">
      <h1 className="miracles-title">The Little Book of Miracles</h1>

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

      <div className={`miracles-page${flipping ? ' is-flipping' : ''}`} key={viewDate}>
        <div className="miracles-daterow">
          <span className="miracles-date-label">date</span>
          <span className="miracles-date">{prettyDate(viewDate)}</span>
        </div>

        <div className="miracles-grid">
          {page.map((box) => (
            <div className="miracle-box" key={box.id}>
              <div className="miracle-frame">
                {box.url && <img src={box.url} alt="" className="miracle-img" />}
                {box.status === 'drawing' && <span className="miracle-spinner" />}
                {box.status === 'error' && <span className="miracle-err">!</span>}
              </div>

              <textarea
                className="miracle-caption"
                placeholder="a small miracle…"
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
                {box.status === 'drawing'
                  ? 'drawing…'
                  : box.url ? 'redraw' : '✦ draw'}
              </button>

              {box.status === 'error' && box.error && (
                <div className="miracle-errmsg">{box.error}</div>
              )}
            </div>
          ))}
        </div>

        <button type="button" className="miracles-add" onClick={addBox}>
          + add another
        </button>
      </div>

      <div className="miracles-nav">
        <button
          type="button"
          className="miracles-arrow"
          onClick={() => idx > 0 && setViewDate(pages[idx - 1])}
          disabled={idx <= 0}
        >
          ‹ earlier
        </button>
        <span className="miracles-pageno">
          {idx + 1} / {pages.length}
        </span>
        <button
          type="button"
          className="miracles-arrow"
          onClick={() => idx < pages.length - 1 && setViewDate(pages[idx + 1])}
          disabled={idx >= pages.length - 1}
        >
          later ›
        </button>
      </div>

      <div className="miracles-version">
        book {UI_VERSION} · engine {engineVersion || '— draw to check'}
      </div>
    </div>
  );
}
