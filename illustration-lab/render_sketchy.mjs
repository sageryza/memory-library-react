import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { mkdir } from 'node:fs/promises';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/sketchy_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.REPLICATE_API_TOKEN;

const CONCEPTS = [
  { id: 'owl',       c: 'an owl perched on a fence rail' },
  { id: 'england',   c: 'the outline of England wearing a little hat' },
  { id: 'cake',      c: 'a small three-layer cake inside a larger dotted outline of the same cake' },
  { id: 'timer',     c: 'a kitchen timer wearing a tiny name tag that reads ME' },
  { id: 'crosswalk', c: 'a crosswalk whose two middle stripes are tied together in a little knot' },
];

const vr = await fetch('https://api.replicate.com/v1/models/sageryza/special', { headers: { Authorization: `Bearer ${KEY}` } });
const ver = (await vr.json()).latest_version.id;
console.log('version:', ver);

async function render(m) {
  for (let a = 1; a <= 5; a++) {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: ver, input: {
        prompt: `special, ${m.c}, a simple hand-drawn doodle drawn large, thin black pen line on a plain white background, minimal, no color`,
        num_outputs: 1, output_format: 'webp', go_fast: false } }),
    });
    const j = await res.json();
    if (!j.id) { await new Promise(r => setTimeout(r, 12000 * a)); continue; }
    for (let i = 0; i < 60; i++) {
      const p = await (await fetch(`https://api.replicate.com/v1/predictions/${j.id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
      if (p.status === 'succeeded') {
        const url = Array.isArray(p.output) ? p.output[0] : p.output;
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        await sharp(buf).resize(640, 640, { fit: 'inside' }).webp({ quality: 80 }).toFile(`${OUT}/${m.id}.webp`);
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

const CELL = 400, PAD = 14, LH = 34;
const W = 3*(CELL+PAD)+PAD, H = 2*(CELL+LH+PAD)+PAD;
const comps = []; let svg = '';
for (let i = 0; i < CONCEPTS.length; i++) {
  const m = CONCEPTS[i];
  const x = PAD + (i%3)*(CELL+PAD), y = PAD + Math.floor(i/3)*(CELL+LH+PAD);
  try {
    const t = await sharp(`${OUT}/${m.id}.webp`).resize(CELL, CELL, { fit: 'contain', background: '#fff' }).png().toBuffer();
    comps.push({ input: t, left: x, top: y });
  } catch {}
  svg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>`
    + `<text x="${x+CELL/2}" y="${y+CELL+24}" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#2e2a24">${m.id} — Sketchy</text>`;
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#f4efe6' } })
  .composite([...comps, { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 }])
  .png().toFile(`${SP}/sheet_sketchy.png`);
console.log('SHEET DONE');
