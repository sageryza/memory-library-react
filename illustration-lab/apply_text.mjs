// Append pre-cleaned {date,type,text} bands to the timeline, with a safety
// sanitizer that guarantees only <em>/<strong>/@@PB@@ survive as markup.
// Usage: node apply_text.mjs <specPath> <label>
import { readFileSync, writeFileSync } from "node:fs";
const TL = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";
const [,, specPath, label] = process.argv;

function finalize(t) {
  if (t == null) return "";
  let s = String(t);
  // protect intended emphasis tags + page-break tokens
  s = s.replace(/<strong>/g, "S").replace(/<\/strong>/g, "/S")
       .replace(/<em>/g, "E").replace(/<\/em>/g, "/E")
       .replace(/@@PB@@/g, "PB");
  // convert any raw markdown the agent left behind
  s = s.replace(/\*\*([^\n*][^*]*?)\*\*/g, "S$1/S")
       .replace(/\*([^\n*][^*]*?)\*/g, "E$1/E");
  // drop stray asterisks + backslashes-before-space/eol
  s = s.replace(/\*+/g, "").replace(/\\(?=\s|$)/g, "").replace(/\\([^\w\s])/g, "$1");
  // escape any remaining literal HTML in the prose
  s = s.replace(/&(?!(amp|lt|gt|#\d+);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // restore protected markup
  s = s.replace(/S/g, "<strong>").replace(/\/S/g, "</strong>")
       .replace(/E/g, "<em>").replace(/\/E/g, "</em>")
       .replace(/PB/g, "@@PB@@");
  // tidy whitespace + page-break lines
  s = s.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
       .replace(/\n*@@PB@@\n*/g, "\n@@PB@@\n").trim()
       .replace(/^@@PB@@\n?/, "").replace(/\n?@@PB@@$/, "");
  return s;
}
const visLen = (t) => t.replace(/<[^>]+>/g, "").replace(/@@PB@@/g, "").length;

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const html = readFileSync(TL, "utf8");
const m = html.match(/const sections=(\[[\s\S]*?\n\]);/);
const existing = (0, eval)(m[1]);
let page = Math.max(...existing.map((e) => e.page)) + 1;

const bands = [];
for (const b of spec) {
  const text = finalize(b.text);
  if (visLen(text) < 3) continue;
  bands.push({ page: page++, type: b.type, lines: Math.max(2, Math.round(visLen(text) / 47)), date: b.date, text });
}
const all = existing.concat(bands);
const body = all.map((e) => `{page:${e.page},type:"${e.type}",lines:${e.lines},date:${JSON.stringify(e.date)},text:${JSON.stringify(e.text)}}`).join(",\n");
const next = html.replace(m[1], "[\n" + body + "\n]");
const check = (0, eval)(next.match(/const sections=(\[[\s\S]*?\n\]);/)[1]);
if (!Array.isArray(check)) throw new Error("validation failed");
const badTags = bands.filter((e) => { const o=(e.text.match(/<(em|strong)>/g)||[]).length,c=(e.text.match(/<\/(em|strong)>/g)||[]).length; return o!==c; });
const stray = bands.filter(e=>/[<>](?!)/.test(e.text.replace(/<\/?(em|strong)>/g,""))|| /\*/.test(e.text));
writeFileSync(TL, next);
console.log(`[${label}] +${bands.length} bands (pages ${bands[0]?.page}..${bands[bands.length-1]?.page}) | total ${check.length} | emphasis+${bands.filter(b=>/<(em|strong)>/.test(b.text)).length} pb+${bands.filter(b=>/@@PB@@/.test(b.text)).length} | badTags:${badTags.length} stray:${stray.length}`);
