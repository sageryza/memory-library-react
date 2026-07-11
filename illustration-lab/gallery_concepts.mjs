import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/concept_render`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;
const data = JSON.parse(await readFile(`${SP}/concept_counts.json`, 'utf8'));

const PROMPT = (c) =>
  'A single object drawn as a simple doodle / icon, centered and drawn LARGE so it '
  + 'fills most of the frame — like a quick diagram, NOT a scene, on a plain uncluttered '
  + 'WHITE background like the reference images. Loose, imperfect, hand-drawn with a '
  + 'thin black ballpoint pen, wobbly uneven lines, childlike and minimal, like the '
  + 'reference images. No shading, no solid black fills, no color. NO whole people and '
  + 'NO stick figures — a single body part (like a hand holding something) is fine when '
  + `the idea calls for it. Draw: ${c}. Do NOT write the object's name or any `
  + "caption/title anywhere. Only include words if they are literally part of the idea "
  + "(e.g. a 'CLOSED' sign, a small 'x3'); otherwise no text at all.";

// exactly the app's fast tier: mini, low, 7 refs (from the live folder)
const DIR = '/home/user/memory-library-react/functions/miracle-refs';
const refFiles = (await readdir(DIR)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(DIR, f)) });
console.log('refs:', refFiles.length);

const jobs = [];
for (const m of data) m.concepts.forEach((c, i) => jobs.push({ mid: m.id, idx: i, c }));

async function render(j) {
  const file = `${OUT}/${j.mid}-${j.idx}.webp`;
  try { await readFile(file); return; } catch {}
  for (let a = 1; a <= 4; a++) {
    const form = new FormData();
    form.append('model', 'gpt-image-1-mini');
    form.append('prompt', PROMPT(j.c));
    form.append('size', '1024x1024'); form.append('quality', 'low'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).resize(430, 430, { fit: 'inside' }).webp({ quality: 78 }).toFile(file);
      console.log(`${j.mid}-${j.idx} ok`); return;
    }
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 12000*a)); continue; }
    console.log(`${j.mid}-${j.idx} FAIL ${res.status}`); return;
  }
}
// concurrency 8
let idx = 0;
async function worker() { while (idx < jobs.length) { const j = jobs[idx++]; await render(j); } }
await Promise.all(Array.from({ length: 8 }, worker));

// static gallery, embedded data URIs
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
async function uri(p) { try { const b = await readFile(p); return `data:image/webp;base64,${b.toString('base64')}`; } catch { return null; } }
let cards = '';
for (const m of data) {
  let figs = '';
  for (let i = 0; i < m.concepts.length; i++) {
    const u = await uri(`${OUT}/${m.id}-${i}.webp`);
    figs += `<figure>${u ? `<img src="${u}">` : '<div class="miss">—</div>'}<figcaption>${esc(m.concepts[i])}</figcaption></figure>`;
  }
  cards += `<div class="card"><div class="hd">${m.id} · ${m.concepts.length} concept${m.concepts.length>1?'s':''}</div>
<div class="moment">“${esc(m.moment)}”</div><div class="grid">${figs}</div></div>\n`;
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>What the distiller actually picks — 16 real moments</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:16px 18px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:18px}
.sub{font-size:12px;opacity:.72;margin-top:4px;line-height:1.5}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;margin:14px;padding:14px}
.hd{font-weight:700;font-size:14px;margin-bottom:5px}
.moment{font-size:14px;font-style:italic;color:#463f35;margin-bottom:11px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
figure{margin:0}figure img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:11px;padding-top:5px;opacity:.82;line-height:1.35}
.miss{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;color:#a99}
</style></head><body>
<header><h1>What the real distiller actually picks</h1>
<div class="sub">Your live <b>claude-opus-4-8</b> distiller, current prompt, run on your 16 real moments — then each concept it returned rendered on the app's fast tier (mini · low · 7 references). Average 2.25 concepts per moment. The ‹ › arrows in the app flip between the concepts shown in each row.</div></header>
${cards}</body></html>`;
await writeFile(`${SP}/concepts_gallery.html`, html);
console.log('GALLERY DONE');
