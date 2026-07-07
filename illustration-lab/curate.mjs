// From the deduped 'keep' pool, split out near-blank / tiny-fragment junk so the
// LoRA training candidates are only real drawings. Keeps originals untouched
// (copies into train/ vs junk/). Text was already separated by dedup_clean.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const inDir = process.argv[2];
const outDir = process.argv[3];
await mkdir(join(outDir, 'train'), { recursive: true });
await mkdir(join(outDir, 'junk'), { recursive: true });

const files = (await readdir(inDir)).filter(f => /\.(png|webp|jpe?g)$/i.test(f)).sort();
let train = 0, junk = 0;
for (const f of files) {
  const flat = await sharp(join(inDir, f)).flatten({ background: '#ffffff' }).png().toBuffer();
  let t;
  try { t = await sharp(flat).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true }); }
  catch { t = await sharp(flat).toBuffer({ resolveWithObject: true }); }
  const { width: w, height: h } = t.info;
  // ink fraction on the trimmed content
  const { data } = await sharp(t.data).grayscale().resize(96, 96, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }).then(r => ({ data: r.data }));
  let dark = 0; for (let i = 0; i < data.length; i++) if (data[i] < 120) dark++;
  const inkFrac = dark / data.length;
  const tiny = Math.min(w, h) < 40 || (w * h) < 6000;
  const nearBlank = inkFrac < 0.010;                 // faint orange frames, stray marks
  if (tiny || nearBlank) { await copyFile(join(inDir, f), join(outDir, 'junk', f)); junk++; }
  else { await copyFile(join(inDir, f), join(outDir, 'train', f)); train++; }
}
console.log(`keep ${files.length} -> train ${train} | junk(near-blank/tiny) ${junk}`);
