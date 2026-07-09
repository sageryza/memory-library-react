// Append one journal page's bands to the timeline.
// Usage: node apply_generic.mjs <dumpPath> <specPath> <label>
import { readFileSync, writeFileSync } from "node:fs";
import { clean } from "./clean_v2.mjs";
const TL = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";
const [,, dumpPath, specPath, label] = process.argv;

const visLen = (t) => t.replace(/<[^>]+>/g, "").replace(/@@PB@@/g, "").length;
const mk = (page, type, date, text) => ({ page, type, date, lines: Math.max(2, Math.round(visLen(text) / 47)), text });
function unescapeMap(raw) {
  let u = ""; const map = []; let i = 0;
  while (i < raw.length) {
    if (raw[i] === "\\" && raw[i + 1] === "n") { u += "\n"; map.push(i); i += 2; continue; }
    if (raw[i] === "\\" && raw[i + 1] === "t") { u += "  "; map.push(i, i); i += 2; continue; }
    if (raw[i] === "\\") { i++; continue; }
    u += raw[i]; map.push(i); i++;
  }
  map.push(raw.length);
  return { u, map };
}

const raw = readFileSync(dumpPath, "utf8");
const cs = raw.indexOf("<content>"); const ce = raw.indexOf("</content>");
const content = raw.slice(cs < 0 ? 0 : cs, ce < 0 ? raw.length : ce);
const { u, map } = unescapeMap(content);
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const warnings = [];
let cursor = 0; const uIdx = [];
for (const b of spec) {
  let s = 0; while (s < map.length && map[s] < cursor) s++;
  const k = u.indexOf(b.anchor, s);
  if (k === -1) { warnings.push(`anchor NOT FOUND "${b.anchor.slice(0,38)}" (${b.date})`); uIdx.push(cursor === 0 ? 0 : cursor); }
  else { uIdx.push(k); cursor = map[k] + 1; }
}

const html = readFileSync(TL, "utf8");
const m = html.match(/const sections=(\[[\s\S]*?\n\]);/);
const existing = (0, eval)(m[1]);
let page = Math.max(...existing.map((e) => e.page)) + 1;

const bands = [];
for (let i = 0; i < spec.length; i++) {
  const aU = uIdx[i], zU = i + 1 < spec.length ? uIdx[i + 1] : u.length;
  const a = map[aU], z = map[zU];
  if (z <= a) { warnings.push(`empty slice ${i} (${spec[i].date})`); continue; }
  const text = clean(content.slice(a, z));
  if (visLen(text) < 3) { warnings.push(`band ${i} (${spec[i].date}) <3 chars`); continue; }
  bands.push(mk(page++, spec[i].type, spec[i].date, text));
}

const all = existing.concat(bands);
const body = all.map((e) => `{page:${e.page},type:"${e.type}",lines:${e.lines},date:${JSON.stringify(e.date)},text:${JSON.stringify(e.text)}}`).join(",\n");
const next = html.replace(m[1], "[\n" + body + "\n]");
const check = (0, eval)(next.match(/const sections=(\[[\s\S]*?\n\]);/)[1]);
if (!Array.isArray(check)) throw new Error("validation failed");
const badTags = bands.filter((e) => { const o=(e.text.match(/<(em|strong)>/g)||[]).length,c=(e.text.match(/<\/(em|strong)>/g)||[]).length; return o!==c; });
const stray = bands.filter(e=>/\\/.test(e.text)||/\*/.test(e.text)||/\{[a-z]+=/i.test(e.text));
if (badTags.length || stray.length) { console.log(`WARN cleanliness — badTags:${badTags.length} stray:${stray.length}`); }
writeFileSync(TL, next);
console.log(`[${label}] +${bands.length} bands (pages ${bands[0]?.page}..${bands[bands.length-1]?.page}) | total now ${check.length} | emphasis+${bands.filter(b=>/<(em|strong)>/.test(b.text)).length} | anchors-missed ${warnings.filter(w=>w.includes("NOT FOUND")).length}`);
if (warnings.length) warnings.slice(0,6).forEach(w=>console.log("  ! "+w));
