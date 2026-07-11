import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/should_draw_grids`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const sd = JSON.parse(await readFile('/home/user/memory-library-react/illustration-lab/should_draw.json', 'utf8'));
const chunks = [sd.slice(0, 9), sd.slice(9, 18), sd.slice(18, 22)];

const TILE_NAMES = ['mint_boots', 'mint_gift', 'mint_marbles', 'mint_unicorn', 'mint_world', 'mint_chest'];
const tiles = [];
for (const n of TILE_NAMES) tiles.push({ name: `${n}.png`, buf: await readFile(join(`${SP}/style_refs`, `${n}.png`)) });

function prompt(items) {
  const n = items.length;
  const gridWord = n === 9 ? 'a 3x3 grid of nine' : n === 4 ? 'a 2x2 grid of four' : `a grid of ${n}`;
  const numWord = n === 9 ? 'nine' : n === 4 ? 'four' : `${n}`;
  const cells = items.map((it, i) => `${i + 1}) ${it.image}`).join('\n');
  return `Copy the style of these reference images. Create ONE ${gridWord} separate drawings, one per cell. Draw these ${numWord} scenes, one per cell, no caption text:\n${cells}`;
}

async function render(id, items) {
  const p = prompt(items);
  await writeFile(`${OUT}/${id}_prompt.txt`, p);
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', p);
    form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('n', '1');
    for (const r of tiles) form.append('image[]', new Blob([r.buf], { type: 'image/png' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 93 }).toFile(`${OUT}/${id}.webp`);
      console.log(id, 'ok'); return;
    }
    const t = await res.text(); console.log(id, res.status, t.slice(0, 120));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 10000 * a)); continue; }
    return;
  }
}
await Promise.all([
  render('grid1_moments_1-9', chunks[0]),
  render('grid2_moments_10-18', chunks[1]),
  render('grid3_moments_19-22', chunks[2]),
]);
console.log('DONE');
