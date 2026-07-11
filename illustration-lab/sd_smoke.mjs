import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const cfg = { apiKey:'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s', authDomain:'membry-df528.firebaseapp.com', projectId:'membry-df528', storageBucket:'membry-df528.firebasestorage.app', messagingSenderId:'513384339473', appId:'1:513384339473:web:8f46c5915a949c93a8b9b0' };
const app = initializeApp(cfg);
const auth = getAuth(app);
const uid = await new Promise((res,rej)=>{ onAuthStateChanged(auth,u=>{ if(u) res(u.uid); }); signInAnonymously(auth).catch(rej); });
console.log('signed in uid:', uid.slice(0,8));
const call = httpsCallable(getFunctions(app,'us-central1'),'sagediagram',{timeout:60000});
try { const r = await call({ mode:'list' }); console.log('LIST OK — items:', (r.data.items||[]).length); }
catch(e){ console.log('CALL FAILED:', e.code||'', e.message); process.exit(2); }
