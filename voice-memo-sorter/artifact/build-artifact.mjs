import fs from 'node:fs';
import path from 'node:path';

const SCRATCH = '/tmp/claude-0/-home-user/0ce3c286-e0d7-560a-a987-94d9c461a814/scratchpad';
const data = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'memos-data.json'), 'utf8'));

const CATS = [
  { k: 'song', label: 'Songs' },
  { k: 'dream', label: 'Dreams' },
  { k: 'idea', label: 'Ideas' },
  { k: 'conversation', label: 'Conversations & fights' },
  { k: 'journal', label: 'Journal' },
  { k: 'todo', label: 'To-dos' },
  { k: 'quote', label: 'Quotes' },
  { k: 'note', label: 'Notes' },
  { k: 'other', label: 'Other' },
];
const EXTRA = [
  { k: 'transcription', label: 'Journal transcriptions', emoji: '✍️' },
  { k: 'empty', label: 'Empty', emoji: '🔇' },
  { k: 'toolong', label: 'Too long', emoji: '⏳' },
];

const icons = {};
for (const c of CATS) {
  const b = fs.readFileSync(path.join(SCRATCH, 'icons', `${c.k}.png`));
  icons[c.k] = 'data:image/png;base64,' + b.toString('base64');
}

const dataJson = JSON.stringify(data).replace(/<\//g, '<\\/');
const catJson = JSON.stringify([...CATS, ...EXTRA].map((c) => ({ k: c.k, label: c.label, emoji: c.emoji || null })));
const iconJson = JSON.stringify(icons).replace(/<\//g, '<\\/');

const html = `<title>Voice Memo Library</title>
<style>
  :root{
    --bg:#FBF8F3; --surface:#ffffff; --ink:#403a54; --muted:#8b84a2; --line:#ece6f3;
    --accent:#8b7ccf; --accent-ink:#5f51a6; --accent-soft:#f0ebfb; --chip:#f4eefb;
    --shadow:0 1px 2px rgba(80,60,120,.06),0 6px 20px rgba(80,60,120,.06);
    --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
  }
  @media (prefers-color-scheme:dark){
    :root{ --bg:#1e1b27; --surface:#282433; --ink:#e9e3f4; --muted:#a49cbb; --line:#37324a;
      --accent:#b3a5e8; --accent-ink:#cabdf5; --accent-soft:#2f2843; --chip:#312a45;
      --shadow:0 1px 2px rgba(0,0,0,.25),0 6px 20px rgba(0,0,0,.25);}
  }
  :root[data-theme="light"]{ --bg:#FBF8F3; --surface:#fff; --ink:#403a54; --muted:#8b84a2; --line:#ece6f3;
    --accent:#8b7ccf; --accent-ink:#5f51a6; --accent-soft:#f0ebfb; --chip:#f4eefb;
    --shadow:0 1px 2px rgba(80,60,120,.06),0 6px 20px rgba(80,60,120,.06);}
  :root[data-theme="dark"]{ --bg:#1e1b27; --surface:#282433; --ink:#e9e3f4; --muted:#a49cbb; --line:#37324a;
    --accent:#b3a5e8; --accent-ink:#cabdf5; --accent-soft:#2f2843; --chip:#312a45;
    --shadow:0 1px 2px rgba(0,0,0,.25),0 6px 20px rgba(0,0,0,.25);}

  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5;
    -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:rgba(0,0,0,0)}
  .wrap{max-width:820px;margin:0 auto;padding:0 16px 64px}
  .stick{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 88%,transparent);
    backdrop-filter:blur(10px);padding:16px 16px 12px;border-bottom:1px solid var(--line);margin:0 -16px 16px}
  .stick-in{max-width:820px;margin:0 auto}
  h1{font-family:var(--serif);font-weight:600;font-size:22px;margin:0 0 2px;letter-spacing:.2px}
  .sub{color:var(--muted);font-size:13px;margin:0 0 12px}
  .search{position:relative}
  .search input{width:100%;font-family:var(--sans);font-size:16px;color:var(--ink);
    background:var(--surface);border:1.5px solid var(--line);border-radius:12px;
    padding:12px 40px 12px 42px;outline:none;box-shadow:var(--shadow)}
  .search input:focus{border-color:var(--accent)}
  .search .ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);display:flex;pointer-events:none}
  .search .clr{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:none;
    color:var(--muted);cursor:pointer;font-size:20px;padding:6px;line-height:1;border-radius:8px}
  .search .clr:hover{color:var(--ink);background:var(--chip)}

  .cats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0 8px}
  .cat{border:0;background:none;padding:0;cursor:pointer;text-align:center;font-family:var(--sans);
    transition:transform .08s ease}
  @media (hover:hover){ .cat:hover{transform:translateY(-3px)} }
  .cat:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:16px}
  .cat img{width:100%;height:auto;display:block;border-radius:5px;background:#fff}
  .cat .ct{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;margin-top:5px}
  .extra{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 4px;justify-content:center}
  .extra .cat{border:1.5px solid var(--line);background:var(--surface);border-radius:14px;padding:8px 16px;box-shadow:var(--shadow)}
  .extra .em{font-size:22px;display:block}
  .extra .nm{font-size:12px;font-weight:600;color:var(--ink)}

  .bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 10px}
  .count{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}

  .list{display:flex;flex-direction:column;gap:10px}
  .memo{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;
    box-shadow:var(--shadow);cursor:pointer}
  .memo:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .memo h2{font-family:var(--serif);font-weight:600;font-size:17px;margin:0 0 5px;text-wrap:balance}
  .meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}
  .chip{font-size:11px;font-weight:600;color:var(--accent-ink);background:var(--chip);
    padding:2px 9px;border-radius:999px}
  .date{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
  .snip{font-size:14px;color:var(--ink);opacity:.85;margin:0}
  mark{background:#f7e59b;color:inherit;border-radius:3px;padding:0 1px}
  :root[data-theme="dark"] mark{background:#6f5f2a;color:#fff}
  @media (prefers-color-scheme:dark){mark{background:#6f5f2a;color:#fff}}
  .empty-state{text-align:center;color:var(--muted);padding:48px 0;font-size:15px}
  .foot{color:var(--muted);font-size:12px;text-align:center;margin-top:28px}

  .back{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--line);background:var(--surface);
    color:var(--accent-ink);font-weight:600;font-size:14px;font-family:var(--sans);
    border-radius:10px;padding:8px 14px;cursor:pointer;box-shadow:var(--shadow)}
  .back:hover{border-color:var(--accent)}
  .cathead{display:flex;align-items:center;gap:14px;margin:4px 0 14px}
  .cathead img{width:104px;border-radius:6px;background:#fff}
  .cathead .em{font-size:40px}
  .cathead h2{font-family:var(--serif);font-size:22px;font-weight:600;margin:0}
  .cathead .n{color:var(--muted);font-size:13px}
  .cfilter{display:flex;gap:8px;margin:0 0 14px}
  .cfilter button{border:1.5px solid var(--line);background:var(--surface);border-radius:6px;
    padding:6px 14px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:var(--sans)}
  .cfilter button[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-ink)}
  .dtitle{font-family:var(--serif);font-weight:600;font-size:24px;margin:6px 0 8px;text-wrap:balance}
  .ddesc{font-size:15px;color:var(--muted);font-style:italic;max-width:66ch;margin:0 0 10px}
  .dkeys{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 18px}
  .dbody{font-size:16px;line-height:1.65;white-space:pre-wrap;max-width:66ch}
  #catView,#memoView{display:none}
  body[data-view="cat"] #home{display:none}
  body[data-view="cat"] #catView{display:block}
  body[data-view="memo"] #home,body[data-view="memo"] #catView{display:none}
  body[data-view="memo"] #memoView{display:block}

  .autoscroll{position:fixed;top:10px;right:12px;z-index:40;display:flex;gap:6px}
  .autoscroll button{width:40px;height:34px;border-radius:6px;border:1.5px solid var(--line);
    background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:blur(6px);
    color:var(--accent-ink);box-shadow:var(--shadow);cursor:pointer;display:flex;align-items:center;
    justify-content:center;padding:0;transition:transform .08s ease,background .15s ease,color .15s ease}
  @media (hover:hover){ .autoscroll button:hover{border-color:var(--accent)} }
  .autoscroll button[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
  .autoscroll button:disabled{opacity:.38;cursor:default}
  .autoscroll button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .autoscroll svg{width:18px;height:18px;display:block}

  .dcat{margin:2px 0 18px;padding:14px 0 0;border-top:1px solid var(--line)}
  .dcat .lab{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
  .catpick{display:flex;flex-wrap:wrap;gap:6px}
  .catpick button{border:1.5px solid var(--line);background:var(--surface);border-radius:6px;
    padding:6px 12px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:var(--sans)}
  .catpick button[aria-pressed="true"]{border-color:var(--accent);background:var(--accent);color:#fff}
  @media (hover:hover){ .catpick button:hover{border-color:var(--accent)} }
  .catpick button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .corr{display:inline-flex;align-items:center;gap:8px;border:1.5px solid var(--accent);
    background:var(--accent-soft);color:var(--accent-ink);border-radius:8px;padding:9px 16px;
    font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)}
  @media (hover:hover){ .corr:hover{background:var(--accent);color:#fff} }
  .toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(16px);
    background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
    box-shadow:var(--shadow);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;z-index:60}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div id="home">
  <div class="stick"><div class="stick-in">
    <h1>Voice Memo Library</h1>
    <p class="sub" id="sub"></p>
    <div class="search">
      <span class="ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg></span>
      <input id="q" type="search" autocomplete="off" aria-label="Search memos" />
      <button class="clr" id="clr" title="Clear" aria-label="Clear search" hidden>×</button>
    </div>
  </div></div>
  <div class="wrap">
    <div id="browse">
      <nav class="cats" id="cats" aria-label="Categories"></nav>
      <div class="extra" id="extra"></div>
      <p class="foot">Tap a category to open it, or search everything above. Private — nothing leaves this page.</p>
      <div style="text-align:center"><button class="corr" id="corr" type="button" hidden></button></div>
    </div>
    <div id="results" hidden>
      <div class="bar"><span class="count" id="rcount"></span></div>
      <main class="list" id="rlist"></main>
    </div>
  </div>
</div>

<div id="catView">
  <div class="stick"><div class="stick-in"><button class="back" data-back><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Back</button></div></div>
  <div class="wrap">
    <div class="cathead" id="chead"></div>
    <div class="cfilter" id="cfilter"></div>
    <main class="list" id="clist"></main>
  </div>
</div>

<div id="memoView">
  <div class="stick"><div class="stick-in"><button class="back" data-back><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Back</button></div></div>
  <div class="wrap">
    <div class="meta" id="dmeta"></div>
    <h2 class="dtitle" id="dtitle"></h2>
    <p class="ddesc" id="ddesc"></p>
    <div class="dkeys" id="dkeys"></div>
    <div class="dcat" id="dcat"></div>
    <div class="dbody" id="dbody"></div>
  </div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="autoscroll" role="group" aria-label="Auto-scroll">
  <button id="scrollUp" type="button" aria-pressed="false" aria-label="Auto-scroll up" title="Auto-scroll up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>
  <button id="scrollStop" type="button" aria-label="Stop scrolling" title="Stop" disabled><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg></button>
  <button id="scrollDown" type="button" aria-pressed="false" aria-label="Auto-scroll down" title="Auto-scroll down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
</div>

<script id="memos" type="application/json">__DATA__</script>
<script>
  const DATA = JSON.parse(document.getElementById('memos').textContent);
  const CATS = __CATS__;
  const ICONS = __ICONS__;
  const LABEL = Object.fromEntries(CATS.map(c=>[c.k,c.label]));
  LABEL.original='Original song'; LABEL.cover='Cover';
  const byDateDesc=(a,b)=>(b.d||'').localeCompare(a.d||'');

  document.getElementById('sub').textContent = DATA.length + ' memos · 2021–2026';

  // ---- recategorization: local, reversible overrides you can export to Claude ----
  const OVR = JSON.parse(localStorage.getItem('memoCatOverrides')||'{}');
  const byId = {};
  for(const m of DATA){ m._o = m.c; byId[m.id]=m; if(OVR[m.id]) m.c=OVR[m.id]; }
  const TARGETS = [
    {k:'original',label:'Original song'},{k:'cover',label:'Cover'},{k:'dream',label:'Dream'},
    {k:'idea',label:'Idea'},{k:'conversation',label:'Conversation'},{k:'journal',label:'Journal'},
    {k:'transcription',label:'Journal transcription'},{k:'todo',label:'To-do'},{k:'quote',label:'Quote'},
    {k:'note',label:'Note'},{k:'other',label:'Other'},{k:'empty',label:'Empty'},{k:'toolong',label:'Too long'},
  ];
  let toastT;
  function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg;
    el.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('show'),1800); }
  function renderCorr(){
    const n=Object.keys(OVR).length, btn=document.getElementById('corr');
    btn.hidden=n===0;
    btn.textContent='Copy '+n+' recategorization'+(n===1?'':'s')+' to send';
  }
  function copyCorr(){
    const ids=Object.keys(OVR); if(!ids.length) return;
    const lines=ids.map(id=>{ const m=byId[id], to=OVR[id];
      return id+'  |  '+((m&&m.t)||'?')+'  |  '+((m&&(LABEL[m._o]||m._o))||'?')+' -> '+(LABEL[to]||to); });
    const text='RECATEGORIZE ('+ids.length+'):\\n'+lines.join('\\n');
    const ok=()=>toast('Copied '+ids.length+' — paste to Claude');
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(ok).catch(()=>window.prompt('Copy and send to Claude:',text)); }
    else window.prompt('Copy and send to Claude:',text);
  }
  document.getElementById('corr').onclick=copyCorr;

  const catsEl=document.getElementById('cats'), extraEl=document.getElementById('extra');
  function renderCats(){
    const counts={};
    for(const m of DATA) counts[m.c]=(counts[m.c]||0)+1;
    catsEl.innerHTML=''; extraEl.innerHTML='';
    for(const c of CATS.filter(c=>ICONS[c.k])){
      const b=document.createElement('button'); b.className='cat';
      const n=(c.k==='song')?((counts.original||0)+(counts.cover||0)):(counts[c.k]||0);
      b.innerHTML='<img alt="'+c.label+'" src="'+ICONS[c.k]+'"><div class="ct">'+n+' memos</div>';
      b.onclick=()=>openCat(c.k); catsEl.appendChild(b);
    }
    for(const c of CATS.filter(c=>!ICONS[c.k])){
      const b=document.createElement('button'); b.className='cat';
      b.innerHTML='<span class="em">'+(c.emoji||'•')+'</span><div class="nm">'+c.label+'</div><div class="ct">'+(counts[c.k]||0)+'</div>';
      b.onclick=()=>openCat(c.k); extraEl.appendChild(b);
    }
    renderCorr();
  }
  renderCats();

  const esc=s=>s.replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  function hl(text,q){ if(!q) return esc(text);
    const i=text.toLowerCase().indexOf(q); if(i<0) return esc(text);
    return esc(text.slice(0,i))+'<mark>'+esc(text.slice(i,i+q.length))+'</mark>'+esc(text.slice(i+q.length)); }
  function snippet(text,q){ if(!text) return '<em>(no words)</em>';
    if(!q) return esc(text.slice(0,160))+(text.length>160?'…':'');
    const i=text.toLowerCase().indexOf(q);
    if(i<0) return esc(text.slice(0,160))+(text.length>160?'…':'');
    const s=Math.max(0,i-60); return (s>0?'…':'')+hl(text.slice(s,i+q.length+100),q)+'…'; }


  function cardPreview(m,q){
    const desc=m.s||'';
    if(q){
      if(desc.toLowerCase().includes(q)) return hl(desc,q);
      if((m.t||'').toLowerCase().includes(q)||((m.k||[]).join(' ').includes(q))) return esc(desc)||snippet(m.x||'',q);
      return snippet(m.x||'',q);
    }
    return desc?esc(desc):snippet(m.x||'','');
  }
  function memoCard(m,q){
    const d=document.createElement('article');
    d.className='memo'; d.tabIndex=0; d.setAttribute('role','button');
    d.innerHTML='<h2>'+hl(m.t||'(untitled)',q)+'</h2>'+
      '<div class="meta"><span class="chip">'+esc(LABEL[m.c]||m.c)+'</span><span class="date">'+esc(m.d||'')+'</span></div>'+
      '<p class="snip">'+cardPreview(m,q)+'</p>';
    const open=()=>openMemo(m);
    d.addEventListener('click',open);
    d.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    return d;
  }
  function fillList(el,items,q,cap){
    el.innerHTML='';
    const frag=document.createDocumentFragment();
    for(const m of items.slice(0,cap)) frag.appendChild(memoCard(m,q));
    el.appendChild(frag);
    if(items.length>cap){
      const more=document.createElement('div'); more.className='empty-state';
      more.textContent='Showing the '+cap+' most recent of '+items.length+'. Search to narrow it down.';
      el.appendChild(more);
    }
    if(!items.length){ el.innerHTML='<div class="empty-state">Nothing here.</div>'; }
  }

  // ---- navigation (home / cat / memo) with real history ----
  let curCat=null, homeScroll=0, catScroll=0;
  function setView(v){ if(window.__autoStop)window.__autoStop(); document.body.dataset.view=v; }
  let songFilter='all';
  function openCat(k,push=true){
    curCat=k;
    if(push&&k==='song') songFilter='all';
    const c=CATS.find(c=>c.k===k);
    const isSong=m=>m.c==='original'||m.c==='cover';
    let items=DATA.filter(k==='song'?isSong:(m=>m.c===k)).sort(byDateDesc);
    if(k==='song'&&songFilter!=='all') items=items.filter(m=>m.c===songFilter);
    const cf=document.getElementById('cfilter');
    cf.innerHTML='';
    if(k==='song'){
      const opts=[['all','All'],['original','Originals'],['cover','Covers']];
      for(const o of opts){
        const bb=document.createElement('button');
        bb.textContent=o[1];
        bb.setAttribute('aria-pressed', songFilter===o[0]?'true':'false');
        bb.onclick=()=>{ songFilter=o[0]; openCat('song',false); };
        cf.appendChild(bb);
      }
    }
    document.getElementById('chead').innerHTML=
      (ICONS[k]?'<img alt="" src="'+ICONS[k]+'">':'<span class="em">'+(c.emoji||'•')+'</span>')+
      '<div><h2>'+esc(c.label)+'</h2><div class="n">'+items.length+' memos</div></div>';
    fillList(document.getElementById('clist'),items,'',300);
    homeScroll=window.scrollY; setView('cat'); window.scrollTo(0,0);
    if(push) history.pushState({v:'cat',k},'','#'+k);
  }
  function openMemo(m,push=true){
    document.getElementById('dtitle').textContent=m.t||'(untitled)';
    document.getElementById('dmeta').innerHTML='<span class="chip">'+esc(LABEL[m.c]||m.c)+'</span><span class="date">'+esc(m.d||'')+'</span>';
    document.getElementById('ddesc').innerHTML=m.s?esc(m.s):'';
    document.getElementById('dkeys').innerHTML=(m.k||[]).map(k=>'<span class="chip">'+esc(k)+'</span>').join(' ');
    renderCatPicker(m);
    document.getElementById('dbody').textContent=m.x||'(no words in this one)';
    catScroll=window.scrollY; setView('memo'); window.scrollTo(0,0);
    if(push) history.pushState({v:'memo'},'','#memo');
  }
  function renderCatPicker(m){
    const el=document.getElementById('dcat');
    const changed=m.c!==m._o;
    el.innerHTML='<div class="lab">Category'+(changed?' · was '+esc(LABEL[m._o]||m._o):'')+'</div>';
    const pick=document.createElement('div'); pick.className='catpick';
    for(const t of TARGETS){
      const b=document.createElement('button'); b.type='button'; b.textContent=t.label;
      b.setAttribute('aria-pressed', m.c===t.k?'true':'false');
      b.onclick=()=>applyCat(m,t.k);
      pick.appendChild(b);
    }
    el.appendChild(pick);
  }
  function applyCat(m,k){
    if(k===m._o) delete OVR[m.id]; else OVR[m.id]=k;
    m.c=k;
    localStorage.setItem('memoCatOverrides', JSON.stringify(OVR));
    document.getElementById('dmeta').innerHTML='<span class="chip">'+esc(LABEL[m.c]||m.c)+'</span><span class="date">'+esc(m.d||'')+'</span>';
    renderCatPicker(m); renderCats();
    toast(k===m._o?'Reset to original':'Moved to '+(LABEL[k]||k));
  }
  function showFromState(st){
    const v=(st&&st.v)||'home';
    if(v==='cat'&&st.k){ openCat(st.k,false); window.scrollTo(0,catScroll); }
    else if(v==='memo'){ setView('memo'); }
    else { setView('home'); window.scrollTo(0,homeScroll); }
  }
  window.addEventListener('popstate',e=>showFromState(e.state));
  document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>history.back());
  history.replaceState({v:'home'},'','#');
  setView('home');

  // ---- search (home): hides the grid, shows results under the bar ----
  const qEl=document.getElementById('q');
  const browse=document.getElementById('browse');
  const results=document.getElementById('results');
  let t;
  function doSearch(){
    const q=qEl.value.trim().toLowerCase();
    document.getElementById('clr').hidden=!qEl.value;
    if(!q){ results.hidden=true; browse.hidden=false; return; }
    const items=DATA.filter(m=>(m.t&&m.t.toLowerCase().includes(q))||(m.s&&m.s.toLowerCase().includes(q))||((m.k||[]).join(' ').includes(q))||(m.x&&m.x.toLowerCase().includes(q))).sort(byDateDesc);
    document.getElementById('rcount').textContent=items.length+' '+(items.length===1?'memo':'memos')+' matching “'+q+'”';
    fillList(document.getElementById('rlist'),items,q,250);
    browse.hidden=true; results.hidden=false;
  }
  qEl.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(doSearch,120);});
  document.getElementById('clr').onclick=()=>{qEl.value='';doSearch();qEl.focus();};

  // ---- floating auto-scroll (slow, up / stop / down) ----
  (function(){
    const up=document.getElementById('scrollUp'), down=document.getElementById('scrollDown'), stopBtn=document.getElementById('scrollStop');
    const SPEED=42; // px per second — a gentle reading pace
    let dir=0, raf=null, last=0, acc=0;
    function reflect(){
      up.setAttribute('aria-pressed', dir<0?'true':'false');
      down.setAttribute('aria-pressed', dir>0?'true':'false');
      stopBtn.disabled = dir===0;
    }
    function step(ts){
      if(!last) last=ts;
      const dt=Math.min((ts-last)/1000,0.05); last=ts;
      acc+=SPEED*dt*dir;
      const move=Math.trunc(acc);
      if(move){ acc-=move; const before=window.scrollY; window.scrollBy(0,move);
        if(window.scrollY===before){ stop(); return; } }        // hit top/bottom
      raf=requestAnimationFrame(step);
    }
    function start(d){ if(dir===d){ stop(); return; }
      dir=d; last=0; acc=0; reflect();
      cancelAnimationFrame(raf); raf=requestAnimationFrame(step);
    }
    function stop(){ dir=0; if(raf)cancelAnimationFrame(raf); raf=null; reflect(); }
    window.__autoStop=stop;
    up.onclick=()=>start(-1); down.onclick=()=>start(1); stopBtn.onclick=stop;
    // a real manual scroll (wheel / drag / arrow keys) cancels it
    addEventListener('wheel',()=>dir&&stop(),{passive:true});
    addEventListener('touchmove',()=>dir&&stop(),{passive:true});
    addEventListener('keydown',e=>{ if(dir&&['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)) stop(); });
  })();
</script>`;

const finalHtml = html.replace('__DATA__', dataJson).replace('__CATS__', catJson).replace('__ICONS__', iconJson);
fs.writeFileSync(path.join(SCRATCH, 'memo-library.html'), finalHtml);
console.log('wrote memo-library.html', (finalHtml.length/1e6).toFixed(2), 'MB');
