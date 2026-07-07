import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const cfg = { apiKey:'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s', authDomain:'membry-df528.firebaseapp.com', projectId:'membry-df528', storageBucket:'membry-df528.firebasestorage.app', messagingSenderId:'513384339473', appId:'1:513384339473:web:8f46c5915a949c93a8b9b0' };
const app=initializeApp(cfg); await signInAnonymously(getAuth(app));
const fn=httpsCallable(getFunctions(app,'us-central1'),'illustrateMiracle',{timeout:300000});
// default engine (replicate) — exactly what the app's draw button sends
const res=await fn({text:'a quick test of the cat sleeping on a warm windowsill', id:'urlcheck', distill:true});
const u=res.data.url;
console.log('engine:', res.data.engine, '| version:', res.data.version);
console.log('URL:', u);
const head = await fetch(u, { method:'GET' });
console.log('GET status:', head.status, '| content-type:', head.headers.get('content-type'), '| bytes:', head.headers.get('content-length'));
console.log('host:', new URL(u).host);
process.exit(0);
