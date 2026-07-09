import { readFile, writeFile } from 'node:fs/promises';
const DIR = '/home/user/memory-library-react/illustration-lab/should_draw_marker';
const b64 = async (p) => 'data:image/webp;base64,' + (await readFile(p)).toString('base64');

const cards = [
  { file: 'marker1_moments_1-9.webp', model: 'gpt-image-1',   quality: 'high',   cost: '~$0.19', note: 'bold marker line' },
  { file: 'marker1_img2_medium.webp', model: 'gpt-image-2',   quality: 'medium', cost: '~$0.07', note: 'clean fine line' },
  { file: 'marker1_img2_high.webp',   model: 'gpt-image-2',   quality: 'high',   cost: '~$0.22', note: 'clean fine line, most detail' },
  { file: 'marker1_img15_medium.webp',model: 'gpt-image-1.5', quality: 'medium', cost: '~$0.06', note: 'grey wash + color' },
  { file: 'marker1_img15_high.webp',  model: 'gpt-image-1.5', quality: 'high',   cost: '~$0.20', note: 'grey wash + color' },
];
for (const c of cards) c.src = await b64(`${DIR}/${c.file}`);

const cardHtml = cards.map((c, i) => `
  <figure class="card">
    <img src="${c.src}" alt="Grid 1 rendered on ${c.model} ${c.quality}">
    <figcaption>
      <span class="model">${c.model}</span>
      <span class="row"><span class="q ${c.quality}">${c.quality}</span><span class="cost">${c.cost}</span></span>
      <span class="note">${c.note}</span>
    </figcaption>
  </figure>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grid 1 — model & cost comparison</title>
<style>
  :root{--bg:#ece9e2;--card:#faf8f3;--ink:#231f1b;--muted:#6c665d;--line:#d6d1c5;--accent:#5f5296;--mint:#3f8168;}
  @media (prefers-color-scheme:dark){:root{--bg:#17150f;--card:#211f1b;--ink:#ece8df;--muted:#a49c8e;--line:#33302a;--accent:#b3a4ef;--mint:#8dcbac;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:clamp(16px,3vw,40px);}
  h1{font-family:Georgia,serif;font-size:clamp(24px,4vw,36px);margin:0 0 4px;letter-spacing:-.01em;}
  .sub{color:var(--muted);margin:0 0 26px;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;}
  .card{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.05),0 8px 20px rgba(0,0,0,.06);}
  .card img{width:100%;height:auto;display:block;background:#fff;border-bottom:1px solid var(--line);}
  figcaption{display:flex;flex-direction:column;gap:6px;padding:13px 15px;}
  .model{font-weight:700;font-size:15px;font-family:ui-monospace,Menlo,monospace;}
  .row{display:flex;align-items:center;justify-content:space-between;}
  .q{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;padding:3px 9px;border-radius:6px;border:1px solid var(--line);color:var(--muted);}
  .q.high{color:var(--accent);border-color:var(--accent);}
  .q.medium{color:var(--mint);border-color:var(--mint);}
  .cost{font-variant-numeric:tabular-nums;font-weight:600;}
  .note{color:var(--muted);font-size:13px;}
</style></head>
<body>
  <h1>Grid 1 — model &amp; cost</h1>
  <p class="sub">Same nine moments, same marker prompt &amp; reference doodles. OpenAI list-price estimates (incl. ~$0.03 reference-image input each).</p>
  <div class="grid">${cardHtml}</div>
</body></html>`;

await writeFile('/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/marker_compare.html', html);
console.log('wrote marker_compare.html', (html.length/1024/1024).toFixed(1)+'MB');
