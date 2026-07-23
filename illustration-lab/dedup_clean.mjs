// Dedup + clean a folder of extracted drawing layers.
//   node dedup_clean.mjs <inDir> <outDir>
// - trims each layer to its ink bounding box (kills crop/whitespace differences)
// - classifies: solid fill (orange rect / gray square), blank, likely-text, drawing
// - dHash + Hamming clustering to group near-duplicates (different crops -> same cluster)
// - keeps one representative (most ink detail) per cluster; sets the rest aside
// - writes contact sheets so nothing is silently dropped
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const inDir = process.argv[2];
const outDir = process.argv[3] || join(inDir, '_cleaned');
if (!inDir) { console.error('usage: node dedup_clean.mjs <inDir> <outDir>'); process.exit(1); }

const HASH = 16;            // dHash grid -> HASH*HASH bits
const DUP_DIST = 24;        // <= this Hamming distance = same drawing
const files = (await readdir(inDir)).filter(f => /\.(png|webp|jpe?g)$/i.test(f)).sort();

function ham(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }

async function analyze(path) {
  // Flatten onto white, then trim near-uniform border to the ink bbox.
  const flat = sharp(await sharp(path).flatten({ background: '#ffffff' }).png().toBuffer());
  let trimmed, info;
  try {
    const t = await flat.clone().trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    trimmed = t.data; info = t.info;
  } catch { const t = await flat.clone().toBuffer({ resolveWithObject: true }); trimmed = t.data; info = t.info; }

  const w = info.width, h = info.height;
  const blank = w <= 3 || h <= 3;

  // Stats on the trimmed content: ink fraction (dark px), saturation, mid-gray fill.
  const { data } = await sharp(trimmed).resize(64, 64, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }).then(r => ({ data: r.data }));
  let dark = 0, sat = 0, midfill = 0, n = 64 * 64;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    const s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255) || 1);
    if (l < 110) dark++;                         // ink
    if (s > 0.35 && l > 60 && l < 230) sat++;    // colored fill (orange etc.)
    if (Math.abs(l - 128) < 55 && s < 0.18) midfill++; // flat gray
  }
  const inkFrac = dark / n, satFrac = sat / n, grayFrac = midfill / n;
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));

  let kind = 'drawing';
  if (blank) kind = 'blank';
  else if (satFrac > 0.30) kind = 'solid';                 // orange rectangle
  else if (grayFrac > 0.45 && inkFrac > 0.4) kind = 'solid'; // gray square
  else if (aspect > 3.2 && inkFrac < 0.30) kind = 'text';   // wide thin ink band

  // dHash on trimmed grayscale.
  const g = await sharp(trimmed).grayscale().resize(HASH + 1, HASH, { fit: 'fill' }).raw().toBuffer();
  const bits = [];
  for (let y = 0; y < HASH; y++) for (let x = 0; x < HASH; x++) {
    const idx = y * (HASH + 1) + x;
    bits.push(g[idx] < g[idx + 1] ? 1 : 0);
  }
  return { file: basename(path), w, h, inkFrac, kind, bits, detail: inkFrac * w * h };
}

const items = [];
for (const f of files) { try { items.push(await analyze(join(inDir, f))); } catch (e) { console.error('skip', f, e.message); } }

// Cluster drawings by Hamming distance (single-linkage).
const drawings = items.filter(i => i.kind === 'drawing');
const parent = drawings.map((_, i) => i);
const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
for (let i = 0; i < drawings.length; i++)
  for (let j = i + 1; j < drawings.length; j++)
    if (ham(drawings[i].bits, drawings[j].bits) <= DUP_DIST) parent[find(i)] = find(j);

const clusters = new Map();
drawings.forEach((d, i) => { const r = find(i); (clusters.get(r) || clusters.set(r, []).get(r)).push(d); });

// Keep the most-detailed representative per cluster.
const keep = [], dupes = [];
for (const grp of clusters.values()) {
  grp.sort((a, b) => b.detail - a.detail);
  keep.push(grp[0]); dupes.push(...grp.slice(1));
}

await mkdir(join(outDir, 'keep'), { recursive: true });
await mkdir(join(outDir, 'dupes'), { recursive: true });
await mkdir(join(outDir, 'text'), { recursive: true });
await mkdir(join(outDir, 'solid'), { recursive: true });
for (const k of keep) await copyFile(join(inDir, k.file), join(outDir, 'keep', k.file));
for (const d of dupes) await copyFile(join(inDir, d.file), join(outDir, 'dupes', d.file));
for (const t of items.filter(i => i.kind === 'text')) await copyFile(join(inDir, t.file), join(outDir, 'text', t.file));
for (const s of items.filter(i => i.kind === 'solid' || i.kind === 'blank')) await copyFile(join(inDir, s.file), join(outDir, 'solid', s.file));

// Contact sheet grouped by cluster (dupes sit next to their keeper).
async function sheet(groups, path, cols = 8, cell = 150) {
  const rows = groups.reduce((a, g) => a + Math.ceil(g.length / cols), 0) || 1;
  const W = cols * cell, H = rows * cell;
  const comp = []; let row = 0;
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) {
      const col = i % cols; if (i && col === 0) row++;
      const th = await sharp(join(inDir, g[i].file)).flatten({ background: '#fff' })
        .resize(cell - 10, cell - 10, { fit: 'contain', background: '#fff' }).extend({ top: 5, bottom: 5, left: 5, right: 5, background: g === g && i === 0 ? '#2a7' : '#ddd' }).png().toBuffer();
      comp.push({ input: th, left: col * cell, top: row * cell });
    }
    row++;
  }
  await sharp({ create: { width: W, height: Math.max(H, cell), channels: 3, background: '#fff' } }).composite(comp).png().toFile(path);
}
const multi = [...clusters.values()].filter(g => g.length > 1);
await sheet([...clusters.values()], join(outDir, '_all_clusters.png'));
if (multi.length) await sheet(multi, join(outDir, '_duplicates_only.png'));

await writeFile(join(outDir, '_report.json'), JSON.stringify({
  total: items.length, drawings: drawings.length, uniqueDrawings: keep.length,
  duplicatesRemoved: dupes.length, textLayers: items.filter(i => i.kind === 'text').length,
  solidOrBlank: items.filter(i => i.kind === 'solid' || i.kind === 'blank').length,
  dupClusters: multi.map(g => g.map(d => d.file)),
}, null, 2));

console.log(`layers ${items.length} | drawings ${drawings.length} -> unique ${keep.length} (removed ${dupes.length} dupes) | text ${items.filter(i=>i.kind==='text').length} | solid/blank ${items.filter(i=>i.kind==='solid'||i.kind==='blank').length}`);
console.log('clusters with dupes:', multi.length);
