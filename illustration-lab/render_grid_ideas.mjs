import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/grid_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

// canonical grid prompt, minus its final "For the nine cells..." paragraph
const full = await readFile('/home/user/memory-library-react/illustration-lab/chatgpt_grid_prompt.txt', 'utf8');
const BASE = full.slice(0, full.indexOf('For the nine cells')).trim();

const nine = JSON.parse(await readFile(`${SP}/grid9.json`, 'utf8'));

// Version A — ChatGPT distills: give it the verbatim journal line, let it decide what to draw
const cellsA = nine.map((n, i) => `Cell ${i + 1} is based on this line from the user's journal: "${n.quote}"`).join('\n');
const promptA = BASE + '\n\nFor the nine cells, each panel is based on a line from the user\'s journal below. Read each line and draw your OWN simple marker-sketch interpretation of the scene or object it describes, keeping the raw reference style. Do not add caption text.\n' + cellsA;

// Version B — I distill: explicit description of what to draw per cell
const cellsB = nine.map((n, i) => `${i + 1}) ${n.desc}`).join('\n');
const promptB = BASE + '\n\nFor the nine cells, draw exactly these nine scenes, one per cell, in the raw reference style, no caption text:\n' + cellsB;

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const ORDER = ['ref-fish', 'ref-puzzle', 'ref-firstaid', 'ref-chess', 'ref-cereal', 'ref-viewer', 'ref-wagon'];
const refs = [];
for (const name of ORDER) refs.push({ name: `${name}.webp`, buf: await readFile(join(DIR, `${name}.webp`)) });

async function render(id, prompt) {
  await writeFile(`${OUT}/${id}_prompt.txt`, prompt);
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);
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
  render('gridA_chatgpt_distills', promptA),
  render('gridB_i_distill', promptB),
]);
console.log('DONE');
