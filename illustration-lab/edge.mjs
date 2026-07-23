import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
async function trimToSubject(buffer) {
  try {
    const trimmed = await sharp(buffer).flatten({ background: '#ffffff' })
      .trim({ background: '#ffffff', threshold: 12 }).toBuffer({ resolveWithObject: true });
    const { width, height } = trimmed.info;
    if (!width || !height) return buffer;
    const side = Math.max(width, height);
    const margin = Math.round(side * 0.08);
    const canvas = side + margin * 2;
    return await sharp({ create: { width: canvas, height: canvas, channels: 3, background: '#ffffff' } })
      .composite([{ input: trimmed.data, gravity: 'centre' }]).webp({ quality: 82 }).toBuffer();
  } catch (e) { console.log('  -> caught, fell back:', e.message.split('\n')[0]); return buffer; }
}
// all-white 800x800
const blank = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } }).webp().toBuffer();
const r1 = await trimToSubject(blank);
console.log('blank input bytes', blank.length, '-> output bytes', r1.length, '(equal => fell back to original:', blank.length===r1.length, ')');
// tiny off-center dot
const dot = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
  .composite([{ input: { create:{width:40,height:40,channels:3,background:'#000'} }, left: 120, top: 600 }]).webp().toBuffer();
const r2 = await trimToSubject(dot);
const m = await sharp(r2).metadata();
console.log('dot -> square canvas', m.width+'x'+m.height, '(centered, fills frame)');
