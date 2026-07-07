// Fill check: draw once via the DEPLOYED function, fetch the RAW image, and
// measure margins. A frame-filling image trims to ~its full size; a shrunken
// doodle-on-white trims away a big border.
import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');

const cfg = {
  apiKey: 'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s',
  authDomain: 'membry-df528.firebaseapp.com', projectId: 'membry-df528',
  storageBucket: 'membry-df528.firebasestorage.app',
  messagingSenderId: '513384339473', appId: '1:513384339473:web:8f46c5915a949c93a8b9b0',
};
const OUT = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/concepts';
require('fs').mkdirSync(OUT, { recursive: true });

const app = initializeApp(cfg);
await signInAnonymously(getAuth(app));
const fn = httpsCallable(getFunctions(app, 'us-central1'), 'illustrateMiracle', { timeout: 300000 });

const story = 'It was my birthday and we went to get cake but the shop was closed — we told them and they let us in anyway';
const res = await fn({ text: story, id: 'fillcheck', engine: 'openai', distill: true, variants: 1 });
const c = (res.data.concepts && res.data.concepts[0]) || res.data;
console.log('version', res.data.version, '| caption:', c.caption, '| url host:', new URL(c.url).host);

const buf = Buffer.from(await (await fetch(c.url)).arrayBuffer());
const meta = await sharp(buf).metadata();
const trimmed = await sharp(buf).flatten({ background: '#fff' }).trim({ threshold: 18 }).metadata()
  .catch(() => ({ width: meta.width, height: meta.height }));
const wPct = Math.round(100 * (trimmed.width || meta.width) / meta.width);
const hPct = Math.round(100 * (trimmed.height || meta.height) / meta.height);
require('fs').writeFileSync(`${OUT}/fillcheck-raw.png`, await sharp(buf).png().toBuffer());
console.log(`raw ${meta.width}x${meta.height} | content spans ${wPct}% wide x ${hPct}% tall of the frame`);
console.log(wPct >= 88 && hPct >= 88 ? 'PASS: image fills the frame' : 'WARN: sizable white margin remains');
