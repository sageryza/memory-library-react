import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const LAB = '/home/user/memory-library-react/illustration-lab';
const OUT = `${SP}/should_draw_marker`;
const KEY = process.env.OPENAI_API_KEY;

const sd = JSON.parse(await readFile(`${LAB}/should_draw.json`, 'utf8'));
const chunks = { 'marker1_moments_1-9': sd.slice(0, 9), 'marker2_moments_10-18': sd.slice(9, 18) };
const full = await readFile(`${LAB}/chatgpt_grid_prompt.txt`, 'utf8');
const BASE = full.slice(0, full.indexOf('For the nine cells')).trim();

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const ORDER = ['ref-fish', 'ref-puzzle', 'ref-firstaid', 'ref-chess', 'ref-cereal', 'ref-viewer', 'ref-wagon'];
const refs = [];
for (const name of ORDER) refs.push({ name: `${name}.webp`, buf: await readFile(join(DIR, `${name}.webp`)) });

const FRAME = 'IMPORTANT LAYOUT: draw a COMPLETE 3x3 grid — exactly three columns and three rows, nine equal square cells. '
  + 'Fit the ENTIRE grid inside the image with a clear white margin all around it; do not zoom in, do not crop any cell, do not let the grid run off any edge, and keep every one of the nine cells fully visible and separate (never merge two scenes into one cell). One scene per cell.';

function prompt(items) {
  const cells = items.map((it, i) => `${i + 1}) ${it.image}`).join('\n');
  return `${BASE}\n\n${FRAME}\n\nFor the nine cells, draw exactly these nine scenes, one per cell, in the raw reference sketch style, no caption text:\n${cells}`;
}

async function render(id, items) {
  const p = prompt(items);
  await writeFile(`${OUT}/${id}_prompt.txt`, p);
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', p);
    form.append('size', '1024x1024'); form.append('quality', 'high'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 94 }).toFile(`${OUT}/${id}.webp`);
      console.log(id, 'ok'); return;
    }
    const t = await res.text(); console.log(id, res.status, t.slice(0, 120));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 10000 * a)); continue; }
    return;
  }
}
await Promise.all(Object.entries(chunks).map(([id, items]) => render(id, items)));
console.log('DONE');
