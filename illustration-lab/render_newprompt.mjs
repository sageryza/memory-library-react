import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/newprompt_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

// exact deployed MIRACLE_OPENAI_PROMPT
const PROMPT = (concept) =>
  'A single object drawn as a simple doodle / icon, centered and drawn LARGE so it '
  + 'fills most of the frame — like a quick diagram, NOT a scene, on a plain uncluttered '
  + 'WHITE background like the reference images. '
  + 'Loose, imperfect, hand-drawn with a thin black ballpoint pen, wobbly '
  + 'uneven lines, childlike and minimal, like the reference images. No shading, no solid '
  + 'black fills, no color. NO whole people and NO stick figures — a single body part '
  + '(like a hand holding something) is fine when the idea calls for it. '
  + `Draw: ${concept}. Do NOT write the object's `
  + 'name or any caption/title anywhere. Only include words if they are literally part of '
  + "the idea (e.g. a 'CLOSED' sign, a small 'x3'); otherwise no text at all.";

const CONCEPTS = [
  { id: 'owl',       c: 'an owl perched on a fence rail' },
  { id: 'england',   c: 'the outline of England wearing a little hat' },
  { id: 'cake',      c: 'a small three-layer cake drawn solid, inside a slightly larger dotted outline of the same cake' },
  { id: 'timer',     c: 'a kitchen timer wearing a tiny name tag that reads ME' },
  { id: 'crosswalk', c: 'a crosswalk whose two middle stripes are tied together in a little knot' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });
console.log('refs:', refFiles.length);

async function render(m, model, quality, fidelity, tag) {
  const t0 = Date.now();
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', PROMPT(m.c));
    form.append('size', '1024x1024'); form.append('quality', quality); form.append('n', '1');
    if (fidelity) form.append('input_fidelity', 'high');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
    });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(640, 640, { fit: 'inside' }).webp({ quality: 80 }).toFile(`${OUT}/${m.id}-${tag}.webp`);
      console.log(`${m.id}-${tag} ok ${(Date.now()-t0)/1000|0}s`);
      return;
    }
    const t = await res.text();
    console.log(`${m.id}-${tag} ${res.status} attempt ${a}: ${t.slice(0,90)}`);
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 15000*a)); continue; }
    return;
  }
}

const jobs = [];
for (const m of CONCEPTS) {
  jobs.push(() => render(m, 'gpt-image-1-mini', 'medium', false, 'mini'));
  jobs.push(() => render(m, 'gpt-image-1.5', 'medium', true, '15med'));
}
await Promise.all(jobs.map(j => j()));

// contact sheet: 5 rows x 2 cols
const CELL = 420, PAD = 14, LH = 34;
const rows = CONCEPTS.length, W = 2*(CELL+PAD)+PAD, H = rows*(CELL+LH+PAD)+PAD;
const comps = []; let svg = '';
for (let r = 0; r < rows; r++) {
  const m = CONCEPTS[r];
  for (let c = 0; c < 2; c++) {
    const tag = c === 0 ? 'mini' : '15med';
    const x = PAD + c*(CELL+PAD), y = PAD + r*(CELL+LH+PAD);
    try {
      const t = await sharp(`${OUT}/${m.id}-${tag}.webp`).resize(CELL, CELL, { fit: 'contain', background: '#fff' }).png().toBuffer();
      comps.push({ input: t, left: x, top: y });
    } catch {}
    svg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`
      + `<text x="${x+CELL/2}" y="${y+CELL+24}" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#2e2a24">${m.id} — ${c===0?'mini (medium)':'gpt-image-1.5 (medium)'}</text>`;
  }
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#f4efe6' } })
  .composite([...comps, { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 }])
  .png().toFile(`${SP}/sheet_newprompt.png`);
console.log('SHEET DONE');
