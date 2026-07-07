import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/taste_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (c) =>
  'Match the style of the reference images — a simple hand-drawn doodle in thin black '
  + 'pen on a plain white background, drawn LARGE and centered. STRICTLY black pen line '
  + 'only, no color, no shading, no solid fills. NO whole people, NO stick figures. '
  + `Draw: ${c}. Any words should look hand-lettered, small, and slightly wobbly.`;

const M = [
  { id:'anger-bottles',
    c:'a neat row of small upright specimen bottles, each with a little hand-lettered label; every label reads the word "anger" except one bottle near the end whose label reads "sadness"' },
  { id:'glasses-eyes',
    c:'a pair of eyeglasses drawn straight-on, with a wide open human eye — iris, pupil and a few lashes — drawn inside each lens, as if the glasses are staring back at you' },
  { id:'elephant-shoe',
    c:'an elephant bent down low to the ground, using its trunk to tie the laces of a single sneaker sitting in front of its feet' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

async function render(m) {
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
      await sharp(buf).resize(620, 620, { fit: 'inside' }).webp({ quality: 82 }).toFile(`${OUT}/${m.id}.webp`);
      console.log(m.id, 'ok'); return;
    }
    const t = await res.text(); console.log(m.id, res.status, t.slice(0,80));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 12000*a)); continue; }
    return;
  }
}
let i=0; async function worker(){ while(i<M.length){ await render(M[i++]); } }
await Promise.all(Array.from({length:3}, worker));
console.log('DONE');
