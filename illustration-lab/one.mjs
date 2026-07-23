import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const cfg={apiKey:'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s',authDomain:'membry-df528.firebaseapp.com',projectId:'membry-df528',storageBucket:'membry-df528.firebasestorage.app',messagingSenderId:'513384339473',appId:'1:513384339473:web:8f46c5915a949c93a8b9b0'};
const OUT='/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/concepts';
const app=initializeApp(cfg); await signInAnonymously(getAuth(app));
const fn=httpsCallable(getFunctions(app,'us-central1'),'illustrateMiracle',{timeout:300000});
const stories=[['cake','My mom got me a Mini Brands surprise ball, and the food inside was strawberry whipped-cream pancakes'],['plant','I forgot to water my plant for weeks and it bloomed anyway']];
const tiles=[];
for(const [slug,s] of stories){
  const r=await fn({text:s,id:'label-'+slug,variants:1}); // default engine now
  const c=(r.data.concepts||[])[0]||r.data;
  console.log(slug,'engine='+r.data.engine,'| drawing="'+c.drawing+'"');
  const buf=Buffer.from(await (await fetch(c.url)).arrayBuffer());
  const t=`${OUT}/label-${slug}.png`; await sharp(buf).resize(380,380,{fit:'contain',background:'#fff'}).png().toFile(t); tiles.push(t);
}
await sharp({create:{width:380*tiles.length,height:380,channels:3,background:'#fff'}}).composite(tiles.map((t,i)=>({input:t,left:i*380,top:0}))).png().toFile(`${OUT}/label-check.png`);
console.log('SHEET',`${OUT}/label-check.png`); process.exit(0);
