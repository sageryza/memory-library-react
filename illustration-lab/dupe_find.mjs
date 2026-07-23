// Find near-duplicates the hash-dedup missed, including REDRAWN pairs (same
// subject, slightly different lines). Uses a contrast-normalized 32x32
// fingerprint + cosine similarity, which tolerates line variation better than
// a strict perceptual hash. Renders the closest pairs for human confirmation.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const IN = process.argv[2];
const CAPS = JSON.parse(await readFile(process.argv[3], 'utf8'));
const OUT = process.argv[4];
const files = (await readdir(IN)).filter(f => /\.png$/i.test(f) && CAPS[f] && !/^unclear$/i.test(CAPS[f])).sort();

async function fp(f) {
  const flat = await sharp(join(IN, f)).flatten({ background: '#fff' }).png().toBuffer();
  let t; try { t = await sharp(flat).trim({ threshold: 12 }).toBuffer(); } catch { t = flat; }
  const g = await sharp(t).grayscale().resize(32, 32, { fit: 'fill' }).raw().toBuffer();
  const v = Float32Array.from(g);
  let mean = 0; for (const x of v) mean += x; mean /= v.length;
  let sd = 0; for (const x of v) sd += (x - mean) ** 2; sd = Math.sqrt(sd / v.length) || 1;
  for (let i = 0; i < v.length; i++) v[i] = (v[i] - mean) / sd;
  return v;
}
const fps = [];
for (const f of files) fps.push({ f, v: await fp(f) });

function cos(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d / a.length; }
const pairs = [];
for (let i = 0; i < fps.length; i++)
  for (let j = i + 1; j < fps.length; j++) {
    const s = cos(fps[i].v, fps[j].v);
    if (s > 0.40) pairs.push({ i, j, s });
  }
pairs.sort((a, b) => b.s - a.s);
for (const th of [0.65, 0.6, 0.55, 0.5, 0.45, 0.4])
  console.log(`  cos>${th}: ${pairs.filter(p => p.s > th).length} pairs`);
const top = pairs.slice(0, 60);
console.log(`showing top ${top.length}`);

const cell = 190;
const comp = [];
for (let r = 0; r < top.length; r++) {
  const { i, j, s } = top[r];
  for (const [k, idx] of [[0, i], [1, j]]) {
    const im = await sharp(join(IN, fps[idx].f)).flatten({ background: '#fff' }).resize(cell - 6, cell - 6, { fit: 'contain', background: '#fff' }).toBuffer();
    comp.push({ input: im, left: k * cell + 3, top: r * cell + 3 });
  }
  const lab = Buffer.from(`<svg width="120" height="${cell}"><text x="6" y="24" font-family="monospace" font-size="15" fill="#b00">${s.toFixed(2)}</text></svg>`);
  comp.push({ input: lab, left: 2 * cell + 6, top: r * cell });
  console.log(`  ${s.toFixed(2)}  ${fps[i].f} (${CAPS[fps[i].f]})  ||  ${fps[j].f} (${CAPS[fps[j].f]})`);
}
await sharp({ create: { width: 2 * cell + 130, height: Math.max(cell, top.length * cell), channels: 3, background: '#eee' } })
  .composite(comp).png().toFile(OUT);
console.log('wrote', OUT);
