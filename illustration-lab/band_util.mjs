import { readFileSync, writeFileSync } from "node:fs";

const TL = "/home/user/memory-library-react/ios-journal/JournalReader/journal_timeline.html";

// Serialize one entry in the exact house format: unquoted keys, double-quoted
// strings with \n / \" escaped (JSON.stringify handles the escaping).
function ser(e) {
  const lines = Math.max(2, Math.round(e.text.length / 47));
  return `{page:${e.page},type:"${e.type}",lines:${lines},date:${JSON.stringify(e.date)},text:${JSON.stringify(e.text)}}`;
}

// Append entries just before the closing `];` of `const sections=[ ... ];`,
// then validate that the whole array still parses. Returns the new total count.
export function appendEntries(entries) {
  const html = readFileSync(TL, "utf8");
  const m = html.match(/(const sections=\[[\s\S]*?)(\n?\];)/);
  if (!m) throw new Error("sections array not found");
  const body = m[1];
  const addition = entries.map(ser).join(",\n");
  // ensure a comma between the last existing entry and our first
  const joiner = /\}\s*$/.test(body) ? ",\n" : "\n";
  const next = html.replace(m[0], body + joiner + addition + "\n];");

  // validate: pull the array text and eval in a bare context
  const check = next.match(/const sections=(\[[\s\S]*?\n\]);/);
  if (!check) throw new Error("post-write: array not found");
  let arr;
  try { arr = (0, eval)(check[1]); } catch (err) { throw new Error("parse fail: " + err.message); }
  if (!Array.isArray(arr)) throw new Error("not an array");
  writeFileSync(TL, next);
  return arr.length;
}

export function currentCount() {
  const html = readFileSync(TL, "utf8");
  const check = html.match(/const sections=(\[[\s\S]*?\n\]);/);
  return (0, eval)(check[1]).length;
}
