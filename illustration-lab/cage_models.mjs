import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FINAL_PROMPT } from './final_prompt.mjs';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/cage_models`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;
const concept = 'a birdcage with vertical bars across the front but its entire back wall wide open, a clear empty path leading out the back';
const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

const MODELS = [
  { model:'gpt-image-1',   fidelity:true },
  { model:'gpt-image-1.5', fidelity:true },
  { model:'gpt-image-2',   fidelity:false },
];
async function render(m) {
  const file = `${OUT}/${m.model}.webp`;
  try { await readFile(file); return; } catch {}
  const t0 = Date.now();
  for (let a=1;a<=4;a++){
    const form = new FormData();
    form.append('model', m.model);
    form.append('prompt', FINAL_PROMPT(concept));
    form.append('size','1024x1024'); form.append('quality','medium'); form.append('n','1');
    if (m.fidelity) form.append('input_fidelity','high');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type:'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', { method:'POST', headers:{ Authorization:`Bearer ${KEY}` }, body:form });
    if (res.ok){ const buf=Buffer.from((await res.json()).data[0].b64_json,'base64'); await sharp(buf).resize(470,470,{fit:'inside'}).webp({quality:84}).toFile(file); console.log(`${m.model} ok ${((Date.now()-t0)/1000|0)}s`); return; }
    const t=await res.text(); console.log(`${m.model} ${res.status} ${t.slice(0,60)}`);
    if (res.status===429||res.status>=500){ await new Promise(r=>setTimeout(r,20000*a)); continue; }
    return;
  }
}
await Promise.all(MODELS.map(render));

const CELL=440, PAD=14;
const comps=[]; let svg='';
const labs=['img 1 (fidelity)','img 1.5 (fidelity)','img 2 (no fidelity)'];
for (let c=0;c<MODELS.length;c++){ const x=PAD+c*(CELL+PAD);
  svg+=`<text x="${x+CELL/2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2e2a24">${labs[c]}</text>`;
  try{const t=await sharp(`${OUT}/${MODELS[c].model}.webp`).resize(CELL,CELL,{fit:'contain',background:'#fff'}).png().toBuffer();comps.push({input:t,left:x,top:26});}catch{}
  svg+=`<rect x="${x}" y="26" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`;
}
const W=MODELS.length*(CELL+PAD)+PAD, H=CELL+26+PAD;
await sharp({create:{width:W,height:H,channels:3,background:'#f4efe6'}})
  .composite([...comps,{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0}])
  .png().toFile(`${SP}/sheet_cage_models.png`);
console.log('SHEET DONE');
