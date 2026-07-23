import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FINAL_PROMPT } from './final_prompt.mjs';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/toaster_matrix`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;
const concept = 'a boxy toaster-shaped space heater with a small worried face, giving off wavy heat lines';

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

const MODELS = [
  { model: 'gpt-image-1', fidelity: true },   // gpt-image-1 accepts input_fidelity
  { model: 'gpt-image-2', fidelity: false },  // gpt-image-2 rejects it
];
const Q = ['low','medium','high'];

async function render(m, q) {
  const file = `${OUT}/${m.model}-${q}.webp`;
  try { await readFile(file); return; } catch {}
  const t0 = Date.now();
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', m.model);
    form.append('prompt', FINAL_PROMPT(concept));
    form.append('size', '1024x1024'); form.append('quality', q); form.append('n', '1');
    if (m.fidelity) form.append('input_fidelity', 'high');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(460, 460, { fit: 'inside' }).webp({ quality: 84 }).toFile(file);
      console.log(`${m.model}-${q} ok ${((Date.now()-t0)/1000|0)}s`); return;
    }
    const t = await res.text(); console.log(`${m.model}-${q} ${res.status} ${t.slice(0,60)}`);
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 20000*a)); continue; }
    return;
  }
}
const jobs = [];
for (const m of MODELS) for (const q of Q) jobs.push({ m, q });
let idx = 0;
async function worker(){ while (idx < jobs.length){ const j = jobs[idx++]; await render(j.m, j.q); } }
await Promise.all(Array.from({ length: 4 }, worker));

// grid: rows = models, cols = low/med/high
const CELL=400, PAD=14, RL=120, TOP=26;
const W = RL + 3*(CELL+PAD) + PAD, H = TOP + 2*(CELL+PAD) + PAD;
const comps=[]; let svg='';
Q.forEach((q,i)=>{ const x=RL+PAD+i*(CELL+PAD)+CELL/2; svg+=`<text x="${x}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2e2a24">${q}</text>`; });
MODELS.forEach((m,r)=>{
  const y=TOP+PAD+r*(CELL+PAD);
  svg+=`<text x="6" y="${y+CELL/2}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2e2a24">${m.model.replace('gpt-image-','img ')}</text>`;
  Q.forEach((q,c)=>{ const x=RL+PAD+c*(CELL+PAD);
    try{}catch{}
    svg+=`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`;
  });
});
for (let r=0;r<MODELS.length;r++) for (let c=0;c<Q.length;c++){
  const x=RL+PAD+c*(CELL+PAD), y=TOP+PAD+r*(CELL+PAD);
  try{const t=await sharp(`${OUT}/${MODELS[r].model}-${Q[c]}.webp`).resize(CELL,CELL,{fit:'contain',background:'#fff'}).png().toBuffer();comps.push({input:t,left:x,top:y});}catch{}
}
await sharp({create:{width:W,height:H,channels:3,background:'#f4efe6'}})
  .composite([...comps,{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0}])
  .png().toFile(`${SP}/sheet_toaster_matrix.png`);
console.log('SHEET DONE');
