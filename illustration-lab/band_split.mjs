import { readFileSync } from "node:fs";
import { appendEntries } from "./band_util.mjs";

// Phrase-based bander for messy/huge entries. Spec:
//   node band_split.mjs <src> <specFile> <startPage>
// spec = [ {date, start, end, parts:[ {type, until:"verbatim phrase" | null} ]} ]
// Each part runs from the previous split point up to (but not including) the first
// occurrence of `until` in the CLEANED text; the final part uses until:null (to end).
const src = readFileSync(process.argv[2], "utf8");
const spec = JSON.parse(readFileSync(process.argv[3], "utf8"));
let page = +process.argv[4];

function clean(raw) {
  let s = raw
    .replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "  ")
    .replace(/\\r/g, "").replace(/\\~/g, "~").replace(/\\\\/g, "\\")
    .replace(/\\([\[\]()~*_#])/g, "$1");
  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "(pic)")
    .replace(/\s*\{color=[^}\n]*\}/g, "")
    .replace(/\t/g, " ")
    .replace(/<empty-block\/>/g, "")
    .replace(/<\/?[a-z_-]+(?:\s[^>\n]*)?>/gi, "")
    .replace(/^\s*#{1,6}\s+/gm, "").replace(/\s*#{1,6}\s*$/gm, "")
    .replace(/\*\*/g, "").replace(/\*/g, "")
    .replace(/^\s*---\s*$/gm, "")
    .replace(/^.*(?:color\{gray\}|\\rule\{)[^\n]*$/gm, "")
    .replace(/\$`?|`?\$/g, "")
    .replace(/\[?https?:\/\/\S+?\]?(?=\s|$)/g, "");
  return s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

const entries = [];
for (const sec of spec) {
  const text = clean(src.slice(sec.start, sec.end));
  let idx = 0;
  sec.parts.forEach((part, i) => {
    let j;
    if (part.until == null) j = text.length;
    else {
      j = text.indexOf(part.until, idx);
      if (j === -1) { console.log(`!! phrase not found (${sec.date} part ${i}): "${part.until.slice(0,40)}" — extending to end`); j = text.length; }
    }
    const piece = text.slice(idx, j).trim();
    idx = j;
    if (piece.length >= 3) entries.push({ page: page++, type: part.type, date: part.date || sec.date, text: piece });
    else console.log(`!! empty piece skipped (${sec.date} part ${i})`);
  });
  if (idx < text.length - 3) {
    const tail = text.slice(idx).trim();
    if (tail.length >= 3) { console.log(`!! trailing ${text.length-idx} chars in ${sec.date} not assigned — appending as last part type`); entries.push({ page: page++, type: sec.parts[sec.parts.length-1].type, date: sec.date, text: tail }); }
  }
}
const total = appendEntries(entries);
console.log("appended", entries.length, "bands -> total", total, "| next page", page);
for (const e of entries) console.log(`  p${e.page} ${e.type} ${e.date} (${e.text.length}c) — ${e.text.slice(0,46).replace(/\n/g," ")}…`);
