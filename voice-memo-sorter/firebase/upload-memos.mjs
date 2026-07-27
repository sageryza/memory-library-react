// One-step Firebase Storage uploader — pure Node, NO installs needed.
//
// It uploads every .m4a in ~/VoiceMemos (plus the manifest, if it's nearby) to
// your Firebase Storage at  memo-audio/ , authenticating with your service-account
// key. Nothing to install: uses only Node's built-in modules.
//
// RUN (from the folder that has this file + your service-account .json):
//     node upload-memos.mjs
//
// If it can't find your key or your memos automatically, pass them explicitly:
//     node upload-memos.mjs /path/to/serviceAccount.json ~/VoiceMemos
//
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';

const HOME = os.homedir();
const BUCKET = process.env.BUCKET || 'membry-df528.firebasestorage.app';

// ---- locate the service-account key ----
function findKey() {
  if (process.argv[2]) return process.argv[2];
  const dirs = ['.', path.join(HOME, 'Downloads'), HOME, path.join(HOME, 'Desktop')];
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(d); } catch { continue; }
    const hit = files.find(f => f.endsWith('.json') && /firebase.*adminsdk|membry.*firebase|serviceaccount/i.test(f));
    if (hit) return path.join(d, hit);
  }
  return null;
}
// ---- locate the VoiceMemos folder ----
function findMemos() {
  if (process.argv[3]) return process.argv[3];
  for (const d of [path.join(HOME, 'VoiceMemos'), path.join(HOME, 'Desktop', 'VoiceMemos'), path.join(HOME, 'Downloads', 'VoiceMemos')]) {
    try { if (fs.statSync(d).isDirectory()) return d; } catch {}
  }
  return null;
}
// ---- locate the manifest (optional) ----
function findManifest() {
  for (const d of ['.', path.join(HOME, 'Downloads'), HOME, path.join(HOME, 'Desktop')]) {
    const p = path.join(d, 'memo-audio-manifest.json');
    try { if (fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

const keyPath = findKey();
const memosDir = findMemos();
if (!keyPath) { console.error('❌ Could not find your service-account .json. Pass it:  node upload-memos.mjs /path/to/key.json ~/VoiceMemos'); process.exit(1); }
if (!memosDir) { console.error('❌ Could not find your VoiceMemos folder. Pass it:  node upload-memos.mjs '+keyPath+' /path/to/VoiceMemos'); process.exit(1); }

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/devstorage.read_write', aud: sa.token_uri, iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), sa.private_key));
  const jwt = head + '.' + claim + '.' + sig;
  const res = await fetch(sa.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!res.ok) throw new Error('auth failed: ' + res.status + ' ' + (await res.text()));
  return (await res.json()).access_token;
}
async function put(tok, name, buf, type) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': type }, body: buf });
      if (res.ok) return;
      if (res.status < 500 && res.status !== 429) throw new Error(res.status + ' ' + (await res.text()));
    } catch (e) { if (attempt === 4) throw e; }
    await new Promise(r => setTimeout(r, attempt * 1500));
  }
}

console.log('Key:    ' + keyPath);
console.log('Memos:  ' + memosDir);
console.log('Bucket: gs://' + BUCKET + '/memo-audio/\n');

let tok = await getToken();
console.log('✓ authenticated\n');

const files = fs.readdirSync(memosDir).filter(f => f.endsWith('.m4a')).sort();
if (!files.length) { console.error('❌ No .m4a files in ' + memosDir); process.exit(1); }

const tStart = Date.now();
let done = 0;
for (const f of files) {
  if (Date.now() - tStart > 45 * 60 * 1000) tok = await getToken(); // refresh on long runs
  await put(tok, 'memo-audio/' + f, fs.readFileSync(path.join(memosDir, f)), 'audio/mp4');
  done++;
  if (done % 25 === 0 || done === files.length) console.log(`  ${done}/${files.length} recordings`);
}

const manifest = findManifest();
if (manifest) { await put(tok, 'memo-audio/manifest.json', fs.readFileSync(manifest), 'application/json'); console.log('  + manifest.json'); }
else console.log('  (manifest not found nearby — that\'s ok, Claude can upload it)');

console.log(`\n✅ Done — ${done} recordings uploaded. Tell Claude it finished.`);
