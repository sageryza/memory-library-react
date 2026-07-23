import { readFileSync, writeFileSync } from "node:fs";

const dir = "/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad";
const tl = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";

// Parse the timeline's verbatim sections so every card's context is real text.
const html = readFileSync(tl, "utf8");
const block = html.match(/const sections=\[([\s\S]*?)\];/)[1];
const entries = [...block.matchAll(/\{page:(\d+),type:"([a-z]+)",lines:\d+,date:"([^"]*)",text:"((?:[^"\\]|\\.)*)"\}/g)]
  .map((m) => ({ page: +m[1], type: m[2], date: m[3], text: JSON.parse('"' + m[4] + '"') }));

// The 6 band colors (light + dark), keyed by the entry's own type. A generated
// drawing inherits the color of the moment it illustrates — a dream stays lilac,
// a day stays orange. (The dusty-rose "drawings" band stays reserved for Sophie's
// own physical drawings.)
const TYPE = {
  day:      { label: "Day",      light: "#e8cda6", dark: "#6b5836" },
  dreams:   { label: "Dream",    light: "#d3c7e2", dark: "#4b4160" },
  ideas:    { label: "Idea",     light: "#c5d3b9", dark: "#465239" },
  abstract: { label: "Thinking", light: "#c0d1dd", dark: "#3a4b57" },
  todos:    { label: "List",     light: "#d6d1c6", dark: "#4d493f" },
  drawings: { label: "Drawing",  light: "#e2c4c6", dark: "#5c3b3f" },
};

// Each candidate: the drawing file, an `anchor` unique to its source entry, and
// a `line` — the exact sentence to highlight inside that entry's full passage.
const cand = [
  { file: "journal_g2med/glass-0.webp", concept: "green glass in a black sock",
    anchor: "green glass in one of the black socks",
    line: "I have a little piece of green glass in one of the black socks I'm wearing right now" },
  { file: "journal_g2med/squirrel-1.webp", concept: "watching the squirrel eat",
    anchor: "as I enjoyed watching the squirrel eat it",
    line: "Now I am watching myself eat granola, and I am enjoying it as I enjoyed watching the squirrel eat it." },
  { file: "journal_g2med/heater.webp", concept: "the AI heater (dream)",
    anchor: "it shouldn't get this hot",
    line: "it was also talking about thinking it may have been programmed wrong, because it shouldn't get this hot" },
  { file: "journal_g2med/pinecone.webp", concept: "cookie pinecone (dream)",
    anchor: "loose pine cone",
    line: "the cookies are first extruded in the shape of a loose pine cone, and then each of the petals are cut off to make relatively normal looking cookies" },
  { file: "journal_g2med/feather.webp", concept: "drawing the nice things",
    anchor: "drawing little pictures",
    line: "going more into my mind by drawing little pictures of all the nice things that happened yesterday" },
  { file: "journal_g2med/teacup.webp", concept: "a thought like a warm mug",
    anchor: "like a mug warming my hands",
    line: "I woke up feeling nice and healthy and good because of some thought that I must've had still in sleep, like a mug warming my hands." },
];

// Highlight the illustrated line inside the full passage.
function mark(text, line) {
  const i = text.indexOf(line);
  if (i === -1) return { html: esc(text), ok: false };
  const before = esc(text.slice(0, i));
  const hit = esc(text.slice(i, i + line.length));
  const after = esc(text.slice(i + line.length));
  return { html: before + "<mark>" + hit + "</mark>" + after, ok: true };
}
function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>"); }

const data = [];
for (const c of cand) {
  const e = entries.find((x) => x.text.includes(c.anchor));
  if (!e) { console.log("NO MATCH:", c.concept); continue; }
  const m = mark(e.text, c.line);
  if (!m.ok) { console.log("line not found in entry:", c.concept); }
  const b64 = readFileSync(`${dir}/${c.file}`).toString("base64");
  data.push({
    src: `data:image/webp;base64,${b64}`,
    concept: c.concept, date: e.date, page: e.page,
    typeKey: e.type, typeLabel: (TYPE[e.type]||TYPE.day).label,
    light: (TYPE[e.type]||TYPE.day).light, dark: (TYPE[e.type]||TYPE.day).dark,
    passage: m.html,
  });
}
console.log("cards:", data.length, data.map(d=>d.concept+" ["+d.typeLabel+"]").join(" | "));

const html_out = `<title>Illustrate — curation feed</title>
<style>
  :root{
    --paper:#ede4d0; --ink:#5a1e22; --rose-deep:#c98d92; --sage:#8ea877;
    --grey:#b8b0a0; --card:#f6efe0; --line:#d8cbb2; --shadow:rgba(90,30,34,.18);
    --mark:rgba(201,141,146,.32);
  }
  :root[data-theme="dark"]{
    --paper:#221a17; --ink:#f0e4d6; --rose-deep:#c98d92; --sage:#9fb98a;
    --grey:#6a6152; --card:#2c221e; --line:#3e322b; --shadow:rgba(0,0,0,.4);
    --mark:rgba(201,141,146,.28);
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --paper:#221a17; --ink:#f0e4d6; --rose-deep:#c98d92; --sage:#9fb98a;
      --grey:#6a6152; --card:#2c221e; --line:#3e322b; --shadow:rgba(0,0,0,.4);
      --mark:rgba(201,141,146,.28);
    }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
    min-height:100vh;display:flex;flex-direction:column;align-items:center;
    -webkit-tap-highlight-color:transparent;overflow-x:hidden}
  header{width:100%;max-width:560px;padding:22px 20px 6px;text-align:center}
  h1{margin:0;font-size:15px;font-weight:600;letter-spacing:.22em;
    text-transform:uppercase;color:var(--rose-deep)}
  .sub{margin:6px 0 0;font-size:15px;font-style:italic;opacity:.72}
  .meter{width:100%;max-width:560px;padding:12px 20px 4px;display:flex;
    align-items:center;gap:12px;font-size:13px}
  .bar{flex:1;height:5px;border-radius:3px;background:var(--line);overflow:hidden}
  .bar > i{display:block;height:100%;width:0;background:var(--rose-deep);transition:width .3s}
  .count{font-variant-numeric:tabular-nums;opacity:.7;white-space:nowrap}
  .stage{position:relative;width:100%;max-width:560px;flex:1;
    display:flex;align-items:flex-start;justify-content:center;padding:8px 20px 0}
  .deck{position:relative;width:100%;max-width:460px;min-height:560px}
  .card{position:absolute;inset:0;background:var(--card);border:1px solid var(--line);
    border-radius:14px;box-shadow:0 10px 30px var(--shadow);overflow:hidden;
    display:flex;flex-direction:column;will-change:transform;touch-action:pan-y}
  /* the colored spine = the band this drawing lives in */
  .spine{height:6px;width:100%;flex:none}
  .pic{display:flex;align-items:center;justify-content:center;padding:16px 20px 6px;
    height:210px;flex:none;background:
      radial-gradient(120% 90% at 50% 0%, var(--tint), transparent 72%)}
  .pic img{max-width:100%;max-height:100%;object-fit:contain;
    filter:drop-shadow(0 2px 4px var(--shadow))}
  .meta{display:flex;align-items:center;gap:8px;padding:10px 22px 2px;font-size:11px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--rose-deep)}
  .chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;
    border:1px solid var(--line);color:var(--ink);opacity:.85;letter-spacing:.1em}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--tint)}
  .passage{flex:1;overflow-y:auto;padding:8px 22px 20px;font-size:16px;line-height:1.5;
    -webkit-overflow-scrolling:touch}
  .passage mark{background:var(--mark);color:inherit;padding:1px 2px;border-radius:3px;
    box-shadow:0 1px 0 var(--rose-deep)}
  .fade{position:absolute;left:0;right:0;bottom:0;height:26px;pointer-events:none;
    background:linear-gradient(transparent,var(--card))}
  .stamp{position:absolute;top:220px;font-size:15px;font-weight:700;letter-spacing:.18em;
    text-transform:uppercase;padding:6px 12px;border-radius:6px;border:2px solid;
    opacity:0;transition:opacity .08s;z-index:5}
  .stamp.keep{left:22px;color:var(--sage);border-color:var(--sage);transform:rotate(-12deg)}
  .stamp.skip{right:22px;color:var(--grey);border-color:var(--grey);transform:rotate(12deg)}
  .controls{width:100%;max-width:460px;display:flex;gap:14px;padding:16px 20px 8px}
  .btn{flex:1;padding:14px 0;border-radius:6px;border:1px solid var(--line);
    background:var(--card);color:var(--ink);font-family:inherit;font-size:15px;
    letter-spacing:.06em;cursor:pointer;transition:transform .1s}
  .btn:hover{transform:translateY(-1px)}
  .btn:focus-visible{outline:2px solid var(--rose-deep);outline-offset:2px}
  .btn.keep{border-color:var(--sage);color:var(--sage)}
  .btn.skip{color:var(--grey)}
  .hint{max-width:460px;width:100%;padding:2px 20px 22px;text-align:center;
    font-size:12px;opacity:.5}
  .done{max-width:500px;padding:26px;text-align:center;display:none}
  .done h2{font-size:22px;margin:0 0 4px;color:var(--rose-deep)}
  .done p{opacity:.75;margin:4px 0 20px;font-style:italic}
  .kept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));
    gap:12px;margin:0 0 22px}
  .kept-grid figure{margin:0;background:var(--card);border:1px solid var(--line);
    border-radius:10px;padding:8px;box-shadow:0 4px 14px var(--shadow);
    border-top:4px solid var(--tint)}
  .kept-grid img{width:100%;aspect-ratio:1;object-fit:contain}
  .kept-grid figcaption{font-size:10px;opacity:.7;margin-top:5px;line-height:1.3}
  .again{padding:12px 22px;border-radius:6px;border:1px solid var(--line);
    background:var(--card);color:var(--ink);font-family:inherit;font-size:14px;
    letter-spacing:.06em;cursor:pointer}
  .empty{opacity:.6;font-style:italic}
</style>

<header>
  <h1>Illustrate</h1>
  <p class="sub">a drawing for a moment in the journal — keep the ones that fit</p>
</header>

<div class="meter" id="meter">
  <div class="bar"><i id="fill"></i></div>
  <span class="count"><span id="idx">1</span>/<span id="total">0</span> · <span id="kept">0</span> kept</span>
</div>

<div class="stage" id="stage"><div class="deck" id="deck"></div></div>

<div class="controls" id="controls">
  <button class="btn skip" id="skipBtn">✕ &nbsp;Not this one</button>
  <button class="btn keep" id="keepBtn">Keep &nbsp;♥</button>
</div>
<p class="hint">Swipe or drag · scroll the card to read around the <mark>highlighted</mark> line · ← skip · → keep</p>

<section class="done" id="done">
  <h2 id="doneTitle"></h2>
  <p id="doneSub"></p>
  <div class="kept-grid" id="keptGrid"></div>
  <button class="again" id="againBtn">Start over</button>
</section>

<script>
const CARDS = ${JSON.stringify(data)};
const deck=document.getElementById('deck'), fill=document.getElementById('fill');
const idxEl=document.getElementById('idx'), keptEl=document.getElementById('kept');
document.getElementById('total').textContent=CARDS.length;
const dark=()=>{
  const t=document.documentElement.getAttribute('data-theme');
  if(t==='dark')return true; if(t==='light')return false;
  return matchMedia('(prefers-color-scheme:dark)').matches;
};
let i=0, keptList=[], busy=false;

function tint(c){ return dark()?c.dark:c.light; }

function build(){
  deck.innerHTML='';
  for(let k=Math.min(i+2,CARDS.length-1); k>=i; k--){
    if(k>=CARDS.length) continue;
    const c=CARDS[k], depth=k-i, el=document.createElement('div');
    el.className='card';
    el.style.setProperty('--tint', tint(c));
    el.style.transform='translateY('+depth*10+'px) scale('+(1-depth*0.03)+')';
    el.style.zIndex=100-depth;
    el.innerHTML=
      '<div class="stamp keep">Keep</div><div class="stamp skip">Skip</div>'+
      '<div class="spine" style="background:'+tint(c)+'"></div>'+
      '<div class="pic"><img alt="'+c.concept+'" src="'+c.src+'"></div>'+
      '<div class="meta"><span class="chip"><span class="dot"></span>'+c.typeLabel+'</span>'+
        '<span>'+c.date+'</span></div>'+
      '<div class="passage">'+c.passage+'<div class="fade"></div></div>';
    deck.appendChild(el);
    if(depth===0) attachDrag(el);
  }
  updateMeter();
}
function updateMeter(){
  idxEl.textContent=Math.min(i+1,CARDS.length);
  keptEl.textContent=keptList.length;
  fill.style.width=(i/CARDS.length*100)+'%';
}
function decide(keep){
  if(busy||i>=CARDS.length) return; busy=true;
  const top=deck.querySelector('.card:last-child');
  if(keep) keptList.push(CARDS[i]);
  const dir=keep?1:-1;
  if(top){ top.style.transition='transform .35s ease,opacity .35s ease';
    top.style.transform='translateX('+dir*140+'%) rotate('+dir*18+'deg)'; top.style.opacity='0'; }
  setTimeout(()=>{ i++; busy=false; i>=CARDS.length?finish():build(); },300);
}
function attachDrag(el){
  let sx=0,sy=0,dx=0,dragging=false,fromScroll=false;
  const ks=el.querySelector('.stamp.keep'), ss=el.querySelector('.stamp.skip');
  const pass=el.querySelector('.passage');
  const start=(x,y,t)=>{ dragging=true; sx=x; sy=y; el.style.transition='none';
    fromScroll = t && pass.contains(t) && pass.scrollHeight>pass.clientHeight; };
  const move=(x,y)=>{ if(!dragging) return; const ddx=x-sx, ddy=y-sy;
    if(fromScroll && Math.abs(ddy)>Math.abs(ddx)) return;   // let vertical scroll win
    dx=ddx; el.style.transform='translate('+dx+'px,'+ddy*0.25+'px) rotate('+dx/18+'deg)';
    ks.style.opacity=dx>30?Math.min(dx/120,1):0; ss.style.opacity=dx<-30?Math.min(-dx/120,1):0; };
  const end=()=>{ if(!dragging) return; dragging=false; el.style.transition='transform .25s ease';
    if(Math.abs(dx)>90) decide(dx>0);
    else { el.style.transform=''; ks.style.opacity=0; ss.style.opacity=0; } dx=0; };
  el.addEventListener('touchstart',e=>start(e.touches[0].clientX,e.touches[0].clientY,e.target),{passive:true});
  el.addEventListener('touchmove',e=>move(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  el.addEventListener('touchend',end);
  el.addEventListener('mousedown',e=>{ if(e.target.closest('.passage')&&pass.scrollHeight>pass.clientHeight) return;
    start(e.clientX,e.clientY,e.target); e.preventDefault();
    const mm=ev=>move(ev.clientX,ev.clientY);
    const mu=()=>{ end(); removeEventListener('mousemove',mm); removeEventListener('mouseup',mu); };
    addEventListener('mousemove',mm); addEventListener('mouseup',mu); });
}
function finish(){
  for(const id of ['stage','controls','meter']) document.getElementById(id).style.display='none';
  document.querySelector('.hint').style.display='none';
  fill.style.width='100%';
  const done=document.getElementById('done'); done.style.display='block';
  document.getElementById('doneTitle').textContent=
    keptList.length?keptList.length+(keptList.length===1?' drawing kept':' drawings kept'):'None kept this round';
  document.getElementById('doneSub').textContent=
    keptList.length?'each one drops into its own moment — the dream stays a dream, the day stays a day':
    'nothing added — swipe again whenever you like';
  const grid=document.getElementById('keptGrid');
  grid.innerHTML=keptList.length?'':'<p class="empty">no keepers — that\\u2019s a fine answer too</p>';
  keptList.forEach(c=>{ const f=document.createElement('figure');
    f.style.setProperty('--tint', tint(c));
    f.innerHTML='<img src="'+c.src+'" alt="'+c.concept+'"><figcaption>'+c.typeLabel+' · '+c.date+'<br>'+c.concept+'</figcaption>';
    grid.appendChild(f); });
}
document.getElementById('keepBtn').onclick=()=>decide(true);
document.getElementById('skipBtn').onclick=()=>decide(false);
document.getElementById('againBtn').onclick=()=>{ i=0; keptList=[]; busy=false;
  for(const id of ['stage','controls','meter']) document.getElementById(id).style.display='';
  document.querySelector('.hint').style.display=''; document.getElementById('done').style.display='none'; build(); };
addEventListener('keydown',e=>{ if(e.key==='ArrowRight')decide(true); else if(e.key==='ArrowLeft')decide(false); });
build();
</script>`;

writeFileSync(`${dir}/illustrate.html`, html_out);
console.log("wrote illustrate.html", (html_out.length/1024).toFixed(0)+"kb");
