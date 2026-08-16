// Merge the sweep agents' found-*.json files into one deduped moments.json.
// Usage: node merge_moments.mjs <scratch-dir> <out.json>
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2];
const out = process.argv[3] ?? 'moments.json';
const files = (await readdir(dir)).filter(f => /^found-\d+\.json$/.test(f)).sort();
let all = [];
for (const f of files) {
  const arr = JSON.parse(await readFile(join(dir, f), 'utf8'));
  all = all.concat(arr.map(m => ({ ...m, src: f })));
}
all.sort((a, b) => (a.idx - b.idx));

// dedupe: same entry idx + quotes overlapping heavily -> keep the better one
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => new Set(norm(s).split(' ').filter(w => w.length > 3));
const overlap = (a, b) => {
  const wa = words(a), wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let n = 0; for (const w of wa) if (wb.has(w)) n++;
  return n / Math.min(wa.size, wb.size);
};
const rank = m => (m.kind === 'coincidence' ? 4 : 0) + ({ high: 3, medium: 2, low: 1 }[m.confidence] || 0);
const kept = [];
for (const m of all) {
  const dup = kept.find(k => k.idx === m.idx && overlap(k.quote, m.quote) > 0.6);
  if (dup) { if (rank(m) > rank(dup)) kept[kept.indexOf(dup)] = m; continue; }
  kept.push(m);
}
// stable ids: jm-<page>-<seq within page>
const perPage = {};
for (const m of kept) {
  perPage[m.page] = (perPage[m.page] || 0) + 1;
  m.id = `jm-${m.page}-${perPage[m.page]}`;
  delete m.src;
}
await writeFile(out, JSON.stringify(kept, null, 1));
const c = kept.filter(m => m.kind === 'coincidence').length;
const p = kept.filter(m => m.picMarker).length;
console.log(`kept ${kept.length} moments (${c} coincidences, ${kept.length - c} moments, ${p} with pic markers) from ${all.length} raw`);
