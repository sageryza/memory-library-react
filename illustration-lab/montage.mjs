import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const D = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/reftest';
const lbl = (t, w) => Buffer.from(`<svg width="${w}" height="26"><rect width="${w}" height="26" fill="#222"/><text x="8" y="19" font-family="sans-serif" font-size="16" fill="#fff">${t}</text></svg>`);
const cell = 300;
async function tile(f, cap) {
  const img = await sharp(`${D}/${f}`).resize(cell, cell, { fit: 'contain', background: '#fff' }).toBuffer();
  return sharp({ create: { width: cell, height: cell + 26, channels: 3, background: '#fff' } })
    .composite([{ input: lbl(cap, cell), top: 0, left: 0 }, { input: img, top: 26, left: 0 }]).png().toBuffer();
}
const refs = await sharp(`${D}/_refs8.png`).resize(2 * cell, null, { fit: 'contain', background: '#fff' }).toBuffer();
const rm = await sharp(refs).metadata();
const grid = [
  { input: await tile('cake-NEW.png', 'CAKE — new clean 8 refs'), top: 0, left: 0 },
  { input: await tile('cake-OLD.png', 'CAKE — old photo crops'), top: 0, left: cell },
  { input: await tile('capsule-NEW.png', 'CAPSULE — new clean 8 refs'), top: cell + 26, left: 0 },
  { input: await tile('capsule-OLD.png', 'CAPSULE — old photo crops'), top: cell + 26, left: cell },
];
const W = 2 * cell, H = rm.height + 2 * (cell + 26);
await sharp({ create: { width: W, height: H, channels: 3, background: '#fff' } })
  .composite([{ input: refs, top: 0, left: 0 }, ...grid.map(g => ({ input: g.input, top: g.top + rm.height, left: g.left }))])
  .png().toFile(`${D}/_compare.png`);
console.log('wrote _compare.png', W + 'x' + H);
