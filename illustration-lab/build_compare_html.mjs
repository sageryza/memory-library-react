import { readFile, writeFile } from 'node:fs/promises';
const DIR = '/home/user/memory-library-react/illustration-lab/should_draw_marker';
const b64 = async (p) => 'data:image/webp;base64,' + (await readFile(p)).toString('base64');

const cards = [
  { file: 'marker1_moments_1-9.webp', model: 'gpt-image-1',   quality: 'high',   cost: '~$0.19' },
  { file: 'marker1_img2_medium.webp', model: 'gpt-image-2',   quality: 'medium', cost: '~$0.07' },
  { file: 'marker1_img2_high.webp',   model: 'gpt-image-2',   quality: 'high',   cost: '~$0.22' },
  { file: 'marker1_img15_medium.webp',model: 'gpt-image-1.5', quality: 'medium', cost: '~$0.06' },
  { file: 'marker1_img15_high.webp',  model: 'gpt-image-1.5', quality: 'high',   cost: '~$0.20' },
];
for (const c of cards) c.src = await b64(`${DIR}/${c.file}`);

const cardHtml = cards.map((c) => `
  <figure class="card">
    <img src="${c.src}" alt="Grid 1 on ${c.model} ${c.quality}" tabindex="0">
    <figcaption>
      <span class="model">${c.model}</span>
      <span class="row"><span class="q ${c.quality}">${c.quality}</span><span class="cost">${c.cost}</span></span>
    </figcaption>
  </figure>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grid 1 — model & cost comparison</title>
<style>
  :root{--bg:#ece9e2;--card:#faf8f3;--ink:#231f1b;--muted:#6c665d;--line:#d6d1c5;--accent:#5f5296;--mint:#3f8168;}
  @media (prefers-color-scheme:dark){:root{--bg:#17150f;--card:#211f1b;--ink:#ece8df;--muted:#a49c8e;--line:#33302a;--accent:#b3a4ef;--mint:#8dcbac;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:clamp(16px,3vw,40px);}
  h1{font-family:Georgia,serif;font-size:clamp(22px,4vw,34px);margin:0 0 4px;letter-spacing:-.01em;}
  .sub{color:var(--muted);margin:0 0 24px;font-size:13px;}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;}
  .card{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.05),0 6px 16px rgba(0,0,0,.06);}
  .card img{width:100%;height:auto;display:block;background:#fff;border-bottom:1px solid var(--line);cursor:zoom-in;}
  .card img:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
  figcaption{display:flex;flex-direction:column;gap:4px;padding:9px 12px;}
  .model{font-weight:700;font-size:12px;font-family:ui-monospace,Menlo,monospace;}
  .row{display:flex;align-items:center;justify-content:space-between;}
  .q{font-size:9px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;padding:2px 7px;border-radius:5px;border:1px solid var(--line);color:var(--muted);}
  .q.high{color:var(--accent);border-color:var(--accent);}
  .q.medium{color:var(--mint);border-color:var(--mint);}
  .cost{font-variant-numeric:tabular-nums;font-weight:600;font-size:12px;}
  /* lightbox */
  .lb{position:fixed;inset:0;background:rgba(20,17,12,.9);display:none;align-items:center;justify-content:center;padding:24px;z-index:50;}
  .lb.open{display:flex;}
  .lb img{max-width:96vw;max-height:92vh;width:auto;height:auto;border-radius:8px;background:#fff;box-shadow:0 12px 50px rgba(0,0,0,.5);}
  .lb-x{position:fixed;top:14px;right:16px;width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.92);color:#111;font-size:26px;line-height:1;cursor:pointer;display:grid;place-items:center;z-index:51;box-shadow:0 2px 10px rgba(0,0,0,.35);}
  .lb-x:hover{background:#fff;}
  .lb-x:focus-visible{outline:3px solid var(--accent);}
</style></head>
<body>
  <h1>Grid 1 — model &amp; cost</h1>
  <p class="sub">Same nine moments, same marker prompt &amp; reference doodles. Tap any image to enlarge. Cost = OpenAI list-price estimate.</p>
  <div class="grid">${cardHtml}</div>
  <div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Enlarged image">
    <button class="lb-x" id="lbx" aria-label="Close">&times;</button>
    <img id="lbimg" src="" alt="">
  </div>
  <script>
    (function(){
      var lb=document.getElementById('lb'),img=document.getElementById('lbimg'),x=document.getElementById('lbx');
      function open(src,alt){img.src=src;img.alt=alt||'';lb.classList.add('open');x.focus();}
      function close(){lb.classList.remove('open');img.src='';}
      document.querySelectorAll('.card img').forEach(function(el){
        el.addEventListener('click',function(){open(el.src,el.alt);});
        el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(el.src,el.alt);}});
      });
      x.addEventListener('click',close);
      lb.addEventListener('click',function(e){if(e.target===lb)close();});
      document.addEventListener('keydown',function(e){if(e.key==='Escape'&&lb.classList.contains('open'))close();});
    })();
  </script>
</body></html>`;

await writeFile('/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/marker_compare.html', html);
console.log('wrote marker_compare.html', (html.length/1024/1024).toFixed(1)+'MB');
