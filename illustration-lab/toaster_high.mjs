import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FINAL_PROMPT } from './final_prompt.mjs';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
await mkdir(`${SP}/compare_render`, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;
const concept = 'a boxy toaster-shaped space heater with a small worried face, giving off wavy heat lines';

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

const t0 = Date.now();
for (let a = 1; a <= 4; a++) {
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', FINAL_PROMPT(concept));
  form.append('size', '1024x1024'); form.append('quality', 'high'); form.append('n', '1');
  for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
  if (res.ok) {
    const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
    await sharp(buf).resize(500, 500, { fit: 'inside' }).webp({ quality: 85 }).toFile(`${SP}/compare_render/heater-final-high.webp`);
    console.log('ok', ((Date.now()-t0)/1000|0)+'s'); break;
  }
  const t = await res.text(); console.log(res.status, t.slice(0,80));
  if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 20000*a)); continue; }
  break;
}
// side by side: V2 medium (old heavy) vs final high
const CELL=460, PAD=16;
const comps=[]; let svg='';
svg += `<text x="${PAD+CELL/2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2e2a24">V2 medium (earlier)</text>`;
svg += `<text x="${2*PAD+CELL+CELL/2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2e2a24">final prompt · HIGH</text>`;
const paths=[`${SP}/compare_render/heater-V2.webp`, `${SP}/compare_render/heater-final-high.webp`];
for (let c=0;c<2;c++){ const x=PAD+c*(CELL+PAD);
  try{const t=await sharp(paths[c]).resize(CELL,CELL,{fit:'contain',background:'#fff'}).png().toBuffer();comps.push({input:t,left:x,top:26});}catch{}
  svg+=`<rect x="${x}" y="26" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`;
}
const W=2*(CELL+PAD)+PAD, H=CELL+26+PAD;
await sharp({create:{width:W,height:H,channels:3,background:'#f4efe6'}})
  .composite([...comps,{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0}])
  .png().toFile(`${SP}/sheet_toaster_high.png`);
console.log('SHEET DONE');
