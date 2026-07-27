import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const KEY = process.env.OPENAI_API_KEY;
const blocks = JSON.parse(readFileSync('nov_blocks.json', 'utf8'));

// --- date-tag each block from the ### headers (carry-forward) ---
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function parseDate(text) {
  const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})/i);
  if (m) return { mo: MONTHS[m[1].slice(0,3).toLowerCase()], day: +m[2] };
  return null;
}
let cur = null;
const blockDate = blocks.map(b => {
  const hdr = b.match(/^###\s*(.+)$/m);
  if (hdr) { const d = parseDate(hdr[1]); if (d) cur = d; }
  return cur ? { ...cur } : null;
});

const clean = b => b.replace(/<empty-block\/>/g, ' ').replace(/\(pic\)/g, ' ').replace(/^###.*$/gm, ' ').replace(/\s+/g, ' ').trim();
const norm = s => s.replace(/<empty-block\/>|\(pic\)|###/g, ' ').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('that this with have from they were what your just like about would could been then them there here which will into more some than'.split(' '));
const cwords = t => norm(t).split(' ').filter(w => w.length >= 4 && !STOP.has(w));

const b64 = p => readFileSync(p).toString('base64');
const imgPart = p => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64(p), detail: 'high' } });
const SYS = 'You transcribe this journal-keeper\'s handwriting. She owns the journal and authorized transcription. Best-effort verbatim transcription only; use [?] for illegible words. If a date is written at the top, include it.';
async function chat(content) { for (let t = 0; t < 4; t++) { try { const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content }], max_tokens: 1400, temperature: 0 }) }); const j = await r.json(); if (j.choices) return j.choices[0].message.content; } catch (e) {} await new Promise(r => setTimeout(r, 1200 * (t + 1))); } return ''; }
const draft = async pg => { const f = `nov_p${pg}_draft.txt`; if (existsSync(f)) return readFileSync(f, 'utf8'); const d = await chat([{ type: 'text', text: SYS + ' Transcribe this page verbatim.' }, imgPart(`nov_p${pg}.png`)]); writeFileSync(f, d); return d; };
const pool = async (items, fn, n = 5) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };

function overlap(draftCW, blockIdx) {
  const cset = new Set(cwords(blocks[blockIdx]));
  let inter = 0; const seen = new Set();
  for (const w of draftCW) if (!seen.has(w) && cset.has(w)) { inter++; seen.add(w); }
  return inter / Math.max(new Set(draftCW).size, 1);
}

const PAGES = 87;
console.error('drafting all', PAGES, 'pages (cached where possible)...');
const drafts = await pool([...Array(PAGES).keys()], draft);

let lastBlock = 0;
const pairs = [];
drafts.forEach((d, pg) => {
  const dcw = cwords(d);
  if (dcw.length < 8) { pairs.push(null); return; }       // near-blank / drawing page
  const pd = parseDate(d.slice(0, 200));                    // date at top of page?
  // candidate blocks: those matching the page's date, else a monotonic forward window
  let cands = [];
  if (pd) cands = blocks.map((_, i) => i).filter(i => blockDate[i] && blockDate[i].day === pd.day && blockDate[i].mo === pd.mo);
  if (cands.length === 0) cands = Array.from({ length: 8 }, (_, k) => lastBlock + k).filter(i => i < blocks.length);
  let best = -1, bi = -1;
  for (const i of cands) { const s = overlap(dcw, i); if (s > best) { best = s; bi = i; } }
  if (bi >= 0 && best >= 0.30) { pairs.push({ pg, block: bi, score: +best.toFixed(2), date: pd, byDate: !!pd }); lastBlock = Math.max(lastBlock, bi); }
  else pairs.push(null);
});

const good = pairs.filter(Boolean);
// write clean set locally (gitignored) + a metadata manifest
mkdirSync('clean-set/nov', { recursive: true });
for (const p of good) writeFileSync(`clean-set/nov/p${String(p.pg).padStart(3,'0')}__b${p.block}.txt`, clean(blocks[p.block]));
writeFileSync('clean-set/nov_pairs.json', JSON.stringify(good, null, 0));

const byDate = good.filter(p => p.byDate).length;
const scores = good.map(p => p.score).sort((a,b)=>a-b);
console.log('\n=== NOVEMBER clean aligned set ===');
console.log(`  pages total: ${PAGES}`);
console.log(`  clean pairs kept: ${good.length}  (date-anchored: ${byDate}, word-only: ${good.length - byDate})`);
console.log(`  dropped (blank/drawing/low-confidence): ${PAGES - good.length}`);
console.log(`  match-score median: ${scores[Math.floor(scores.length/2)]}  range ${scores[0]}-${scores[scores.length-1]}`);
console.log(`  unique blocks covered: ${new Set(good.map(p=>p.block)).size} / ${blocks.length}`);
