// Read-only: print stats + a sample item from the semantic search index at
// search-index/archive.json (Firebase Storage). Handy for verifying the shape
// after building/patching. Zero deps (Node 18+).
//
// Usage:  node inspect-archive.mjs <serviceAccount.json>
import fs from 'node:fs';
import crypto from 'node:crypto';

const SA = process.argv[2];
if (!SA) { console.error('usage: node inspect-archive.mjs <serviceAccount.json>'); process.exit(1); }
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

const tok = await token('https://www.googleapis.com/auth/devstorage.read_only');
const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent('search-index/archive.json')}?alt=media`;
const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
console.log('fetch status:', r.status);
const items = await r.json();
const memos = items.filter((x) => x.source === 'memo');
const journal = items.filter((x) => x.source === 'journal');
console.log(`total ${items.length} — ${memos.length} memos, ${journal.length} journal`);
console.log('memo keys:', Object.keys(memos[0] || {}).filter((k) => k !== 'vector'));
console.log('memos with file:', memos.filter((m) => m.file).length);
console.log('sample memo:', JSON.stringify({ id: memos[0]?.id, file: memos[0]?.file, dur: memos[0]?.dur, date: memos[0]?.date, title: memos[0]?.title }));
console.log('sample journal:', JSON.stringify({ id: journal[0]?.id, type: journal[0]?.type, date: journal[0]?.date }));
