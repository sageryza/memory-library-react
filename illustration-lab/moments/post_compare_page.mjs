// Build the Compare page from moments.json and POST it into the Chats app.
// Usage: node post_compare_page.mjs [--dry]
import { readFile, writeFile } from 'node:fs/promises';
const ms = JSON.parse(await readFile(new URL('./moments.json', import.meta.url), 'utf8'));
const CHAT = 'journal-synchronicity-moments';
const SHEET = 'moments-s180';
const esc = s => (s || '').replace(/<em ?>|<\/em>/g, '').replace(/@@PB@@/g, ' ')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s+\n/g, '\n').trim();
const card = m => `
<div class="card" data-item="${m.id}" style="padding:12px 14px;margin:10px 0">
  <div style="font-weight:700">${esc(m.title)}</div>
  <div style="font:600 11px/1.6 -apple-system,'Helvetica Neue',sans-serif;letter-spacing:.06em;color:var(--ink2)">
    ${esc(m.date || '')} · p${m.page}${m.picMarker ? ' · <span style="color:var(--chg)">✎ PIC</span>' : ''}${m.illustrated ? ' · <span style="color:var(--green)">DRAWN</span>' : ''}${m.confidence === 'low' ? ' · <span style="color:var(--rose)">MAYBE</span>' : ''}
  </div>
  <div style="color:var(--ink);font-size:15px;line-height:1.5;margin-top:6px;white-space:pre-line">${esc(m.quote)}</div>
</div>`;
const co = ms.filter(m => m.kind === 'coincidence'), mo = ms.filter(m => m.kind !== 'coincidence');
const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Journal moments — sweep 1</title>
<link rel="stylesheet" href="/compare.css">
<div class="wrap">
  <h1>Journal moments — sweep 1</h1>
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
    '<b>✎ PIC</b> = your own (pic) marker sits on it in the journal, so it may already be drawn. ' +
    '<b>DRAWN</b> = the drawing is confirmed in the scanned PDF. ' +
    '<b>MAYBE</b> = a shakier call, included rather than dropped. ' +
    'A note on any card reaches this chat — mark the keepers, the wrong ones, anything misread.' });
})();
</script>`;
await writeFile(new URL('./compare_page.html', import.meta.url), html);
if (process.argv.includes('--dry')) { console.log('dry: wrote compare_page.html,', html.length, 'chars'); process.exit(0); }
const sid = (process.env.CLAUDE_CODE_REMOTE_SESSION_ID || '').replace(/^cse_/, '');
const r = await fetch('https://imageforge-q125.onrender.com/api/chatfeed/page', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat: CHAT, session: sid, title: 'Journal moments — sweep 1', html })
});
console.log(JSON.stringify(await r.json(), null, 1));
