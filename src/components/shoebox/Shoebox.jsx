import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useShoeboxState from '../../hooks/useShoeboxState';
import './Shoebox.css';

// Shoebox — the Polaroid version of the Memory Library. Two surfaces over the
// same memories: the LIBRARY (every memory as an instant photo) and the BOARD
// (a corkboard you pin them to, arrange freely, and play as a life sequence —
// the camera glides from one pinned polaroid to the next).
//
// Deliberately self-contained: its own route, its own CSS, its own board state
// (users/{uid}/preferences/shoebox). Nothing in the existing app is touched.

// Board canvas size (px) and the polaroid's board footprint.
const BOARD_W = 2600;
const BOARD_H = 1700;
const CARD_W = 240;
const CARD_H = Math.round(CARD_W * 107 / 88); // true 600-film proportions

const stripHtml = (s) => String(s || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const hashOf = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// A stable little tilt per memory, so the wall reads like real photos and a
// card never jumps to a new angle between visits.
const tiltOf = (id) => ((hashOf(String(id)) % 700) / 100) - 3.5;

const dateOf = (m) => {
  let t = m.timestamp || '';
  if (!t && m.createdAt && typeof m.createdAt.toDate === 'function') {
    try { t = m.createdAt.toDate().toISOString(); } catch { /* ignore */ }
  }
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const titleOf = (m) => stripHtml(m.title).replace(/\s*•\s*/g, ' · ');
const pictureOf = (m) => (m.illustration && m.illustration.url) || '';

// One instant photo. Frame: thin outline around the picture, the white
// border, a thin outline around the whole card; square image, deep chin.
// A memory with no picture yet shows its words on undeveloped film.
function Polaroid({ m, tilt = 0, chin = true }) {
  const url = pictureOf(m);
  const title = titleOf(m);
  return (
    <div className="sb-card" style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="sb-photo">
        {url ? (
          <img src={url} alt={title || 'memory'} draggable="false" />
        ) : (
          <div className="sb-undev"><span>{stripHtml(m.content) || title}</span></div>
        )}
      </div>
      {chin && (
        <div className="sb-chin">
          <span className="sb-chintitle">{title || ' '}</span>
          <span className="sb-chindate">{dateOf(m)}</span>
        </div>
      )}
    </div>
  );
}

export default function Shoebox({ memories = [], memoriesLoading = false, userId = null }) {
  const [view, setView] = useState(() => {
    try { return sessionStorage.getItem('shoeboxView') || 'library'; } catch { return 'library'; }
  });
  const [filter, setFilter] = useState('developed');
  const [openId, setOpenId] = useState(null);
  const [ordering, setOrdering] = useState(false);
  // String mode: tying constellations by hand. curStr = which chain her taps
  // are currently extending (an index into strings; -1 = none yet).
  const [stringing, setStringing] = useState(false);
  const [curStr, setCurStr] = useState(-1);
  const curStrRef = useRef(-1);
  const [playStep, setPlayStep] = useState(null); // null = not playing; -1 = whole board; 0.. = pins
  const { pins, strings, setPins, setStrings, loaded } = useShoeboxState(userId);

  const chainIds = (c) => (c && c.ids) || (Array.isArray(c) ? c : []);

  const wrapRef = useRef(null);
  const dragRef = useRef(null);

  // ---- the board camera (Sophie: "take up the whole screen, start in the
  // center, and be able to go anywhere from there") ------------------------
  // The board is a free camera over the cork, like a map: cam = where the
  // cork's top-left sits on screen (x, y) and the scale (z). One finger on
  // the background pans, pinch zooms around the fingers, + / − / Fit are the
  // buttons. iOS page zoom can never go below 1x, so all of it lives here.
  const [cam, setCam] = useState(null); // null until the wrapper has a size
  const camRef = useRef(null);
  const panRef = useRef(null);

  const HEADER_H = 54; // the floating header band the fit centres below
  const fitCam = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !el.clientWidth) return { x: 0, y: HEADER_H, z: 0.15 };
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const z = Math.max(0.05, Math.min(vw / BOARD_W, (vh - HEADER_H - 16) / BOARD_H) * 0.97);
    return {
      x: (vw - BOARD_W * z) / 2,
      y: HEADER_H + (vh - HEADER_H - BOARD_H * z) / 2,
      z,
    };
  }, []);

  // The board can go anywhere but never fully off screen.
  const clampCam = useCallback((c) => {
    const el = wrapRef.current;
    if (!el) return c;
    const K = 120;
    const z = Math.min(1.6, Math.max(fitCam().z * 0.8, c.z));
    return {
      z,
      x: Math.min(el.clientWidth - K, Math.max(K - BOARD_W * z, c.x)),
      y: Math.min(el.clientHeight - K, Math.max(K - BOARD_H * z, c.y)),
    };
  }, [fitCam]);

  const applyCam = useCallback((c) => {
    const cc = clampCam(c);
    camRef.current = cc;
    setCam(cc);
    try { sessionStorage.setItem('shoeboxCam', JSON.stringify(cc)); } catch { /* ignore */ }
  }, [clampCam]);

  // Zoom by a factor around a viewport point (the fingers, or the centre).
  const zoomAt = useCallback((f, atX, atY) => {
    const el = wrapRef.current;
    if (!el) return;
    const c = camRef.current || fitCam();
    const z1 = Math.min(1.6, Math.max(fitCam().z * 0.8, c.z * f));
    const k = z1 / c.z;
    const mx = atX != null ? atX : el.clientWidth / 2;
    const my = atY != null ? atY : el.clientHeight / 2;
    applyCam({ z: z1, x: mx - (mx - c.x) * k, y: my - (my - c.y) * k });
  }, [applyCam, fitCam]);

  // First look: the whole board, centred; a session remembers where she was.
  useLayoutEffect(() => {
    if (view !== 'board' || camRef.current || !wrapRef.current) return;
    let c = null;
    try {
      const raw = JSON.parse(sessionStorage.getItem('shoeboxCam'));
      if (raw && [raw.x, raw.y, raw.z].every(Number.isFinite) && raw.z > 0) c = raw;
    } catch { /* ignore */ }
    applyCam(c || fitCam());
  }, [view, applyCam, fitCam]);

  // One-finger pan on the background (a polaroid still drags itself).
  const onWrapDown = (e) => {
    if (playStep !== null || !camRef.current) return;
    if (e.target.closest && e.target.closest('.sb-pincard')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    panRef.current = { sx: e.clientX, sy: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
  };
  const onWrapMove = (e) => {
    const p = panRef.current;
    if (!p || !camRef.current) return;
    applyCam({ z: camRef.current.z, x: p.cx + e.clientX - p.sx, y: p.cy + e.clientY - p.sy });
  };
  const onWrapUp = () => { panRef.current = null; };

  // Pinch: two touches zoom around their midpoint. Native, non-passive
  // (touchmove must preventDefault); a second finger cancels any pan/drag.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || view !== 'board') return undefined;
    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTS = (e) => {
      if (e.touches.length === 2) {
        dragRef.current = null;
        panRef.current = null;
        const r = el.getBoundingClientRect();
        pinch = {
          d0: dist(e.touches),
          cam0: camRef.current || fitCam(),
          mid: {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top,
          },
        };
      }
    };
    const onTM = (e) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        const z1 = Math.min(1.6, Math.max(fitCam().z * 0.8, pinch.cam0.z * (dist(e.touches) / pinch.d0)));
        const k = z1 / pinch.cam0.z;
        applyCam({
          z: z1,
          x: pinch.mid.x - (pinch.mid.x - pinch.cam0.x) * k,
          y: pinch.mid.y - (pinch.mid.y - pinch.cam0.y) * k,
        });
      }
    };
    const onTE = () => { pinch = null; };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE);
    el.addEventListener('touchcancel', onTE);
    return () => {
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchmove', onTM);
      el.removeEventListener('touchend', onTE);
      el.removeEventListener('touchcancel', onTE);
    };
  }, [view, applyCam, fitCam]);

  // Handwriting face for the chins. A <link> so a failed font fetch degrades
  // to the cursive fallback instead of failing the route's CSS chunk.
  useEffect(() => {
    if (document.getElementById('sb-caveat')) return;
    const l = document.createElement('link');
    l.id = 'sb-caveat';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&display=swap';
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem('shoeboxView', view); } catch { /* ignore */ }
  }, [view]);

  const byId = useMemo(() => {
    const map = {};
    memories.forEach((m) => { map[m.id] = m; });
    return map;
  }, [memories]);

  const sorted = useMemo(() => {
    const stamp = (m) => {
      if (m.timestamp) return Date.parse(m.timestamp) || 0;
      if (m.createdAt && typeof m.createdAt.toDate === 'function') {
        try { return m.createdAt.toDate().getTime(); } catch { return 0; }
      }
      return 0;
    };
    return [...memories].sort((a, b) => stamp(b) - stamp(a));
  }, [memories]);

  const developed = useMemo(() => sorted.filter((m) => pictureOf(m)), [sorted]);
  // "Developed" is the default shelf, but a library with no pictures at all
  // falls through to everything rather than opening empty.
  const shelf = (filter === 'developed' && developed.length) ? developed : sorted;

  const pinned = useMemo(() => pins.filter((p) => byId[p.id]), [pins, byId]);
  const isPinned = useCallback((id) => pins.some((p) => p.id === id), [pins]);

  const pinMemory = (id) => {
    if (isPinned(id)) return;
    const n = pins.length;
    // A fresh pin lands on a loose grid walk with a little scatter.
    const x = 170 + ((n % 7) * 330) + ((hashOf(id) % 60) - 30);
    const y = 140 + (Math.floor(n / 7) * 400) + ((hashOf(id + 'y') % 60) - 30);
    setPins((prev) => [...prev, {
      id,
      x: Math.min(BOARD_W - CARD_W - 40, Math.max(20, x)),
      y: Math.min(BOARD_H - CARD_H - 40, Math.max(20, y)),
      seq: null,
    }]);
  };
  const unpinMemory = (id) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
    // A polaroid leaving the board takes its knot with it.
    setStrings((prev) => prev
      .map((c) => chainIds(c).filter((x) => x !== id))
      .filter((ids) => ids.length >= 2)
      .map((ids) => ({ ids })));
  };

  // ---- tying strings by hand -------------------------------------------
  // Tap polaroids one after another to tie them; tap a tied one to untie it.
  // Tapping a member of another string merges that string with the one being
  // built — which is also how "add one more to an existing constellation"
  // works: tap the new card, then tap the constellation.
  const stringTap = (id) => {
    setStrings((prev) => {
      const chains = prev.map((c) => [...chainIds(c)]);
      const at = chains.findIndex((ids) => ids.includes(id));
      let cur = curStrRef.current;
      if (cur >= chains.length) cur = -1;
      if (at === -1) {
        if (cur >= 0) chains[cur].push(id);
        else { chains.push([id]); cur = chains.length - 1; }
      } else if (cur === -1) {
        cur = at; // pick the string up
      } else if (at === cur) {
        chains[at] = chains[at].filter((x) => x !== id); // untie
      } else {
        chains[at] = chains[at].concat(chains[cur]); // tie two strings into one
        chains.splice(cur, 1);
        cur = at > cur ? at - 1 : at;
      }
      curStrRef.current = cur;
      setCurStr(cur);
      return chains.map((ids) => ({ ids }));
    });
  };
  const pruneStrings = () => setStrings((prev) => prev
    .map(chainIds).filter((ids) => ids.length >= 2).map((ids) => ({ ids })));
  const toggleStringing = () => {
    if (stringing) pruneStrings();
    setStringing((s) => !s);
    setOrdering(false);
    curStrRef.current = -1;
    setCurStr(-1);
  };

  // ---- board dragging (tap = open, drag = move) --------------------------
  const onPinDown = (e, id) => {
    if (playStep !== null) return;
    const pin = pins.find((p) => p.id === id);
    if (!pin) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, x: pin.x, y: pin.y, moved: false };
  };
  const onPinMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    // Pointer deltas are screen pixels; the board may be zoomed out.
    const z = (camRef.current && camRef.current.z) || 1;
    const dx = (e.clientX - d.startX) / z;
    const dy = (e.clientY - d.startY) / z;
    if (!d.moved && (Math.abs(dx) * z > 6 || Math.abs(dy) * z > 6)) d.moved = true;
    if (!d.moved) return;
    const x = Math.min(BOARD_W - CARD_W - 10, Math.max(6, d.x + dx));
    const y = Math.min(BOARD_H - CARD_H - 10, Math.max(6, d.y + dy));
    setPins((prev) => prev.map((p) => (p.id === d.id ? { ...p, x, y } : p)));
  };
  const onPinUp = (e, id) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    if (ordering) {
      // Tapping in order mode numbers the sequence; tapping a numbered one
      // takes its number back.
      setPins((prev) => {
        const cur = prev.find((p) => p.id === id);
        if (!cur) return prev;
        if (cur.seq != null) return prev.map((p) => (p.id === id ? { ...p, seq: null } : p));
        const max = prev.reduce((m, p) => Math.max(m, p.seq == null ? 0 : p.seq), 0);
        return prev.map((p) => (p.id === id ? { ...p, seq: max + 1 } : p));
      });
      return;
    }
    if (stringing) {
      stringTap(id);
      return;
    }
    setOpenId(id);
  };

  // ---- the life-sequence play (camera glides pin to pin) -----------------
  const playList = useMemo(() => {
    const numbered = pinned.filter((p) => p.seq != null).sort((a, b) => a.seq - b.seq);
    return numbered.length ? numbered : pinned;
  }, [pinned]);

  const camera = useMemo(() => {
    if (playStep === null || !wrapRef.current) return null;
    const vw = wrapRef.current.clientWidth;
    const vh = wrapRef.current.clientHeight;
    if (playStep === -1 || playStep >= playList.length) {
      const s = Math.min(vw / BOARD_W, vh / BOARD_H) * 0.96;
      return { x: (vw - BOARD_W * s) / 2, y: (vh - BOARD_H * s) / 2, s };
    }
    const pin = playList[playStep];
    const s = Math.min(2.3, (vw * 0.72) / CARD_W, (vh * 0.72) / CARD_H);
    const cx = pin.x + CARD_W / 2;
    const cy = pin.y + CARD_H / 2;
    return { x: vw / 2 - cx * s, y: vh / 2 - cy * s, s };
  }, [playStep, playList]);

  useEffect(() => {
    if (playStep === null) return undefined;
    const glide = 1700;
    const hold = playStep === -1 ? 1200 : 2300;
    const t = setTimeout(() => {
      setPlayStep((k) => {
        if (k === null) return null;
        if (k >= playList.length) return null;     // closing shot shown, done
        return k + 1 > playList.length - 1 && k !== -1 ? playList.length : k + 1;
      });
    }, glide + hold);
    return () => clearTimeout(t);
  }, [playStep, playList.length]);

  const startPlay = () => {
    if (!playList.length) return;
    setOrdering(false);
    setOpenId(null);
    setPlayStep(-1);
  };
  const stopPlay = () => setPlayStep(null);

  const open = openId ? byId[openId] : null;
  const playing = playStep !== null;

  return (
    <div className={`sb-root${playing ? ' sb-playing' : ''}`}>
      {!playing && (
        <header className="sb-head">
          <Link to="/" className="sb-back">‹ Library</Link>
          <h1>Shoebox</h1>
          <div className="sb-tabs">
            <button className={view === 'library' ? 'on' : ''} onClick={() => setView('library')}>LIBRARY</button>
            <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>BOARD</button>
          </div>
          {view === 'board' && (
            <div className="sb-boardacts">
              <button className={`sb-act${stringing ? ' on' : ''}`} onClick={toggleStringing}>
                {stringing ? 'Done tying' : 'String'}
              </button>
              <button
                className={`sb-act${ordering ? ' on' : ''}`}
                onClick={() => { if (stringing) toggleStringing(); setOrdering((o) => !o); }}
              >
                {ordering ? 'Done ordering' : 'Order'}
              </button>
              <button className="sb-act sb-play" onClick={startPlay} disabled={!pinned.length}>▶ Play</button>
            </div>
          )}
        </header>
      )}

      {view === 'library' && !playing && (
        <div className="sb-lib">
          <div className="sb-filters">
            <button className={filter === 'developed' ? 'on' : ''} onClick={() => setFilter('developed')}>
              Developed ({developed.length})
            </button>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              All ({sorted.length})
            </button>
          </div>
          {memoriesLoading && !sorted.length && <p className="sb-note">Opening the shoebox…</p>}
          {!memoriesLoading && !sorted.length && <p className="sb-note">No memories yet.</p>}
          <div className="sb-grid">
            {shelf.map((m) => (
              <button key={m.id} className="sb-cell" onClick={() => setOpenId(m.id)}>
                <Polaroid m={m} tilt={tiltOf(m.id)} />
                {isPinned(m.id) && <span className="sb-pinmark" title="On the board" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {(view === 'board' || playing) && (
        <div
          className={`sb-boardwrap${playing ? ' play' : ''}`}
          ref={wrapRef}
          onClick={playing ? stopPlay : undefined}
          onPointerDown={playing ? undefined : onWrapDown}
          onPointerMove={playing ? undefined : onWrapMove}
          onPointerUp={playing ? undefined : onWrapUp}
          onPointerCancel={playing ? undefined : onWrapUp}
        >
          <div
            className="sb-cork"
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: camera
                ? `translate(${camera.x}px, ${camera.y}px) scale(${camera.s})`
                : (cam ? `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` : undefined),
            }}
          >
            {/* Red string constellations — drawn under the polaroids, tied
                pinhead to pinhead in chain order, with a little sag so it
                reads as string rather than a diagram line. */}
            <svg className="sb-strings" width={BOARD_W} height={BOARD_H}>
              {strings.map((chain, ci) => {
                // Firestore can't hold nested arrays, so a stored chain is
                // { ids: [...] }; a bare array is accepted too.
                const pts = chainIds(chain)
                  .map((id) => pins.find((p) => p.id === id))
                  .filter(Boolean)
                  .map((p) => ({
                    id: p.id,
                    x: p.x + CARD_W / 2 + ((hashOf(p.id + 'p') % 26) - 13),
                    y: p.y + 1,
                  }));
                const segs = [];
                for (let i = 0; i + 1 < pts.length; i++) {
                  const a = pts[i];
                  const b = pts[i + 1];
                  const sag = 22 + (hashOf(a.id + b.id) % 26);
                  segs.push(
                    <path
                      key={a.id + b.id}
                      d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.max(a.y, b.y) + sag} ${b.x} ${b.y}`}
                    />,
                  );
                }
                return <g key={ci} className={stringing && ci === curStr ? 'cur' : undefined}>{segs}</g>;
              })}
            </svg>
            {pinned.map((p) => {
              const m = byId[p.id];
              return (
                <div
                  key={p.id}
                  className="sb-pincard"
                  style={{ left: p.x, top: p.y, width: CARD_W }}
                  onPointerDown={(e) => onPinDown(e, p.id)}
                  onPointerMove={onPinMove}
                  onPointerUp={(e) => onPinUp(e, p.id)}
                  onPointerCancel={() => { dragRef.current = null; }}
                >
                  <Polaroid m={m} tilt={tiltOf(p.id)} />
                  <span className="sb-pinhead" style={{ marginLeft: (hashOf(p.id + 'p') % 26) - 13 }} />
                  {ordering && p.seq != null && <span className="sb-seq">{p.seq}</span>}
                  {!ordering && p.seq != null && playing === false && <span className="sb-seq quiet">{p.seq}</span>}
                </div>
              );
            })}
            {!pinned.length && !playing && (
              <p className="sb-empty">Open a polaroid in the Library and pin it here.</p>
            )}
          </div>
        </div>
      )}

      {view === 'board' && !playing && (
        <div className="sb-zoomer">
          <button className="sb-zbtn" onClick={() => zoomAt(1.4)} aria-label="Zoom in">+</button>
          <button className="sb-zbtn" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out">−</button>
          <button className="sb-zbtn sb-zfit" onClick={() => applyCam(fitCam())} aria-label="Fit the whole board">Fit</button>
        </div>
      )}
      {view === 'board' && ordering && !playing && (
        <p className="sb-orderhint">Tap polaroids in story order. Tap a number to clear it.</p>
      )}
      {view === 'board' && stringing && !playing && (
        <p className="sb-orderhint">Tap polaroids one after another to tie them together. Tap a tied one to untie it.</p>
      )}

      {open && !playing && (
        <div className="sb-scrim" onClick={() => setOpenId(null)}>
          <div className="sb-detail" onClick={(e) => e.stopPropagation()}>
            <div className="sb-bigcard"><Polaroid m={open} tilt={0} /></div>
            {stripHtml(open.content) && <div className="sb-paper">{stripHtml(open.content)}</div>}
            <div className="sb-detailacts">
              {isPinned(open.id) ? (
                <button className="sb-act" onClick={() => { unpinMemory(open.id); }}>Take off the board</button>
              ) : (
                <button className="sb-act sb-primary" onClick={() => { pinMemory(open.id); setOpenId(null); setView('board'); }}>
                  Pin to the board
                </button>
              )}
              <button className="sb-act" onClick={() => setOpenId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {!loaded && view === 'board' && !playing && <p className="sb-note sb-float">Loading the board…</p>}
    </div>
  );
}
