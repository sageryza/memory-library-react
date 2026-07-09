import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/hybrid_grid`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';

const nine = JSON.parse(await readFile(`${SP}/grid9.json`, 'utf8'));
const cells = nine.map((n, i) => `${i + 1}) ${n.desc}`).join('\n');

const STYLE = 'cute cozy storybook illustration: confident black ink outline, soft pastel watercolor fills '
  + '(mint green, lavender, pink), gentle wavy shading, a few tiny sparkles, clean white background, whimsical and charming';

const promptDescribe = `Create ONE hand-drawn 3x3 grid of nine separate drawings, one per cell, in this exact art style: ${STYLE}. Draw these nine scenes, one per cell, no caption text:\n${cells}`;
const promptInfer = `Create ONE hand-drawn 3x3 grid of nine separate drawings, one per cell, in the SAME art style as the reference images — match their linework, soft pastel colours, wavy fills, and overall feel. Draw these nine scenes, one per cell, no caption text:\n${cells}`;

// cut-up tiles (6 of the cool-pastel tiles)
const TILE_NAMES = ['mint_boots', 'mint_gift', 'mint_marbles', 'mint_unicorn', 'mint_world', 'mint_chest'];
const tiles = [];
for (const n of TILE_NAMES) tiles.push({ name: `${n}.png`, buf: await readFile(join(`${SP}/style_refs`, `${n}.png`)) });

// full uncut grid sheets (cool-pastel ones)
const GRID_FILES = ['662981dc-102D1552D90D4ACCACFF34ECC0E4C6C5.png', '02f53e28-D169815124F344FDA88A4386E3390D56.png', 'd8839d04-24E84FFA87B24DB699B5EA4AC2E59570.png'];
const grids = [];
for (const f of GRID_FILES) grids.push({ name: f.slice(0, 8) + '.png', buf: await readFile(join(UP, f)) });

async function render(id, prompt, refs, quality) {
  await writeFile(`${OUT}/${id}_prompt.txt`, prompt);
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', prompt);
    form.append('size', '1024x1024'); form.append('quality', quality); form.append('n', '1');
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

const jobs = [
  ['1_describe_tiles_med', promptDescribe, tiles, 'medium'],
  ['2_infer_tiles_med',    promptInfer,    tiles, 'medium'],
  ['3_describe_grids_med', promptDescribe, grids, 'medium'],
  ['4_infer_grids_med',    promptInfer,    grids, 'medium'],
  ['5_describe_tiles_high',promptDescribe, tiles, 'high'],
];
let i = 0; async function worker() { while (i < jobs.length) { const [id, p, r, q] = jobs[i++]; await render(id, p, r, q); } }
await Promise.all([worker(), worker(), worker()]);
console.log('DONE');
