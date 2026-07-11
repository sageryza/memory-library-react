import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { mkdir, writeFile } from 'node:fs/promises';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/ny_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

// New Yorker single-panel: her instruction was to just say "New Yorker cartoon"
// and let the model do the work. Prompt = the drawable scene + the caption.
const PROMPT = (scene, caption) =>
  `A single-panel New Yorker cartoon, classic black-ink line drawing with light grey wash on white. `
  + `Scene: ${scene} `
  + `Below the cartoon, centered, a caption in small serif italics reads: "${caption}"`;

const M = [
  { id: 'ny_dreaming', scene: 'a woman waking up in bed tangled with a sleepy tousled man, propped on one elbow and beaming right into his half-open eyes.',
    caption: 'Oh my gosh — I was just dreaming about you.' },
  { id: 'ny_plants', scene: 'three potted houseplants tiptoeing back in through a kitchen window at midnight, each clutching gold coins, wearing tiny guilty smiles as they settle into their pots.',
    caption: 'We were here the whole time.' },
  { id: 'ny_golddog', scene: 'a man walking down a city sidewalk holding a leash attached to a rigid, gleaming solid-gold dog.',
    caption: "He's mostly for investment purposes." },
];

async function render(m) {
  for (let a = 1; a <= 4; a++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: PROMPT(m.scene, m.caption), size: '1024x1024', quality: 'medium', n: 1 }),
    });
    if (res.ok) {
      const j = await res.json();
      const buf = Buffer.from(j.data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 92 }).toFile(`${OUT}/${m.id}.webp`);
      console.log(m.id, 'ok'); return;
    }
    const t = await res.text(); console.log(m.id, res.status, t.slice(0, 120));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 8000 * a)); continue; }
    return;
  }
}
let i = 0; async function worker() { while (i < M.length) await render(M[i++]); }
await Promise.all([worker(), worker()]);
console.log('DONE');
