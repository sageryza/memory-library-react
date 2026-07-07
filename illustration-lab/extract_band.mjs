import { readFileSync } from "node:fs";
import { appendEntries } from "./band_util.mjs";

// Slice verbatim text out of a saved Notion fetch (raw JSON-escaped), clean only
// Notion's markup (never the words), and append as timeline bands.
// Usage: node extract_band.mjs <srcfile> <rangesJsonFile>
//   ranges: [{page,type,date,start,end}]  char offsets into the raw file
const src = readFileSync(process.argv[2], "utf8");
const ranges = JSON.parse(readFileSync(process.argv[3], "utf8"));

function clean(raw) {
  let s = raw
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "  ")
    .replace(/\\r/g, "")
    .replace(/\\~/g, "~")
    .replace(/\\\\/g, "\\")
    .replace(/\\([\[\]()~*_#])/g, "$1");
  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "(pic)")
    .replace(/\s*\{color=[^}\n]*\}/g, "")
    .replace(/\t/g, " ")
    .replace(/<empty-block\/>/g, "")
    .replace(/<\/?span[^>\n]*>/g, "")
    .replace(/<\/?[a-z_-]+(?:\s[^>\n]*)?>/gi, "") // any stray tags
    .replace(/^\s*#{1,6}\s+/gm, "").replace(/\s*#{1,6}\s*$/gm, "")               // heading markers, keep the label
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*---\s*$/gm, "")             // stray page-break rules
    .replace(/^.*(?:color\{gray\}|\\rule\{)[^\n]*$/gm, "")   // latex hr dividers
    .replace(/\$`?|`?\$/g, "");
  // collapse blank runs, trim
  s = s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim();
  return s;
}

const entries = ranges.map((r) => ({
  page: r.page, type: r.type, date: r.date, text: clean(src.slice(r.start, r.end)),
}));

// guard: no empty text
for (const e of entries) if (!e.text || e.text.length < 3) throw new Error("empty band p" + e.page);

const total = appendEntries(entries);
console.log("appended", entries.length, "bands -> total", total);
for (const e of entries) console.log(`  p${e.page} ${e.type} ${e.date} — ${e.text.slice(0,52).replace(/\n/g,' ')}…`);
