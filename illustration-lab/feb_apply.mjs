import { readFileSync, writeFileSync } from "node:fs";
import { clean } from "./clean_v2.mjs";

const TL = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";
const TR = "/root/.claude/projects/-home-user/fd404207-1f77-5017-b6fe-be163a414045/tool-results";
const SP = "/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad";
const DUMP = `${TR}/mcp-814c3433-7ba2-4ad3-bd96-5f084107f36e-notion-fetch-1783466838840.txt`;
const FEB_BASE_PAGE = 6; // February 1st lands on physical page 6 (pages 2–5 are the pre-Feb Jan lead-in)

const visLen = (t) => t.replace(/<[^>]+>/g, "").replace(/@@PB@@/g, "").length;
const mk = (page, type, date, text) => ({ page, type, date, lines: Math.max(2, Math.round(visLen(text) / 47)), text });

// unescape + offset map (same as the month applier), plus we work in unescaped
// coordinates so we can count `---` page-break lines before each band.
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

const warnings = [];
const raw = readFileSync(DUMP, "utf8");
const cs = raw.indexOf("<content>"); const ce = raw.indexOf("</content>");
const content = raw.slice(cs < 0 ? 0 : cs, ce < 0 ? raw.length : ce);
const { u, map } = unescapeMap(content);
// positions (in u) of every `---` page-break line
const breakPos = [];
{ const re = /(^|\n)---(?=\n|$)/g; let m; while ((m = re.exec(u))) breakPos.push(m.index); }
const pageAt = (uIdx) => FEB_BASE_PAGE + breakPos.filter((p) => p < uIdx).length;

const spec = JSON.parse(readFileSync(`${SP}/bands_feb.json`, "utf8"));
// resolve anchors -> u index, in order
let cursor = 0; const uIdx = [];
for (const b of spec) {
  let s = 0; while (s < map.length && map[s] < cursor) s++;
  const k = u.indexOf(b.anchor, s);
  if (k === -1) { warnings.push(`anchor NOT FOUND "${b.anchor.slice(0,40)}" (${b.date})`); uIdx.push(cursor); }
  else { uIdx.push(k); cursor = map[k] + 1; }
}
// build bands: slice raw between consecutive anchors (map u index -> raw offset)
const febBands = [];
for (let i = 0; i < spec.length; i++) {
  const aU = uIdx[i], zU = i + 1 < spec.length ? uIdx[i + 1] : u.length;
  const aRaw = map[aU], zRaw = map[zU];
  if (zRaw <= aRaw) { warnings.push(`empty slice band ${i} (${spec[i].date})`); continue; }
  const text = clean(content.slice(aRaw, zRaw));
  if (visLen(text) < 3) { warnings.push(`band ${i} (${spec[i].date}) <3 chars, skipped`); continue; }
  febBands.push(mk(pageAt(aU), spec[i].type, spec[i].date, text));
}

// splice: keep existing pages <=5 (Jan lead-in) and >=75 (Mar–Dec), replace 6..74
const html = readFileSync(TL, "utf8");
const m = html.match(/const sections=(\[[\s\S]*?\n\]);/);
const existing = (0, eval)(m[1]);
const head = existing.filter((e) => e.page <= 5);
const tailMar = existing.filter((e) => e.page >= 75);
const all = head.concat(febBands, tailMar);

const body = all.map((e) => `{page:${e.page},type:"${e.type}",lines:${e.lines},date:${JSON.stringify(e.date)},text:${JSON.stringify(e.text)}}`).join(",\n");
const next = html.replace(m[1], "[\n" + body + "\n]");
const check = (0, eval)(next.match(/const sections=(\[[\s\S]*?\n\]);/)[1]);
if (!Array.isArray(check)) throw new Error("validation failed");
writeFileSync(TL, next);

const febMax = Math.max(...febBands.map((b) => b.page));
const bad = check.filter((e) => { const o=(e.text.match(/<(em|strong)>/g)||[]).length,c=(e.text.match(/<\/(em|strong)>/g)||[]).length; return o!==c; });
console.log(`head<=5: ${head.length} | feb: ${febBands.length} (pages ${FEB_BASE_PAGE}..${febMax}, ${breakPos.length} page-breaks) | mar+>=75: ${tailMar.length}`);
console.log(`TOTAL: ${check.length} bands | feb emphasis: ${febBands.filter(b=>/<(em|strong)>/.test(b.text)).length} | feb dividers: ${febBands.filter(b=>/@@PB@@/.test(b.text)).length}`);
console.log(`checks — stray \\\\: ${check.filter(e=>/\\/.test(e.text)).length} | stray *: ${check.filter(e=>/\*/.test(e.text)).length} | {key=}: ${check.filter(e=>/\{[a-z]+=/i.test(e.text)).length} | unbalanced: ${bad.length} | feb<75? ${febMax<75}`);
if (warnings.length) { console.log("\nWARNINGS ("+warnings.length+"):"); warnings.forEach((w)=>console.log("  "+w)); }
