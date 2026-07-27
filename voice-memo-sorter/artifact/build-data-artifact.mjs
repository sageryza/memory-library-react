import fs from 'node:fs';
import path from 'node:path';

const SCRATCH = '/tmp/claude-0/-home-user/0ce3c286-e0d7-560a-a987-94d9c461a814/scratchpad';
const data = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'resorted/transcripts-resorted.json'), 'utf8'));

const out = data.map((x) => ({
  file: path.basename(x.file),
  date: x.recordedAt || null,
  category: x.newCategory,
  title: x.sort.title || null,
  keywords: x.keywords || [],
  description: x.description || null,
  melody: x.melodyNote || null,
  duration: x.analysis ? Math.round(x.analysis.duration) : null,
  transcript: (x.transcript || '').trim() || null,
}));
const json = JSON.stringify(out).replace(/<\//g, '<\\/');

const html = `<title>Voice Memo Archive — master data</title>
<style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5}pre{background:#f5f3f8;padding:12px;border-radius:8px;overflow-x:auto;font-size:11px;max-height:300px}</style>
<h1>Voice Memo Archive — master data</h1>
<p><strong>${out.length} memos</strong> (2021–2026): transcripts, categories, titles, keywords, descriptions. This page is the canonical machine-readable archive — private to Sage's account.</p>
<p><em>For Claude:</em> the complete dataset is embedded below as JSON in the <code>&lt;script id="archive" type="application/json"&gt;</code> tag. Fetch this page and parse that block. Categories: original, cover, dream, idea, conversation, journal, todo, quote, note, other, empty, toolong.</p>
<pre id="preview"></pre>
<script id="archive" type="application/json">${json}</script>
<script>
const d = JSON.parse(document.getElementById('archive').textContent);
document.getElementById('preview').textContent = 'Preview (first 2 of ' + d.length + '):\\n' + JSON.stringify(d.slice(0, 2), null, 2);
</script>`;

fs.writeFileSync(path.join(SCRATCH, 'memo-archive-data.html'), html);
console.log('built:', (html.length / 1e6).toFixed(2), 'MB,', out.length, 'memos');
