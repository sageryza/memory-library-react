// Before/after gallery for the text-erased images: original (with text) beside
// the erased version, so we can confirm the drawing line was preserved.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ORIG = process.argv[2];      // curated/train (before)
const ERASED = process.argv[3];    // erased (after)
const JUNK = process.argv[4];      // erased_curated/junk (now-blank)
const OUT = process.argv[5];
const status = JSON.parse(await readFile(join(ERASED, '_status.json'), 'utf8'));
const junkSet = new Set((await readdir(JUNK).catch(() => [])).filter(f => /\.png$/i.test(f)));
const erasedFiles = Object.keys(status).filter(f => status[f] === 'erased').sort();

async function thumb(p) {
  return `data:image/webp;base64,${(await sharp(p).flatten({ background: '#fff' })
    .resize(360, 360, { fit: 'contain', background: '#fff' }).webp({ quality: 74 }).toBuffer()).toString('base64')}`;
}
const cards = [];
for (const f of erasedFiles) {
  cards.push({ b: await thumb(join(ORIG, f)), a: await thumb(join(ERASED, f)), blank: junkSet.has(f) });
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Text erase — before / after</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 18px;z-index:5}
h1{margin:0;font-size:18px}.sub{font-size:12px;opacity:.7;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.card.blank{outline:2px solid #d98;}
.pair{display:grid;grid-template-columns:1fr 1fr}
.pair figure{margin:0;border-right:1px solid var(--line)}
.pair img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;display:block;cursor:zoom-in}
figcaption{font-size:11px;text-align:center;padding:3px;background:#faf6ee;border-top:1px solid var(--line)}
.flag{font-size:11px;color:#b45;padding:4px 8px;text-align:center}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:20;cursor:zoom-out}
#lb img{max-width:92vw;max-height:88vh;background:#fff;border-radius:8px}
</style></head><body>
<header><h1>Text erase — before / after (${cards.length})</h1>
<div class="sub">Left = original (with handwriting) · Right = erased. Red outline = erased to near-blank, dropped from training. Tap to zoom.</div></header>
<div class="grid" id="g"></div><div id="lb"><img></div>
<script>
const DATA=${JSON.stringify(cards)};
const g=document.getElementById('g');
for(const c of DATA){const d=document.createElement('div');d.className='card'+(c.blank?' blank':'');
 d.innerHTML='<div class="pair"><figure><img src="'+c.b+'"><figcaption>before</figcaption></figure><figure><img src="'+c.a+'"><figcaption>after</figcaption></figure></div>'+(c.blank?'<div class="flag">⚠ near-blank after erase — dropped</div>':'');
 d.querySelectorAll('img').forEach(im=>im.onclick=()=>{const lb=document.getElementById('lb');lb.querySelector('img').src=im.src;lb.style.display='flex'});
 g.appendChild(d);}
document.getElementById('lb').onclick=()=>document.getElementById('lb').style.display='none';
</script></body></html>`;
await writeFile(OUT, html);
console.log('wrote', OUT, '|', cards.length, 'before/after pairs |', [...junkSet].length, 'near-blank flagged');
