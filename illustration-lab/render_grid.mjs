import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const KEY = process.env.OPENAI_API_KEY;

// The verbatim ChatGPT grid prompt — the single source of truth (no ad-hoc prompt).
const PROMPT = (await readFile(`${SP}/chatgpt_grid_prompt.txt`, 'utf8')).trim();

// References attached in the EXACT A–G order the prompt names them.
const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const ORDER = ['ref-fish', 'ref-puzzle', 'ref-firstaid', 'ref-chess', 'ref-cereal', 'ref-viewer', 'ref-wagon'];
const refs = [];
for (const name of ORDER) refs.push({ name: `${name}.webp`, buf: await readFile(join(DIR, `${name}.webp`)) });
console.log('refs in order:', ORDER.join(', '));

for (let a = 1; a <= 4; a++) {
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', PROMPT);
  form.append('size', '1024x1024');
  form.append('quality', 'high');
  form.append('n', '1');
  for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
  if (res.ok) {
    const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
    await sharp(buf).webp({ quality: 90 }).toFile(`${SP}/grid_chatgpt_high.webp`);
    console.log('ok', ((Date.now()-t0)/1000|0)+'s -> grid_chatgpt_high.webp');
    break;
  }
  const txt = await res.text(); console.log(res.status, txt.slice(0,120));
  if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 12000*a)); continue; }
  break;
}
