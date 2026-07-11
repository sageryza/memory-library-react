import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const fs = require('fs');
const cfg = { apiKey:'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s', authDomain:'membry-df528.firebaseapp.com', projectId:'membry-df528', storageBucket:'membry-df528.firebasestorage.app', messagingSenderId:'513384339473', appId:'1:513384339473:web:8f46c5915a949c93a8b9b0' };
const app = initializeApp(cfg); const auth = getAuth(app);
await new Promise((res,rej)=>{ onAuthStateChanged(auth,u=>u&&res()); signInAnonymously(auth).catch(rej); });
const call = httpsCallable(getFunctions(app,'us-central1'),'sagediagram',{timeout:60000});
const r = await call({ mode:'moments' });
const REF = 978307200e3; // Swift Date encodes as seconds since 2001-01-01
for (const b of r.data.books) {
  console.log(`\n=== book ${b.book} (${b.pages.length} pages) ===`);
  for (const p of b.pages) {
    const d = typeof p.date === 'number' ? new Date(REF + p.date*1000).toISOString().slice(0,10) : p.date;
    console.log(`-- page ${d}`);
    p.texts.forEach((t,i)=>console.log(`  [${i+1}] ${t}`));
  }
}
fs.writeFileSync('/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/moments.json', JSON.stringify(r.data, null, 2));
