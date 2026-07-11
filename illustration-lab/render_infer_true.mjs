import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/infer_true`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';

const nine = JSON.parse(await readFile(`${SP}/grid9.json`, 'utf8'));
const cells = nine.map((n, i) => `${i + 1}) ${n.desc}`).join('\n');
const PROMPT = `Copy the style of these reference images. Create ONE 3x3 grid of nine separate drawings, one per cell. Draw these nine scenes, one per cell, no caption text:\n${cells}`;
await writeFile(`${OUT}/prompt.txt`, PROMPT);

const TILE_NAMES = ['mint_boots', 'mint_gift', 'mint_marbles', 'mint_unicorn', 'mint_world', 'mint_chest'];
const tiles = [];
for (const n of TILE_NAMES) tiles.push({ name: `${n}.png`, buf: await readFile(join(`${SP}/style_refs`, `${n}.png`)) });

const GRID_FILES = ['662981dc-102D1552D90D4ACCACFF34ECC0E4C6C5.png', '02f53e28-D169815124F344FDA88A4386E3390D56.png', 'd8839d04-24E84FFA87B24DB699B5EA4AC2E59570.png'];
const cards = [];
for (const f of GRID_FILES) cards.push({ name: f.slice(0, 8) + '.png', buf: await readFile(join(UP, f)) });

async function render(id, refs) {
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', PROMPT);
    form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/png' }), r.name);
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
await Promise.all([render('infer_cards_med', cards), render('infer_tiles_med', tiles)]);
console.log('DONE');
