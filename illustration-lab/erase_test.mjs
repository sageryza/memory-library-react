// Test AI text-removal on a few doodles. gpt-image-1 edits, input_fidelity high.
// Shows before/after so we can judge whether it preserves the hand's line.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const IN = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1/curated/train';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1/erase';
const KEY = process.env.OPENAI_API_KEY;
const fs = createRequire('/home/user/memory-library-react/functions/')('fs');
fs.mkdirSync(OUT, { recursive: true });

const FILES = [
  'composite-special-stickers-copy__006.png',
  'september-special-stickers-2__010.png',
  'end-of-march-special-stickers__019.png',
  'march-special-stickers-recreational__017.png',
];
const PROMPT = 'Remove every handwritten word, letter, number, and text annotation from this '
  + 'image. Keep the line drawing exactly as it is — same wobbly hand-drawn pen lines, same '
  + 'position, same style — on a plain white background. Erase only the text. Do not redraw, '
  + 'smooth, or add anything.';

async function erase(file) {
  const png = await sharp(join(IN, file)).flatten({ background: '#fff' }).resize(1024, 1024, { fit: 'contain', background: '#fff' }).png().toBuffer();
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', PROMPT);
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  form.append('input_fidelity', 'high');
  form.append('n', '1');
  form.append('image[]', new Blob([png], { type: 'image/png' }), file.replace(/\.png$/, '.png'));
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0,200)}`);
  return Buffer.from((await res.json()).data[0].b64_json, 'base64');
}

const pairs = [];
for (const f of FILES) {
  const before = await sharp(join(IN, f)).flatten({ background: '#fff' }).resize(360, 360, { fit: 'contain', background: '#fff' }).toBuffer();
  let after;
  try { after = await sharp(await erase(f)).resize(360, 360, { fit: 'contain', background: '#fff' }).toBuffer(); }
  catch (e) { console.error('FAIL', f, e.message); after = await sharp({create:{width:360,height:360,channels:3,background:'#fdd'}}).png().toBuffer(); }
  pairs.push(before, after);
  console.log('done', f);
}
// grid: rows = files, col0 before, col1 after
const lbl = (t) => Buffer.from(`<svg width="360" height="22"><rect width="360" height="22" fill="#222"/><text x="6" y="16" font-family="sans-serif" font-size="14" fill="#fff">${t}</text></svg>`);
const comp = [{ input: lbl('BEFORE'), top: 0, left: 0 }, { input: lbl('AFTER — text erased'), top: 0, left: 360 }];
for (let i = 0; i < FILES.length; i++) {
  comp.push({ input: pairs[i*2], top: 22 + i*360, left: 0 });
  comp.push({ input: pairs[i*2+1], top: 22 + i*360, left: 360 });
}
await sharp({ create: { width: 720, height: 22 + FILES.length*360, channels: 3, background: '#fff' } })
  .composite(comp).png().toFile(join(OUT, '_beforeafter.png'));
console.log('wrote _beforeafter.png');
