import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const trainDir = process.argv[2];
const capsPath = process.argv[3];
const out = process.argv[4];
const re = new RegExp(process.argv[5], 'i');
const caps = JSON.parse(await readFile(capsPath, 'utf8'));
const hits = Object.entries(caps).filter(([f, c]) => c && !/^unclear$/i.test(c) && re.test(c));
console.log(process.argv[5], '->', hits.length, 'matches');

const cols = 4, cell = 210, capH = 22;
const comp = [];
for (let i = 0; i < hits.length; i++) {
  const [f, c] = hits[i];
  const img = await sharp(join(trainDir, f)).flatten({ background: '#fff' }).resize(cell - 6, cell - 6, { fit: 'contain', background: '#fff' }).toBuffer();
  const esc = c.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const label = Buffer.from(`<svg width="${cell}" height="${capH}"><rect width="${cell}" height="${capH}" fill="#f4efe6"/><text x="4" y="15" font-family="sans-serif" font-size="11" fill="#333">${esc.slice(0,42)}</text></svg>`);
  const col = i % cols, row = Math.floor(i / cols);
  const tile = await sharp({ create: { width: cell, height: cell + capH, channels: 3, background: '#fff' } })
    .composite([{ input: img, top: 3, left: 3 }, { input: label, top: cell, left: 0 }]).png().toBuffer();
  comp.push({ input: tile, left: col * cell, top: row * (cell + capH) });
}
const rows = Math.max(1, Math.ceil(hits.length / cols));
await sharp({ create: { width: cols * cell, height: rows * (cell + capH), channels: 3, background: '#ccc' } })
  .composite(comp).png().toFile(out);
console.log('wrote', out);
