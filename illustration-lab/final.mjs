import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock';

// EXACT logic from functions/index.js trimToSubject
async function trimToSubject(buffer) {
  try {
    const trimmed = await sharp(buffer).flatten({ background:'#ffffff' })
      .trim({ background:'#ffffff', threshold:12 }).toBuffer({ resolveWithObject:true });
    const { width, height } = trimmed.info; if (!width||!height) return buffer;
    const side = Math.max(width,height); const margin = Math.round(side*0.08); const canvas = side+margin*2;
    const centered = await sharp({ create:{ width:canvas, height:canvas, channels:3, background:'#ffffff' } })
      .composite([{ input: trimmed.data, gravity:'centre' }]).png().toBuffer();
    return await sharp(centered).resize(1024,1024,{kernel:'lanczos3'}).webp({quality:82}).toBuffer();
  } catch(e){ console.log('fallback',e.message); return buffer; }
}
async function run(name, region) {
  const box = await sharp(`${UP}/cbee14de-IMG_6087.png`).extract(region).png().toBuffer();
  const t = await trimToSubject(box);
  await sharp(t).png().toFile(`${OUT}/final-${name}.png`);
  const m = await sharp(t).metadata();
  console.log(name, '->', m.width+'x'+m.height, t.length+' bytes');
}
await run('handcuffs', { left:70, top:380, width:480, height:340 });
await run('pinkberry', { left:611, top:1190, width:480, height:360 });
