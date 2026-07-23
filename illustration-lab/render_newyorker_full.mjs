import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir } from 'node:fs/promises';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/ny_full`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const jokes = JSON.parse(await readFile('/home/user/memory-library-react/illustration-lab/jokes_candidates.json', 'utf8'));

// New plan (Sage): let the model pick the punchline AND render the caption itself.
const PROMPT = (scene) =>
  `A single-panel New Yorker cartoon: classic black-ink line drawing with light grey wash on white. `
  + `Scene: ${scene} `
  + `Give it a witty New Yorker-style caption printed underneath in the classic small serif italic — you choose the funniest caption that fits this scene.`;

const slug = (d, i) => `ny${String(i + 1).padStart(2, '0')}_` + (d.date || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

async function render(j, i) {
  const id = slug(j, i);
  for (let a = 1; a <= 4; a++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: PROMPT(j.visual || j.gist), size: '1024x1024', quality: 'medium', n: 1 }),
    });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 92 }).toFile(`${OUT}/${id}.webp`);
      console.log(id, 'ok'); return;
    }
    const t = await res.text(); console.log(id, res.status, t.slice(0, 90));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 8000 * a)); continue; }
    return;
  }
}
let i = 0; const jobs = jokes.map((j, idx) => [j, idx]);
async function worker() { while (i < jobs.length) { const [j, idx] = jobs[i++]; await render(j, idx); } }
await Promise.all([worker(), worker(), worker()]);
console.log('DONE');
