// Numbered contact sheet of the keep folder so I can pick references by index.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2];
const out = process.argv[3];
const files = (await readdir(dir)).filter(f => /\.(png|webp|jpe?g)$/i.test(f)).sort();
const cols = 8, cell = 150;
const rows = Math.ceil(files.length / cols);
const comp = [];
const map = [];
for (let i = 0; i < files.length; i++) {
  const col = i % cols, row = Math.floor(i / cols);
  const th = await sharp(join(dir, files[i])).flatten({ background: '#fff' })
    .resize(cell - 8, cell - 26, { fit: 'contain', background: '#fff' }).toBuffer();
  const label = Buffer.from(
    `<svg width="${cell - 8}" height="18"><text x="2" y="14" font-family="monospace" font-size="13" fill="#c00">#${i + 1}</text></svg>`
  );
  const tile = await sharp({ create: { width: cell - 8, height: cell - 8, channels: 3, background: '#fff' } })
    .composite([{ input: th, top: 18, left: 0 }, { input: label, top: 0, left: 0 }]).png().toBuffer();
  comp.push({ input: tile, left: col * cell + 4, top: row * cell + 4 });
  map.push(`#${i + 1} = ${files[i]}`);
}
await sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: '#eee' } })
  .composite(comp).png().toFile(out);
await writeFile(out.replace(/\.png$/, '_map.txt'), map.join('\n'));
console.log('sheet', out, '|', files.length, 'images');
