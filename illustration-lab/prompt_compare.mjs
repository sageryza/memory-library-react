import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/compare_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const REFDESC = "The seven reference images are the user's own raw marker sketches on paper: a hanging fish mobile, a hand placing a loose puzzle piece, an open first-aid kit, a group of chess pieces, a hand reaching into a bowl of cereal, a small handheld viewfinder, and a little wagon of standing figures with a pull cord.";

// V0 — current
const V0 = (c) =>
  'Match the style of the reference images — a simple hand-drawn doodle in thin black pen on a plain '
  + 'white background, drawn LARGE and centered. STRICTLY black pen line only, no color, no shading, no '
  + `solid fills. NO whole people, NO stick figures (a hand is fine). Draw: ${c}. No caption text unless literally part of the idea.`;
// V1 — light borrow: caption refs + raw sketch, not icon
const V1 = (c) =>
  `${REFDESC} Use them ONLY as style guidance — do not copy their content. Draw a NEW drawing in the same `
  + 'raw hand-drawn spirit: a quick marker sketch on paper, NOT a clean doodle, NOT an icon, NOT clipart. '
  + `Black pen only, no color, no shading. NO whole people or stick figures (a hand is fine). Draw: ${c}.`;
// V2 — heavy borrow: add their line-quality / scanned-page language
const V2 = (c) =>
  `${REFDESC} Use them ONLY as style guidance — do not copy their content. Draw a NEW quick marker sketch `
  + 'on paper in the same spirit — NOT a clean doodle, NOT an icon, NOT clipart. Match the line quality '
  + 'exactly: wobbly, blunt, uneven, slightly shaky black lines with inconsistent thickness. Let proportions '
  + 'be clumsy and imperfect. Keep the form extremely simple, sparse, awkward, and direct — readable, but '
  + 'loose. Keep lots of blank white paper. Black pen only: no color, no shading, no solid fills, no smooth '
  + 'symmetry, no polished icon design, no cute embellishment. NO whole people or stick figures (a hand is '
  + `fine). Make it feel like a photographed or scanned sketch page. Draw: ${c}.`;
const VERSIONS = { V0, V1, V2 };

const CONCEPTS = [
  { id:'coin',    c:'two hands, one from each side, trading a single coin for another identical coin between them' },
  { id:'rabbits', c:'three identical little rabbits in a row, each with a small name tag that reads "Sophie"' },
  { id:'heater',  c:'a boxy toaster-shaped space heater with a small worried face, giving off wavy heat lines' },
  { id:'teacup',  c:'a plain teacup drawn in one single continuous unbroken line' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

async function render(cid, ver, concept) {
  const file = `${OUT}/${cid}-${ver}.webp`;
  try { await readFile(file); return; } catch {}
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', VERSIONS[ver](concept));
    form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 82 }).toFile(file);
      console.log(`${cid}-${ver} ok`); return;
    }
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 20000*a)); continue; }
    console.log(`${cid}-${ver} FAIL ${res.status}`); return;
  }
}
const jobs = [];
for (const c of CONCEPTS) for (const v of ['V0','V1','V2']) jobs.push({ cid:c.id, v, c:c.c });
let idx = 0;
async function worker(){ while (idx < jobs.length){ const j = jobs[idx++]; await render(j.cid, j.v, j.c); } }
await Promise.all(Array.from({ length: 5 }, worker));

// comparison sheet: rows = concepts, cols = V0/V1/V2
const CELL=380, PAD=14, RL=120, TOP=26;
const W = RL + 3*(CELL+PAD) + PAD, H = TOP + CONCEPTS.length*(CELL+PAD) + PAD;
const comps=[]; let svg='';
const cols=['V0 (current)','V1 (caption + raw)','V2 (heavy borrow)'];
for (let c=0;c<3;c++){ const x=RL+PAD+c*(CELL+PAD)+CELL/2; svg+=`<text x="${x}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2e2a24">${cols[c]}</text>`; }
const LAB={coin:'coin trade',rabbits:'3 rabbits',heater:'toaster-heater',teacup:'one-line teacup'};
for (let r=0;r<CONCEPTS.length;r++){
  const y=TOP+PAD+r*(CELL+PAD);
  svg+=`<text x="6" y="${y+CELL/2}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2e2a24">${LAB[CONCEPTS[r].id]}</text>`;
  const vs=['V0','V1','V2'];
  for (let c=0;c<3;c++){ const x=RL+PAD+c*(CELL+PAD);
    try{const t=await sharp(`${OUT}/${CONCEPTS[r].id}-${vs[c]}.webp`).resize(CELL,CELL,{fit:'contain',background:'#fff'}).png().toBuffer();comps.push({input:t,left:x,top:y});}catch{}
    svg+=`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`;
  }
}
await sharp({create:{width:W,height:H,channels:3,background:'#f4efe6'}})
  .composite([...comps,{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0}])
  .png().toFile(`${SP}/sheet_compare.png`);
console.log('SHEET DONE');
