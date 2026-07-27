// Read search-index/archive.json, backfill each memo item's `file` + `dur` from
// memo-audio/manifest.json (joined by id), and re-upload — WITHOUT re-embedding
// (keeps existing vectors, so it's free). This is the template for cheap,
// incremental edits to the index. Zero deps (Node 18+).
//
// Usage:  node patch-archive.mjs <serviceAccount.json>
import fs from 'node:fs';
import crypto from 'node:crypto';

const SA = process.argv[2];
if (!SA) { console.error('usage: node patch-archive.mjs <serviceAccount.json>'); process.exit(1); }
const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
const BUCKET = process.env.BUCKET || `${sa.project_id}.firebasestorage.app`;
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const c = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri, iat: now, exp: now + 3600 }));
  const jwt = h + '.' + c + '.' + b64url(crypto.sign('RSA-SHA256', Buffer.from(h + '.' + c), sa.private_key));
  const r = await fetch(sa.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!r.ok) throw new Error('token ' + r.status + ' ' + await r.text());
  return (await r.json()).access_token;
}
const media = (name) => `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(name)}?alt=media`;

const tok = await token('https://www.googleapis.com/auth/devstorage.read_write');
const items = await (await fetch(media('search-index/archive.json'), { headers: { Authorization: 'Bearer ' + tok } })).json();
const manifest = await (await fetch(media('memo-audio/manifest.json'), { headers: { Authorization: 'Bearer ' + tok } })).json();
const byId = new Map((manifest.memos || []).map((m) => [m.id, m]));

let patched = 0, missing = 0;
for (const it of items) {
  if (it.source !== 'memo') continue;
  const m = byId.get(it.id);
  if (m) { it.file = m.file; if (m.dur != null) it.dur = m.dur; patched++; } else { missing++; }
}
console.log(`patched ${patched} memo items with file/dur; ${missing} unmatched`);

const name = encodeURIComponent('search-index/archive.json');
const up = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${name}`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(items),
});
console.log('upload status:', up.status, up.ok ? 'OK' : await up.text());
