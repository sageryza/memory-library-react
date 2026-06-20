// XI game engine — ported verbatim from the standalone app (xi_app_v1.html)
// so the look and every interaction stay identical. The ONLY changes:
//   • deck data (POOL) and storage (st) are injected, not global/localStorage
//   • the in-app Library screen + export/import are removed; the bottom-nav
//     "Library" button calls ctx.onOpenLibrary() to open the real archive
//   • $ is scoped to the mounted root node, and scrolling targets that node
//
// st (storage adapter) mirrors the original sget/sset/slist contract:
//   st.get(key) -> Promise<value|null>   (memory keys 'xi2_mem_*' and state keys)
//   st.set(key, value) -> Promise        (memory writes route to Firestore)
//   st.list() -> Promise<string[]>       (memory keys that currently have memories)

export function initXi(root, ctx) {
  const { POOL, onOpenLibrary } = ctx;
  const st = ctx.storage;

  const $ = (s) => root.querySelector(s);
  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const UNDO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>';

  const card = (r) => POOL[r.d][r.i];
  const cap = (r) => card(r).cap;
  const poolLen = (d) => POOL[d].length;
  function nextI(d, i) { return (i + 1) % poolLen(d); }
  function missKey(shown) { return shown.map((r) => r.d + r.i).slice().sort().join('-'); }
  function memKey(shown) { return 'xi2_mem_' + shown.map((r) => r.d + r.i).slice().sort().join('-'); }
  function clone(a) { return a.map((r) => ({ d: r.d, i: r.i })); }
  const dayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
  const todayKey = () => new Date().toISOString().slice(0, 10);
  function pairForDay(dn) { return [{ d: 'ev', i: ((dn % POOL.ev.length) + POOL.ev.length) % POOL.ev.length }, { d: 'tw', i: (((dn * 7 + 3) % POOL.tw.length) + POOL.tw.length) % POOL.tw.length }]; }

  let S = { shown: [], hist: [], flip: 'tw' };
  function deckSig() { return POOL.ev.length + '-' + POOL.tw.length + '-' + (POOL.ev[0] ? POOL.ev[0].cap : ''); }
  function topPair() { return [{ d: 'ev', i: 0 }, { d: 'tw', i: 0 }]; }
  async function savePair() { await st.set('xi2_pair', { day: todayKey(), sig: deckSig(), shown: S.shown }); }
  async function loadState() {
    const p = await st.get('xi2_pair');
    if (p && p.shown && p.shown.length && p.sig === deckSig()) { S.shown = p.shown; }
    else { S.shown = topPair(); await savePair(); }
  }

  /* top center: New cards (centered) + Undo (absolute left) */
  function renderCenter() {
    const undo = S.hist.length ? `<button id="undoBtn" aria-label="Undo">${UNDO}</button>` : '';
    $('#center').innerHTML = undo + '<button class="newcards" id="newCardsBtn">New cards</button><button class="nothing" id="nothingBtn">I got nothing</button>';
    $('#newCardsBtn').onclick = async () => { S.hist.push(clone(S.shown)); const d = S.flip; const k = S.shown.findIndex((r) => r.d === d); if (k >= 0) { S.shown[k] = { d, i: nextI(d, S.shown[k].i) }; } else { S.shown.push({ d, i: 0 }); } S.flip = (S.flip === 'tw' ? 'ev' : 'tw'); await savePair(); renderCenter(); renderToday(); };
    $('#nothingBtn').onclick = gotNothing;
    const u = $('#undoBtn'); if (u) u.onclick = async () => { if (!S.hist.length) return; S.shown = S.hist.pop(); await savePair(); renderCenter(); renderToday(); };
  }
  function closeMenu() { root.querySelectorAll('.cardmenu').forEach((m) => m.remove()); }
  function showCardMenu(el, k) {
    closeMenu(); const m = document.createElement('div'); m.className = 'cardmenu';
    m.innerHTML = '<button data-a="replace">Replace</button>'; el.appendChild(m);
    m.querySelector('[data-a=replace]').onclick = async (e) => { e.stopPropagation(); S.hist.push(clone(S.shown)); const d = S.shown[k].d; S.shown[k] = { d, i: nextI(d, S.shown[k].i) }; await savePair(); closeMenu(); renderCenter(); renderToday(); };
    setTimeout(() => document.addEventListener('click', function h(ev) { if (!ev.target.closest('.cardmenu')) { closeMenu(); document.removeEventListener('click', h, true); } }, true), 0);
  }
  function autoReplace(k) { S.hist.push(clone(S.shown)); const d = S.shown[k].d; S.shown[k] = { d, i: nextI(d, S.shown[k].i) }; savePair().then(() => { renderCenter(); renderToday(); }); }
  async function gotNothing() { const mk = missKey(S.shown); const m = (await st.get('xi2_misses')) || {}; if (m[mk]) { delete m[mk]; } else { m[mk] = 1; } await st.set('xi2_misses', m); renderToday(); }
  function tapcard(el, k) { let n = 0, t = null; el.addEventListener('click', (e) => { e.preventDefault(); n++; if (t) clearTimeout(t); t = setTimeout(() => { const c = n; n = 0; t = null; if (c >= 3) { closeMenu(); autoReplace(k); } else { showCardMenu(el, k); } }, 300); }); }
  async function renderToday() {
    const arr = (await st.get(memKey(S.shown))) || []; const one = S.shown.length === 1; const misses = (await st.get('xi2_misses')) || {}; const missed = !!misses[missKey(S.shown)];
    let h = `<div class="cardrow ${missed ? 'missed' : ''}" data-n="${S.shown.length}">` + S.shown.map((r, k) => `<div class="card ${k % 2 ? 'fly-r' : 'fly-l'}" data-k="${k}"><img loading="lazy" decoding="async" src="${card(r).img}" alt="${esc(cap(r))}"><button class="cardback" data-k="${k}" aria-label="Back">${UNDO}</button></div>`).join('') + `</div>`;
    h += `<div class="block">`;
    if (arr.length) h += `<div class="collected">${arr.length} ${arr.length === 1 ? 'memory' : 'memories'} collected</div>`;
    const ph = one ? 'Add your memory&hellip;' : 'A memory that\'s both of these&hellip;';
    h += `<div class="composer"><textarea placeholder="${ph}"></textarea><div class="btn-row"><button class="btn small" id="saveBtn">Save</button></div></div>`;
    h += arr.map((m) => `<div class="mem"><div class="txt">${esc(m.text)}</div></div>`).join('');
    h += `</div>`;
    $('#cardSlot').innerHTML = h;
    root.querySelectorAll('#cardSlot .card').forEach((el) => tapcard(el, +el.dataset.k));
    root.querySelectorAll('#cardSlot .cardback').forEach((b) => b.onclick = async (e) => { e.stopPropagation(); const k = +b.dataset.k; const r = S.shown[k]; S.hist.push(clone(S.shown)); S.shown[k] = { d: r.d, i: (r.i - 1 + poolLen(r.d)) % poolLen(r.d) }; await savePair(); renderCenter(); renderToday(); });
    const ta = $('#cardSlot textarea');
    $('#saveBtn').onclick = async () => { const v = ta.value.trim(); if (!v) return; const key = memKey(S.shown); const a = (await st.get(key)) || []; a.unshift({ text: v, ts: Date.now() }); await st.set(key, a); renderToday(); };
  }
  /* curate */
  let deck = 'ev', pos = 0;
  function renderCurate() {
    const D = deck === 'ev' ? POOL.ev : POOL.tw; if (pos >= D.length) pos = 0; if (pos < 0) pos = D.length - 1; const c = D[pos];
    $('#curateSlot').innerHTML = `<div class="curtoggle"><button id="tEv" class="${deck === 'ev' ? 'on' : ''}">Events</button><button id="tTw" class="${deck === 'tw' ? 'on' : ''}">Twists</button></div>
      <div class="card swipezone" style="max-width:320px;margin:0 auto"><img loading="lazy" decoding="async" src="${c.img}" alt="${esc(c.cap)}"><button class="tapnav left" id="cPrev"></button><button class="tapnav right" id="cNext"></button></div>`;
    $('#tEv').onclick = () => { deck = 'ev'; pos = 0; renderCurate(); }; $('#tTw').onclick = () => { deck = 'tw'; pos = 0; renderCurate(); };
    $('#cPrev').onclick = () => { pos = (pos - 1 + D.length) % D.length; renderCurate(); root.scrollTo(0, 0); };
    $('#cNext').onclick = () => { pos = (pos + 1) % D.length; renderCurate(); root.scrollTo(0, 0); };
  }
  /* past cards: recent daily pairs */
  let gsel = [];
  function renderGallery() {
    const base = dayNum(); let cells = '';
    for (let off = 0; off < 24; off++) {
      const dn = base - off; const pr = pairForDay(dn);
      const dt = new Date(Date.now() - off * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const cc = pr.map((r) => { const sl = gsel.some((g) => g.d === r.d && g.i === r.i) ? ' selg' : ''; return `<button class="galcard${sl}" data-d="${r.d}" data-i="${r.i}"><img loading="lazy" decoding="async" src="${card(r).img}"></button>`; }).join(''); cells += `<div class="galcell"><div class="pairmini">${cc}</div><div class="galdate">${off === 0 ? 'Today' : dt}</div></div>`;
    }
    const bar = gsel.length === 2 ? `<button class="usepair" id="usePairBtn">Add a memory with these &rarr;</button>` : `<div class="selhint">${gsel.length === 1 ? 'Pick one more card' : 'Tap any two cards to pair them'}</div>`;
    $('#gallerySlot').innerHTML = `<div class="selbar">${bar}</div><div class="gallerygrid">${cells}</div>`;
    root.querySelectorAll('#gallerySlot .galcard').forEach((b) => b.onclick = () => { const r = { d: b.dataset.d, i: +b.dataset.i }; const idx = gsel.findIndex((g) => g.d === r.d && g.i === r.i); if (idx >= 0) gsel.splice(idx, 1); else { if (gsel.length >= 2) gsel.shift(); gsel.push(r); } renderGallery(); });
    const up = $('#usePairBtn'); if (up) up.onclick = async () => { S.shown = gsel.slice().sort((a, b) => a.d === b.d ? 0 : (a.d === 'ev' ? -1 : 1)).map((r) => ({ d: r.d, i: r.i })); S.hist = []; S.flip = 'tw'; gsel = []; await savePair(); renderCenter(); showScreen('today'); renderToday(); };
  }

  function showScreen(name) {
    ['today', 'curate', 'board', 'gallery'].forEach((s) => { const el = $('#screen-' + s); if (el) el.style.display = (s === name) ? '' : 'none'; });
    $('#navToday').classList.toggle('on', name === 'today'); $('#navCurate').classList.toggle('on', name === 'curate'); $('#navBoard').classList.toggle('on', name === 'board'); $('#navGallery').classList.toggle('on', name === 'gallery'); root.scrollTo(0, 0);
  }
  $('#navToday').onclick = async () => { if (!S.shown || !S.shown.length) { S.shown = topPair(); await savePair(); } showScreen('today'); renderToday(); };
  $('#navCurate').onclick = () => { showScreen('curate'); renderCurate(); };
  $('#navBoard').onclick = () => { showScreen('board'); renderBoard(); };
  $('#navGallery').onclick = () => { showScreen('gallery'); renderGallery(); };
  $('#navLibrary').onclick = () => { if (onOpenLibrary) onOpenLibrary(); };

  /* ===== BOARD MODE ===== */
  const BR = 5, BC = 4; let bgrid = [], bsel = [];
  function bShuf(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function bAdj(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; }
  async function newBoard() {
    const ev = [], tw = []; for (let r = 0; r < BR; r++) for (let c = 0; c < BC; c++) { ((r + c) % 2 === 0 ? ev : tw).push([r, c]); }
    const ei = bShuf(POOL.be.map((x, i) => i)).slice(0, ev.length), ti = bShuf(POOL.bw.map((x, i) => i)).slice(0, tw.length);
    bgrid = Array.from({ length: BR }, () => Array(BC).fill(null));
    ev.forEach((p, k) => bgrid[p[0]][p[1]] = { d: 'be', i: ei[k] }); tw.forEach((p, k) => bgrid[p[0]][p[1]] = { d: 'bw', i: ti[k] });
    bsel = []; await st.set('xi2_board', bgrid); renderBoard();
  }
  async function renderBoard() {
    if (!bgrid.length) { const s = await st.get('xi2_board'); if (s && s.length) { bgrid = s; } else { return newBoard(); } }
    const keys = new Set(await st.list()); const slot = $('#boardSlot'); slot.innerHTML = '';
    for (let r = 0; r < BR; r++) for (let c = 0; c < BC; c++) {
      const cell = bgrid[r][c]; const el = document.createElement('div');
      el.className = 'bcell ' + (cell.d === 'be' ? 'ev' : 'tw') + (bsel.some((s) => s[0] === r && s[1] === c) ? ' bsel' : '');
      const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < BR && b >= 0 && b < BC);
      const has = nb.some(([a, b]) => keys.has(memKey([cell, bgrid[a][b]])));
      el.innerHTML = '<img src="' + card(cell).img + '" alt="">' + (has ? '<span class="bdot"></span>' : '');
      el.onclick = () => bTap(r, c); slot.appendChild(el);
    }
    bPanel();
  }
  function bTap(r, c) {
    const cell = [r, c];
    if (bsel.length === 1 && !(bsel[0][0] === r && bsel[0][1] === c) && bAdj(bsel[0], cell)) { bsel = [bsel[0], cell]; }
    else if (bsel.length === 1 && bsel[0][0] === r && bsel[0][1] === c) { bsel = []; }
    else { bsel = [cell]; }
    renderBoard();
  }
  function bPanel() {
    const p = $('#boardPanel');
    if (bsel.length === 0) { p.innerHTML = '<div class="blead">Tap a card, then tap a card it touches to pair them.</div>'; return; }
    if (bsel.length === 1) { const cell = bgrid[bsel[0][0]][bsel[0][1]]; p.innerHTML = '<div class="blead">' + esc(cap(cell)) + ' &mdash; tap a touching card to pair.</div>'; return; }
    const A = bgrid[bsel[0][0]][bsel[0][1]], B = bgrid[bsel[1][0]][bsel[1][1]]; const ev = A.d === 'be' ? A : B, tw = A.d === 'bw' ? A : B; bEdit(ev, tw);
  }
  async function bEdit(ev, tw) {
    const key = memKey([ev, tw]); const cur = (await st.get(key)) || []; const p = $('#boardPanel');
    p.innerHTML = '<div class="bed"><div class="bpair"><b>' + esc(cap(ev)) + '</b><span class="x">&times;</span><b>' + esc(cap(tw)) + '</b></div><textarea id="bta" placeholder="A memory that is both of these..."></textarea><div class="brow"><button class="act" id="bclear">Close</button><button class="act dark" id="bsave">Save</button></div>' + (cur.length ? '<div class="bexist">' + cur.map((m) => esc(m.text)).join('<br>') + '</div>' : '') + '</div>';
    const ta = $('#bta'); ta.focus();
    $('#bclear').onclick = () => { bsel = []; renderBoard(); };
    $('#bsave').onclick = async () => { const t = ta.value.trim(); if (t) { const a = (await st.get(key)) || []; a.unshift({ text: t, ts: Date.now() }); await st.set(key, a); } bsel = []; renderBoard(); };
  }
  $('#newBoard').onclick = newBoard;

  // Re-render whichever screen is currently visible (used when Firestore
  // memories arrive/refresh under the engine).
  function currentScreen() {
    for (const s of ['today', 'curate', 'board', 'gallery']) { const el = $('#screen-' + s); if (el && el.style.display !== 'none') return s; }
    return 'today';
  }
  function refresh() {
    const s = currentScreen();
    if (s === 'today') renderToday();
    else if (s === 'board') { bgrid = []; renderBoard(); }
    else if (s === 'gallery') renderGallery();
  }

  // boot
  (async function () { await loadState(); renderCenter(); renderToday(); showScreen('today'); })();

  return { refresh };
}

export default initXi;
