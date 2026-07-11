import { readFileSync } from "node:fs";
// node map_chunks.mjs <src> <start> <end>
// Prints each page-break-delimited segment's [start,end) + opening words + length,
// so bands can be typed without loading full text.
const src = readFileSync(process.argv[2], "utf8");
const A = +process.argv[3], B = +process.argv[4];
const seg = src.slice(A, B);
const marks = [];
const re = /\\n---\\n|###\s+[^\\]+/g;
let m;
while ((m = re.exec(seg))) marks.push(m.index);
const bounds = [0, ...marks, seg.length].filter((v, i, a) => a.indexOf(v) === i).sort((x, y) => x - y);
for (let i = 0; i < bounds.length - 1; i++) {
  const s = bounds[i], e = bounds[i + 1];
  let txt = seg.slice(s, e).replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/<empty-block\/>/g, "").replace(/\s+/g, " ").trim();
  if (!txt) continue;
  console.log(`[${A + s},${A + e}) len${e - s}  ${txt.slice(0, 105)}`);
}
