import { readFileSync, writeFileSync } from "node:fs";
import { clean } from "./clean_v2.mjs";

const TL = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";
const TR = "/root/.claude/projects/-home-user/fd404207-1f77-5017-b6fe-be163a414045/tool-results";
const SP = "/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad";

// dump file per month
const DUMP = {
  oct: `${TR}/mcp-814c3433-7ba2-4ad3-bd96-5f084107f36e-notion-fetch-1783463058152.txt`,
  nov: `${TR}/mcp-814c3433-7ba2-4ad3-bd96-5f084107f36e-notion-fetch-1783463256563.txt`,
  dec: `${SP}/dec_dump.txt`,
};

const visLen = (t) => t.replace(/<[^>]+>/g, "").replace(/@@PB@@/g, "").length;
const mk = (type, date, text) => ({ type, date, lines: Math.max(2, Math.round(visLen(text) / 47)), text });

// same backslash-tolerant offset finder used by the September rebuild
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
function findInRaw(u, map, phrase, fromRawIdx) {
  let startU = 0; while (startU < map.length && map[startU] < fromRawIdx) startU++;
  // normalize whitespace in the search: collapse runs so an anchor with single
  // spaces still matches source that has odd spacing/newlines
  const k = u.indexOf(phrase, startU);
  return k === -1 ? -1 : map[k];
}

const warnings = [];
function bandMonth(month, spec) {
  const raw = readFileSync(DUMP[month], "utf8");
  const cs = raw.indexOf("<content>"); const ce = raw.indexOf("</content>");
  const content = raw.slice(cs < 0 ? 0 : cs, ce < 0 ? raw.length : ce);
  const { u, map } = unescapeMap(content);
  // resolve every anchor to a raw offset, in order
  let cursor = 0; const offs = [];
  for (const b of spec) {
    const o = findInRaw(u, map, b.anchor, cursor);
    if (o === -1) { warnings.push(`${month}: anchor NOT FOUND "${b.anchor.slice(0,40)}" (date ${b.date})`); offs.push(cursor); }
    else { offs.push(o); cursor = o + 1; }
  }
  const out = [];
  for (let i = 0; i < spec.length; i++) {
    const a = offs[i];
    const z = i + 1 < spec.length ? offs[i + 1] : content.length;
    if (z <= a) { warnings.push(`${month}: empty/inverted slice at band ${i} (${spec[i].date})`); continue; }
    const text = clean(content.slice(a, z));
    if (visLen(text) >= 3) out.push({ ...mk(spec[i].type, spec[i].date, text), _srcDate: spec[i].date });
    else warnings.push(`${month}: band ${i} (${spec[i].date}) cleaned to <3 chars, skipped`);
  }
  return out;
}

// 1. existing timeline: base = pages <= 336, and the kept Oct 9 band (page 337)
const html = readFileSync(TL, "utf8");
const m = html.match(/const sections=(\[[\s\S]*?\n\]);/);
const existing = (0, eval)(m[1]);
const base = existing.filter((e) => e.page <= 336);
const oldOct9 = existing.find((e) => e.page === 337);
if (!oldOct9) throw new Error("expected existing page 337 (Oct 9) not found");

// 2. band each month from its spec
const specOct = JSON.parse(readFileSync(`${SP}/bands_oct.json`, "utf8"));
const specNov = JSON.parse(readFileSync(`${SP}/bands_nov.json`, "utf8"));
const specDec = JSON.parse(readFileSync(`${SP}/bands_dec.json`, "utf8"));
const octBands = bandMonth("oct", specOct);
const novBands = bandMonth("nov", specNov);
const decBands = bandMonth("dec", specDec);

// 3. split October: Oct 8 bands go BEFORE the kept Oct 9; the rest AFTER it
const oct8 = octBands.filter((b) => /oct\s*8\b/i.test(b._srcDate) || /\b8\b/.test(b._srcDate) && /oct/i.test(b._srcDate));
const octRest = octBands.filter((b) => !oct8.includes(b));

// 4. assemble tail in chronological order, strip helper field, renumber from 337
const tail = [...oct8, { ...oldOct9 }, ...octRest, ...novBands, ...decBands].map((b) => {
  const { _srcDate, ...rest } = b; return rest;
});
let page = 337;
for (const b of tail) b.page = page++;

// 5. serialize + validate + write
const all = base.concat(tail);
const body = all.map((e) => `{page:${e.page},type:"${e.type}",lines:${e.lines},date:${JSON.stringify(e.date)},text:${JSON.stringify(e.text)}}`).join(",\n");
const next = html.replace(m[1], "[\n" + body + "\n]");
const check = (0, eval)(next.match(/const sections=(\[[\s\S]*?\n\]);/)[1]);
if (!Array.isArray(check)) throw new Error("validation failed");
writeFileSync(TL, next);

const bad = check.filter((e) => { const o = (e.text.match(/<(em|strong)>/g)||[]).length, c = (e.text.match(/<\/(em|strong)>/g)||[]).length; return o !== c; });
console.log(`base<=336: ${base.length} | oct: ${octBands.length} (oct8=${oct8.length}) | nov: ${novBands.length} | dec: ${decBands.length}`);
console.log(`TOTAL: ${check.length} bands | pages ${check[0].page}..${check[check.length-1].page}`);
console.log(`checks — stray \\\\: ${check.filter(e=>/\\/.test(e.text)).length} | stray *: ${check.filter(e=>/\*/.test(e.text)).length} | unbalanced tags: ${bad.length}`);
if (warnings.length) { console.log("\nWARNINGS ("+warnings.length+"):"); warnings.forEach((w)=>console.log("  "+w)); }
