// Build two Replicate training sets from the captioned candidates:
//   captioned/  = webp image + matching .txt ("SAGEDOODLE, <content>")
//   plain/      = webp image only (rely on trigger_word)
// UNCLEAR / failed captions are excluded from BOTH training sets (still kept in
// the full pool). Images normalized to clean white 1024 squares.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, parse } from 'node:path';

const TRIGGER = 'SAGEDIAGRAM';
const UNIFORM_CAP = `${TRIGGER}, a simple hand-drawn diagram`;
const trainDir = process.argv[2];
const capsPath = process.argv[3];
const outDir = process.argv[4];
const caps = JSON.parse(await readFile(capsPath, 'utf8'));
await mkdir(join(outDir, 'captioned'), { recursive: true });
await mkdir(join(outDir, 'plain'), { recursive: true });

const files = (await readdir(trainDir)).filter(f => /\.(png|webp|jpe?g)$/i.test(f)).sort();
let n = 0, skipped = 0;
for (const f of files) {
  const c = caps[f];
  if (!c || /^unclear$/i.test(c)) { skipped++; continue; }
  const base = parse(f).name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  // normalize: flatten white, trim, pad square, 1024, webp
  const flat = await sharp(join(trainDir, f)).flatten({ background: '#fff' }).png().toBuffer();
  let t; try { t = await sharp(flat).trim({ threshold: 12 }).toBuffer(); } catch { t = flat; }
  // Fit the drawing inside a 880px box (leaving margin), then center on 1024 white.
  const inner = await sharp(t).resize(880, 880, { fit: 'inside', background: '#fff' }).toBuffer();
  const sq = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#fff' } })
    .composite([{ input: inner, gravity: 'center' }])
    .webp({ quality: 92 }).toBuffer();
  await writeFile(join(outDir, 'captioned', `${base}.webp`), sq);
  await writeFile(join(outDir, 'plain', `${base}.webp`), sq);
  await writeFile(join(outDir, 'captioned', `${base}.txt`), `${TRIGGER}, ${c.toLowerCase()}`);
  n++;
}
console.log(`packaged ${n} images (skipped ${skipped} unclear/failed) | trigger ${TRIGGER}`);
