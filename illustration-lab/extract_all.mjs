// Extract every leaf layer (with pixels) from all PSDs in a dir into one folder.
//   node extract_all.mjs <psdDir> <outDir>
import { createRequire } from 'module';
const require = createRequire('/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/psd/');
const agpsd = require('ag-psd');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const fs = require('fs'); const path = require('path');
agpsd.initializeCanvas(createCanvas);

const SRCDIR = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

function findPsds(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith('__MACOSX') || e.name.startsWith('._')) continue;
    if (e.isDirectory()) out.push(...findPsds(p));
    else if (/\.psd$/i.test(e.name)) out.push(p);
  }
  return out;
}

const psds = findPsds(SRCDIR).sort();
let total = 0;
for (const src of psds) {
  const sheet = path.basename(src, '.psd').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  let psd;
  try { psd = agpsd.readPsd(fs.readFileSync(src), { skipCompositeImageData: true }); }
  catch (e) { console.error('READ FAIL', sheet, e.message); continue; }
  const leaves = [];
  (function walk(nodes, prefix = '') {
    for (const n of nodes || []) {
      if (n.children && n.children.length) walk(n.children, prefix + (n.name || 'group') + '/');
      else if (n.canvas) leaves.push({ name: (prefix + (n.name || 'layer')).replace(/[\/\\]/g, '_'), layer: n });
    }
  })(psd.children);
  let k = 0;
  for (const { name, layer } of leaves) {
    try {
      const png = layer.canvas.toBuffer('image/png');
      const idx = String(++k).padStart(3, '0');
      fs.writeFileSync(path.join(OUT, `${sheet}__${idx}.png`), png);
      total++;
    } catch { /* skip */ }
  }
  console.log(`${sheet}: ${leaves.length} leaf layers`);
}
console.log(`\nPSDs ${psds.length} | layers extracted ${total} -> ${OUT}`);
