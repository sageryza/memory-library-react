// Self-contained HTML gallery of the training set: each image embedded as a
// data URI with a blank, editable caption box beneath. Captions autosave to
// localStorage + can be exported. Month tabs (parsed from the sheet filename)
// filter the grid. Optional pre-fill captions + dedup exclude list.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const IN = process.argv[2];
const CAPS = JSON.parse(await readFile(process.argv[3], 'utf8'));
const OUT = process.argv[4];
const PREFILL = process.argv[5] ? JSON.parse(await readFile(process.argv[5], 'utf8')) : {};
const EXCLUDE = new Set(process.argv[6] ? JSON.parse(await readFile(process.argv[6], 'utf8')) : []);

// Parse the month/sheet each drawing came from, out of the filename prefix.
function monthOf(f) {
  const s = f.toLowerCase();
  if (s.includes('february')) return 'February';
  if (s.includes('end-of-march') || s.includes('march')) return 'March';
  if (s.includes('april')) return 'April';
  if (s.includes('summer')) return 'Summer';
  if (s.includes('september')) return 'September';
  if (s.includes('october')) return 'October';
  if (s.includes('composite')) return 'Composite';
  if (s.includes('oldest')) return 'Oldest';
  return 'Other';
}
const ORDER = ['February', 'March', 'April', 'Summer', 'September', 'October', 'Composite', 'Oldest', 'Other'];

const files = (await readdir(IN)).filter(f => /\.png$/i.test(f) && CAPS[f] && !/^unclear$/i.test(CAPS[f]) && !EXCLUDE.has(f)).sort();
const cards = [];
for (const f of files) {
  const thumb = await sharp(join(IN, f)).flatten({ background: '#fff' })
    .resize(420, 420, { fit: 'contain', background: '#fff' }).webp({ quality: 72 }).toBuffer();
  cards.push({ uri: `data:image/webp;base64,${thumb.toString('base64')}`, f, m: monthOf(f) });
}
const present = ORDER.filter(m => cards.some(c => c.m === m));
const counts = Object.fromEntries(present.map(m => [m, cards.filter(c => c.m === m).length]));

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAGEDIAGRAM — caption your drawings</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 18px;z-index:5}
h1{margin:0 0 8px;font-size:18px}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.tabs button{border:1px solid var(--line);background:#fff;border-radius:6px;padding:5px 11px;cursor:pointer;font-size:13px}
.tabs button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}
.controls button{border:1px solid var(--line);background:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px}
.controls button.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;cursor:zoom-in}
.card input{border:0;border-top:1px solid var(--line);padding:8px;font-size:13px;width:100%;font-family:inherit;background:#fff}
.card input:focus{outline:2px solid #cdbb8a;outline-offset:-2px}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:20;cursor:zoom-out}
#lb img{max-width:92vw;max-height:88vh;background:#fff;border-radius:8px}
.count{opacity:.7;margin-left:auto}
</style></head><body>
<header><h1>SAGEDIAGRAM — caption your drawings</h1>
<div class="tabs" id="tabs">
<button class="on" data-m="all">All ${cards.length}</button>
${present.map(m => `<button data-m="${m}">${m} ${counts[m]}</button>`).join('\n')}
</div>
<div class="controls">
<button class="primary" id="exp">⬇ Export captions (.json)</button>
<button id="clr">Clear all</button>
<span class="count" id="cnt"></span>
</div></header>
<div class="grid" id="g"></div>
<div id="lb"><img></div>
<script>
const DATA=${JSON.stringify(cards)};
const PREFILL=${JSON.stringify(PREFILL)};
const KEY='sagediagram_caps_v1';
const store=Object.assign({}, PREFILL, JSON.parse(localStorage.getItem(KEY)||'{}'));
localStorage.setItem(KEY, JSON.stringify(store));
let filt='all';
const g=document.getElementById('g'),cnt=document.getElementById('cnt');
function updateCount(){const n=Object.values(store).filter(v=>v&&v.trim()).length;cnt.textContent=n+' captioned';}
function render(){g.innerHTML='';
 for(const c of DATA){ if(filt!=='all'&&c.m!==filt)continue;
   const d=document.createElement('div');d.className='card';
   const img=document.createElement('img');img.loading='lazy';img.src=c.uri;
   img.onclick=()=>{const lb=document.getElementById('lb');lb.querySelector('img').src=c.uri;lb.style.display='flex'};
   const inp=document.createElement('input');inp.placeholder='';inp.value=store[c.f]||'';
   inp.oninput=()=>{store[c.f]=inp.value;localStorage.setItem(KEY,JSON.stringify(store));updateCount();};
   d.appendChild(img);d.appendChild(inp);g.appendChild(d);
 }}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');filt=b.dataset.m;render();});
document.getElementById('exp').onclick=()=>{
  const clean={};for(const k in store){if(store[k]&&store[k].trim())clean[k]=store[k].trim();}
  const blob=new Blob([JSON.stringify(clean,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sagediagram-captions.json';a.click();};
document.getElementById('clr').onclick=()=>{if(confirm('Clear all captions you typed?')){localStorage.removeItem(KEY);location.reload();}};
document.getElementById('lb').onclick=()=>document.getElementById('lb').style.display='none';
updateCount();render();
</script></body></html>`;
await writeFile(OUT, html);
console.log('wrote', OUT, '|', cards.length, 'cards | months:', JSON.stringify(counts));
