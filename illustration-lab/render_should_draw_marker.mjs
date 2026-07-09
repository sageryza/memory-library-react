import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const LAB = '/home/user/memory-library-react/illustration-lab';
const OUT = `${SP}/should_draw_marker`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const sd = JSON.parse(await readFile(`${LAB}/should_draw.json`, 'utf8'));
const chunks = [sd.slice(0, 9), sd.slice(9, 18), sd.slice(18, 22)];
const full = await readFile(`${LAB}/chatgpt_grid_prompt.txt`, 'utf8');
const BASE = full.slice(0, full.indexOf('For the nine cells')).trim();

// her original marker reference doodles
const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const ORDER = ['ref-fish', 'ref-puzzle', 'ref-firstaid', 'ref-chess', 'ref-cereal', 'ref-viewer', 'ref-wagon'];
const refs = [];
for (const name of ORDER) refs.push({ name: `${name}.webp`, buf: await readFile(join(DIR, `${name}.webp`)) });

function prompt(items) {
  const n = items.length;
  let base = BASE;
  const word = n === 9 ? 'nine' : n === 4 ? 'four' : `${n}`;
  if (n !== 9) base = base.replace(/3x3 grid/g, n === 4 ? '2x2 grid' : `grid of ${n}`);
  const cells = items.map((it, i) => `${i + 1}) ${it.image}`).join('\n');
  return `${base}\n\nFor the ${word} cells, draw exactly these ${word} scenes, one per cell, in the raw reference sketch style, no caption text:\n${cells}`;
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
await Promise.all([
  render('marker1_moments_1-9', chunks[0]),
  render('marker2_moments_10-18', chunks[1]),
  render('marker3_moments_19-22', chunks[2]),
]);
console.log('DONE');
