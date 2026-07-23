import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/march_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (c) =>
  'Match the style of the reference images — a simple hand-drawn doodle in thin black '
  + 'pen on a plain white background, drawn LARGE and centered. STRICTLY black pen line '
  + 'only, no color, no shading, no solid fills. NO whole people, NO stick figures. '
  + `Draw: ${c}. No caption or title text unless it is literally part of the idea.`;

const M = [
  { id:'cage-open', t:'the cage with the open back',
    q:"a cage… 'I can't get out' — but secretly, if you look behind you, there's a wide open way out. the bars are real, but you can leave through the back.",
    c:'a birdcage with vertical bars across the front but its entire back wall wide open, a clear empty path leading out the back' },
  { id:'pill-book', t:'book instead of pills',
    q:'Instead of the pills every morning, you could look at your book of photographs, and remind yourself one paradox at a time, that the world isn’t as it seems.',
    c:'a tipped-over medicine pill bottle with a tiny open book spilling out of it instead of pills' },
  { id:'rabbits-sophie', t:'rabbits all named Sophie',
    q:'all of my rabbits… all of them being called Sophie.',
    c:'a row of four identical little rabbits, each wearing a small name tag that reads "Sophie"' },
  { id:'coin-fungible', t:'a coin for a coin',
    q:'the coin being sold for money… A coin for a coin makes the whole world fungible.',
    c:'a single coin with a small price tag hanging from it, the price tag showing a drawing of the very same coin' },
  { id:'eggs-cracked', t:'every egg cracked',
    q:'trying to find eggs in the fridge but all of them were cracked.',
    c:'an open egg carton in which every single egg is cracked' },
  { id:'slow-car', t:'slowness as identity',
    q:'waiting in line for slow cars… the slow becomes an identity… the whole world is slowed down by slow people.',
    c:'a long line of cars backed up bumper to bumper behind one lone small car at the very front' },
  { id:'throat-pebble', t:'a pebble, not a stone',
    q:'whether there is a stone in his throat — a small pebble, like gravel… even his subconscious knows a whole stone wouldn’t fit.',
    c:'a side profile of a neck with a tiny pebble drawn inside the throat, a larger stone crossed out beside it' },
  { id:'napkin-bounce', t:'the napkin that won’t leave',
    q:'The napkin ping-ponging around all the chairs was a meta version of all my problems… you can’t forget about them.',
    c:'a crumpled napkin bouncing between the seats of several cafe chairs, little dashed motion arrows tracing its path' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

async function render(m) {
  const file = `${OUT}/${m.id}.webp`;
  try { await readFile(file); return; } catch {}
  const t0 = Date.now();
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', PROMPT(m.c));
    form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 80 }).toFile(file);
      console.log(m.id, 'ok', ((Date.now()-t0)/1000|0)+'s'); return;
    }
    const t = await res.text();
    console.log(m.id, res.status, t.slice(0,70));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 20000*a)); continue; }
    return;
  }
}
let idx = 0;
async function worker(){ while (idx < M.length){ await render(M[idx++]); } }
await Promise.all(Array.from({ length: 5 }, worker));

const esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
async function uri(p){ try { const b=await readFile(p); return 'data:image/webp;base64,'+b.toString('base64'); } catch { return null; } }
let cards='';
for (const m of M){
  const u = await uri(`${OUT}/${m.id}.webp`);
  cards += `<div class="card">${u?`<img src="${u}">`:'<div class="miss">—</div>'}<div class="t">${esc(m.t)}</div><div class="q">"${esc(m.q)}"</div><div class="c">${esc(m.c)}</div></div>\n`;
}
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>March moments</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:14px 16px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:16px}.sub{font-size:12px;opacity:.72;margin-top:3px}
.wrap{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px}
.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
.t{font-weight:700;font-size:14px;margin-top:7px}.q{font-size:12px;font-style:italic;color:#5b5347;margin-top:4px;line-height:1.4}
.c{font-size:11px;opacity:.62;margin-top:5px;line-height:1.35}
.miss{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;color:#a99}
</style></head><body>
<header><h1>March moments — the hard-to-picture ones</h1>
<div class="sub">gpt-image-2 medium, minimal prompt + guardrails, 7 refs. Chosen by the "if it's hard to imagine, a diagram helps" rule.</div></header>
<div class="wrap">${cards}</div></body></html>`;
await writeFile(`${SP}/march_gallery.html`, html);
console.log('GALLERY DONE');
