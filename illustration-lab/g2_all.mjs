import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const MED = `${SP}/journal_g2med`, HIGH = `${SP}/journal_g2high`;
await mkdir(MED, { recursive: true }); await mkdir(HIGH, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (c) =>
  'A single object drawn as a simple doodle / icon, centered and drawn LARGE so it '
  + 'fills most of the frame — like a quick diagram, NOT a scene, on a plain uncluttered '
  + 'WHITE background like the reference images. Loose, imperfect, hand-drawn with a '
  + 'thin black ballpoint pen, wobbly uneven lines, childlike and minimal, like the '
  + 'reference images. STRICTLY black pen line only — absolutely NO color anywhere; no '
  + `shading, no solid black fills. NO whole people and NO stick figures. Draw: ${c}. `
  + "Do NOT write the object's name or any caption anywhere.";

// ---- MEDIUM set: all moments except the 4 already at medium ----
const MEDIUM = [
  ['glass-0','a black sock with a tiny triangular shard of green glass glinting inside it, a few little sparkle marks around the shard'],
  ['glass-1','a broken green glass bottle whose scattered shards trail across into a single black sock'],
  ['knex-0','two K’nex-style connector pieces (a round hub and a rod) snapping together'],
  ['knex-1','a short row of K’nex rods and round connectors linked into a single chain, like a sentence built of parts'],
  ['sheep-0','three little sheep standing in a row, one drawn solid black, one with gray scribbled wool, one left white'],
  ['sheep-1','three sheep — black, gray, white — lined up on a single baseline like a tiny bar chart'],
  ['sunset-0','a cocktail glass whose layered contents form a little sunset — a round sun sitting on the liquid’s horizon line'],
  ['sunset-1','a tall drink glass half-submerged in water, the liquid inside drawn as a small sunset with a low sun'],
  ['squirrel-0','a human hand and a squirrel’s paw reaching toward each other, each pinching a little piece of granola'],
  ['squirrel-1','one bowl of granola split down the middle — a human hand dipping into one half, a squirrel nibbling from the other'],
  ['teacup','a plain teacup drawn in one single continuous unbroken pen line'],
  ['feather','a line of handwriting scribble that shrinks smaller and smaller left to right until it trails off into a tiny feather'],
  ['heart-hand','an open cupped hand holding up a single small heart'],
  ['pb-cookie','a round cookie broken into two halves with a single bite taken out of the middle'],
  ['heater','a boxy toaster-shaped space heater with a small worried face, giving off many wavy heat lines'],
  ['pinecone','a pinecone on the left with its scales being trimmed off, becoming a round smooth cookie on the right, a small arrow between'],
  ['stuck-pages','two book pages being peeled apart, torn fibers stringing between them where they stick'],
  ['plant-coin','a potted houseplant tiptoeing on little feet, a shiny coin tucked behind one of its leaves'],
  ['self-ring','a single hand slipping a ring onto one of its own fingers'],
];
// ---- HIGH set: the 4 reasoning-heavy ones ----
const HIGHSET = [
  ['storm-drain','a wide car tire rolling safely over a storm-drain grate while a thin bicycle wheel beside it drops into the slot'],
  ['pants','one single pair of wide pants with two separate pairs of legs coming out of the bottom'],
  ['jellybeans','a tipped-over jar with jelly beans spilling out and sorting themselves into neat little same-group clusters'],
  ['white-light','a sun and a rain cloud overlapping, with a plain empty white circle where they meet'],
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

async function render(id, concept, quality, outDir) {
  const file = `${outDir}/${id}.webp`;
  try { await readFile(file); return; } catch {}
  const t0 = Date.now();
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', PROMPT(concept));
    form.append('size', '1024x1024'); form.append('quality', quality); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 80 }).toFile(file);
      console.log(`${id} ${quality} ok ${((Date.now()-t0)/1000|0)}s`); return;
    }
    const t = await res.text();
    console.log(`${id} ${quality} ${res.status} ${t.slice(0,70)}`);
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 20000*a)); continue; }
    return;
  }
}

const jobs = [
  ...MEDIUM.map(([id,c]) => ({ id, c, q: 'medium', out: MED })),
  ...HIGHSET.map(([id,c]) => ({ id, c, q: 'high', out: HIGH })),
];
let idx = 0;
async function worker(){ while (idx < jobs.length){ const j = jobs[idx++]; await render(j.id, j.c, j.q, j.out); } }
await Promise.all(Array.from({ length: 5 }, worker));
console.log('ALL RENDERS DONE');
