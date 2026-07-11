import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/refs';
require('fs').mkdirSync(OUT, { recursive: true });

const m = await sharp(`${UP}/165f4270-IMG_5022.jpeg`).metadata();
console.log('IMG_5022', m.width, m.height);

// rough drawing-square crops (orig px) — will refine after inspecting
const regions = {
  choc:    { left: 930,  top: 700,  width: 470, height: 470 },
  ring:    { left: 1700, top: 760,  width: 470, height: 440 },
  book:    { left: 950,  top: 1600, width: 470, height: 470 },
  splinter:{ left: 1620, top: 1620, width: 470, height: 440 },
  cake:    { left: 2390, top: 770,  width: 470, height: 440 },
  manbook: { left: 3030, top: 780,  width: 470, height: 460 },
  singing: { left: 2390, top: 1620, width: 470, height: 460 },
  bird:    { left: 3030, top: 1620, width: 470, height: 460 },
};
for (const [name, r] of Object.entries(regions)) {
  await sharp(`${UP}/165f4270-IMG_5022.jpeg`).extract(r).resize(300,300,{fit:'inside'}).png().toFile(`${OUT}/raw-${name}.png`);
}
// contact sheet
const tiles = Object.keys(regions);
const cols = 4, cell = 300;
const composite = [];
for (let i=0;i<tiles.length;i++){
  composite.push({ input: `${OUT}/raw-${tiles[i]}.png`, left: (i%cols)*cell, top: Math.floor(i/cols)*cell });
}
await sharp({ create: { width: cols*cell, height: Math.ceil(tiles.length/cols)*cell, channels:3, background:'#ddd' } })
  .composite(composite).png().toFile(`${OUT}/sheet.png`);
console.log('done', tiles.join(' '));
