import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/journal_render2`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (c) =>
  'A single object drawn as a simple doodle / icon, centered and drawn LARGE so it '
  + 'fills most of the frame — like a quick diagram, NOT a scene, on a plain uncluttered '
  + 'WHITE background like the reference images. Loose, imperfect, hand-drawn with a '
  + 'thin black ballpoint pen, wobbly uneven lines, childlike and minimal, like the '
  + 'reference images. STRICTLY black pen line only — absolutely NO color anywhere, not '
  + 'even a single spot; no shading, no solid black fills. NO whole people and NO stick '
  + `figures — a single body part (like a hand) is fine when the idea calls for it. Draw: ${c}. `
  + "Do NOT write the object's name or any caption anywhere. Only include words if they are "
  + "literally part of the idea; otherwise no text at all.";

const M = [
  { id:'teacup', t:'the one-line teacup', q:'to be the good strong teacup — one single line — not sketching',
    c:'a plain teacup drawn in one single continuous unbroken pen line' },
  { id:'feather', t:'shrinking handwriting', q:'scared of how small my handwriting is getting → feather voice',
    c:'a line of handwriting scribble that shrinks smaller and smaller left to right until it trails off into a tiny feather' },
  { id:'heart-hand', t:'the almost-valentine', q:'a heart in a hand that says: my love is still with you',
    c:'an open cupped hand holding up a single small heart' },
  { id:'pb-cookie', t:'peanut butter cookie', q:'a peanut butter cookie… he bit right into the middle where the peanut butter was',
    c:'a round cookie broken into two halves with a single bite taken out of the middle' },
  { id:'storm-drain', t:'wide wheels, lucky', q:'cars going over storm drains — a lucky coincidence their wheels are so wide… people’s feet falling in',
    c:'a wide car tire rolling safely over a storm-drain grate while a thin bicycle wheel beside it drops into the slot' },
  { id:'heater', t:'the AI toaster-heater', q:'a toaster-looking heater programmed with AI… thinking it may have been programmed wrong because it shouldn’t get this hot',
    c:'a boxy toaster-shaped space heater with a small worried face, giving off many wavy heat lines' },
  { id:'pants', t:'both fit the pants', q:'We wore the same pants and daddy was amazed that we could both fit them',
    c:'one single pair of wide pants with two separate pairs of legs coming out of the bottom' },
  { id:'white-light', t:'sun + rain = white', q:'the light is all white… a compromise between the yellow sunlight and the gray of the rain water',
    c:'a sun and a rain cloud overlapping, with a plain empty white circle where they meet' },
  { id:'pinecone', t:'pinecone cookies', q:'cookies first extruded in the shape of a loose pine cone, then each petal cut off to make normal cookies',
    c:'a pinecone on the left with its scales being trimmed off, becoming a round smooth cookie on the right, a small arrow between' },
  { id:'jellybeans', t:'jelly beans by color', q:'transfixed with all the colors… organize all of them by color, match them to the flavors',
    c:'a tipped-over jar with jelly beans spilling out and sorting themselves into neat little same-group clusters' },
  { id:'stuck-pages', t:'stuck pages', q:'two pages of a book stuck together, to pull one off is to take some of each page with it',
    c:'two book pages being peeled apart, torn fibers stringing between them where they stick' },
  { id:'plant-coin', t:'plants stealing coins', q:'plants stealing coins in the middle of the night, then back to their pots, pretending nothing happened',
    c:'a potted houseplant tiptoeing on little feet, a shiny coin tucked behind one of its leaves' },
  { id:'self-ring', t:'married to myself', q:'Are you married? … Yes, to myself',
    c:'a single hand slipping a ring onto one of its own fingers' },
];

const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });

async function render(m) {
  const file = `${OUT}/${m.id}.webp`;
  try { await readFile(file); return; } catch {}
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-1-mini');
    form.append('prompt', PROMPT(m.c));
    form.append('size', '1024x1024'); form.append('quality', 'low'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 78 }).toFile(file);
      console.log(m.id, 'ok'); return;
    }
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 12000*a)); continue; }
    console.log(m.id, 'FAIL', res.status); return;
  }
}
let idx = 0;
async function worker(){ while (idx < M.length) { await render(M[idx++]); } }
await Promise.all(Array.from({ length: 6 }, worker));

const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
async function uri(p){ try { const b = await readFile(p); return `data:image/webp;base64,${b.toString('base64')}`; } catch { return null; } }
let cards = '';
for (const m of M) {
  const u = await uri(`${OUT}/${m.id}.webp`);
  cards += `<div class="card">${u?`<img src="${u}">`:'<div class="miss">—</div>'}
<div class="t">${esc(m.t)}</div><div class="q">"${esc(m.q)}"</div><div class="c">${esc(m.c)}</div></div>\n`;
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>13 more journal moments</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:14px 16px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:16px}.sub{font-size:12px;opacity:.72;margin-top:3px}
.wrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:11px;padding:12px}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:9px}
.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
.t{font-weight:700;font-size:13px;margin-top:6px}.q{font-size:11px;font-style:italic;color:#5b5347;margin-top:3px;line-height:1.35}
.c{font-size:10px;opacity:.62;margin-top:4px;line-height:1.3}
.miss{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;color:#a99}
</style></head><body>
<header><h1>13 more moments from your February</h1>
<div class="sub">Unmarked moments, distilled and rendered on the fast tier (mini · low · 7 refs), strict black pen. Each shows the real quote and the concept I drew.</div></header>
<div class="wrap">${cards}</div></body></html>`;
await writeFile(`${SP}/journal_batch2_gallery.html`, html);
console.log('GALLERY DONE');
