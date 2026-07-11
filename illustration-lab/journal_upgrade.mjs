import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/journal_upgrade`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (c) =>
  'A single object drawn as a simple doodle / icon, centered and drawn LARGE so it '
  + 'fills most of the frame — like a quick diagram, NOT a scene, on a plain uncluttered '
  + 'WHITE background like the reference images. Loose, imperfect, hand-drawn with a '
  + 'thin black ballpoint pen, wobbly uneven lines, childlike and minimal, like the '
  + 'reference images. STRICTLY black pen line only — absolutely NO color anywhere; no '
  + `shading, no solid black fills. NO whole people and NO stick figures. Draw: ${c}. `
  + "Do NOT write the object's name or any caption anywhere.";

// identical concept text to the mini-low run, to isolate the model
const M = [
  { id:'storm-drain', c:'a wide car tire rolling safely over a storm-drain grate while a thin bicycle wheel beside it drops into the slot' },
  { id:'pants',       c:'one single pair of wide pants with two separate pairs of legs coming out of the bottom' },
  { id:'jellybeans',  c:'a tipped-over jar with jelly beans spilling out and sorting themselves into neat little same-group clusters' },
  { id:'white-light', c:'a sun and a rain cloud overlapping, with a plain empty white circle where they meet' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

async function render(m) {
  const t0 = Date.now();
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');       // flagship
    form.append('prompt', PROMPT(m.c));
    form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('n', '1');
    // gpt-image-2 rejects input_fidelity, so we don't send it
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 80 }).toFile(`${OUT}/${m.id}.webp`);
      console.log(m.id, 'ok', ((Date.now()-t0)/1000|0)+'s'); return;
    }
    const t = await res.text();
    console.log(m.id, res.status, t.slice(0,80));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 20000*a)); continue; }
    return;
  }
}
await Promise.all(M.map(render));

// side-by-side: mini-low (old) vs gpt-image-2 (new)
const LAB = {'storm-drain':'wide wheels lucky','pants':'both fit pants','jellybeans':'jelly beans by color','white-light':'sun+rain=white'};
const CELL=380, PAD=14, LH=30, RL=150;
const W = RL + 2*(CELL+PAD) + PAD;
const H = M.length*(CELL+PAD) + PAD + 26;
const comps=[]; let svg='';
svg += `<text x="${RL+PAD+CELL/2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#2e2a24">mini · low (original)</text>`;
svg += `<text x="${RL+2*PAD+CELL+CELL/2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#2e2a24">gpt-image-2 · medium</text>`;
for (let r=0;r<M.length;r++){
  const y = 26 + PAD + r*(CELL+PAD);
  svg += `<text x="10" y="${y+CELL/2}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2e2a24">${LAB[M[r].id]}</text>`;
  const paths = [`${SP}/journal_render2/${M[r].id}.webp`, `${OUT}/${M[r].id}.webp`];
  for (let c=0;c<2;c++){
    const x = RL + PAD + c*(CELL+PAD);
    try { const t = await sharp(paths[c]).resize(CELL,CELL,{fit:'contain',background:'#fff'}).png().toBuffer(); comps.push({input:t,left:x,top:y}); } catch {}
    svg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`;
  }
}
await sharp({create:{width:W,height:H,channels:3,background:'#f4efe6'}})
  .composite([...comps,{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0}])
  .png().toFile(`${SP}/sheet_upgrade.png`);
console.log('SHEET DONE');
