// Calls the deployed illustrateMiracle with each engine/distill variant on the
// same story, downloads the results, and builds a contact sheet to compare.
import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const sharpReq = createRequire('/home/user/memory-library-react/functions/');
const sharp = sharpReq('sharp');

const cfg = {
  apiKey: 'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s',
  authDomain: 'membry-df528.firebaseapp.com',
  projectId: 'membry-df528',
  storageBucket: 'membry-df528.firebasestorage.app',
  messagingSenderId: '513384339473',
  appId: '1:513384339473:web:8f46c5915a949c93a8b9b0',
};
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/engines';
require('fs').mkdirSync(OUT, { recursive: true });

const STORY = process.argv[2]
  || 'It was my birthday and we went to get cake but the shop was closed — we told them and they let us in anyway';

const app = initializeApp(cfg);
await signInAnonymously(getAuth(app));
const fn = httpsCallable(getFunctions(app, 'us-central1'), 'illustrateMiracle', { timeout: 180000 });

const variants = [
  { label: 'openai-distill',  data: { engine: 'openai',    distill: true } },
  { label: 'openai-raw',      data: { engine: 'openai',    distill: false } },
  { label: 'sketchy-distill', data: { engine: 'replicate', distill: true } },
];

const results = [];
for (const v of variants) {
  try {
    const res = await fn({ text: STORY, id: 'try-' + v.label, ...v.data });
    const d = res.data;
    console.log(v.label, '| engine=' + d.engine, '| caption=' + JSON.stringify(d.caption), '| drawing=' + JSON.stringify(d.drawing));
    const buf = Buffer.from(await (await fetch(d.url)).arrayBuffer());
    await sharp(buf).resize(420, 420, { fit: 'contain', background: '#fff' }).png().toFile(`${OUT}/${v.label}.png`);
    results.push(v.label);
  } catch (e) {
    console.log(v.label, 'ERROR', e.code || '', e.message);
  }
}

if (results.length) {
  const cell = 420;
  const comp = results.map((l, i) => ({ input: `${OUT}/${l}.png`, left: i * cell, top: 28 }));
  // simple labels via SVG
  const labelSvg = Buffer.from(
    `<svg width="${results.length*cell}" height="28"><rect width="100%" height="100%" fill="#fff"/>` +
    results.map((l,i)=>`<text x="${i*cell+8}" y="20" font-family="sans-serif" font-size="18">${l}</text>`).join('') +
    `</svg>`);
  await sharp({ create: { width: results.length*cell, height: cell+28, channels: 3, background: '#fff' } })
    .composite([{ input: labelSvg, left: 0, top: 0 }, ...comp]).png().toFile(`${OUT}/sheet.png`);
  console.log('SHEET', `${OUT}/sheet.png`);
}
process.exit(0);
