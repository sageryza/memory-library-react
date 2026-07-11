// Static, no-JavaScript picks gallery: every card is plain HTML with the image
// inline, so it renders in any viewer (including no-JS previews).
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const W = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1';
const IN = `${W}/erased_curated/train`;
const REC = JSON.parse(await readFile(`${W}/recognize.json`, 'utf8'));
const OUT = `${W}/picks_static.html`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const picks = Object.entries(REC)
  .filter(([, v]) => v && v.score >= 4)
  .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));

let cardsHtml = '';
for (const [f, v] of picks) {
  const thumb = await sharp(join(IN, f)).flatten({ background: '#fff' })
    .resize(380, 380, { fit: 'contain', background: '#fff' }).webp({ quality: 68 }).toBuffer();
  cardsHtml += `<div class="card"><span class="s${v.score}">${v.score === 5 ? '★ 5' : '4'}</span>`
    + `<img src="data:image/webp;base64,${thumb.toString('base64')}" alt="">`
    + `<div class="lbl">${esc(v.label)}</div></div>\n`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAGEDIAGRAM — training picks (static)</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{background:var(--bg);border-bottom:1px solid var(--line);padding:14px 18px}
h1{margin:0;font-size:18px}.sub{font-size:12px;opacity:.7;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;position:relative}
.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;display:block}
.lbl{padding:7px 8px;font-size:12px;border-top:1px solid var(--line)}
.s5{position:absolute;top:6px;right:6px;background:#2a7;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px}
.s4{position:absolute;top:6px;right:6px;background:#c90;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px}
</style></head><body>
<header><h1>Training picks — ${picks.length} clearly recognizable drawings</h1>
<div class="sub">Each label is what the drawing was recognized AS (green ★5 = unmistakable, gold 4 = clear). If a label is wrong, tell me which and I'll drop it from training.</div></header>
<div class="grid">
${cardsHtml}</div></body></html>`;
await writeFile(OUT, html);
console.log('static gallery:', picks.length, 'cards ->', OUT);
