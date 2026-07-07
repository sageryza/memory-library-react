import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/journal_minimal`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

// The whole prompt, stripped to almost nothing.
const PROMPT = (c) => `Match the style of the reference images. ${c}`;

const M = [
  { id:'teacup',  full:'journal_g2med/teacup.webp',   c:'a plain teacup drawn in one single continuous unbroken pen line' },
  { id:'feather', full:'journal_g2med/feather.webp',  c:'a line of handwriting scribble that shrinks smaller and smaller left to right until it trails off into a tiny feather' },
  { id:'heater',  full:'journal_g2med/heater.webp',   c:'a boxy toaster-shaped space heater with a small worried face, giving off many wavy heat lines' },
  { id:'sunset',  full:'journal_g2med/sunset-0.webp', c:"a cocktail glass whose layered contents form a little sunset — a round sun sitting on the liquid's horizon line" },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

async function render(m) {
  const file = `${OUT}/${m.id}.webp`;
  const t0 = Date.now();
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', PROMPT(m.c));
    form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 80 }).toFile(file);
      console.log(m.id, 'ok', ((Date.now()-t0)/1000|0)+'s'); return;
    }
    const t = await res.text();
    console.log(m.id, res.status, t.slice(0,70));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 20000*a)); continue; }
    return;
  }
}
await Promise.all(M.map(render));

// side-by-side: full prompt (left) vs minimal prompt (right)
const CELL=380, PAD=14, RL=140;
const W = RL + 2*(CELL+PAD) + PAD, H = M.length*(CELL+PAD) + PAD + 26;
const comps=[]; let svg='';
svg += `<text x="${RL+PAD+CELL/2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2e2a24">full prompt</text>`;
svg += `<text x="${RL+2*PAD+CELL+CELL/2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2e2a24">minimal prompt</text>`;
const LAB={teacup:'one-line teacup',feather:'handwriting→feather',heater:'AI toaster-heater',sunset:'sunset cocktail'};
for (let r=0;r<M.length;r++){
  const y=26+PAD+r*(CELL+PAD);
  svg += `<text x="8" y="${y+CELL/2}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2e2a24">${LAB[M[r].id]}</text>`;
  const paths=[`${SP}/${M[r].full}`, `${OUT}/${M[r].id}.webp`];
  for (let c=0;c<2;c++){ const x=RL+PAD+c*(CELL+PAD);
    try{const t=await sharp(paths[c]).resize(CELL,CELL,{fit:'contain',background:'#fff'}).png().toBuffer();comps.push({input:t,left:x,top:y});}catch{}
    svg+=`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`;
  }
}
await sharp({create:{width:W,height:H,channels:3,background:'#f4efe6'}})
  .composite([...comps,{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0}])
  .png().toFile(`${SP}/sheet_minimal.png`);
console.log('SHEET DONE');
