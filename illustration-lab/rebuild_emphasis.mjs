import { readFileSync, writeFileSync } from "node:fs";
import { clean } from "./clean_v2.mjs";

const TL = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";
const TR = "/root/.claude/projects/-home-user/fd404207-1f77-5017-b6fe-be163a414045/tool-results";
const D = {
  MAR: `${TR}/mcp-814c3433-7ba2-4ad3-bd96-5f084107f36e-notion-fetch-1783404074003.txt`,
  APR: `${TR}/mcp-814c3433-7ba2-4ad3-bd96-5f084107f36e-notion-fetch-1783404537826.txt`,
  JUN: `${TR}/mcp-814c3433-7ba2-4ad3-bd96-5f084107f36e-notion-fetch-1783404901531.txt`,
  SEP: `${TR}/mcp-814c3433-7ba2-4ad3-bd96-5f084107f36e-notion-fetch-1783405031088.txt`,
};
const srcCache = {};
const src = (d) => (srcCache[d] ||= readFileSync(D[d], "utf8"));

// replay list: ranges specs and split specs, in page order, with their dump + startPage
const SPECS = [
  ["ranges","ranges_mar1_3.json","MAR"], ["ranges","ranges_mar4_7.json","MAR"],
  ["ranges","ranges_mar9_14.json","MAR"], ["ranges","ranges_mar17_21.json","MAR"],
  ["ranges","r_apr3_6.json","APR"], ["ranges","r_apr7_11.json","APR"], ["ranges","r_apr12.json","APR"],
  ["ranges","r_apr13_18.json","APR"], ["ranges","r_apr19_may.json","APR"],
  ["ranges","r_june.json","JUN"],
  ["ranges","s_sep_intro.json","SEP"], ["split","s_sep7.json","SEP",225], ["ranges","s_sep9.json","SEP"],
  ["split","s_sep10.json","SEP",238], ["split","s_sep11.json","SEP",245], ["split","s_sep12_14.json","SEP",250],
  ["split","s_sep15.json","SEP",258], ["split","s_sep24.json","SEP",273], ["split","s_sep25.json","SEP",279],
  ["ranges","s_sep26a.json","SEP"], ["split","s_sep26b.json","SEP",287], ["split","s_sep27.json","SEP",289],
  ["split","s_sep28_29.json","SEP",293], ["split","s_sep30.json","SEP",299],
  ["split","s_oct1.json","SEP",307], ["split","s_oct2.json","SEP",314], ["split","s_oct3.json","SEP",319],
  ["split","s_oct4a.json","SEP",326], ["split","s_oct4b.json","SEP",328], ["split","s_oct5_9.json","SEP",334],
];

const visLen = (t) => t.replace(/<[^>]+>/g, "").replace(/@@PB@@/g, "").length;
const mk = (page, type, date, text) => ({ page, type, date, lines: Math.max(2, Math.round(visLen(text) / 47)), text });

const warnings = [];
// find a phrase in raw by searching an unescaped copy (so \[ matches [, etc.),
// mapping the hit back to a real raw offset.
function unescapeMap(raw) {
  let u = ""; const map = []; let i = 0;
  while (i < raw.length) {
    if (raw[i] === "\\" && raw[i + 1] === "n") { u += "\n"; map.push(i); i += 2; continue; }
    if (raw[i] === "\\" && raw[i + 1] === "t") { u += "  "; map.push(i, i); i += 2; continue; }
    if (raw[i] === "\\") { i++; continue; }   // drop any other backslash (\\ , \[ , \" , \~ …)
    u += raw[i]; map.push(i); i++;
  }
  return { u, map };
}
function findInRaw(raw, phrase, fromRawIdx) {
  const { u, map } = unescapeMap(raw);
  let startU = 0; while (startU < map.length && map[startU] < fromRawIdx) startU++;
  const k = u.indexOf(phrase, startU);
  return k === -1 ? -1 : map[k];
}
function doRanges(file, dump) {
  const ranges = JSON.parse(readFileSync(file, "utf8"));
  return ranges.map((r) => mk(r.page, r.type, r.date, clean(src(dump).slice(r.start, r.end))));
}
function doSplit(file, dump, startPage) {
  const spec = JSON.parse(readFileSync(file, "utf8"));
  let page = startPage;
  const out = [];
  for (const sec of spec) {
    const raw = src(dump).slice(sec.start, sec.end);
    let idx = 0;
    sec.parts.forEach((part, i) => {
      let j;
      if (part.until == null) j = raw.length;
      else { j = findInRaw(raw, part.until, idx); if (j === -1) { warnings.push(`${file} p${page} phrase not found: "${part.until.slice(0,30)}"`); j = raw.length; } }
      const text = clean(raw.slice(idx, j));
      idx = j;
      if (visLen(text) >= 3) out.push(mk(page++, part.type, part.date || sec.date, text));
    });
    if (idx < raw.length - 3) { const tail = clean(raw.slice(idx)); if (visLen(tail) >= 3) out.push(mk(page++, sec.parts[sec.parts.length-1].type, sec.date, tail)); }
  }
  return out;
}

// 1. keep the existing timeline's pages <= 74 as the base
const html = readFileSync(TL, "utf8");
const m = html.match(/const sections=(\[[\s\S]*?\n\]);/);
const existing = (0, eval)(m[1]);
const base = existing.filter((e) => e.page <= 74);
console.log("base (pages <=74):", base.length, "bands");

// 2. replay all specs with the emphasis cleaner
let rebuilt = [];
for (const [kind, file, dump, sp] of SPECS) {
  const got = kind === "ranges" ? doRanges(file, dump) : doSplit(file, dump, sp);
  rebuilt = rebuilt.concat(got);
}
console.log("rebuilt (pages 75-337):", rebuilt.length, "bands");
console.log("page range:", rebuilt[0]?.page, "->", rebuilt[rebuilt.length-1]?.page);

// 3. combine, serialize, validate, write
const all = base.concat(rebuilt);
const body = all.map((e) => `{page:${e.page},type:"${e.type}",lines:${e.lines},date:${JSON.stringify(e.date)},text:${JSON.stringify(e.text)}}`).join(",\n");
const next = html.replace(m[1], "[\n" + body + "\n]");
const check = (0, eval)(next.match(/const sections=(\[[\s\S]*?\n\]);/)[1]);
if (!Array.isArray(check)) throw new Error("validation failed");
const emCount = check.filter((e) => /<(em|strong)>/.test(e.text)).length;
const pbCount = check.filter((e) => /@@PB@@/.test(e.text)).length;
writeFileSync(TL, next);
console.log("TOTAL:", check.length, "bands | with emphasis:", emCount, "| with page-breaks:", pbCount);
if (warnings.length) { console.log("\nWARNINGS:"); warnings.forEach((w) => console.log("  " + w)); }
