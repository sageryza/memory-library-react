import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/new_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (c) =>
  'Match the style of the reference images — a simple hand-drawn doodle in thin black '
  + 'pen on a plain white background, drawn LARGE and centered. STRICTLY black pen line '
  + 'only, no color, no shading, no solid fills. NO whole people, NO stick figures. '
  + `Draw: ${c}. No caption or title text unless it is literally part of the idea.`;

// New, un-drawn Feb moments. `anchor` = a phrase that locates the source entry in
// the timeline (so the card can show the surrounding passage). Concepts written to
// be visually specific — each says what makes the picture legible.
const M = [
  { id:'tray-memories', anchor:'putting memories on it',
    c:'a flat serving tray holding a small scattered collection of little keepsake objects — a key, a seashell, a button, a tiny photo — arranged like specimens' },
  { id:'hand-letter', anchor:'handing someone a letter is an indirect way',
    c:'a stiff plastic mannequin hand held out flat, offering a single folded letter resting on the palm' },
  { id:'two-bears', anchor:'we were both bears',
    c:'two bears standing side by side facing forward, one clearly a big tall bear and the other a small short bear, plainly a matched pair' },
  { id:'red-frequency', anchor:'red frequency that goes above the line',
    c:'a long horizontal threshold line with a jagged heartbeat waveform running along it, and a single tall spike shooting up past the line, that one spike drawn heavier and shakier than the rest' },
  { id:'playlist-storm', anchor:'soft stars, hard thunder',
    c:'a phone screen showing a music playlist, its two track icons drawn as a cluster of soft little stars and a single hard jagged lightning bolt' },
  { id:'wrong-turn', anchor:'took a wrong turn',
    c:'a winding mountain trail seen from the side with a map location pin at the peak, and a fork lower down where one branch is marked with a small X as the wrong turn' },
  { id:'kraft-books', anchor:'no one will say they aren',
    c:'a neat stack of a few slim books with plain wrapped kraft-paper covers, only a few pages thick each' },
  { id:'cloth-debris', anchor:'uncovered the white of my cloth',
    c:'a hand snapping out a folded cloth, little specks and crumbs of debris scattering off it and falling to the floor below' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });
console.log('refs:', refs.length);

async function render(m) {
  const file = `${OUT}/${m.id}.webp`;
  try { await readFile(file); console.log(m.id, 'exists'); return; } catch {}
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
    console.log(m.id, res.status, t.slice(0,90));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 15000*a)); continue; }
    return;
  }
}
let idx = 0;
async function worker(){ while (idx < M.length){ await render(M[idx++]); } }
await Promise.all(Array.from({ length: 4 }, worker));
console.log('DONE');
