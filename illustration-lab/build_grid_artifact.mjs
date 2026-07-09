import { readFile, writeFile } from 'node:fs/promises';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const LAB = '/home/user/memory-library-react/illustration-lab';

const nine = JSON.parse(await readFile(`${LAB}/grid9.json`, 'utf8'));
const base = (await readFile(`${LAB}/chatgpt_grid_prompt.txt`, 'utf8')).slice(0, undefined).split('For the nine cells')[0].trim();
const b64 = async (p) => 'data:image/webp;base64,' + (await readFile(p)).toString('base64');
const imgB = await b64(`${LAB}/grid_ideas/gridB_i_distill.webp`);
const imgA = await b64(`${LAB}/grid_ideas/gridA_chatgpt_distills.webp`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Version A landed 9 sentences in ~6 panels — note the merges/crops
const aOutcome = [
  'rendered', 'merged with #3 (monkey head on the dog)', 'merged with #2',
  'rendered', 'merged with #6 (shares the sock panel)', 'merged with #5',
  'rendered', 'cropped off the sheet', 'rendered (as the big-head wagon)',
];

const cellsB = nine.map((n, i) => `
  <li>
    <span class="num">${i + 1}</span>
    <div class="cell-body">
      <p class="idea">${esc(n.desc)}</p>
      <p class="src">${esc(n.date)} · ${esc(n.mood)}</p>
      <pre class="prompt">${i + 1}) ${esc(n.desc)}</pre>
    </div>
  </li>`).join('');

const cellsA = nine.map((n, i) => `
  <li>
    <span class="num">${i + 1}</span>
    <div class="cell-body">
      <p class="idea">${esc(n.desc)}</p>
      <p class="src">${esc(n.date)} · <span class="outcome">${esc(aOutcome[i])}</span></p>
      <pre class="prompt">Cell ${i + 1} is based on this line from the user's journal: "${esc(n.quote)}"</pre>
    </div>
  </li>`).join('');

const html = `<article>
<header class="masthead">
  <p class="eyebrow">Illustration Lab · process sheet</p>
  <h1>Grid of Nine</h1>
  <p class="dek">Nine journal moments, run through Sage's original grid prompt two ways — once by handing the model an explicit description of each panel, once by handing it the raw journal sentence and letting it distill. Here's the prompt behind every cell.</p>
</header>

<section class="base">
  <h2>The shared prompt</h2>
  <p class="note">Both sheets use this exact prompt (Sage's original, straight from ChatGPT) plus seven of her reference sketches for style. Only the final “nine cells” instruction changes between versions.</p>
  <pre class="prompt block">${esc(base)}</pre>
</section>

<section class="version winner">
  <div class="v-head">
    <h2>Version B — <em>I distill</em></h2>
    <span class="tag mint">winner · full 3×3</span>
  </div>
  <p class="note">Each cell gets an explicit description of what to draw. Result: all nine read clearly and the sheet stays complete — it even hand-lettered “WISHES.”</p>
  <div class="v-grid">
    <figure class="sheet"><img src="${imgB}" alt="Nine hand-drawn marker sketches in a 3x3 grid"><figcaption>Version B — all nine panels distinct</figcaption></figure>
    <ol class="cells">${cellsB}</ol>
  </div>
</section>

<section class="version">
  <div class="v-head">
    <h2>Version A — <em>ChatGPT distills</em></h2>
    <span class="tag lav">merged to ~6</span>
  </div>
  <p class="note">Each cell just gets the verbatim journal sentence; the model decides what to draw. Charming, but it compressed nine ideas into about six panels — merging two pairs and cropping one off the page.</p>
  <div class="v-grid">
    <figure class="sheet"><img src="${imgA}" alt="Hand-drawn marker sketches, some panels merged"><figcaption>Version A — nine sentences, ~six panels</figcaption></figure>
    <ol class="cells">${cellsA}</ol>
  </div>
</section>

<footer class="foot">
  <p>gpt-image-1 · image-edits endpoint · 7 reference sketches (fish, puzzle, first-aid kit, chess, cereal-scoop, viewer, wagon) · high quality</p>
</footer>
</article>`;

const css = `
:root{
  --paper:#e8e6de; --card:#f5f3ee; --ink:#231f1b; --muted:#6c665d;
  --line:#d3cfc4; --lav:#5f5296; --lav-soft:#efeaf6; --mint:#3f8168; --mint-soft:#e6f0ea;
  --shadow:0 1px 2px rgba(40,34,26,.05),0 6px 18px rgba(40,34,26,.06);
}
@media (prefers-color-scheme:dark){
  :root{--paper:#171614; --card:#211f1c; --ink:#ece8df; --muted:#9a938686; --muted:#a49c8e;
    --line:#332f29; --lav:#b3a4ef; --lav-soft:#251f36; --mint:#8dcbac; --mint-soft:#16261e;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 22px rgba(0,0,0,.35);}
}
:root[data-theme="dark"]{--paper:#171614;--card:#211f1c;--ink:#ece8df;--muted:#a49c8e;--line:#332f29;--lav:#b3a4ef;--lav-soft:#251f36;--mint:#8dcbac;--mint-soft:#16261e;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 22px rgba(0,0,0,.35);}
:root[data-theme="light"]{--paper:#e8e6de;--card:#f5f3ee;--ink:#231f1b;--muted:#6c665d;--line:#d3cfc4;--lav:#5f5296;--lav-soft:#efeaf6;--mint:#3f8168;--mint-soft:#e6f0ea;--shadow:0 1px 2px rgba(40,34,26,.05),0 6px 18px rgba(40,34,26,.06);}

*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
  font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;padding:clamp(18px,4vw,56px);}
article{max-width:1000px;margin:0 auto;}
.masthead{border-bottom:2px solid var(--ink);padding-bottom:22px;margin-bottom:40px;}
.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--lav);margin:0 0 12px;font-weight:600;}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:clamp(38px,7vw,68px);line-height:.98;margin:0;letter-spacing:-.01em;text-wrap:balance;}
.dek{max-width:64ch;color:var(--muted);font-size:clamp(15px,2vw,18px);margin:18px 0 0;}
h2{font-family:Georgia,serif;font-weight:700;font-size:clamp(22px,3vw,30px);margin:0;letter-spacing:-.01em;}
h2 em{font-style:italic;color:var(--lav);}
.note{color:var(--muted);max-width:70ch;margin:8px 0 0;font-size:15px;}
section{margin-bottom:52px;}
.prompt{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;
  background:var(--card);border:1px solid var(--line);border-left:3px solid var(--lav);
  border-radius:6px;padding:14px 16px;margin:14px 0 0;white-space:pre-wrap;overflow-x:auto;color:var(--ink);}
.prompt.block{max-height:none;font-size:12.5px;color:var(--muted);}
.v-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.tag{font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;padding:5px 11px;border-radius:6px;}
.tag.mint{background:var(--mint-soft);color:var(--mint);border:1px solid var(--mint);}
.tag.lav{background:var(--lav-soft);color:var(--lav);border:1px solid var(--lav);}
.v-grid{display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:34px;margin-top:22px;align-items:start;}
@media(max-width:760px){.v-grid{grid-template-columns:1fr;}}
.sheet{margin:0;position:sticky;top:20px;}
@media(max-width:760px){.sheet{position:static;}}
.sheet img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);background:#fff;}
figcaption{font-size:12px;color:var(--muted);margin-top:8px;text-align:center;font-style:italic;}
.cells{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px;counter-reset:none;}
.cells li{display:flex;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:14px 16px;box-shadow:var(--shadow);}
.num{flex:none;width:30px;height:30px;border-radius:50%;background:var(--ink);color:var(--paper);
  font-weight:700;font-size:14px;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
.winner .num{background:var(--mint);color:#fff;}
.cell-body{min-width:0;}
.idea{margin:2px 0 4px;font-weight:600;font-size:15px;line-height:1.4;}
.src{margin:0;font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);}
.outcome{color:var(--lav);text-transform:none;letter-spacing:0;font-weight:600;}
.foot{border-top:1px solid var(--line);padding-top:18px;color:var(--muted);font-size:12.5px;
  font-family:ui-monospace,monospace;}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth;}}
`;

await writeFile(`${SP}/grid_artifact.html`, `<style>${css}</style>\n${html}`);
console.log('wrote grid_artifact.html', (html.length/1024|0)+'KB html', (imgA.length+imgB.length)/1024/1024|0, 'MB images');
