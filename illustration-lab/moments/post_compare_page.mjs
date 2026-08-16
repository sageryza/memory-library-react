// Build the Compare page from moments.json and POST it into the Chats app.
// A new VERSION is a NEW page (house rule) — bump VERSION, run, supersede the old id.
// The SHEET name is pinned to the item set (moments-s180) so her notes and
// check/X votes carry across versions.
// Usage: node post_compare_page.mjs [--dry] [--supersede <oldPageId>]
import { readFile, writeFile } from 'node:fs/promises';
const ms = JSON.parse(await readFile(new URL('./moments.json', import.meta.url), 'utf8'));
const CHAT = 'journal-synchronicity-moments';
const SHEET = 'moments-s180';
const VERSION = 'v2';
const TITLE = `Journal moments — sweep 1 ${VERSION}`;
const BASE = 'https://imageforge-q125.onrender.com';

const esc = s => (s || '').replace(/<em ?>|<\/em>/g, '').replace(/@@PB@@/g, ' ')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s+\n/g, '\n').trim();

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';
const EX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// The card stays a BLOCK: compare.js appends its note affordance as a child of
// [data-item], so the flex row lives one level in or the note becomes a column.
const card = m => `
<div class="card mcard" data-item="${m.id}">
  <div class="mrow">
    <div class="rail">
      <button type="button" class="vbox" data-v="yes" data-id="${m.id}" aria-label="a coincidence">${CHECK}</button>
      <button type="button" class="vbox" data-v="no" data-id="${m.id}" aria-label="not a coincidence">${EX}</button>
    </div>
    <div class="mbody">
      <div class="mtitle">${esc(m.title)}</div>
      <div class="mmeta">${esc(m.date || '')} · p${m.page}${m.picMarker ? ' · <span class="f-pic">✎ PIC</span>' : ''}${m.illustrated ? ' · <span class="f-drawn">DRAWN</span>' : ''}${m.confidence === 'low' ? ' · <span class="f-maybe">MAYBE</span>' : ''}</div>
      <div class="mquote">${esc(m.quote)}</div>
    </div>
  </div>
</div>`;

const co = ms.filter(m => m.kind === 'coincidence'), mo = ms.filter(m => m.kind !== 'coincidence');
const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<link rel="stylesheet" href="/compare.css">
<style>
  .mcard { padding: 12px 14px; margin: 10px 0; }
  .mrow { display: flex; gap: 12px; align-items: flex-start; }
  /* the boxes sit on the LEFT — the pill owns the top-right corner */
  .rail { flex: 0 0 auto; display: flex; flex-direction: column; gap: 6px; }
  .vbox {
    width: 30px; height: 30px; padding: 0; border-radius: 6px;
    border: 1.5px solid var(--line); background: var(--surface);
    color: #cec5b4;                       /* both start with NO colour */
    display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .vbox svg { width: 17px; height: 17px; }
  .vbox[data-v="yes"].on { color: var(--rose); border-color: var(--rose); }   /* check → red */
  .vbox[data-v="no"].on  { color: var(--ink);  border-color: var(--ink);  }   /* X → black */
  .mbody { min-width: 0; }
  .mtitle { font-weight: 700; }
  .mmeta { font: 600 11px/1.6 -apple-system, 'Helvetica Neue', sans-serif; letter-spacing: .06em; color: var(--ink2); }
  .f-pic { color: var(--chg); } .f-drawn { color: var(--green); } .f-maybe { color: var(--rose); }
  .mquote { font-size: 15px; line-height: 1.5; margin-top: 6px; white-space: pre-line; }
</style>
<div class="wrap">
  <h1>${TITLE}</h1>
  <h2>Coincidences (${co.length})</h2>
  ${co.map(card).join('')}
  <h2>Little moments (${mo.length})</h2>
  ${mo.map(card).join('')}
</div>
<script src="/compare.js"></script>
<script>
(function () {
  window.__compareNotes({ chat: '${CHAT}', sheet: '${SHEET}' });
  window.__compareHelp({ html: '<b>The sweep of all 13 transcribed journals</b> — every entry read, ' +
    'the little moments and coincidences pulled out with their exact words. ' +
    'Check = a coincidence, X = not one; tap again to clear. ' +
    '<b>✎ PIC</b> = your own (pic) marker sits on it in the journal, so it may already be drawn. ' +
    '<b>DRAWN</b> = the drawing is confirmed in the scanned PDF. ' +
    '<b>MAYBE</b> = a shakier call, included rather than dropped.' });

  function save(id, ok) {
    return fetch('/api/chatfeed/verdict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: '${CHAT}', sheet: '${SHEET}', item: id, ok: ok })
    }).catch(function () { /* offline — the box keeps what she tapped */ });
  }
  function paint(id, val) {
    var boxes = document.querySelectorAll('.vbox[data-id="' + id + '"]');
    for (var i = 0; i < boxes.length; i++) {
      var v = boxes[i].getAttribute('data-v');
      boxes[i].classList.toggle('on', (val === true && v === 'yes') || (val === false && v === 'no'));
    }
  }
  var state = {};
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.vbox') : null;
    if (!b) return;
    var id = b.getAttribute('data-id');
    var want = b.getAttribute('data-v') === 'yes';
    var next = state[id] === want ? null : want;   // tapping the lit one clears it
    state[id] = next;
    paint(id, next);
    save(id, next);
  });
  // paint what she already answered
  fetch('/api/chatfeed/verdict?chat=' + encodeURIComponent('${CHAT}') + '&sheet=' + encodeURIComponent('${SHEET}'))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var items = (d && d.items) || {};
      Object.keys(items).forEach(function (id) {
        if (items[id] === true || items[id] === false) { state[id] = items[id]; paint(id, items[id]); }
      });
    }).catch(function () {});
})();
</script>`;

await writeFile(new URL('./compare_page.html', import.meta.url), html);
if (process.argv.includes('--dry')) { console.log('dry: wrote compare_page.html,', html.length, 'chars'); process.exit(0); }
const sid = (process.env.CLAUDE_CODE_REMOTE_SESSION_ID || '').replace(/^cse_/, '');
const r = await fetch(BASE + '/api/chatfeed/page', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat: CHAT, session: sid, title: TITLE, html })
});
const out = await r.json();
console.log(JSON.stringify(out, null, 1));
const si = process.argv.indexOf('--supersede');
if (si > -1 && process.argv[si + 1]) {
  const s = await fetch(`${BASE}/api/chatfeed/page/${process.argv[si + 1]}/supersede`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  console.log('superseded', process.argv[si + 1], JSON.stringify(await s.json()));
}
