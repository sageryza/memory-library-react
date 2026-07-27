import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('resorted/transcripts-resorted.json','utf8'));
const flagged = new Set(JSON.parse(fs.readFileSync('flagged-journal-duplicates.json','utf8')).map(f=>f.file));
const out = r.map(x=>{
  let cat = x.newCategory;
  if (cat==='journal' && flagged.has(x.file)) cat='transcription';
  const id = x.file.split('/').pop().replace(/\.[^.]+$/,'');
  return {
    id, file: id + '.m4a',
    date: x.recordedAt || null,
    cat,
    title: (x.sort && x.sort.title) || null,
    desc: x.description || null,
    keywords: x.keywords || [],
    dur: x.analysis ? Math.round(x.analysis.duration) : null,
    transcript: (x.transcript || '').trim() || null,
  };
});
fs.writeFileSync('memo-audio-manifest.json', JSON.stringify({ version: 1, count: out.length, memos: out }));
const bycat={}; out.forEach(m=>bycat[m.cat]=(bycat[m.cat]||0)+1);
console.log('manifest:', out.length, 'memos |', (fs.statSync('memo-audio-manifest.json').size/1e6).toFixed(2),'MB');
console.log('by cat:', JSON.stringify(bycat));
