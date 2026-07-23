import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
const fs = require('fs');
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/refs';
fs.mkdirSync(OUT, { recursive: true });

// refined, text-free drawing crops from IMG_5022 (orig px)
const regions = {
  ring:    { left: 1735, top: 775,  width: 410, height: 380 },
  book:    { left: 980,  top: 1770, width: 440, height: 320 },
  choc:    { left: 980,  top: 745,  width: 400, height: 380 },
  bird:    { left: 3055, top: 1635, width: 400, height: 230 },
  singing: { left: 2395, top: 1730, width: 470, height: 350 },
};

async function clean(src, r, name) {
  // crop → grayscale → boost contrast → threshold to crisp ink → trim → pad square → resize
  const cropped = await sharp(src).extract(r).grayscale().normalise()
    .linear(1.4, -40).threshold(170).toBuffer();
  const trimmed = await sharp(cropped).flatten({background:'#fff'}).trim({background:'#fff',threshold:20}).toBuffer({resolveWithObject:true});
  const side = Math.max(trimmed.info.width, trimmed.info.height);
  const margin = Math.round(side*0.10);
  const canvas = side + margin*2;
  const centered = await sharp({create:{width:canvas,height:canvas,channels:3,background:'#fff'}})
    .composite([{input:trimmed.data,gravity:'centre'}]).png().toBuffer();
  await sharp(centered).resize(768,768,{kernel:'lanczos3'}).png().toFile(`${OUT}/clean-${name}.png`);
}
for (const [name,r] of Object.entries(regions)) await clean(`${UP}/165f4270-IMG_5022.jpeg`, r, name);

// contact sheet
const names = Object.keys(regions); const cols=5, cell=240;
const comp = [];
for (let i=0;i<names.length;i++){
  const buf = await sharp(`${OUT}/clean-${names[i]}.png`).resize(cell,cell,{fit:'inside',background:'#fff'}).extend({top:0,bottom:0,left:0,right:0,background:'#fff'}).png().toBuffer();
  comp.push({input:buf,left:i*cell,top:0});
}
await sharp({create:{width:cols*cell,height:cell,channels:3,background:'#bbb'}}).composite(comp).png().toFile(`${OUT}/clean-sheet.png`);
console.log('cleaned', names.join(' '));
