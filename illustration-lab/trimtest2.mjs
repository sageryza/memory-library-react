import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock';
async function trimToSubject(buffer) {
  try {
    const trimmed = await sharp(buffer).flatten({ background:'#ffffff' })
      .trim({ background:'#ffffff', threshold:12 }).toBuffer({ resolveWithObject:true });
    const { width, height } = trimmed.info; if(!width||!height) return buffer;
    const side = Math.max(width,height); const margin = Math.round(side*0.08); const canvas = side+margin*2;
    return await sharp({ create:{ width:canvas, height:canvas, channels:3, background:'#ffffff' } })
      .composite([{ input: trimmed.data, gravity:'centre' }])
      .resize(1024,1024,{kernel:'lanczos3'}).webp({quality:82}).toBuffer();
  } catch(e){ console.log('fallback', e.message); return buffer; }
}
const box = await sharp(`${UP}/cbee14de-IMG_6087.png`).extract({ left:70, top:380, width:480, height:360 }).png().toBuffer();
const t = await trimToSubject(box);
await sharp(t).png().toFile(`${OUT}/t-after-1024.png`);
console.log('output', (await sharp(t).metadata()).width+'x'+(await sharp(t).metadata()).height, 'bytes', t.length);
