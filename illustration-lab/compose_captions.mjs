import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const IN = `${SP}/ny_render`;

const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// naive word-wrap to <= maxChars per line
function wrap(t, max) {
  const words = t.split(' '); const lines = []; let cur = '';
  for (const w of words) { if ((cur+' '+w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

const JOBS = [
  { file: 'ny_dreaming', cropTo: 905, caption: 'Oh my gosh — I was just dreaming about you.' },
  { file: 'ny_plants',   cropTo: null, caption: 'We were here the whole time.' },
  { file: 'ny_golddog',  cropTo: null, caption: "He's mostly for investment purposes." },
];

for (const j of JOBS) {
  let img = sharp(`${IN}/${j.file}.webp`);
  const meta = await img.metadata();
  const W = meta.width;
  if (j.cropTo) img = img.extract({ left: 0, top: 0, width: W, height: j.cropTo });
  const art = await img.png().toBuffer();
  const artMeta = await sharp(art).metadata();
  const lines = wrap(j.caption, 42);
  const fs = 34, lh = 46, pad = 34;
  const stripH = pad*2 + lines.length*lh;
  const cy = pad + lh - 12;
  const tspans = lines.map((ln,i)=>`<text x="${W/2}" y="${cy + i*lh}" font-family="Liberation Serif" font-style="italic" font-size="${fs}" fill="#111" text-anchor="middle">${esc(ln)}</text>`).join('');
  const strip = Buffer.from(`<svg width="${W}" height="${stripH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f7f5f0"/>${tspans}</svg>`);
  const stripPng = await sharp(strip).png().toBuffer();
  const out = await sharp({ create: { width: W, height: artMeta.height + stripH, channels: 3, background: '#f7f5f0' } })
    .composite([{ input: art, top: 0, left: 0 }, { input: stripPng, top: artMeta.height, left: 0 }])
    .webp({ quality: 92 }).toBuffer();
  await sharp(out).toFile(`${IN}/${j.file}_cap.webp`);
  console.log('wrote', `${j.file}_cap.webp`, `${W}x${artMeta.height+stripH}`);
}
console.log('DONE');
