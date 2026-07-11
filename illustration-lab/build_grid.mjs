import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const CELL = 300, LBL = 28;
const cols = [
  { name: 'LoRA — no captions', dir: `${SP}/lora_test` },
  { name: 'LoRA — uniform caption', dir: `${SP}/lora_test_cap` },
  { name: 'LoRA — per-image labels', dir: `${SP}/lora_test_lbl` },
  { name: 'gpt-image-1 (current)', files: { cake: `${SP}/modelab/gpt-image-1.png`, capsule: `${SP}/reftest/capsule-NEW.png`, water: `${SP}/modelab/gpt1-water.png` } },
];
const rows = ['cake', 'capsule', 'water'];
const label = (t, w) => Buffer.from(`<svg width="${w}" height="${LBL}"><rect width="${w}" height="${LBL}" fill="#222"/><text x="8" y="19" font-family="sans-serif" font-size="14" fill="#fff">${t}</text></svg>`);
const comp = [];
for (let c = 0; c < cols.length; c++) comp.push({ input: label(cols[c].name, CELL), left: c * CELL, top: 0 });
for (let r = 0; r < rows.length; r++) {
  for (let c = 0; c < cols.length; c++) {
    const p = cols[c].files ? cols[c].files[rows[r]] : `${cols[c].dir}/${rows[r]}.png`;
    try {
      const img = await sharp(p).resize(CELL - 6, CELL - 6, { fit: 'contain', background: '#fff' }).toBuffer();
      comp.push({ input: img, left: c * CELL + 3, top: LBL + r * CELL + 3 });
    } catch { /* missing */ }
  }
}
await sharp({ create: { width: cols.length * CELL, height: LBL + rows.length * CELL, channels: 3, background: '#fff' } })
  .composite(comp).png().toFile(`${SP}/final_grid.png`);
console.log('GRID DONE');
