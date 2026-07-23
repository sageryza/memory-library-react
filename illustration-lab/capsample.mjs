import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, readFile } from 'node:fs/promises';
import { join, parse } from 'node:path';

const dir = process.argv[2], out = process.argv[3];
const imgs = (await readdir(dir)).filter(f => f.endsWith('.webp')).sort();
// evenly sample 24
const N = 24, pick = [];
for (let i = 0; i < N; i++) pick.push(imgs[Math.floor(i * imgs.length / N)]);
const cols = 4, cell = 230, capH = 40;
const comp = [];
for (let i = 0; i < pick.length; i++) {
  const f = pick[i];
  const cap = await readFile(join(dir, parse(f).name + '.txt'), 'utf8');
  const img = await sharp(join(dir, f)).resize(cell - 8, cell - 8, { fit: 'contain', background: '#fff' }).toBuffer();
  const esc = cap.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const label = Buffer.from(`<svg width="${cell}" height="${capH}"><rect width="${cell}" height="${capH}" fill="#f4efe6"/><text x="4" y="16" font-family="sans-serif" font-size="11" fill="#333">${esc.slice(0,40)}</text><text x="4" y="31" font-family="sans-serif" font-size="11" fill="#333">${esc.slice(40,80)}</text></svg>`);
  const col = i % cols, row = Math.floor(i / cols);
  const tile = await sharp({ create: { width: cell, height: cell + capH, channels: 3, background: '#fff' } })
    .composite([{ input: img, top: 4, left: 4 }, { input: label, top: cell, left: 0 }]).png().toBuffer();
  comp.push({ input: tile, left: col * cell, top: row * (cell + capH) });
}
const rows = Math.ceil(pick.length / cols);
await sharp({ create: { width: cols * cell, height: rows * (cell + capH), channels: 3, background: '#ddd' } })
  .composite(comp).png().toFile(out);
console.log('wrote', out);
