import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const SP='/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT=`${SP}/orig15`; await mkdir(OUT,{recursive:true});
const KEY=process.env.OPENAI_API_KEY;
// ORIGINAL single-drawing prompt (pre-rawer) — verbatim from render_singles_high.
const REFBLOCK="Use ONLY the user's reference sketches as style guidance; do not use or imitate any previous generated image. Image A is the hanging fish mobile sketch. Image B is the loose puzzle-piece sketch. Image C is the open box/kit sketch. Image D is the grouped chess/game-piece sketch. Image E is the hand dropping small pieces into a bowl/tray sketch. Image F is the simple wheeled dome/creature toy sketch. Image G is the tray of standing figures with a pull cord sketch.";
const RULES="Important style rules:\n"
+"* Match the user's line quality: wobbly, blunt, uneven, slightly shaky black lines with inconsistent thickness.\n"
+"* Keep the forms extremely simple, sparse, awkward, and direct.\n"
+"* Let proportions be clumsy and imperfect.\n"
+"* Keep lots of blank white or off-white paper visible.\n"
+"* No shading, no color, no polished icon design, no smooth symmetry, no cute decorative embellishment.\n"
+"* Make the page feel like a photographed or scanned sketch page.\n"
+"* The object should be readable but only barely; it should feel like a quick concept sketch, not a finished illustration.\n"
+"* No whole people or stick figures (a hand is fine). Any words should look hand-lettered, small, and slightly wobbly.";
const PROMPT=(c)=>"Create a single original black-line drawing that closely matches the raw drawing style in the reference images. "+REFBLOCK+" Draw ONE object, large and centered on a square page, as a quick marker sketch on paper in the same spirit as the references — a simple invention sketch, not a clean doodle or clipart. Draw: "+c+".\n\n"+RULES;
const CONCEPTS=[
 {id:'glasses',c:'a pair of eyeglasses drawn straight-on, with a wide open human eye — iris, pupil and a few lashes — drawn inside each lens, as if the glasses are staring back at you'},
 {id:'elephant',c:'an elephant bent down low to the ground, using its trunk to tie the laces of a single sneaker sitting in front of its feet'},
 {id:'bottles',c:'a row of exactly SIX small upright specimen bottles: five with a little hand-lettered label reading the word "anger", and one with a label reading "sadness"'},
];
const DIR='/home/user/memory-library-react/functions/miracle-refs';
const ORDER=['ref-fish','ref-puzzle','ref-firstaid','ref-chess','ref-cereal','ref-viewer','ref-wagon'];
const refs=[]; for(const n of ORDER) refs.push({name:`${n}.webp`,buf:await readFile(join(DIR,`${n}.webp`))});
const jobs=[]; for(const q of ['low','medium']) for(const c of CONCEPTS) jobs.push({q,c});
async function render({q,c}){ const file=`${OUT}/${c.id}_${q}.webp`;
 for(let a=1;a<=4;a++){ const form=new FormData();
  form.append('model','gpt-image-1.5'); form.append('prompt',PROMPT(c.c));
  form.append('size','1024x1024'); form.append('quality',q); form.append('n','1');
  for(const r of refs) form.append('image[]',new Blob([r.buf],{type:'image/webp'}),r.name);
  const res=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${KEY}`},body:form});
  if(res.ok){ const buf=Buffer.from((await res.json()).data[0].b64_json,'base64');
   await sharp(buf).webp({quality:92}).toFile(file); console.log('OK',c.id,q); return; }
  const t=await res.text(); console.log('ERR',c.id,q,res.status,t.slice(0,90));
  if(res.status===429||res.status>=500){ await new Promise(r=>setTimeout(r,12000*a)); continue; } return; }
}
let i=0; async function w(){ while(i<jobs.length){ await render(jobs[i++]); } }
await Promise.all(Array.from({length:4},w)); console.log('DONE');
