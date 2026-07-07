import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/taste_render_high`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

// Single-drawing prompt built from the EXACT ChatGPT grid-prompt wording:
// same reference descriptions + same "Important style rules", grid scaffolding
// swapped for one centered object. This is the "lock the style, aim it at our
// concept" template.
const REFBLOCK =
  "Use ONLY the user's reference sketches as style guidance; do not use or imitate any previous generated image. "
  + "Image A is the hanging fish mobile sketch. Image B is the loose puzzle-piece sketch. Image C is the open box/kit sketch. "
  + "Image D is the grouped chess/game-piece sketch. Image E is the hand dropping small pieces into a bowl/tray sketch. "
  + "Image F is the simple wheeled dome/creature toy sketch. Image G is the tray of standing figures with a pull cord sketch.";

const RULES =
  "Important style rules:\n"
  + "* Match the user's line quality: wobbly, blunt, uneven, slightly shaky black lines with inconsistent thickness.\n"
  + "* Keep the forms extremely simple, sparse, awkward, and direct.\n"
  + "* Let proportions be clumsy and imperfect.\n"
  + "* Keep lots of blank white or off-white paper visible.\n"
  + "* No shading, no color, no polished icon design, no smooth symmetry, no cute decorative embellishment.\n"
  + "* Make the page feel like a photographed or scanned sketch page.\n"
  + "* The object should be readable but only barely; it should feel like a quick concept sketch, not a finished illustration.\n"
  + "* No whole people or stick figures (a hand is fine). Any words should look hand-lettered, small, and slightly wobbly.";

const PROMPT = (c) =>
  "Create a single original black-line drawing that closely matches the raw drawing style in the reference images. "
  + REFBLOCK + " "
  + "Draw ONE object, large and centered on a square page, as a quick marker sketch on paper in the same spirit as the "
  + "references — a simple invention sketch, not a clean doodle or clipart. "
  + `Draw: ${c}.\n\n` + RULES;

const M = [
  { id:'glasses-eyes', c:'a pair of eyeglasses drawn straight-on, with a wide open human eye — iris, pupil and a few lashes — drawn inside each lens, as if the glasses are staring back at you' },
  { id:'elephant-shoe', c:'an elephant bent down low to the ground, using its trunk to tie the laces of a single sneaker sitting in front of its feet' },
  { id:'anger-bottles', c:'a row of small upright specimen bottles, each with a little hand-lettered label; every label reads the word "anger" except one bottle near the end whose label reads "sadness"' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const ORDER = ['ref-fish', 'ref-puzzle', 'ref-firstaid', 'ref-chess', 'ref-cereal', 'ref-viewer', 'ref-wagon'];
const refs = [];
for (const name of ORDER) refs.push({ name: `${name}.webp`, buf: await readFile(join(DIR, `${name}.webp`)) });

async function render(m) {
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', PROMPT(m.c));
    form.append('size', '1024x1024'); form.append('quality', 'high'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 90 }).toFile(`${OUT}/${m.id}.webp`);
      console.log(m.id, 'ok'); return;
    }
    const t = await res.text(); console.log(m.id, res.status, t.slice(0,90));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 12000*a)); continue; }
    return;
  }
}
let i=0; async function worker(){ while(i<M.length){ await render(M[i++]); } }
await Promise.all(Array.from({length:3}, worker));
console.log('DONE');
