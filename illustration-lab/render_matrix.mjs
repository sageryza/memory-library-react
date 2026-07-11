// Rerun the 16 real-moment prompts across every model×quality combo except the
// two most expensive (gpt-image-2 high, gpt-image-1.5 high). White refs for all.
import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/matrix_render`;
await mkdir(OUT, { recursive: true });
const MOMENTS = JSON.parse(await readFile(`${SP}/moments_data.json`, 'utf8'));
const KEY = process.env.OPENAI_API_KEY;

const COMBOS = [];
for (const q of ['low', 'medium', 'high']) COMBOS.push({ model: 'gpt-image-1-mini', q, tag: `mini-${q}` });
for (const q of ['low', 'medium', 'high']) COMBOS.push({ model: 'gpt-image-1', q, tag: `1-${q}` });
for (const q of ['low', 'medium']) COMBOS.push({ model: 'gpt-image-1.5', q, tag: `1.5-${q}` });
for (const q of ['low', 'medium']) COMBOS.push({ model: 'gpt-image-2', q, tag: `2-${q}` });

const PROMPT = (c) =>
  'A single object drawn as a simple doodle / icon, centered and drawn LARGE so it fills '
  + 'most of the frame — like a quick diagram, NOT a scene, on a plain uncluttered WHITE '
  + 'background like the reference images. Loose, imperfect, hand-drawn with a thin black '
  + 'ballpoint pen, wobbly uneven lines, childlike and minimal, like the reference images. '
  + 'No shading, no solid black fills, no color. NO whole people and NO stick figures — a '
  + `single body part (like a hand holding something) is fine. Draw: ${c}. Do NOT write the `
  + "object's name or any caption anywhere. Only include words if they are literally part of the idea.";

const refFiles = (await readdir(`${SP}/reftest/newrefs`)).filter(f => f.endsWith('.webp')).sort();
const refs = [];
for (const f of refFiles) refs.push({ name: f, buf: await readFile(join(`${SP}/reftest/newrefs`, f)) });

const noFidelity = new Set(); // models that reject input_fidelity
async function renderOne(m, combo) {
  const file = `${OUT}/${m.id}-${combo.tag}.webp`;
  try { await readFile(file); return; } catch { /* render it */ }
  for (let attempt = 1; attempt <= 5; attempt++) {
    const form = new FormData();
    form.append('model', combo.model);
    form.append('prompt', PROMPT(m.concept));
    form.append('size', '1024x1024');
    form.append('quality', combo.q);
    form.append('n', '1');
    if (!noFidelity.has(combo.model)) form.append('input_fidelity', 'high');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
    });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 74 }).toFile(file);
      console.log(`${m.id}-${combo.tag} ok`);
      return;
    }
    const t = await res.text();
    if (t.includes('input_fidelity')) { noFidelity.add(combo.model); console.log(`${combo.model}: dropping input_fidelity`); continue; }
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 25000 * attempt)); continue; }
    console.log(`${m.id}-${combo.tag} HARD FAIL ${res.status}: ${t.slice(0, 100)}`);
    return;
  }
  console.log(`${m.id}-${combo.tag} FAILED (retries)`);
}

const jobs = [];
for (const m of MOMENTS) for (const c of COMBOS) jobs.push([m, c]);
let idx = 0;
async function worker() { while (idx < jobs.length) { const [m, c] = jobs[idx++]; await renderOne(m, c); } }
// Tier 3 allows ~50 images/min — run wide; 429s (if any) just back off and retry.
await Promise.all(Array.from({ length: 35 }, worker));

// Static gallery: one card per moment, 10 labeled renders in a grid.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function uri(p) { try { const b = await sharp(p).resize(300, 300, { fit: 'contain', background: '#fff' }).webp({ quality: 62 }).toBuffer(); return `data:image/webp;base64,${b.toString('base64')}`; } catch { return null; } }
let cards = '';
for (const m of MOMENTS) {
  let figs = '';
  for (const c of COMBOS) {
    const u = await uri(`${OUT}/${m.id}-${c.tag}.webp`);
    figs += `<figure>${u ? `<img src="${u}">` : '<div class="miss">failed</div>'}<figcaption>${c.tag}</figcaption></figure>`;
  }
  cards += `<div class="card"><div class="hd">${m.id} — ${esc(m.slug)}</div>
<div class="concept">${esc(m.concept)}</div><div class="grid5">${figs}</div></div>\n`;
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Model × quality matrix — 16 moments</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:14px 16px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:17px}
.sub{font-size:12px;opacity:.7;margin-top:4px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;margin:12px;padding:12px}
.hd{font-weight:700;font-size:14px;margin-bottom:4px}
.concept{font-size:12px;background:#faf6ee;border:1px solid var(--line);border-radius:6px;padding:6px 8px;margin-bottom:10px}
.grid5{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
figure{margin:0}figure img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:10px;text-align:center;padding-top:2px;opacity:.75}
.miss{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;color:#a99;font-size:11px}
</style></head><body>
<header><h1>Model × quality matrix — your 16 moments</h1>
<div class="sub">Labels: model-tier (mini / 1 / 1.5 / 2 × low / medium / high). Excluded: 2-high and 1.5-high (the two priciest). Same prompts, same white references. Refer to a render as e.g. "M6 · 1.5-low".</div></header>
${cards}</body></html>`;
await writeFile(`${SP}/matrix_gallery.html`, html);
console.log('MATRIX GALLERY DONE');
