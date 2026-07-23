import { createRequire } from 'module';
const req = createRequire('/home/user/memory-library-react/functions/');
const sharp = req('sharp');
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const IN = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1/curated/train';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1';
const ERASED = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1/erased';
const KEY = process.env.OPENAI_API_KEY;
const F = 'composite-special-stickers-copy__006.png';

// full-res "before" (normalized like a training image)
const before = await sharp(join(IN, F)).flatten({ background: '#fff' }).resize(1024, 1024, { fit: 'contain', background: '#fff' }).png().toBuffer();
await writeFile(join(OUT, 'venn_before.png'), before);

// prefer the erased copy from the batch run if present, else erase now
let after;
try { after = await readFile(join(ERASED, F)); }
catch {
  const PROMPT = 'Remove every handwritten word, letter, number, and text annotation from this '
    + 'image. Keep the line drawing exactly as it is — same wobbly hand-drawn pen lines, same '
    + 'position, same style — on a plain white background. Erase only the text. Do not redraw, smooth, or add anything.';
  const form = new FormData();
  form.append('model', 'gpt-image-1'); form.append('prompt', PROMPT);
  form.append('size', '1024x1024'); form.append('quality', 'high'); form.append('input_fidelity', 'high'); form.append('n', '1');
  form.append('image[]', new Blob([before], { type: 'image/png' }), F);
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0,150));
  after = Buffer.from((await r.json()).data[0].b64_json, 'base64');
}
await writeFile(join(OUT, 'venn_after.png'), await sharp(after).png().toBuffer());
console.log('wrote venn_before.png + venn_after.png');
