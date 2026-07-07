import { readFileSync, writeFileSync } from "node:fs";

const dir = "/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad";

// The 12 pre-generated candidate drawings, each paired with its verbatim
// source excerpt, date, and a short concept label. These are the assets the
// overnight pipeline would produce; here they're the deck the user swipes.
const cards = [
  { file: "journal_g2med/glass-0.webp", date: "Feb 1", concept: "green glass in a black sock",
    text: "a little piece of green glass in one of my black socks — it reminds me of summer" },
  { file: "journal_g2med/teacup.webp", date: "Feb 2", concept: "the good strong teacup",
    text: "I want to be the good strong teacup — one single line" },
  { file: "journal_g2med/feather.webp", date: "Feb 3", concept: "handwriting shrinking",
    text: "scared of how small my handwriting is getting" },
  { file: "journal_g2med/heart-hand.webp", date: "Feb 4", concept: "a heart in a hand",
    text: "he almost made me a valentine — a heart in a hand that says: my love is still with you" },
  { file: "journal_g2med/heater.webp", date: "Feb 5", concept: "the AI heater (dream)",
    text: "a dream: a toaster-looking heater who was programmed with AI, and it knew it shouldn't get this hot" },
  { file: "journal_g2med/pinecone.webp", date: "Feb 11", concept: "cookie pinecone (dream)",
    text: "a dream: cookies extruded as a loose pine cone, then each petal cut off one by one" },
  { file: "journal_g2med/squirrel-1.webp", date: "Feb 8", concept: "watching the squirrel eat",
    text: "watching myself eat granola as I enjoyed watching the squirrel eat it" },
  { file: "march_render/cage-open.webp", date: "Mar", concept: "a cage open at the back",
    text: "it's a cage, but you can just leave through the back" },
  { file: "march_render/pill-book.webp", date: "Mar", concept: "the book of photographs",
    text: "instead of the pills, look at your book of photographs — one paradox at a time" },
  { file: "march_render/rabbits-sophie.webp", date: "Mar", concept: "all the rabbits named Sophie",
    text: "all of my rabbits, all of them being called Sophie" },
  { file: "march_render/eggs-cracked.webp", date: "Mar", concept: "cracked eggs in the fridge (dream)",
    text: "a dream: trying to find eggs in the fridge but all of them were cracked" },
  { file: "march_render/slow-car.webp", date: "Mar", concept: "waiting in line for slow cars",
    text: "waiting in line for slow cars — the slow becomes an identity" },
];

const data = cards.map((c) => {
  const b64 = readFileSync(`${dir}/${c.file}`).toString("base64");
  return { src: `data:image/webp;base64,${b64}`, date: c.date, concept: c.concept, text: c.text };
});

