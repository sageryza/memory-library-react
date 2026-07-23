import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { mkdir } from 'node:fs/promises';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/hoonie_fun`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.REPLICATE_API_TOKEN;

const CONCEPTS = [
  { id: 'piano',     c: 'a grand piano whose open lid is a butterfly wing' },
  { id: 'hourglass', c: 'an hourglass with a tiny stormy ocean and a sailboat inside the bottom bulb' },
  { id: 'mountains', c: 'a mountain range that is actually a sleeping cat under a quilted blanket' },
  { id: 'teacup',    c: 'a teacup whose rising steam is a flock of tiny birds' },
  { id: 'book',      c: 'an open book whose pages fold up into a spiral staircase' },
  { id: 'moon',      c: 'a crescent moon strung up as a hammock, with a pair of empty boots resting in it' },
];

const vr = await fetch('https://api.replicate.com/v1/models/sageryza/hoonie', { headers: { Authorization: `Bearer ${KEY}` } });
const ver = (await vr.json()).latest_version.id;

let secs = 0;
async function render(m) {
  for (let a = 1; a <= 5; a++) {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: ver, input: {
        prompt: `HOONIE, ${m.c}, linocut relief print, white background`,
        num_inference_steps: 40, num_outputs: 1, output_format: 'webp', go_fast: false } }),
    });
    const j = await res.json();
    if (!j.id) { await new Promise(r => setTimeout(r, 12000 * a)); continue; }
    for (let i = 0; i < 60; i++) {
      const p = await (await fetch(`https://api.replicate.com/v1/predictions/${j.id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
      if (p.status === 'succeeded') {
        secs += p.metrics?.predict_time || 0;
        const url = Array.isArray(p.output) ? p.output[0] : p.output;
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        await sharp(buf).webp({ quality: 88 }).toFile(`${OUT}/${m.id}.webp`);
        console.log(m.id, 'ok');
        return;
      }
      if (p.status === 'failed' || p.status === 'canceled') { console.log(m.id, p.status); break; }
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  console.log(m.id, 'FAILED');
}
await Promise.all(CONCEPTS.map(render));
console.log('billed seconds:', secs.toFixed(1), '=$' + (secs*0.001525).toFixed(2));

const CELL = 400, PAD = 14, LH = 52;
const W = 3*(CELL+PAD)+PAD, H = 2*(CELL+LH+PAD)+PAD;
const comps = []; let svg = '';
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
for (let i = 0; i < CONCEPTS.length; i++) {
  const m = CONCEPTS[i];
  const x = PAD + (i%3)*(CELL+PAD), y = PAD + Math.floor(i/3)*(CELL+LH+PAD);
  try {
    const t = await sharp(`${OUT}/${m.id}.webp`).resize(CELL, CELL, { fit: 'contain', background: '#fff' }).png().toBuffer();
    comps.push({ input: t, left: x, top: y });
  } catch {}
  const words = m.c.split(' ');
  const l1 = words.slice(0, 7).join(' '), l2 = words.slice(7).join(' ');
  svg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`
    + `<text x="${x+CELL/2}" y="${y+CELL+20}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#2e2a24">${esc(l1)}</text>`
    + `<text x="${x+CELL/2}" y="${y+CELL+38}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#2e2a24">${esc(l2)}</text>`;
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#f4efe6' } })
  .composite([...comps, { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 }])
  .png().toFile(`${SP}/sheet_hoonie_fun.png`);
console.log('SHEET DONE');
