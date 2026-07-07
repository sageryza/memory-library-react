// Render every real moment two ways and build the static gallery:
//   A = gpt-image-1 with CLEAN WHITE reference doodles (no gray paper)
//   B = the trained LoRA (sageryza/sage-diagram-lbl)
import { createRequire } from 'module';
const require = createRequire('/home/user/memory-library-react/functions/');
const sharp = require('sharp');
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/moments_render`;
await mkdir(OUT, { recursive: true });
const MOMENTS = JSON.parse(await readFile(`${SP}/moments_data.json`, 'utf8'));
const OKEY = process.env.OPENAI_API_KEY;
const RKEY = process.env.REPLICATE_API_TOKEN;

const GPT_PROMPT = (c) =>
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

async function gptOne(m) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', GPT_PROMPT(m.concept));
    form.append('size', '1024x1024'); form.append('quality', 'medium');
    form.append('input_fidelity', 'high'); form.append('n', '1');
    for (const r of refs) form.append('image[]', new Blob([r.buf], { type: 'image/webp' }), r.name);
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${OKEY}` }, body: form,
    });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 80 }).toFile(`${OUT}/${m.id}-A.webp`);
      console.log(`${m.id}-A ok`);
      return;
    }
    const t = await res.text();
    console.log(`${m.id}-A attempt ${attempt}: ${res.status}`);
    if (res.status !== 429 && attempt >= 2) { console.log(t.slice(0, 120)); break; }
    await new Promise(r => setTimeout(r, 20000 * attempt));
  }
  console.log(`${m.id}-A FAILED`);
}

let loraVer = null;
async function loraOne(m) {
  if (!loraVer) {
    const r = await fetch('https://api.replicate.com/v1/models/sageryza/sage-diagram-lbl', { headers: { Authorization: `Bearer ${RKEY}` } });
    loraVer = (await r.json()).latest_version.id;
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST', headers: { Authorization: `Bearer ${RKEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: loraVer, input: {
        prompt: `SAGEDIAGRAM, ${m.concept}, a simple hand-drawn doodle drawn large, thin black pen line on a plain white background, minimal, no color`,
        num_outputs: 1, output_format: 'webp', go_fast: false } }),
    });
    const j = await res.json();
    if (!j.id) { await new Promise(r => setTimeout(r, 15000 * attempt)); continue; }
    for (let i = 0; i < 50; i++) {
      const p = await (await fetch(`https://api.replicate.com/v1/predictions/${j.id}`, { headers: { Authorization: `Bearer ${RKEY}` } })).json();
      if (p.status === 'succeeded') {
        const url = Array.isArray(p.output) ? p.output[0] : p.output;
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        await sharp(buf).webp({ quality: 80 }).toFile(`${OUT}/${m.id}-B.webp`);
        console.log(`${m.id}-B ok`);
        return;
      }
      if (p.status === 'failed') break;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  console.log(`${m.id}-B FAILED`);
}

// Run: OpenAI with 2 workers, LoRA sequentially, in parallel overall.
const gptQueue = [...MOMENTS];
async function gptWorker() { while (gptQueue.length) await gptOne(gptQueue.shift()); }
const loraRun = (async () => { for (const m of MOMENTS) await loraOne(m); })();
await Promise.all([gptWorker(), gptWorker(), loraRun]);

// Static, no-JS gallery.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function uri(p) { try { const b = await sharp(p).resize(430, 430, { fit: 'contain', background: '#fff' }).webp({ quality: 70 }).toBuffer(); return `data:image/webp;base64,${b.toString('base64')}`; } catch { return null; } }
let cards = '';
for (const m of MOMENTS) {
  const a = await uri(`${OUT}/${m.id}-A.webp`), b = await uri(`${OUT}/${m.id}-B.webp`);
  cards += `<div class="card"><div class="hd">${m.id} — ${esc(m.slug)}</div>
<div class="moment">“${esc(m.moment)}”</div>
<div class="concept"><b>Claude's distillation:</b> ${esc(m.concept)}</div>
<div class="pair">
<figure>${a ? `<img src="${a}">` : '<div class="miss">render failed</div>'}<figcaption>${m.id}-A · ChatGPT (white refs)</figcaption></figure>
<figure>${b ? `<img src="${b}">` : '<div class="miss">render failed</div>'}<figcaption>${m.id}-B · your LoRA</figcaption></figure>
</div></div>\n`;
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Miracle moments — distillations & renders</title><style>
:root{--bg:#f4efe6;--ink:#2e2a24;--line:#d8cfbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:16px 18px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:18px}
.sub{font-size:12px;opacity:.7;margin-top:4px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;margin:14px;padding:14px}
.hd{font-weight:700;font-size:15px;margin-bottom:6px}
.moment{font-size:14px;font-style:italic;color:#463f35;margin-bottom:6px}
.concept{font-size:13px;background:#faf6ee;border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:10px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
figure{margin:0}figure img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:11px;text-align:center;padding-top:4px;opacity:.75}
.miss{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;color:#a99;font-size:12px}
</style></head><body>
<header><h1>Your real moments — M1 to M16</h1>
<div class="sub">Each card: your exact words → Claude's distillation → render A (ChatGPT with your clean white-background drawings as references) and render B (your trained LoRA). Refer to any image as e.g. “M6-A”.</div></header>
${cards}</body></html>`;
await writeFile(`${SP}/moments_gallery.html`, html);
console.log('GALLERY DONE');
