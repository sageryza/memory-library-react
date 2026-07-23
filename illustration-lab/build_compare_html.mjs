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

const cardHtml = cards.map((c, i) => `
  <figure class="card">
    <a class="thumb" href="#lb${i}"><img src="${c.src}" alt="Grid 1 on ${c.model} ${c.quality}"></a>
    <figcaption>
      <span class="model">${c.model}</span>
      <span class="row"><span class="q ${c.quality}">${c.quality}</span><span class="cost">${c.cost}</span></span>
    </figcaption>
  </figure>`).join('');

// CSS-only :target lightbox (no JS — the render sandbox blocks scripts)
const lbHtml = cards.map((c, i) => `
  <a class="lb" id="lb${i}" href="#close" aria-label="Close enlarged image">
    <span class="lb-x" aria-hidden="true">&times;</span>
    <img src="${c.src}" alt="Enlarged: ${c.model} ${c.quality}">
  </a>`).join('');

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
  .thumb{display:block;cursor:zoom-in;}
  .thumb img{width:100%;height:auto;display:block;background:#fff;border-bottom:1px solid var(--line);}
  .thumb:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
  figcaption{display:flex;flex-direction:column;gap:4px;padding:9px 12px;}
  .model{font-weight:700;font-size:12px;font-family:ui-monospace,Menlo,monospace;}
  .row{display:flex;align-items:center;justify-content:space-between;}
  .q{font-size:9px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;padding:2px 7px;border-radius:5px;border:1px solid var(--line);color:var(--muted);}
  .q.high{color:var(--accent);border-color:var(--accent);}
  .q.medium{color:var(--mint);border-color:var(--mint);}
  .cost{font-variant-numeric:tabular-nums;font-weight:600;font-size:12px;}
  /* CSS-only lightbox */
  .lb{position:fixed;inset:0;background:rgba(20,17,12,.92);display:none;align-items:center;justify-content:center;padding:24px;z-index:50;cursor:zoom-out;text-decoration:none;}
  .lb:target{display:flex;}
  .lb img{max-width:96vw;max-height:92vh;width:auto;height:auto;border-radius:8px;background:#fff;box-shadow:0 12px 50px rgba(0,0,0,.5);}
  .lb-x{position:fixed;top:14px;right:16px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.94);color:#111;font-size:28px;line-height:44px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.35);}
</style></head>
<body>
  <h1>Grid 1 — model &amp; cost</h1>
  <p class="sub">Same nine moments, same marker prompt &amp; reference doodles. Tap any image to enlarge, tap it (or the ×) to shrink. Cost = OpenAI list-price estimate.</p>
  <div class="grid">${cardHtml}</div>
  ${lbHtml}
</body></html>`;

await writeFile('/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/marker_compare.html', html);
console.log('wrote marker_compare.html', (html.length/1024/1024).toFixed(1)+'MB');
