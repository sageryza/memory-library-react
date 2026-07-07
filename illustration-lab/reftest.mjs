// Compare reference sets for the OpenAI miracle engine, style variable only:
// same fixed concepts drawn with (A) the 8 new clean-background doodles vs
// (B) the current book-photo crops. Calls images/edits directly (no deploy).
import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
import { readFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const KEEP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/cleaned_demo/keep';
const NEWREFS = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/reftest/newrefs';
const OLDREFS = '/home/user/memory-library-react/functions/miracle-refs';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/reftest';
await mkdir(NEWREFS, { recursive: true });

const PICKS = ['02-Layer 3.png','19-Layer 36.png','20-Layer 37.png','26-Layer 74.png',
               '27-Layer 73.png','39-Layer 70.png','42-Layer 48.png','43-Layer 49.png'];
// Stage the 8: flatten to clean white, trim, square-pad -> what the engine would ship.
for (const f of PICKS) {
  const buf = await sharp(join(KEEP, f)).flatten({ background: '#fff' }).trim({ threshold: 12 }).toBuffer();
  const m = await sharp(buf).metadata();
  const s = Math.round(Math.max(m.width, m.height) * 1.12);
  await sharp({ create: { width: s, height: s, channels: 3, background: '#fff' } })
    .composite([{ input: buf, gravity: 'center' }]).resize(768, 768, { fit: 'contain', background: '#fff' })
    .webp({ quality: 92 }).toFile(join(NEWREFS, f.replace(/\.png$/, '.webp')));
}

const PROMPT = (c) =>
  'A single small object drawn as a simple doodle / icon, centered with lots of empty '
  + 'space — like a quick diagram, NOT a scene, on a plain uncluttered background like the '
  + 'reference paper. Loose, imperfect, hand-drawn with a thin black ballpoint pen, wobbly '
  + 'uneven lines, childlike and minimal, like the reference images. No shading, no solid '
  + `black fills, no color, NO people, NO hands. Draw: ${c}. Do NOT write the object's `
  + "name or any caption/title anywhere. Only include words if they are literally part of "
  + "the idea (e.g. a 'CLOSED' sign, a small 'x3'); otherwise no text at all.";

const KEY = process.env.OPENAI_API_KEY;
async function gen(concept, refDir) {
  const files = (await readdir(refDir)).filter(f => /\.(webp|png|jpe?g)$/i.test(f)).sort();
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', PROMPT(concept));
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  form.append('input_fidelity', 'high');
  form.append('n', '1');
  for (const f of files) {
    const b = await readFile(join(refDir, f));
    const type = f.endsWith('.webp') ? 'image/webp' : 'image/png';
    form.append('image[]', new Blob([b], { type }), f);
  }
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from((await res.json()).data[0].b64_json, 'base64');
}

const CONCEPTS = [
  ['cake', 'a birthday cake with a little "CLOSED" sign hanging on it'],
  ['capsule', 'a cracked-open capsule with a tiny stack of pancakes inside'],
];

for (const [slug, concept] of CONCEPTS) {
  for (const [tag, dir] of [['NEW', NEWREFS], ['OLD', OLDREFS]]) {
    try {
      const buf = await gen(concept, dir);
      await sharp(buf).png().toFile(join(OUT, `${slug}-${tag}.png`));
      console.log(`ok ${slug} ${tag}`);
    } catch (e) { console.error(`FAIL ${slug} ${tag}:`, e.message); }
  }
}

// Also emit a strip of the 8 staged refs so we can see the input set.
const rf = (await readdir(NEWREFS)).sort();
const strip = [];
for (let i = 0; i < rf.length; i++) {
  const th = await sharp(join(NEWREFS, rf[i])).resize(150, 150, { fit: 'contain', background: '#fff' }).toBuffer();
  strip.push({ input: th, left: (i % 8) * 152, top: 0 });
}
await sharp({ create: { width: 8 * 152, height: 150, channels: 3, background: '#fff' } }).composite(strip).png().toFile(join(OUT, '_refs8.png'));
console.log('done');
