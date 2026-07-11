import { readFileSync, writeFileSync } from "node:fs";

const dir = "/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad";
const tlPath = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";

const html = readFileSync(tlPath, "utf8");
const block = html.match(/const sections=\[([\s\S]*?)\];/)[1];
const entries = [...block.matchAll(/\{page:(\d+),type:"([a-z]+)",lines:\d+,date:"([^"]*)",text:"((?:[^"\\]|\\.)*)"\}/g)]
  .map((m) => ({ page: +m[1], type: m[2], date: m[3], text: JSON.parse('"' + m[4] + '"') }));

const TYPE = {
  day:      { label: "Day",      light: "#e8cda6", dark: "#6b5836" },
  dreams:   { label: "Dream",    light: "#d3c7e2", dark: "#4b4160" },
  ideas:    { label: "Idea",     light: "#c5d3b9", dark: "#465239" },
  abstract: { label: "Thinking", light: "#c0d1dd", dark: "#3a4b57" },
  todos:    { label: "List",     light: "#d6d1c6", dark: "#4d493f" },
  drawings: { label: "Drawing",  light: "#e2c4c6", dark: "#5c3b3f" },
};

// New moments — must match render_new.mjs ids/anchors.
const cand = [
  { file: "new_render/tray-memories.webp", concept: "a tray of memories", anchor: "putting memories on it" },
  { file: "new_render/hand-letter.webp",   concept: "a plastic hand with a letter", anchor: "handing someone a letter is an indirect way" },
  { file: "new_render/two-bears.webp",     concept: "a big bear and a little bear", anchor: "we were both bears" },
  { file: "new_render/red-frequency.webp", concept: "the spike above the line", anchor: "red frequency that goes above the line" },
  { file: "new_render/playlist-storm.webp",concept: "soft stars, hard thunder", anchor: "soft stars, hard thunder" },
  { file: "new_render/wrong-turn.webp",    concept: "the wrong turn up the mountain", anchor: "took a wrong turn" },
  { file: "new_render/kraft-books.webp",   concept: "little kraft-cover books", anchor: "no one will say they aren" },
  { file: "new_render/cloth-debris.webp",  concept: "shaking out the cloth", anchor: "uncovered the white of my cloth" },
];

const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");

// Expand the anchor phrase to its containing sentence for the highlight.
function sentenceAround(text, anchor) {
  const i = text.indexOf(anchor);
  if (i === -1) return null;
  let s = i, e = i + anchor.length;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  if (e < text.length) e++; // include the terminal punctuation
  return text.slice(s, e).trim();
}
function mark(text, line) {
  const i = text.indexOf(line);
  if (i === -1) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + line.length)) + "</mark>" + esc(text.slice(i + line.length));
}

const data = [];
for (const c of cand) {
  const e = entries.find((x) => x.text.includes(c.anchor));
  if (!e) { console.log("NO ENTRY:", c.concept); continue; }
  let img;
  try { img = readFileSync(`${dir}/${c.file}`).toString("base64"); }
  catch { console.log("NO IMAGE yet:", c.file); continue; }
  const line = sentenceAround(e.text, c.anchor);
  const t = TYPE[e.type] || TYPE.day;
  data.push({
    src: `data:image/webp;base64,${img}`,
    concept: c.concept, date: e.date,
    typeLabel: t.label, light: t.light, dark: t.dark,
    passage: mark(e.text, line),
  });
}
console.log("cards:", data.length, data.map(d=>d.concept+" ["+d.typeLabel+"]").join(" | "));

