import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/journal_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (c) =>
  'A single object drawn as a simple doodle / icon, centered and drawn LARGE so it '
  + 'fills most of the frame — like a quick diagram, NOT a scene, on a plain uncluttered '
  + 'WHITE background like the reference images. Loose, imperfect, hand-drawn with a '
  + 'thin black ballpoint pen, wobbly uneven lines, childlike and minimal, like the '
  + 'reference images. No shading, no solid black fills, no color. NO whole people and '
  + 'NO stick figures — a single body part (like a hand holding something) is fine when '
  + `the idea calls for it. Draw: ${c}. Do NOT write the object's name or any `
  + "caption/title anywhere. Only include words if they are literally part of the idea "
  + "(e.g. a 'CLOSED' sign); otherwise no text at all.";

const MOMENTS = [
  { id: 'glass', title: 'green glass in the sock',
    quote: 'a little piece of green glass in one of my black socks right now… I can feel it when I walk. It reminds me of summer.',
    concepts: [
      'a black sock with a tiny triangular shard of green glass glinting inside it, a few little sparkle marks around the shard',
      'a broken green glass bottle whose scattered shards trail across into a single black sock' ] },
  { id: 'knex', title: 'k’nex sentences',
    quote: 'each sentence you have to click together like k’nex in your head.',
    concepts: [
      'two K’nex-style connector pieces (a round hub and a rod) snapping together',
      'a short row of K’nex rods and round connectors linked into a single chain, like a sentence built of parts' ] },
  { id: 'sheep', title: 'three colors of sheep (average/median/mean)',
    quote: 'I thought of them as 3 colors of sheep… black, gray, and white.',
    concepts: [
      'three little sheep standing in a row, one drawn solid black, one with gray scribbled wool, one left white',
      'three sheep — black, gray, white — lined up on a single baseline like a tiny bar chart' ] },
  { id: 'sunset', title: 'the sunset drink',
    quote: 'mine had orange in it, like a sunset — standing half in, half out of the pool.',
    concepts: [
      'a cocktail glass whose layered contents form a little sunset — a round sun sitting on the liquid’s horizon line',
      'a tall drink glass half-submerged in water, the liquid inside drawn as a small sunset with a low sun' ] },
  { id: 'squirrel', title: 'me & the squirrel, granola',
    quote: 'I am watching myself eat granola, and I am enjoying it as I enjoyed watching the squirrel eat it.',
    concepts: [
      'a human hand and a squirrel’s paw reaching toward each other, each pinching a little piece of granola',
      'one bowl of granola split down the middle — a human hand dipping into one half, a squirrel nibbling from the other' ] },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

const jobs = [];
for (const m of MOMENTS) m.concepts.forEach((c, i) => jobs.push({ mid: m.id, idx: i, c }));

async function render(j) {
  const file = `${OUT}/${j.mid}-${j.idx}.webp`;
  try { await readFile(file); return; } catch {}
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-1-mini');
    form.append('prompt', PROMPT(j.c));
    form.append('size', '1024x1024'); form.append('quality', 'low'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 78 }).toFile(file);
      console.log(`${j.mid}-${j.idx} ok`); return;
    }
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 12000*a)); continue; }
    console.log(`${j.mid}-${j.idx} FAIL ${res.status}`); return;
  }
}
let idx = 0;
async function worker() { while (idx < jobs.length) { await render(jobs[idx++]); } }
await Promise.all(Array.from({ length: 6 }, worker));

const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
async function uri(p){ try { const b = await readFile(p); return `data:image/webp;base64,${b.toString('base64')}`; } catch { return null; } }
let cards = '';
for (const m of MOMENTS) {
  let figs = '';
  for (let i = 0; i < m.concepts.length; i++) {
    const u = await uri(`${OUT}/${m.id}-${i}.webp`);
    figs += `<figure>${u?`<img src="${u}">`:'<div class="miss">—</div>'}<figcaption>${esc(m.concepts[i])}</figcaption></figure>`;
  }
  cards += `<div class="card"><div class="hd">${esc(m.title)}</div>
<div class="quote">"${esc(m.quote)}"</div><div class="pair">${figs}</div></div>\n`;
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Journal moments — Claude's picks from February</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:15px 18px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:17px}
.sub{font-size:12px;opacity:.72;margin-top:4px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;margin:13px;padding:13px}
.hd{font-weight:700;font-size:15px;margin-bottom:5px}
.quote{font-size:13px;font-style:italic;color:#463f35;margin-bottom:10px;line-height:1.4}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
figure{margin:0}figure img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:11px;padding-top:5px;opacity:.8;line-height:1.35}
.miss{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;color:#a99}
</style></head><body>
<header><h1>Journal moments — my picks from your February</h1>
<div class="sub">Five unmarked moments (no "(pic)" beside them), distilled the way your marked ones taught me. Two concept angles each, rendered on the app fast tier (mini · low · 7 refs).</div></header>
${cards}</body></html>`;
await writeFile(`${SP}/journal_moments_gallery.html`, html);
console.log('GALLERY DONE');
