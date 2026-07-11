// Push the 314 cleaned/deduped/text-erased drawings into the shared sagediagram
// database via the callable. Month from filename; caption from the user's export.
import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const sharp = require('/home/user/memory-library-react/functions/node_modules/sharp');
const fs = require('fs');

const W = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1';
const IN = `${W}/erased_curated/train`;
const CAPS = JSON.parse(fs.readFileSync('/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045/4467bb1a-sagediagramcaptions_2.json', 'utf8'));
const EXCLUDE = new Set(JSON.parse(fs.readFileSync(`${W}/dedup_exclude.json`, 'utf8')));

const monthOf = (f) => { const s = f.toLowerCase();
  if (s.includes('february')) return 'February';
  if (s.includes('end-of-march') || s.includes('march')) return 'March';
  if (s.includes('april')) return 'April';
  if (s.includes('summer')) return 'Summer';
  if (s.includes('september')) return 'September';
  if (s.includes('october')) return 'October';
  if (s.includes('composite')) return 'Composite';
  if (s.includes('oldest')) return 'Oldest';
  return 'Unsorted'; };

const cfg = { apiKey: 'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s', authDomain: 'membry-df528.firebaseapp.com', projectId: 'membry-df528', storageBucket: 'membry-df528.firebasestorage.app', messagingSenderId: '513384339473', appId: '1:513384339473:web:8f46c5915a949c93a8b9b0' };
const app = initializeApp(cfg); const auth = getAuth(app);
await new Promise((res, rej) => { onAuthStateChanged(auth, (u) => u && res()); signInAnonymously(auth).catch(rej); });
const call = httpsCallable(getFunctions(app, 'us-central1'), 'sagediagram', { timeout: 60000 });

const files = fs.readdirSync(IN).filter((f) => /\.png$/i.test(f) && !EXCLUDE.has(f)).sort();
console.log('to upload:', files.length);

async function one(f) {
  const flat = await sharp(`${IN}/${f}`).flatten({ background: '#fff' }).png().toBuffer();
  let t; try { t = await sharp(flat).trim({ threshold: 12 }).toBuffer(); } catch { t = flat; }
  const inner = await sharp(t).resize(880, 880, { fit: 'inside', background: '#fff' }).toBuffer();
  const sq = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#fff' } }).composite([{ input: inner, gravity: 'center' }]).webp({ quality: 90 }).toBuffer();
  await call({ mode: 'add', name: f, month: monthOf(f), caption: (CAPS[f] || ''), imageBase64: sq.toString('base64'), contentType: 'image/webp' });
}

let i = 0, ok = 0, fail = 0; const CONC = 5;
async function worker() { while (i < files.length) { const f = files[i++]; try { await one(f); ok++; } catch (e) { fail++; console.error('FAIL', f, e.code || e.message); }
  if ((ok + fail) % 25 === 0) console.log(`  ${ok + fail}/${files.length} (ok ${ok}, fail ${fail})`); } }
await Promise.all(Array.from({ length: CONC }, worker));
const l = await call({ mode: 'list' });
console.log(`DONE uploaded ok ${ok} fail ${fail} | shared set now: ${l.data.items.length}`);
