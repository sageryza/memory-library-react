// A/B gpt-image-1 vs gpt-image-2 for the miracle engine: same refs, same
// prompt, same concept. Reports wall-clock per render.
import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const REFS = '/home/user/memory-library-react/functions/miracle-refs';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/modelab';
require('fs').mkdirSync(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const CONCEPT = 'a birthday cake with a little "CLOSED" sign hanging on it';
const PROMPT =
  'A single small object drawn as a simple doodle / icon, centered with lots of empty '
  + 'space — like a quick diagram, NOT a scene, on a plain uncluttered background like the '
  + 'reference paper. Loose, imperfect, hand-drawn with a thin black ballpoint pen, wobbly '
  + `uneven lines, childlike and minimal, like the reference images. No shading, no solid `
  + `black fills, no color, NO people, NO hands. Draw: ${CONCEPT}. Do NOT write the object's `
  + "name or any caption/title anywhere. Only include words if they are literally part of "
  + "the idea (e.g. a 'CLOSED' sign, a small 'x3'); otherwise no text at all.";

async function gen(model) {
  const files = (await readdir(REFS)).filter(f => /\.(webp|png|jpe?g)$/i.test(f)).sort();
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', PROMPT);
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  // gpt-image-2 rejects input_fidelity (its reference-following is built in);
  // gpt-image-1 needs it to copy the hand-drawn look faithfully.
  if (model === 'gpt-image-1') form.append('input_fidelity', 'high');
  form.append('n', '1');
  for (const f of files) {
    const b = await readFile(join(REFS, f));
    form.append('image[]', new Blob([b], { type: f.endsWith('.webp') ? 'image/webp' : 'image/png' }), f);
  }
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) { console.log(`${model}: FAILED ${res.status} after ${secs}s — ${(await res.text()).slice(0, 200)}`); return null; }
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await sharp(buf).png().toFile(join(OUT, `${model}.png`));
  console.log(`${model}: OK in ${secs}s`);
  return secs;
}

// Run sequentially so timings are clean.
await gen('gpt-image-1');
await gen('gpt-image-2');
console.log('done ->', OUT);
