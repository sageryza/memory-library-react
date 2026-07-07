import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock';

// 1) extract the handcuffs frame (white box + small doodle) from the phone screenshot
const src = `${UP}/cbee14de-IMG_6087.png`;
const meta = await sharp(src).metadata();
console.log('screenshot', meta.width, 'x', meta.height);
// crop the upper drawing area of the top-left box (white, with handcuffs)
const box = await sharp(src).extract({ left: 70, top: 380, width: 480, height: 360 }).png().toBuffer();
await sharp(box).toFile(`${OUT}/t-before.png`);

// 2) the trim helper (same logic we'll put in functions/index.js)
async function trimToSubject(buffer, marginPct = 0.08) {
  const base = sharp(buffer).flatten({ background: '#ffffff' });
  const trimmed = await base.trim({ background: '#ffffff', threshold: 12 }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  if (!width || !height) return buffer;
  const side = Math.max(width, height);
  const margin = Math.round(side * marginPct);
  const canvas = side + margin * 2;
  return await sharp({ create: { width: canvas, height: canvas, channels: 3, background: '#ffffff' } })
    .composite([{ input: trimmed.data, gravity: 'centre' }])
    .webp({ quality: 82 }).toBuffer();
}

const before = await sharp(box).metadata();
const t = await trimToSubject(box);
await sharp(t).png().toFile(`${OUT}/t-after.png`);
const after = await sharp(t).metadata();
// report ink fill ratio before vs after by measuring trimmed bbox over canvas
const tb = await sharp(box).flatten({background:'#fff'}).trim({background:'#fff',threshold:12}).toBuffer({resolveWithObject:true});
console.log('input box:', before.width+'x'+before.height, '| ink bbox:', tb.info.width+'x'+tb.info.height,
  '| fill in box ~', ((Math.max(tb.info.width,tb.info.height)/Math.max(before.width,before.height))*100|0)+'%');
console.log('after canvas:', after.width+'x'+after.height,
  '| fill ~', ((Math.max(tb.info.width,tb.info.height)/after.width)*100|0)+'%');