const out = `<title>Illustrate — curation feed</title>
<style>
  :root{
    --paper:#ede4d0; --ink:#5a1e22; --rose-deep:#c98d92; --sage:#8ea877;
    --amber:#c99a3f; --grey:#b8b0a0; --card:#f6efe0; --line:#d8cbb2;
    --shadow:rgba(90,30,34,.18); --mark:rgba(201,141,146,.32);
  }
  :root[data-theme="dark"]{
    --paper:#221a17; --ink:#f0e4d6; --rose-deep:#c98d92; --sage:#9fb98a;
    --amber:#d9b968; --grey:#6a6152; --card:#2c221e; --line:#3e322b;
    --shadow:rgba(0,0,0,.4); --mark:rgba(201,141,146,.28);
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --paper:#221a17; --ink:#f0e4d6; --rose-deep:#c98d92; --sage:#9fb98a;
      --amber:#d9b968; --grey:#6a6152; --card:#2c221e; --line:#3e322b;
      --shadow:rgba(0,0,0,.4); --mark:rgba(201,141,146,.28);
    }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
    min-height:100vh;display:flex;flex-direction:column;align-items:center;
    -webkit-tap-highlight-color:transparent;overflow-x:hidden}
  header{width:100%;max-width:560px;padding:20px 20px 4px;text-align:center}
  h1{margin:0;font-size:15px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--rose-deep)}
  .sub{margin:6px 0 0;font-size:15px;font-style:italic;opacity:.72}
  .meter{width:100%;max-width:560px;padding:12px 20px 4px;display:flex;align-items:center;gap:12px;font-size:13px}
  .bar{flex:1;height:5px;border-radius:3px;background:var(--line);overflow:hidden}
  .bar > i{display:block;height:100%;width:0;background:var(--rose-deep);transition:width .3s}
  .count{font-variant-numeric:tabular-nums;opacity:.7;white-space:nowrap}
  .stage{position:relative;width:100%;max-width:560px;flex:1;display:flex;
    align-items:flex-start;justify-content:center;padding:8px 20px 0}
  .deck{position:relative;width:100%;max-width:460px;min-height:560px}
  .card{position:absolute;inset:0;background:var(--card);border:1px solid var(--line);
    border-radius:14px;box-shadow:0 10px 30px var(--shadow);overflow:hidden;
    display:flex;flex-direction:column;will-change:transform;touch-action:pan-y}
  .spine{height:6px;width:100%;flex:none}
  .pic{display:flex;align-items:center;justify-content:center;padding:16px 20px 6px;
    height:210px;flex:none;background:radial-gradient(120% 90% at 50% 0%, var(--tint), transparent 72%)}
  .pic img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 2px 4px var(--shadow))}
  .meta{display:flex;align-items:center;gap:8px;padding:10px 22px 2px;font-size:11px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--rose-deep)}
  .chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;
    border:1px solid var(--line);color:var(--ink);opacity:.85;letter-spacing:.1em}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--tint)}
  .passage{flex:1;overflow-y:auto;padding:8px 22px 20px;font-size:16px;line-height:1.5;-webkit-overflow-scrolling:touch}
  .passage mark{background:var(--mark);color:inherit;padding:1px 2px;border-radius:3px;box-shadow:0 1px 0 var(--rose-deep)}
  .fade{position:absolute;left:0;right:0;bottom:0;height:26px;pointer-events:none;background:linear-gradient(transparent,var(--card))}
  .stamp{position:absolute;top:214px;font-size:15px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
    padding:6px 12px;border-radius:6px;border:2px solid;opacity:0;transition:opacity .08s;z-index:5;background:var(--card)}
  .stamp.keep{left:22px;color:var(--sage);border-color:var(--sage);transform:rotate(-11deg)}
  .stamp.skip{right:22px;color:var(--grey);border-color:var(--grey);transform:rotate(11deg)}
  .stamp.redo{left:50%;top:120px;transform:translateX(-50%);color:var(--amber);border-color:var(--amber)}
  .controls{width:100%;max-width:460px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:14px 20px 6px}
  .btn{padding:13px 0;border-radius:6px;border:1px solid var(--line);background:var(--card);
    color:var(--ink);font-family:inherit;font-size:14px;letter-spacing:.04em;cursor:pointer;
    transition:transform .1s;display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1.1}
  .btn small{font-size:10px;opacity:.6;letter-spacing:.02em;text-transform:none}
  .btn:hover{transform:translateY(-1px)}
  .btn:focus-visible{outline:2px solid var(--rose-deep);outline-offset:2px}
  .btn.keep{border-color:var(--sage);color:var(--sage)}
  .btn.redo{border-color:var(--amber);color:var(--amber)}
  .btn.skip{color:var(--grey)}
  .hint{max-width:460px;width:100%;padding:2px 20px 20px;text-align:center;font-size:12px;opacity:.5}
  /* redo note sheet */
  .sheet{position:fixed;inset:0;background:rgba(20,12,10,.45);display:none;align-items:center;
    justify-content:center;padding:24px;z-index:50}
  .sheet.open{display:flex}
  .sheet .box{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:20px;max-width:400px;width:100%;box-shadow:0 20px 50px var(--shadow)}
  .sheet h3{margin:0 0 4px;font-size:16px;color:var(--amber)}
  .sheet p{margin:0 0 12px;font-size:13px;opacity:.72;font-style:italic}
  .sheet textarea{width:100%;min-height:74px;border:1px solid var(--line);border-radius:8px;
    background:var(--paper);color:var(--ink);font-family:inherit;font-size:15px;padding:10px;resize:vertical}
  .sheet .row{display:flex;gap:10px;margin-top:12px}
  .sheet button{flex:1;padding:11px 0;border-radius:6px;border:1px solid var(--line);
    background:var(--card);color:var(--ink);font-family:inherit;font-size:14px;cursor:pointer}
  .sheet button.go{border-color:var(--amber);color:var(--amber)}
  .done{max-width:520px;padding:24px;display:none}
  .done h2{font-size:22px;margin:0 0 4px;color:var(--rose-deep);text-align:center}
  .done .lede{opacity:.75;margin:4px 0 22px;font-style:italic;text-align:center}
  .group-h{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--rose-deep);
    margin:18px 0 10px;border-bottom:1px solid var(--line);padding-bottom:5px}
  .kept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}
  .kept-grid figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:8px;box-shadow:0 4px 14px var(--shadow);border-top:4px solid var(--tint)}
  .kept-grid img{width:100%;aspect-ratio:1;object-fit:contain}
  .kept-grid figcaption{font-size:10px;opacity:.7;margin-top:5px;line-height:1.3}
  .redo-list{display:flex;flex-direction:column;gap:10px}
  .redo-item{display:flex;gap:12px;align-items:flex-start;background:var(--card);border:1px solid var(--line);
    border-left:4px solid var(--amber);border-radius:8px;padding:10px 12px}
  .redo-item img{width:52px;height:52px;object-fit:contain;flex:none;border:1px solid var(--line);border-radius:6px}
  .redo-item .rc{font-size:13px}.redo-item .rc b{display:block;margin-bottom:2px}
  .redo-item .note{font-style:italic;opacity:.8}
  .again{display:block;margin:24px auto 8px;padding:12px 22px;border-radius:6px;border:1px solid var(--line);
    background:var(--card);color:var(--ink);font-family:inherit;font-size:14px;cursor:pointer}
  .empty{opacity:.6;font-style:italic}
</style>

<header>
  <h1>Illustrate</h1>
  <p class="sub">two questions per card — is it a good moment, and is this the right drawing?</p>
</header>

<div class="meter" id="meter">
  <div class="bar"><i id="fill"></i></div>
  <span class="count"><span id="idx">1</span>/<span id="total">0</span> · <span id="kept">0</span> kept · <span id="redo">0</span> to redraw</span>
</div>

<div class="stage" id="stage"><div class="deck" id="deck"></div></div>

<div class="controls" id="controls">
  <button class="btn skip" id="skipBtn">Skip<small>not this moment</small></button>
  <button class="btn redo" id="redoBtn">Redraw<small>good moment, fix art</small></button>
  <button class="btn keep" id="keepBtn">Keep<small>moment + drawing</small></button>
</div>
<p class="hint">← skip · ↑ redraw · → keep · drag the card, or scroll it to read around the <mark>line</mark></p>

<div class="sheet" id="sheet"><div class="box">
  <h3>What should change?</h3>
  <p id="sheetConcept"></p>
  <textarea id="note" placeholder="e.g. the cars need something that shows identity — a face, a flag, a name"></textarea>
  <div class="row">
    <button id="noteCancel">Cancel</button>
    <button class="go" id="noteSave">Queue redraw</button>
  </div>
</div></div>

<section class="done" id="done">
  <h2 id="doneTitle"></h2>
  <p class="lede" id="doneSub"></p>
  <div id="keptWrap"></div>
  <div id="redoWrap"></div>
  <button class="again" id="againBtn">Start over</button>
</section>

<script>
const CARDS = ${JSON.stringify(data)};
const deck=document.getElementById('deck'), fill=document.getElementById('fill');
const idxEl=document.getElementById('idx'), keptEl=document.getElementById('kept'), redoEl=document.getElementById('redo');
document.getElementById('total').textContent=CARDS.length;
const isDark=()=>{const t=document.documentElement.getAttribute('data-theme');
  if(t==='dark')return true; if(t==='light')return false; return matchMedia('(prefers-color-scheme:dark)').matches;};
const tint=c=>isDark()?c.dark:c.light;
let i=0, kept=[], redo=[], busy=false;

function build(){
  deck.innerHTML='';
  for(let k=Math.min(i+2,CARDS.length-1); k>=i; k--){
    if(k>=CARDS.length) continue;
    const c=CARDS[k], depth=k-i, el=document.createElement('div');
    el.className='card'; el.style.setProperty('--tint', tint(c));
    el.style.transform='translateY('+depth*10+'px) scale('+(1-depth*0.03)+')'; el.style.zIndex=100-depth;
    el.innerHTML=
      '<div class="stamp keep">Keep</div><div class="stamp skip">Skip</div><div class="stamp redo">Redraw</div>'+
      '<div class="spine" style="background:'+tint(c)+'"></div>'+
      '<div class="pic"><img alt="'+c.concept+'" src="'+c.src+'"></div>'+
      '<div class="meta"><span class="chip"><span class="dot"></span>'+c.typeLabel+'</span><span>'+c.date+'</span></div>'+
      '<div class="passage">'+c.passage+'<div class="fade"></div></div>';
    deck.appendChild(el);
    if(depth===0) drag(el);
  }
  meter();
}
function meter(){ idxEl.textContent=Math.min(i+1,CARDS.length); keptEl.textContent=kept.length;
  redoEl.textContent=redo.length; fill.style.width=(i/CARDS.length*100)+'%'; }

function fly(kind){ // 'keep' | 'skip' | 'redo'
  const top=deck.querySelector('.card:last-child');
  if(top){ top.style.transition='transform .35s ease,opacity .35s ease';
    const tx = kind==='keep'?140 : kind==='skip'?-140 : 0;
    const ty = kind==='redo'?-150 : 0;
    top.style.transform='translate('+tx+'%,'+ty+'%) rotate('+(tx/8)+'deg)'; top.style.opacity='0'; }
}
function advance(){ setTimeout(()=>{ i++; busy=false; i>=CARDS.length?finish():build(); },300); }

function keep(){ if(busy||i>=CARDS.length)return; busy=true; kept.push(CARDS[i]); fly('keep'); advance(); }
function skip(){ if(busy||i>=CARDS.length)return; busy=true; fly('skip'); advance(); }
function askRedo(){ if(busy||i>=CARDS.length)return;
  document.getElementById('sheetConcept').textContent='“'+CARDS[i].concept+'” — keep the moment, note what the drawing should do differently.';
  document.getElementById('note').value='';
  document.getElementById('sheet').classList.add('open');
  setTimeout(()=>document.getElementById('note').focus(),50);
}
document.getElementById('noteSave').onclick=()=>{
  const note=document.getElementById('note').value.trim();
  redo.push({...CARDS[i], note}); document.getElementById('sheet').classList.remove('open');
  busy=true; fly('redo'); advance();
};
document.getElementById('noteCancel').onclick=()=>document.getElementById('sheet').classList.remove('open');

function drag(el){
  let sx=0,sy=0,dx=0,dy=0,on=false,scroll=false;
  const ks=el.querySelector('.stamp.keep'), ss=el.querySelector('.stamp.skip'), rs=el.querySelector('.stamp.redo');
  const pass=el.querySelector('.passage');
  const start=(x,y,t)=>{ on=true; sx=x; sy=y; el.style.transition='none';
    scroll = t && pass.contains(t) && pass.scrollHeight>pass.clientHeight; };
  const move=(x,y)=>{ if(!on)return; const ddx=x-sx, ddy=y-sy;
    if(scroll && Math.abs(ddy)>Math.abs(ddx)) return;
    dx=ddx; dy=ddy;
    el.style.transform='translate('+dx+'px,'+Math.min(dy,60)+'px) rotate('+dx/18+'deg)';
    const up = dy < -40 && Math.abs(dy) > Math.abs(dx);
    rs.style.opacity = up ? Math.min(-dy/110,1) : 0;
    ks.style.opacity = (!up&&dx>30) ? Math.min(dx/120,1):0;
    ss.style.opacity = (!up&&dx<-30) ? Math.min(-dx/120,1):0; };
  const end=()=>{ if(!on)return; on=false; el.style.transition='transform .25s ease';
    const up = dy < -90 && Math.abs(dy) > Math.abs(dx);
    if(up){ el.style.transform=''; rs.style.opacity=0; askRedo(); }
    else if(Math.abs(dx)>90){ dx>0?keep():skip(); }
    else { el.style.transform=''; ks.style.opacity=ss.style.opacity=rs.style.opacity=0; }
    dx=dy=0; };
  el.addEventListener('touchstart',e=>start(e.touches[0].clientX,e.touches[0].clientY,e.target),{passive:true});
  el.addEventListener('touchmove',e=>move(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  el.addEventListener('touchend',end);
  el.addEventListener('mousedown',e=>{ if(e.target.closest('.passage')&&pass.scrollHeight>pass.clientHeight)return;
    start(e.clientX,e.clientY,e.target); e.preventDefault();
    const mm=ev=>move(ev.clientX,ev.clientY);
    const mu=()=>{ end(); removeEventListener('mousemove',mm); removeEventListener('mouseup',mu); };
    addEventListener('mousemove',mm); addEventListener('mouseup',mu); });
}

function finish(){
  for(const id of ['stage','controls','meter']) document.getElementById(id).style.display='none';
  document.querySelector('.hint').style.display='none'; fill.style.width='100%';
  const done=document.getElementById('done'); done.style.display='block';
  const total=kept.length+redo.length;
  document.getElementById('doneTitle').textContent = total? total+' moments illustrated' : 'Nothing this round';
  document.getElementById('doneSub').textContent = total
    ? kept.length+' ready to drop in · '+redo.length+' to redraw' : 'swipe again whenever you like';
  const kw=document.getElementById('keptWrap');
  kw.innerHTML = kept.length ? '<div class="group-h">Ready — drop into their bands</div><div class="kept-grid" id="kg"></div>' : '';
  if(kept.length){ const g=kw.querySelector('#kg'); kept.forEach(c=>{ const f=document.createElement('figure');
    f.style.setProperty('--tint', tint(c));
    f.innerHTML='<img src="'+c.src+'"><figcaption>'+c.typeLabel+' · '+c.date+'<br>'+c.concept+'</figcaption>'; g.appendChild(f); }); }
  const rw=document.getElementById('redoWrap');
  rw.innerHTML = redo.length ? '<div class="group-h">Redraw queue</div><div class="redo-list" id="rl"></div>' : '';
  if(redo.length){ const l=rw.querySelector('#rl'); redo.forEach(c=>{ const d=document.createElement('div');
    d.className='redo-item';
    d.innerHTML='<img src="'+c.src+'"><div class="rc"><b>'+c.concept+'</b>'+
      (c.note?'<span class="note">'+c.note.replace(/</g,'&lt;')+'</span>':'<span class="note" style="opacity:.5">no note — just redraw</span>')+'</div>';
    l.appendChild(d); }); }
}
document.getElementById('keepBtn').onclick=keep;
document.getElementById('skipBtn').onclick=skip;
document.getElementById('redoBtn').onclick=askRedo;
document.getElementById('againBtn').onclick=()=>{ i=0; kept=[]; redo=[]; busy=false;
  for(const id of ['stage','controls','meter']) document.getElementById(id).style.display='';
  document.querySelector('.hint').style.display=''; document.getElementById('done').style.display='none'; build(); };
addEventListener('keydown',e=>{ if(document.getElementById('sheet').classList.contains('open'))return;
  if(e.key==='ArrowRight')keep(); else if(e.key==='ArrowLeft')skip(); else if(e.key==='ArrowUp'){e.preventDefault();askRedo();} });
build();
</script>`;

writeFileSync(`${dir}/illustrate.html`, out);
console.log("wrote illustrate.html", (out.length/1024).toFixed(0)+"kb");
