import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const agpsd = require('ag-psd');
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
agpsd.initializeCanvas(createCanvas);

// build a 200x200 psd with two named layers, each a shape
function layer(name, draw) {
  const c = createCanvas(200, 200); const x = c.getContext('2d');
  x.clearRect(0,0,200,200); draw(x);
  return { name, canvas: c, left:0, top:0, right:200, bottom:200 };
}
const psd = { width:200, height:200, children: [
  layer('circle', x=>{ x.fillStyle='#000'; x.beginPath(); x.arc(100,100,60,0,7); x.fill(); }),
  layer('square', x=>{ x.strokeStyle='#000'; x.lineWidth=6; x.strokeRect(40,40,120,120); }),
]};
fs.writeFileSync('sample.psd', Buffer.from(agpsd.writePsd(psd, { generateThumbnail:false })));

// read it back and export each layer as a trimmed PNG
const parsed = agpsd.readPsd(fs.readFileSync('sample.psd'));
console.log('doc', parsed.width+'x'+parsed.height, '| layers:', (parsed.children||[]).map(l=>l.name).join(', '));
for (const l of parsed.children||[]) {
  if (!l.canvas) { console.log('  ', l.name, 'NO canvas'); continue; }
  fs.writeFileSync(`layer-${l.name}.png`, l.canvas.toBuffer('image/png'));
  console.log('  exported', `layer-${l.name}.png`, l.canvas.width+'x'+l.canvas.height);
}
