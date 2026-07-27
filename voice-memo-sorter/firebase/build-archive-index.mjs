// Build the archive semantic-search index for JournalReader and upload it to
// Firebase Storage at search-index/archive.json — the file `searchArchive`
// (functions/index.js) reads. Two source-tagged corpora, both Sage's:
//   • memo    — every voice memo (from Storage memo-audio/manifest.json)
//   • journal — every transcribed journal entry (from journal_timeline.html)
//
// Zero deps (Node 18+). OpenAI key from $OPENAI_API_KEY; Firebase via the
// service-account JSON. Cost: ~1–2 cents (text-embedding-3-small).
//
// Usage:
//   OPENAI_API_KEY=sk-... node build-archive-index.mjs <serviceAccount.json> [path/to/journal_timeline.html]

import fs from 'node:fs';
import crypto from 'node:crypto';

const [saPath, timelinePathArg] = process.argv.slice(2);
if (!saPath) { console.error('usage: node build-archive-index.mjs <serviceAccount.json> [journal_timeline.html]'); process.exit(1); }
const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
const PROJECT = sa.project_id;
const BUCKET = process.env.BUCKET || `${PROJECT}.firebasestorage.app`;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('Set OPENAI_API_KEY'); process.exit(1); }
const timelinePath = timelinePathArg
  || new URL('../../ios-journal/JournalReader/journal_timeline.html', import.meta.url).pathname;

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri, iat: now, exp: now + 3600 }));
  const jwt = head + '.' + claim + '.' + b64url(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), sa.private_key));
  const r = await fetch(sa.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!r.ok) throw new Error('token ' + r.status + ' ' + await r.text());
  return (await r.json()).access_token;
}

async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', dimensions: 512, input: texts }),
  });
  if (!res.ok) throw new Error('embeddings ' + res.status + ' ' + (await res.text()).slice(0, 300));
  return (await res.json()).data.map((d) => d.embedding.map((n) => Math.round(n * 1e5) / 1e5));
}

const stTok = await token('https://www.googleapis.com/auth/devstorage.read_write');

// --- voice memos: from Storage memo-audio/manifest.json (all of them) ---
const items = [];
{
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent('memo-audio/manifest.json')}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + stTok } });
  if (!r.ok) throw new Error('manifest fetch ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const manifest = await r.json();
  for (const m of (manifest.memos || [])) {
    const text = [m.title, m.desc, m.transcript].filter(Boolean).join('. ').trim();
    if (!text) continue;
    // `file` + `dur` travel with the hit so JournalReader can stream the
    // recording straight from the search result — no second manifest load.
    items.push({ source: 'memo', id: m.id, file: m.file || null, dur: m.dur ?? null,
      date: m.date || null, title: m.title || null, cat: m.cat || null,
      snippet: (m.desc || m.transcript || '').slice(0, 200), text: text.slice(0, 8000) });
  }
}

// --- journal entries: eval the `const sections=[...]` array from the timeline ---
{
  const html = fs.readFileSync(timelinePath, 'utf8');
  const mm = html.match(/const sections\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!mm) throw new Error('could not find sections[] in ' + timelinePath);
  const sections = (0, eval)(mm[1]); // trusted, bundled file
  sections.forEach((s, i) => {
    const text = (s.text || '').trim();
    if (!text) return;
    items.push({ source: 'journal', id: `p${s.page ?? '?'}-${i}`, date: s.date || null,
      type: s.type || null, snippet: text.slice(0, 200), text: text.slice(0, 8000) });
  });
}

const memoN = items.filter((x) => x.source === 'memo').length;
const jN = items.filter((x) => x.source === 'journal').length;
console.log(`collected ${items.length} items — ${memoN} memos, ${jN} journal entries; embedding…`);

for (let i = 0; i < items.length; i += 128) {
  const batch = items.slice(i, i + 128);
  const vecs = await embedBatch(batch.map((x) => x.text));
  batch.forEach((x, j) => { x.vector = vecs[j]; });
  console.log(`  ${Math.min(i + 128, items.length)}/${items.length}`);
}

const name = encodeURIComponent('search-index/archive.json');
const up = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${name}`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + stTok, 'Content-Type': 'application/json' },
  body: JSON.stringify(items),
});
if (!up.ok) { console.error('upload failed', up.status, await up.text()); process.exit(1); }
console.log(`✅ wrote search-index/archive.json (${items.length} items: ${memoN} memos + ${jN} journal) to gs://${BUCKET}/`);
