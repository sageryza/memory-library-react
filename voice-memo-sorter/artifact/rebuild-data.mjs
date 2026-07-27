import fs from 'node:fs';
const SCRATCH = '/tmp/claude-0/-home-user/0ce3c286-e0d7-560a-a987-94d9c461a814/scratchpad';
const r = JSON.parse(fs.readFileSync(SCRATCH + '/resorted/transcripts-resorted.json', 'utf8'));
const flagged = new Set(JSON.parse(fs.readFileSync(SCRATCH + '/flagged-journal-duplicates.json', 'utf8')).map(f => f.file));

let moved = 0;
const out = r.map((x) => {
  let c = x.newCategory;
  if (c === 'journal' && flagged.has(x.file)) { c = 'transcription'; moved++; }
  const id = x.file.split('/').pop().replace(/\.[^.]+$/, '');
  return {
    id,
    t: (x.sort && x.sort.title) || null,
    d: x.recordedAt || null,
    c,
    k: x.keywords || [],
    s: x.description || null,
    x: (x.transcript || '').trim() || null,
  };
});
fs.writeFileSync(SCRATCH + '/memos-data.json', JSON.stringify(out));
const counts = {};
out.forEach((m) => (counts[m.c] = (counts[m.c] || 0) + 1));
console.log('rebuilt memos-data.json:', out.length, 'memos | moved to transcription:', moved);
console.log('journal now:', counts.journal, '| transcription:', counts.transcription);
