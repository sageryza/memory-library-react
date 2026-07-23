// Build the cherry-picked mini gallery: only drawings scored clearly
// recognizable (>=4), each shown with what it was recognized AS, so wrong
// reads can be vetoed. Self-contained HTML.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const W = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1';
const IN = `${W}/erased_curated/train`;
const REC = JSON.parse(await readFile(`${W}/recognize.json`, 'utf8'));
const OUT = `${W}/picks_gallery.html`;

const picks = Object.entries(REC)
  .filter(([, v]) => v && v.score >= 4)
  .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));

const cards = [];
for (const [f, v] of picks) {
  const thumb = await sharp(join(IN, f)).flatten({ background: '#fff' })
    .resize(420, 420, { fit: 'contain', background: '#fff' }).webp({ quality: 72 }).toBuffer();
  cards.push({ uri: `data:image/webp;base64,${thumb.toString('base64')}`, label: v.label, score: v.score, f });
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAGEDIAGRAM — training picks</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 18px;z-index:5}
h1{margin:0;font-size:18px}.sub{font-size:12px;opacity:.7;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;position:relative}
.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;cursor:zoom-in}
.lbl{padding:7px 8px;font-size:12px;border-top:1px solid var(--line)}
.s5{position:absolute;top:6px;right:6px;background:#2a7;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px}
.s4{position:absolute;top:6px;right:6px;background:#c90;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:20;cursor:zoom-out}
#lb img{max-width:92vw;max-height:88vh;background:#fff;border-radius:8px}
</style></head><body>
<header><h1>Training picks — ${cards.length} clearly recognizable drawings</h1>
<div class="sub">Each label is what it was recognized AS (green = unmistakable, gold = clear). If a label is wrong, tell me which and I'll drop it.</div></header>
<div class="grid" id="g"></div><div id="lb"><img></div>
<script>
const DATA=${JSON.stringify(cards)};
const g=document.getElementById('g');
for(const c of DATA){
  const d=document.createElement('div');d.className='card';
  const badge=document.createElement('span');badge.className='s'+c.score;badge.textContent=(c.score===5?'★ 5':'4');
  const img=document.createElement('img');img.loading='lazy';img.src=c.uri;
  img.onclick=()=>{const lb=document.getElementById('lb');lb.querySelector('img').src=c.uri;lb.style.display='flex'};
  const lbl=document.createElement('div');lbl.className='lbl';lbl.textContent=c.label;
  d.appendChild(badge);d.appendChild(img);d.appendChild(lbl);g.appendChild(d);
}
document.getElementById('lb').onclick=()=>document.getElementById('lb').style.display='none';
</script></body></html>`;
await writeFile(OUT, html);
console.log('picked', cards.length, 'of', Object.keys(REC).length, '->', OUT);