const html = `<title>Illustrate — curation feed</title>
<style>
  :root{
    --paper:#ede4d0; --ink:#5a1e22; --rose:#e2c4c6; --rose-deep:#c98d92;
    --sage:#8ea877; --grey:#b8b0a0; --card:#f6efe0; --line:#d8cbb2;
    --shadow:rgba(90,30,34,.18);
  }
  :root[data-theme="dark"]{
    --paper:#221a17; --ink:#f0e4d6; --rose:#5c3b3f; --rose-deep:#c98d92;
    --sage:#9fb98a; --grey:#6a6152; --card:#2c221e; --line:#3e322b;
    --shadow:rgba(0,0,0,.4);
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --paper:#221a17; --ink:#f0e4d6; --rose:#5c3b3f; --rose-deep:#c98d92;
      --sage:#9fb98a; --grey:#6a6152; --card:#2c221e; --line:#3e322b;
      --shadow:rgba(0,0,0,.4);
    }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
    min-height:100vh;display:flex;flex-direction:column;align-items:center;
    -webkit-tap-highlight-color:transparent;overflow-x:hidden}
  header{width:100%;max-width:520px;padding:22px 20px 8px;text-align:center}
  h1{margin:0;font-size:15px;font-weight:600;letter-spacing:.22em;
    text-transform:uppercase;color:var(--rose-deep)}
  .sub{margin:6px 0 0;font-size:15px;font-style:italic;opacity:.72}
  .meter{width:100%;max-width:520px;padding:14px 20px 4px;display:flex;
    align-items:center;gap:12px;font-size:13px;letter-spacing:.04em}
  .bar{flex:1;height:5px;border-radius:3px;background:var(--line);overflow:hidden}
  .bar > i{display:block;height:100%;width:0;background:var(--rose-deep);
    transition:width .3s ease}
  .count{font-variant-numeric:tabular-nums;opacity:.7;white-space:nowrap}
  .stage{position:relative;width:100%;max-width:520px;flex:1;
    display:flex;align-items:center;justify-content:center;padding:10px 20px 0}
  .deck{position:relative;width:100%;max-width:420px;aspect-ratio:3/4.25}
  .card{position:absolute;inset:0;background:var(--card);border:1px solid var(--line);
    border-radius:14px;box-shadow:0 10px 30px var(--shadow);overflow:hidden;
    display:flex;flex-direction:column;will-change:transform;touch-action:pan-y}
  .card .pic{flex:1;display:flex;align-items:center;justify-content:center;
    padding:20px 20px 8px;min-height:0;background:
      radial-gradient(120% 90% at 50% 0%, color-mix(in srgb,var(--rose) 22%,transparent), transparent 70%)}
  .card img{max-width:100%;max-height:100%;object-fit:contain;
    filter:drop-shadow(0 2px 4px var(--shadow))}
  .card .cap{padding:4px 22px 22px;border-top:1px solid var(--line)}
  .card .date{font-size:11px;letter-spacing:.18em;text-transform:uppercase;
    color:var(--rose-deep);margin:12px 0 6px}
  .card .quote{margin:0;font-size:18px;line-height:1.45;font-style:italic}
  .stamp{position:absolute;top:22px;font-size:15px;font-weight:700;letter-spacing:.18em;
    text-transform:uppercase;padding:6px 12px;border-radius:6px;border:2px solid;
    opacity:0;transition:opacity .08s}
  .stamp.keep{left:22px;color:var(--sage);border-color:var(--sage);transform:rotate(-12deg)}
  .stamp.skip{right:22px;color:var(--grey);border-color:var(--grey);transform:rotate(12deg)}
  .controls{width:100%;max-width:420px;display:flex;gap:14px;
    padding:18px 20px 26px}
  .btn{flex:1;padding:14px 0;border-radius:6px;border:1px solid var(--line);
    background:var(--card);color:var(--ink);font-family:inherit;font-size:15px;
    letter-spacing:.06em;cursor:pointer;transition:transform .1s,background .15s}
  .btn:hover{transform:translateY(-1px)}
  .btn:focus-visible{outline:2px solid var(--rose-deep);outline-offset:2px}
  .btn.keep{border-color:var(--sage);color:var(--sage)}
  .btn.skip{color:var(--grey)}
  .hint{max-width:420px;width:100%;padding:0 20px 20px;text-align:center;
    font-size:12px;opacity:.5;letter-spacing:.03em}
  .done{max-width:460px;padding:30px 26px;text-align:center;display:none}
  .done h2{font-size:22px;margin:0 0 4px;color:var(--rose-deep)}
  .done p{opacity:.75;margin:4px 0 20px;font-style:italic}
  .kept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));
    gap:12px;margin:0 0 22px}
  .kept-grid figure{margin:0;background:var(--card);border:1px solid var(--line);
    border-radius:10px;padding:8px;box-shadow:0 4px 14px var(--shadow)}
  .kept-grid img{width:100%;aspect-ratio:1;object-fit:contain}
  .kept-grid figcaption{font-size:10px;opacity:.6;margin-top:4px;line-height:1.25}
  .again{padding:12px 22px;border-radius:6px;border:1px solid var(--line);
    background:var(--card);color:var(--ink);font-family:inherit;font-size:14px;
    letter-spacing:.06em;cursor:pointer}
  .empty{opacity:.6;font-style:italic}
</style>

<header>
  <h1>Illustrate</h1>
  <p class="sub">drawings the journal asked for — keep the ones that feel right</p>
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
<p class="hint">Swipe or drag the card · ← skip · → keep</p>

<section class="done" id="done">
  <h2 id="doneTitle"></h2>
  <p id="doneSub"></p>
  <div class="kept-grid" id="keptGrid"></div>
  <button class="again" id="againBtn">Start over</button>
</section>

<script>
const CARDS = ${JSON.stringify(data)};
const deck = document.getElementById('deck');
const fill = document.getElementById('fill');
const idxEl = document.getElementById('idx');
const keptEl = document.getElementById('kept');
document.getElementById('total').textContent = CARDS.length;

let i = 0, keptList = [], busy = false;

function build(){
  deck.innerHTML = '';
  // render a small stack: current + next two behind it
  for(let k = Math.min(i+2, CARDS.length-1); k >= i; k--){
    if(k >= CARDS.length) continue;
    const c = CARDS[k];
    const el = document.createElement('div');
    el.className = 'card';
    const depth = k - i;
    el.style.transform = 'translateY(' + depth*10 + 'px) scale(' + (1 - depth*0.03) + ')';
    el.style.zIndex = 100 - depth;
    el.innerHTML =
      '<div class="stamp keep">Keep</div><div class="stamp skip">Skip</div>' +
      '<div class="pic"><img alt="' + c.concept + '" src="' + c.src + '"></div>' +
      '<div class="cap"><div class="date">' + c.date + ' · ' + c.concept + '</div>' +
      '<p class="quote">\\u201C' + c.text + '\\u201D</p></div>';
    deck.appendChild(el);
    if(depth === 0) attachDrag(el);
  }
  updateMeter();
}

function updateMeter(){
  const shown = Math.min(i+1, CARDS.length);
  idxEl.textContent = shown;
  keptEl.textContent = keptList.length;
  fill.style.width = (i / CARDS.length * 100) + '%';
}

function decide(keep){
  if(busy || i >= CARDS.length) return;
  busy = true;
  const top = deck.querySelector('.card:last-child');
  if(keep) keptList.push(CARDS[i]);
  const dir = keep ? 1 : -1;
  if(top){
    top.style.transition = 'transform .35s ease, opacity .35s ease';
    top.style.transform = 'translateX(' + dir*140 + '%) rotate(' + dir*18 + 'deg)';
    top.style.opacity = '0';
  }
  setTimeout(() => { i++; busy = false; i >= CARDS.length ? finish() : build(); }, 300);
}

function attachDrag(el){
  let sx=0, sy=0, dx=0, dragging=false;
  const keepStamp = el.querySelector('.stamp.keep');
  const skipStamp = el.querySelector('.stamp.skip');
  const start = (x,y)=>{ dragging=true; sx=x; sy=y; el.style.transition='none'; };
  const move = (x,y)=>{
    if(!dragging) return;
    dx = x - sx; const dy = y - sy;
    el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + dx/18 + 'deg)';
    keepStamp.style.opacity = dx > 30 ? Math.min(dx/120,1) : 0;
    skipStamp.style.opacity = dx < -30 ? Math.min(-dx/120,1) : 0;
  };
  const end = ()=>{
    if(!dragging) return; dragging=false;
    el.style.transition='transform .25s ease';
    if(Math.abs(dx) > 90){ decide(dx > 0); }
    else { el.style.transform=''; keepStamp.style.opacity=0; skipStamp.style.opacity=0; }
    dx=0;
  };
  el.addEventListener('touchstart', e=>start(e.touches[0].clientX,e.touches[0].clientY), {passive:true});
  el.addEventListener('touchmove', e=>move(e.touches[0].clientX,e.touches[0].clientY), {passive:true});
  el.addEventListener('touchend', end);
  el.addEventListener('mousedown', e=>{ start(e.clientX,e.clientY);
    const mm=ev=>move(ev.clientX,ev.clientY);
    const mu=()=>{ end(); window.removeEventListener('mousemove',mm); window.removeEventListener('mouseup',mu); };
    window.addEventListener('mousemove',mm); window.addEventListener('mouseup',mu); });
}

function finish(){
  document.getElementById('stage').style.display='none';
  document.getElementById('controls').style.display='none';
  document.querySelector('.hint').style.display='none';
  document.getElementById('meter').style.display='none';
  fill.style.width='100%';
  const done = document.getElementById('done');
  done.style.display='block';
  document.getElementById('doneTitle').textContent =
    keptList.length ? keptList.length + (keptList.length===1?' drawing kept':' drawings kept') : 'None kept this round';
  document.getElementById('doneSub').textContent =
    keptList.length ? 'these drop into the dusty-rose bands on your timeline' : 'nothing added — swipe again whenever you like';
  const grid = document.getElementById('keptGrid');
  grid.innerHTML = keptList.length ? '' : '<p class="empty">no keepers — that\\u2019s a fine answer too</p>';
  keptList.forEach(c=>{
    const f=document.createElement('figure');
    f.innerHTML = '<img src="'+c.src+'" alt="'+c.concept+'"><figcaption>'+c.concept+'</figcaption>';
    grid.appendChild(f);
  });
}

document.getElementById('keepBtn').onclick = ()=>decide(true);
document.getElementById('skipBtn').onclick = ()=>decide(false);
document.getElementById('againBtn').onclick = ()=>{
  i=0; keptList=[]; busy=false;
  document.getElementById('stage').style.display='';
  document.getElementById('controls').style.display='';
  document.querySelector('.hint').style.display='';
  document.getElementById('meter').style.display='';
  document.getElementById('done').style.display='none';
  build();
};
window.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight') decide(true);
  else if(e.key==='ArrowLeft') decide(false);
});
build();
</script>`;

writeFileSync(`${dir}/illustrate.html`, html);
console.log("wrote illustrate.html", (html.length/1024).toFixed(0)+"kb", data.length, "cards");
