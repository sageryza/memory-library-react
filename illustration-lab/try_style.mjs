import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const cfg = { apiKey:'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s', authDomain:'membry-df528.firebaseapp.com', projectId:'membry-df528', storageBucket:'membry-df528.firebasestorage.app', messagingSenderId:'513384339473', appId:'1:513384339473:web:8f46c5915a949c93a8b9b0' };
const OUT='/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/concepts'; require('fs').mkdirSync(OUT,{recursive:true});
const STORY='It was my birthday and we went to get cake but the shop was closed — we told them and they let us in anyway';
const app=initializeApp(cfg); await signInAnonymously(getAuth(app));
const fn=httpsCallable(getFunctions(app,'us-central1'),'illustrateMiracle',{timeout:300000});
const res=await fn({text:STORY,id:'style-sketchy',engine:'replicate',distill:true,variants:3});
const cs=res.data.concepts||[]; console.log('sketchy concepts:',cs.length,'engine',res.data.engine);
const tiles=[];
for(let i=0;i<cs.length;i++){ console.log(`  [${i+1}] ${cs[i].drawing.slice(0,80)}`); const buf=Buffer.from(await (await fetch(cs[i].url)).arrayBuffer()); const t=`${OUT}/sketchy-${i+1}.png`; await sharp(buf).resize(380,380,{fit:'contain',background:'#fff'}).png().toFile(t); tiles.push(t); }
await sharp({create:{width:380*tiles.length,height:380,channels:3,background:'#fff'}}).composite(tiles.map((t,i)=>({input:t,left:i*380,top:0}))).png().toFile(`${OUT}/sketchy-sheet.png`);
console.log('SHEET',`${OUT}/sketchy-sheet.png`); process.exit(0);
