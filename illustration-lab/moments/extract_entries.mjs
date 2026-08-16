// Parse ios-journal/JournalReader/journal_timeline.html's `const sections=[...]`
// into a clean entries JSON (one object per banded entry, in file order).
// Usage: node extract_entries.mjs <out.json>
import { readFile, writeFile } from 'node:fs/promises';
const html = await readFile(new URL('../../ios-journal/JournalReader/journal_timeline.html', import.meta.url), 'utf8');
const start = html.indexOf('const sections=[');
if (start < 0) throw new Error('sections array not found');
// find the closing ]; that ends the array: scan brackets from the [
let i = html.indexOf('[', start), depth = 0, end = -1, inStr = false, q = '';
for (; i < html.length; i++) {
  const c = html[i];
  if (inStr) { if (c === '\\') i++; else if (c === q) inStr = false; continue; }
  if (c === '"' || c === "'") { inStr = true; q = c; continue; }
  if (c === '[' || c === '{') depth++;
  else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const src = html.slice(html.indexOf('[', start), end + 1);
const sections = new Function('return ' + src)();
console.log('entries:', sections.length);
const out = sections.map((s, idx) => ({ idx, page: s.page, type: s.type, date: s.date ?? null, lines: s.lines, text: s.text }));
await writeFile(process.argv[2] ?? 'entries.json', JSON.stringify(out, null, 1));
console.log('wrote', process.argv[2] ?? 'entries.json');
