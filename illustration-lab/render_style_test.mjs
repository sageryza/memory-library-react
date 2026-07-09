import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const REFDIR = `${SP}/style_refs`;
const OUT = `${SP}/style_test`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

// a subset of the cool-pastel tiles as style references
const REFNAMES = ['mint_boots','mint_gift','mint_marbles','mint_unicorn','mint_world','mint_chest'];
const refs = [];
for (const n of REFNAMES) refs.push({ name: `${n}.png`, buf: await readFile(join(REFDIR, `${n}.png`)) });

const STYLE = 'Cute cozy storybook illustration: confident black ink outline, soft pastel watercolor fills '
  + '(mint green, lavender, pink), gentle wavy shading, a few tiny sparkles, clean white background, whimsical and charming.';

// approach A = describe the style in words; approach B = let the model infer it from the refs only
const promptA = (scene) => `Create a single illustration in this exact art style. ${STYLE} Draw: ${scene}. One centered subject on white, no caption text.`;
const promptB = (scene) => `Draw this in the same art style as the reference images: ${scene}. One centered subject on a white background, no caption text.`;

const M = [
  { id: 'plantheist',   q: 'high',   scene: 'potted houseplants creeping over a kitchen sink at night, clutching stolen gold coins in their leaves, then sitting innocently back in their pots with tiny guilty smiles' },
  { id: 'hoodiegirl',   q: 'medium', scene: "a girl curled up entirely inside a boy's oversized basketball hoodie, only her face peeking out, held like a ball in a basket" },
  { id: 'wishesshop',   q: 'medium', scene: "a little shop display tray of 'pre-used wishes' — fallen eyelashes and gone-to-seed dandelions arranged neatly with a small hand-lettered tag" },
  { id: 'golddog',      q: 'low',    scene: 'a person walking a heavy dog cast entirely from solid gold on a leash down an ordinary sidewalk' },
  { id: 'compassbirds', q: 'low',    scene: 'small black velvet-and-wire birds flying in formation across the sky, each with a tiny blue compass strapped to its back' },
  { id: 'bigheadtrain', q: 'low',    scene: "a little toy train chugging in a circle where each car carries a smiling giant friend's big head, all hooked together" },
  { id: 'milkcookie',   q: 'low',    scene: 'a tiny glass of milk on a bakery counter with a single cookie dipped into it for one careful sip' },
  { id: 'glasssock',    q: 'low',    scene: 'a single sliver of green bottle-glass tucked inside a black sock on a walking foot, glinting against the dark wool' },
];

async function render(m, approach) {
  const prompt = approach === 'A' ? promptA(m.scene) : promptB(m.scene);
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);
    form.append('size', '1024x1024'); form.append('quality', m.q); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/png' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 92 }).toFile(`${OUT}/${m.id}_${m.q}_${approach}.webp`);
      console.log(m.id, m.q, approach, 'ok'); return;
    }
    const t = await res.text(); console.log(m.id, approach, res.status, t.slice(0, 100));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 8000 * a)); continue; }
    return;
  }
}
const jobs = [];
for (const m of M) { jobs.push([m, 'A'], [m, 'B']); }
let i = 0; async function worker() { while (i < jobs.length) { const [m, ap] = jobs[i++]; await render(m, ap); } }
await Promise.all([worker(), worker(), worker()]);
console.log('DONE');
