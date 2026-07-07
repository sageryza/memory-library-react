// Normalize the 202 picks into clean 1024px white squares (no caption files —
// bare-trigger training) ready to zip for the ostris trainer.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, parse } from 'node:path';

const W = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1';
const IN = `${W}/erased_curated/train`;
const OUT = `${W}/train_picks`;
const REC = JSON.parse(await readFile(`${W}/recognize.json`, 'utf8'));
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const picks = Object.entries(REC).filter(([, v]) => v && v.score >= 4).map(([f]) => f).sort();
let n = 0;
for (const f of picks) {
  const flat = await sharp(join(IN, f)).flatten({ background: '#fff' }).png().toBuffer();
  let t; try { t = await sharp(flat).trim({ threshold: 12 }).toBuffer(); } catch { t = flat; }
  const inner = await sharp(t).resize(880, 880, { fit: 'inside', background: '#fff' }).toBuffer();
  const sq = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#fff' } })
    .composite([{ input: inner, gravity: 'center' }]).jpeg({ quality: 92 }).toBuffer();
  await writeFile(join(OUT, parse(f).name.replace(/[^a-z0-9]+/gi, '_') + '.jpg'), sq);
  n++;
}
console.log('normalized', n, 'images ->', OUT);
