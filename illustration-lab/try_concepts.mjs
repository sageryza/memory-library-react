// Call illustrateMiracle once per story with variants:3 (engine openai, distill)
// and lay out the returned concepts so we can see the whole-story ideas.
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

const STORIES = [
  ['birthday', 'It was my birthday and we went to get cake but the shop was closed — we told them and they let us in anyway'],
  ['surpriseball', 'My mom got me a Mini Brands surprise ball, and the food inside was strawberry whipped-cream pancakes'],
  ['bookguy', "I ran into a guy I'd run into twice before — last time he'd taken a picture of a book I dropped"],
];

const app = initializeApp(cfg);
await signInAnonymously(getAuth(app));
const fn = httpsCallable(getFunctions(app, 'us-central1'), 'illustrateMiracle', { timeout: 300000 });

for (const [slug, story] of STORIES) {
  try {
    const res = await fn({ text: story, id: 'concept-' + slug, engine: 'openai', distill: true, variants: 3 });
    const cs = res.data.concepts || [{ url: res.data.url, caption: res.data.caption, drawing: res.data.drawing }];
    console.log(`\n=== ${slug} (v${res.data.version}) — ${cs.length} concepts ===`);
    const tiles = [];
    for (let i = 0; i < cs.length; i++) {
      console.log(`  [${i+1}] caption="${cs[i].caption}"  drawing="${cs[i].drawing}"`);
      const buf = Buffer.from(await (await fetch(cs[i].url)).arrayBuffer());
      const t = `${OUT}/${slug}-${i+1}.png`;
      await sharp(buf).resize(380, 380, { fit: 'contain', background: '#fff' }).png().toFile(t);
      tiles.push(t);
    }
    const cell = 380;
    await sharp({ create: { width: cell*tiles.length, height: cell, channels: 3, background: '#fff' } })
      .composite(tiles.map((t, i) => ({ input: t, left: i*cell, top: 0 }))).png().toFile(`${OUT}/${slug}-sheet.png`);
    console.log('  SHEET', `${OUT}/${slug}-sheet.png`);
  } catch (e) {
    console.log(slug, 'ERROR', e.code || '', e.message);
  }
}
process.exit(0);
