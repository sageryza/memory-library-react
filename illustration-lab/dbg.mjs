import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock';
const box = await sharp(`${UP}/cbee14de-IMG_6087.png`).extract({ left:70, top:380, width:480, height:360 }).png().toBuffer();
const trimmed = await sharp(box).flatten({background:'#ffffff'}).trim({background:'#ffffff',threshold:12}).toBuffer({resolveWithObject:true});
console.log('trimmed info:', trimmed.info.width+'x'+trimmed.info.height);
const side=Math.max(trimmed.info.width,trimmed.info.height); const margin=Math.round(side*0.08); const canvas=side+margin*2;
console.log('side',side,'margin',margin,'canvas',canvas);
const composed = await sharp({create:{width:canvas,height:canvas,channels:3,background:'#ffffff'}})
  .composite([{input:trimmed.data,gravity:'centre'}]).png().toBuffer();
console.log('composed', (await sharp(composed).metadata()).width+'x'+(await sharp(composed).metadata()).height);
await sharp(composed).toFile(`${OUT}/dbg-composed.png`);
const resized = await sharp(composed).resize(1024,1024,{kernel:'lanczos3'}).png().toBuffer();
await sharp(resized).toFile(`${OUT}/dbg-resized.png`);
console.log('resized', (await sharp(resized).metadata()).width+'x'+(await sharp(resized).metadata()).height);
