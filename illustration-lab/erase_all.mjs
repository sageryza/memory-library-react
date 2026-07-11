// For each usable training image: detect handwritten text (cheap vision); if
// present, erase it with gpt-image-1 (input_fidelity high, line preserved);
// otherwise copy the original untouched. Outputs cleaned PNGs + a status log.
import { createRequire } from 'module';
const req = createRequire('/home/user/memory-library-react/functions/');
const sharp = req('sharp'); const fs = req('fs');
import { readdir, readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const IN = process.argv[2];
const CAPS = JSON.parse(await readFile(process.argv[3], 'utf8'));
const OUT = process.argv[4];
const KEY = process.env.OPENAI_API_KEY;
await mkdir(OUT, { recursive: true });

const files = (await readdir(IN)).filter(f => /\.png$/i.test(f) && CAPS[f] && !/^unclear$/i.test(CAPS[f])).sort();

async function hasText(file) {
  const b = await sharp(join(IN, file)).flatten({ background: '#fff' }).resize(512, 512, { fit: 'inside' }).png().toBuffer();
  const body = { model: 'gpt-4o-mini', temperature: 0, max_tokens: 3, messages: [
    { role: 'system', content: 'You detect handwriting. Answer only "yes" or "no": does the image contain any handwritten words or letters (ignore the drawing itself and single symbols like $ or x)?' },
    { role: 'user', content: [{ type: 'text', text: 'Handwritten words present?' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${b.toString('base64')}` } }] },
  ] };
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('detect ' + r.status);
  return /yes/i.test((await r.json()).choices?.[0]?.message?.content || '');
}
const PROMPT = 'Remove every handwritten word, letter, number, and text annotation from this '
  + 'image. Keep the line drawing exactly as it is — same wobbly hand-drawn pen lines, same '
  + 'position, same style — on a plain white background. Erase only the text. Do not redraw, '
  + 'smooth, or add anything.';
async function erase(file) {
  const png = await sharp(join(IN, file)).flatten({ background: '#fff' }).resize(1024, 1024, { fit: 'contain', background: '#fff' }).png().toBuffer();
  const form = new FormData();
  form.append('model', 'gpt-image-1'); form.append('prompt', PROMPT);
  form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('input_fidelity', 'high'); form.append('n', '1');
  form.append('image[]', new Blob([png], { type: 'image/png' }), file);
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
  if (!r.ok) throw new Error('erase ' + r.status + ' ' + (await r.text()).slice(0,120));
  return Buffer.from((await r.json()).data[0].b64_json, 'base64');
}

let idx = 0, erased = 0, kept = 0, failed = 0; const CONC = 6; const status = {};
async function worker() {
  while (idx < files.length) {
    const f = files[idx++];
    try {
      if (await hasText(f)) {
        const buf = await erase(f);
        await writeFile(join(OUT, f), buf); status[f] = 'erased'; erased++;
      } else { await copyFile(join(IN, f), join(OUT, f)); status[f] = 'clean'; kept++; }
    } catch (e) { await copyFile(join(IN, f), join(OUT, f)); status[f] = 'failed:' + e.message; failed++; }
    const n = erased + kept + failed; if (n % 25 === 0) console.log(`  ${n}/${files.length} (erased ${erased}, clean ${kept}, fail ${failed})`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
await writeFile(join(OUT, '_status.json'), JSON.stringify(status, null, 2));
console.log(`DONE ${files.length} | erased ${erased} | clean ${kept} | failed ${failed}`);
