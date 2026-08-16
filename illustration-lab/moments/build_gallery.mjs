// Build a static review page from moments.json.
// Usage: node build_gallery.mjs moments.json moments_gallery.html
import { readFile, writeFile } from 'node:fs/promises';
const ms = JSON.parse(await readFile(process.argv[2] ?? 'moments.json', 'utf8'));
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const card = m => `
<div class="card ${m.kind}${m.picMarker ? ' haspic' : ''}">
  <div class="head"><span class="kind">${m.kind === 'coincidence' ? '✨ coincidence' : 'moment'}</span>
  <span class="meta">${esc(m.date || '')} · p${m.page}${m.picMarker ? ' · ✎ pic' : ''} · ${m.confidence}</span></div>
  <div class="title">${esc(m.title)}</div>
  <blockquote>${esc(m.quote)}</blockquote>
  ${m.picContext ? `<div class="picctx">pic marker: “${esc(m.picContext)}”</div>` : ''}
</div>`;
const co = ms.filter(m => m.kind === 'coincidence'), mo = ms.filter(m => m.kind !== 'coincidence');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Journal moments</title>
<style>
body{font-family:Georgia,serif;background:#faf7f2;color:#2a2620;margin:0;padding:16px;max-width:760px;margin:0 auto}
h1{font-size:22px;margin:12px 0 2px} .sub{color:#8a8072;font-size:13px;margin-bottom:14px}
h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#8a8072;margin:26px 0 10px;font-family:Helvetica,Arial,sans-serif}
.card{background:#fff;border:1px solid #e7e0d4;border-radius:6px;padding:12px 14px;margin:10px 0}
.card.coincidence{border-left:3px solid #b8860b}
.head{display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.05em}
.kind{color:#b8860b;text-transform:uppercase}.card.moment .kind{color:#8a8072}
.meta{color:#8a8072}
.title{font-weight:bold;margin:6px 0 4px}
blockquote{margin:6px 0;color:#4a443a;font-size:14px;line-height:1.45;white-space:pre-wrap}
.picctx{font-size:12px;color:#8a8072;font-style:italic}
</style>
<h1>Journal moments</h1>
<div class="sub">${ms.length} found · ${co.length} coincidences · ${mo.length} little moments · ${ms.filter(m=>m.picMarker).length} with a pic marker</div>
<h2>Coincidences</h2>${co.map(card).join('')}
<h2>Little moments</h2>${mo.map(card).join('')}`;
await writeFile(process.argv[3] ?? 'moments_gallery.html', html);
console.log('wrote', process.argv[3] ?? 'moments_gallery.html', ms.length, 'cards');
