import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const agpsd = require('ag-psd');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const fs = require('fs'); const path = require('path');
agpsd.initializeCanvas(createCanvas);

const SRC = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/psdtest_in/october special stickers 1 copy.psd';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/psdlayers';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const psd = agpsd.readPsd(fs.readFileSync(SRC), { skipCompositeImageData: false });
console.log('doc:', psd.width + 'x' + psd.height);

// walk layers recursively, collect leaf layers that have pixels
const leaves = [];
function walk(nodes, prefix='') {
  for (const n of nodes || []) {
    if (n.children && n.children.length) walk(n.children, prefix + (n.name||'group') + '/');
    else if (n.canvas) leaves.push({ name: (prefix + (n.name||'layer')).replace(/[\/\\]/g,'_'), layer: n });
  }
}
walk(psd.children);
console.log('leaf layers with pixels:', leaves.length);

const tiles = [];
for (let i = 0; i < leaves.length; i++) {
  const { name, layer } = leaves[i];
  const png = layer.canvas.toBuffer('image/png');
  // trim transparent margins, put on white, square-ish
  try {
    const trimmed = await sharp(png).trim().toBuffer();
    const file = `${OUT}/${String(i+1).padStart(2,'0')}-${name}.png`;
    await sharp(trimmed).flatten({ background: '#ffffff' }).png().toFile(file);
    const m = await sharp(file).metadata();
    console.log(`  [${i+1}] ${name}  ${m.width}x${m.height}`);
    const tile = await sharp(file).resize(220,220,{fit:'contain',background:'#fff'}).png().toBuffer();
    tiles.push(tile);
  } catch(e) { console.log(`  [${i+1}] ${name} — trim/flatten failed: ${e.message}`); }
}
// contact sheet
if (tiles.length) {
  const cols = 5, cell = 220, rows = Math.ceil(tiles.length/cols);
  const comp = tiles.map((t,i)=>({ input:t, left:(i%cols)*cell, top:Math.floor(i/cols)*cell }));
  await sharp({ create:{ width:cols*cell, height:rows*cell, channels:3, background:'#ddd' } })
    .composite(comp).png().toFile(`${OUT}/_sheet.png`);
  console.log('SHEET', `${OUT}/_sheet.png`, `(${tiles.length} tiles)`);
}
