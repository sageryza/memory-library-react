// Build the per-user semantic-search index and upload it to Firebase Storage at
// search-index/<uid>.json — the file the `semanticSearch` Cloud Function reads.
//
// Embeds two corpora with OpenAI text-embedding-3-small (512 dims):
//   • voice memos  — from a local transcripts JSON (private; pass its path)
//   • memories     — from Firestore users/<uid>/memories (read via the SA key)
//
// Zero dependencies (Node 18+ built-ins). Reuses the service-account JSON for
// Firestore + Storage; OpenAI key from $OPENAI_API_KEY.
//
// Usage:
//   OPENAI_API_KEY=sk-... node build-search-index.mjs <serviceAccount.json> <uid> <transcripts-resorted.json>
//
// Cost: ~1–2 cents total (embeddings are ~$0.02 / 1M tokens).

import fs from 'node:fs';
import crypto from 'node:crypto';

const [saPath, uid, transcriptsPath] = process.argv.slice(2);
if (!saPath || !uid) { console.error('usage: node build-search-index.mjs <serviceAccount.json> <uid> [transcripts.json]'); process.exit(1); }
const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
const PROJECT = sa.project_id;
const BUCKET = process.env.BUCKET || `${PROJECT}.firebasestorage.app`;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('Set OPENAI_API_KEY'); process.exit(1); }

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

// --- Firestore: flatten a typed Value to a JS primitive/string ---
function fsVal(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsVal);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsVal(x); return o; }
  return null;
}
async function fetchMemories(tok) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}/memories`;
  const out = []; let pageToken = '';
  do {
    const url = base + `?pageSize=300` + (pageToken ? `&pageToken=${pageToken}` : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error('firestore ' + r.status + ' ' + await r.text());
    const j = await r.json();
    for (const d of (j.documents || [])) {
      const id = d.name.split('/').pop();
      const f = {}; for (const [k, v] of Object.entries(d.fields || {})) f[k] = fsVal(v);
      out.push({ id, fields: f, createdAt: d.createTime });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
// Pull the human text out of a memory doc (fields vary), keeping it short-ish.
function memoryText(f) {
  const keys = ['title', 'text', 'content', 'caption', 'note', 'description', 'body', 'memory'];
  const parts = [];
  for (const k of keys) if (typeof f[k] === 'string' && f[k].trim()) parts.push(f[k].trim());
  if (!parts.length) for (const v of Object.values(f)) if (typeof v === 'string' && v.length > 3) parts.push(v);
  return parts.join('. ').replace(/\s+/g, ' ').trim();
}

async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', dimensions: 512, input: texts }),
  });
  if (!res.ok) throw new Error('embeddings ' + res.status + ' ' + (await res.text()).slice(0, 300));
  return (await res.json()).data.map((d) => d.embedding.map((n) => Math.round(n * 1e5) / 1e5));
}

// --- collect items ---
const items = [];
if (transcriptsPath && fs.existsSync(transcriptsPath)) {
  const memos = JSON.parse(fs.readFileSync(transcriptsPath, 'utf8'));
  for (const m of memos) {
    const t = (m.transcript || '').trim();
    if (!t) continue;
    const title = (m.sort && m.sort.title) || null;
    items.push({
      source: 'memo', id: (m.file || '').split('/').pop().replace(/\.[^.]+$/, ''),
      title, date: m.recordedAt || null, cat: m.newCategory || null,
      snippet: (m.description || t).slice(0, 200),
      text: [title, m.description, t].filter(Boolean).join('. ').slice(0, 8000),
    });
  }
}
const dsTok = await token('https://www.googleapis.com/auth/datastore');
for (const mem of await fetchMemories(dsTok)) {
  const text = memoryText(mem.fields);
  if (!text) continue;
  items.push({
    source: 'memory', id: mem.id,
    title: mem.fields.title || null, date: mem.fields.date || mem.createdAt || null,
    cat: mem.fields.category || null, snippet: text.slice(0, 200), text: text.slice(0, 8000),
  });
}
console.log(`collected ${items.length} items (memos + memories); embedding…`);

// --- embed in batches ---
for (let i = 0; i < items.length; i += 128) {
  const batch = items.slice(i, i + 128);
  const vecs = await embedBatch(batch.map((x) => x.text));
  batch.forEach((x, j) => { x.vector = vecs[j]; });
  console.log(`  ${Math.min(i + 128, items.length)}/${items.length}`);
}

// --- upload index to Storage ---
const stTok = await token('https://www.googleapis.com/auth/devstorage.read_write');
const name = encodeURIComponent(`search-index/${uid}.json`);
const up = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${name}`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + stTok, 'Content-Type': 'application/json' },
  body: JSON.stringify(items),
});
if (!up.ok) { console.error('upload failed', up.status, await up.text()); process.exit(1); }
console.log(`✅ wrote search-index/${uid}.json (${items.length} items) to gs://${BUCKET}/`);
