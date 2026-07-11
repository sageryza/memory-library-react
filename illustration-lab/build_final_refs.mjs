// Build the FINAL reference set (user-confirmed picks), whitespace-trimmed,
// on clean white, plus a labeled confirmation sheet.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { mkdir, readFile } from 'node:fs/promises';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/final_refs`;
await mkdir(OUT, { recursive: true });

const PICKS = [
  { out: 'ref-chess.webp',     label: 'chess set',            src: `${SP}/ref_candidates/03-chess-pieces.webp` },
  { out: 'ref-firstaid.webp',  label: 'first aid kit',        src: `${SP}/ref_candidates2/A-first-aid-kit.webp` },
  { out: 'ref-envelopes.webp', label: 'envelopes',            src: `${SP}/reftest/newrefs/19-Layer 36.webp` },
  { out: 'ref-pocket.webp',    label: 'pocket + pencil',      src: `${SP}/batch1/erased_curated/train/october-special-stickers-1-copy__022.png`,
    // cut away the drawn shirt-square border; keep just the pocket + pencil
    region: { left: 140, top: 350, width: 420, height: 500 } },
  { out: 'ref-device.webp',    label: "90s device (the duplicated one)", src: `${SP}/ref_candidates/09-toaster.webp` },
  { out: 'ref-cereal.webp',    label: 'hand + cereal bowl',   src: `${SP}/ref_candidates3/K-hand-stirring-bowl.webp` },
  { out: 'ref-fish.webp',      label: 'goldfish mobile',      src: `${SP}/ref_candidates3/J-fish-mobile.webp` },
  { out: 'ref-puzzle.webp',    label: 'hand + last puzzle piece', src: `${SP}/ref_candidates/06-puzzle-pieces.webp` },
  { out: 'ref-wagon.webp',     label: 'little people in wagon', src: `${SP}/ref_candidates2/D-two-people-in-box.webp` },
];

const tiles = [];
for (const p of PICKS) {
  let base = await sharp(await readFile(p.src)).flatten({ background: '#fff' }).toBuffer();
  if (p.region) {
    const meta = await sharp(base).metadata();
    const sx = meta.width / 1024, sy = meta.height / 1024; // region given at 1024 scale
    base = await sharp(base).extract({
      left: Math.round(p.region.left * sx), top: Math.round(p.region.top * sy),
      width: Math.round(p.region.width * sx), height: Math.round(p.region.height * sy),
    }).toBuffer();
  }
  // trim whitespace, then a small even white margin
  const buf = await sharp(base).trim({ threshold: 25 }).toBuffer();
  const final = await sharp(buf)
    .extend({ top: 46, bottom: 46, left: 46, right: 46, background: '#fff' })
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: false })
    .webp({ quality: 88 }).toBuffer();
  await sharp(final).toFile(`${OUT}/${p.out}`);
  tiles.push({ label: p.label, buf: final });
  console.log('built', p.out);
}

// Labeled confirmation sheet: 3 x 3 grid.
const CELL = 340, PAD = 14, LABEL_H = 34, COLS = 3;
const rows = Math.ceil(tiles.length / COLS);
const W = COLS * (CELL + PAD) + PAD;
const H = rows * (CELL + LABEL_H + PAD) + PAD;
const comps = [];
let svgTexts = '';
for (let i = 0; i < tiles.length; i++) {
  const c = i % COLS, r = Math.floor(i / COLS);
  const x = PAD + c * (CELL + PAD), y = PAD + r * (CELL + LABEL_H + PAD);
  const thumb = await sharp(tiles[i].buf).resize(CELL, CELL, { fit: 'contain', background: '#fff' }).png().toBuffer();
  comps.push({ input: thumb, left: x, top: y });
  svgTexts += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#c9c1b2" stroke-width="2"/>` +
    `<text x="${x + CELL / 2}" y="${y + CELL + 24}" text-anchor="middle" font-family="sans-serif" font-size="19" fill="#2e2a24">${i + 1}. ${tiles[i].label}</text>`;
}
const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgTexts}</svg>`);
await sharp({ create: { width: W, height: H, channels: 3, background: '#f4efe6' } })
  .composite([...comps, { input: svg, left: 0, top: 0 }])
  .png().toFile(`${SP}/sheet_final_refs.png`);
console.log('SHEET DONE');
