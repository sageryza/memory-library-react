import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/grid_test`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

// The user's EXACT grid prompt, with only the nine cell contents replaced.
const PROMPT = `Create a new 3x3 grid of nine original black-line drawings that closely match the raw drawing style in the reference images. Use ONLY the user's reference sketches as style guidance; do not use or imitate any previous generated image. Image A is the hanging fish mobile sketch. Image B is the loose puzzle-piece sketch. Image C is the open box/kit sketch. Image D is the grouped chess/game-piece sketch. Image E is the hand dropping small pieces into a bowl/tray sketch. Image F is the simple wheeled dome/creature toy sketch. Image G is the tray of standing figures with a pull cord sketch.

Make one square page with a rough hand-drawn 3x3 grid. In each cell, draw the one specific object described for that cell, in the same spirit as the references. The drawings should feel like quick marker sketches on paper, not like clean doodles or clipart.

Important style rules:
* Match the user's line quality: wobbly, blunt, uneven, slightly shaky black lines with inconsistent thickness.
* Keep the forms extremely simple, sparse, awkward, and direct.
* Let proportions be clumsy and imperfect.
* The grid lines should also be hand-drawn, a little crooked, with uneven spacing.
* Keep lots of blank white or off-white paper visible.
* No shading, no color, no polished icon design, no smooth symmetry, no cute decorative embellishment.
* Make the page feel like a photographed or scanned sketch page.
* Each object should be readable but only barely; they should feel like quick concept sketches, not finished illustrations.

For the nine cells, draw these specific objects, one per cell: 1) a black sock with a tiny shard of green glass glinting inside it; 2) a plain teacup drawn in one single continuous unbroken line; 3) a line of handwriting that shrinks smaller and smaller until it trails off into a tiny feather; 4) a boxy toaster-shaped space heater with a small worried face giving off wavy heat lines; 5) a pinecone whose scales are being trimmed off, becoming a round smooth cookie, a small arrow between; 6) two book pages being peeled apart, torn fibers stringing between them; 7) an open egg carton in which every egg is cracked; 8) a long line of cars backed up behind one lone small car at the front; 9) a side profile of a neck with a tiny pebble inside the throat, a larger stone crossed out beside it. Make all nine drawings, but keep them stylistically very close to the references.`;

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
    form.append('prompt', PROMPT);
    form.append('size','1024x1024'); form.append('quality','medium'); form.append('n','1');
    if (m.fidelity) form.append('input_fidelity','high');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type:'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', { method:'POST', headers:{ Authorization:`Bearer ${KEY}` }, body:form });
    if (res.ok){ const buf=Buffer.from((await res.json()).data[0].b64_json,'base64'); await sharp(buf).webp({quality:88}).toFile(file); console.log(`${m.model} ok ${((Date.now()-t0)/1000|0)}s`); return; }
    const t=await res.text(); console.log(`${m.model} ${res.status} ${t.slice(0,60)}`);
    if (res.status===429||res.status>=500){ await new Promise(r=>setTimeout(r,20000*a)); continue; }
    return;
  }
}
await Promise.all(MODELS.map(render));

const CELL=620, PAD=14;
const comps=[]; let svg='';
const labs=['img 1','img 1.5','img 2'];
for (let c=0;c<MODELS.length;c++){ const x=PAD+c*(CELL+PAD);
  svg+=`<text x="${x+CELL/2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#2e2a24">${labs[c]}</text>`;
  try{const t=await sharp(`${OUT}/${MODELS[c].model}.webp`).resize(CELL,CELL,{fit:'contain',background:'#fff'}).png().toBuffer();comps.push({input:t,left:x,top:30});}catch{}
  svg+=`<rect x="${x}" y="30" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`;
}
const W=MODELS.length*(CELL+PAD)+PAD, H=CELL+30+PAD;
await sharp({create:{width:W,height:H,channels:3,background:'#f4efe6'}})
  .composite([...comps,{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0}])
  .png().toFile(`${SP}/sheet_grid_test.png`);
console.log('SHEET DONE');
