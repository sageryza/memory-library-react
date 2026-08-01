// import-new.mjs — add your NEWEST voice memos to the pipeline in one command.
//
// Point it at a folder of recordings; it uploads ONLY the ones that aren't
// already there, transcribes + categorizes each, and wires them into everything:
//   • Firebase Storage  memo-audio/<id>.<ext>   (the audio)
//   • memo-audio/manifest.json                  (so the app + Voice Memos tab see it)
//   • search-index/archive.json                 (so semantic search finds it)
//
// It dedupes by the audio's content hash, so re-running is safe — nothing is
// uploaded twice, and it just picks up whatever's new since last time.
//
// Zero npm deps (Node 18+ built-in fetch/crypto). Needs `ffprobe`/`ffmpeg` on
// PATH for durations + large-file handling (you already have these).
//
// SETUP (one time, in your terminal):
//   export OPENAI_API_KEY=sk-...
//   export STORY_FIREBASE_SERVICE_ACCOUNT='<the whole membry-df528 key JSON>'
//   (or pass --sa /path/to/membry-key.json instead of the env var)
//
// USAGE:
//   node import-new.mjs [folder] [--sa <file>] [--dry-run] [--limit N] [--max-min N]
//     folder     the folder with your recordings; defaults to ~/VoiceMemos
//     --sa        service-account JSON file (else read from env — see above)
//     --dry-run  list what WOULD be added (transcribes nothing, costs $0)
//     --limit N  only do the first N new files (great for a first test: --limit 1)
//     --max-min  skip recordings longer than N minutes (default 30)
//
// COST: ~1–2¢ per new memo (transcription + one embedding). Run --dry-run first.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const pos = argv.filter((a) => !a.startsWith('--'));
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };

const folder = (opt('--folder', pos[0]) || path.join(os.homedir(), 'VoiceMemos')).replace(/^~/, os.homedir());
const dryRun = flags.has('--dry-run');
const limit = Number(opt('--limit', Infinity));
const maxMin = Number(opt('--max-min', 30));

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY && !dryRun) { console.error('Set OPENAI_API_KEY (or use --dry-run).'); process.exit(1); }

// Service account for membry-df528 (where the memos live). Resolve, in order:
//   --sa <file>  →  STORY_FIREBASE_SERVICE_ACCOUNT (inline JSON)  →
//   GOOGLE_APPLICATION_CREDENTIALS (file)  →  FIREBASE_SERVICE_ACCOUNT (inline)
function loadSA() {
  const p = opt('--sa', null);
  if (p) return JSON.parse(fs.readFileSync(p.replace(/^~/, os.homedir()), 'utf8'));
  if (process.env.STORY_FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.STORY_FIREBASE_SERVICE_ACCOUNT);
  if (process.env.MEMBRY_FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.MEMBRY_FIREBASE_SERVICE_ACCOUNT);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return null;
}
const sa = loadSA();
if (!sa) { console.error('No service account. Set STORY_FIREBASE_SERVICE_ACCOUNT (the membry-df528 key) in your env, or pass --sa <file>.'); process.exit(1); }
if (sa.project_id !== 'membry-df528') { console.error(`This service account is for "${sa.project_id}", but the voice memos live in membry-df528. Use the membry key (STORY_FIREBASE_SERVICE_ACCOUNT), not the Deck Factory one.`); process.exit(1); }
const BUCKET = process.env.BUCKET || `${sa.project_id}.firebasestorage.app`;
const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.wav', '.aac', '.mp4', '.aiff', '.aif', '.caf', '.flac']);
const MAX_API_BYTES = 24 * 1024 * 1024;
const CATS = ['idea', 'dream', 'song', 'todo', 'journal', 'quote', 'note', 'conversation', 'other'];

// ---- firebase auth (JWT → access token) ----------------------------------
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
const mediaURL = (name) => `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(name)}?alt=media`;
const uploadURL = (name, type) => `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}` + (type ? `&contentType=${encodeURIComponent(type)}` : '');

async function getJSON(tok, name) {
  const r = await fetch(mediaURL(name), { headers: { Authorization: 'Bearer ' + tok } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`fetch ${name} ${r.status}`);
  return r.json();
}
async function putJSON(tok, name, obj) {
  const r = await fetch(uploadURL(name, 'application/json'), { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  if (!r.ok) throw new Error(`upload ${name} ${r.status} ${await r.text()}`);
}
async function putBytes(tok, name, bytes, type) {
  const r = await fetch(uploadURL(name, type), { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': type }, body: bytes });
  if (!r.ok) throw new Error(`upload ${name} ${r.status} ${await r.text()}`);
}

// ---- ffprobe / ffmpeg helpers --------------------------------------------
function run(cmd, args) {
  return new Promise((res) => {
    const p = spawn(cmd, args); let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => res({ code, out, err })); p.on('error', () => res({ code: -1, out, err }));
  });
}
async function durationSec(file) {
  const r = await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', file]);
  if (r.code !== 0) return null;
  try { return Math.round(Number(JSON.parse(r.out).format.duration)); } catch { return null; }
}
// For files over the API cap, transcode to 16k mono mp3 just for transcription.
async function toSmallMp3(file) {
  const tmp = path.join(os.tmpdir(), `vm_${crypto.randomBytes(6).toString('hex')}.mp3`);
  const r = await run('ffmpeg', ['-y', '-i', file, '-ac', '1', '-ar', '16000', '-b:a', '32k', tmp]);
  return r.code === 0 ? tmp : null;
}

// ---- OpenAI ---------------------------------------------------------------
async function transcribe(file) {
  let use = file, tmp = null;
  if ((await fsp.stat(file)).size > MAX_API_BYTES) { tmp = await toSmallMp3(file); if (tmp) use = tmp; }
  try {
    const buf = await fsp.readFile(use);
    const fd = new FormData();
    fd.append('file', new Blob([buf]), path.basename(use));
    fd.append('model', 'gpt-4o-transcribe');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: fd });
    if (!r.ok) throw new Error('transcribe ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return ((await r.json()).text || '').trim();
  } finally { if (tmp) fsp.unlink(tmp).catch(() => {}); }
}
async function classify(text) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0,
      messages: [
        { role: 'system', content: `Sort a voice-memo transcript. Categories: ${CATS.join(', ')}. "dream" = a dream from sleep; "conversation" = talking with someone or dictating a back-and-forth; "journal" = personal reflection/feelings; "idea" = a plan/insight; pick "other" only if nothing fits. Reply as JSON.` },
        { role: 'user', content: text.slice(0, 6000) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'memo', strict: true, schema: {
        type: 'object', additionalProperties: false,
        properties: { category: { type: 'string', enum: CATS }, title: { type: 'string' }, summary: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } },
        required: ['category', 'title', 'summary', 'keywords'],
      } } },
    }),
  });
  if (!r.ok) throw new Error('classify ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return JSON.parse((await r.json()).choices[0].message.content);
}
async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', dimensions: 512, input: text.slice(0, 8000) }),
  });
  if (!r.ok) throw new Error('embed ' + r.status);
  return (await r.json()).data[0].embedding.map((n) => Math.round(n * 1e5) / 1e5);
}

// ---- main -----------------------------------------------------------------
const stTok = await token('https://www.googleapis.com/auth/devstorage.read_write');

const manifest = (await getJSON(stTok, 'memo-audio/manifest.json')) || { version: 1, count: 0, memos: [] };
const seenHash = new Set(manifest.memos.map((m) => m.hash).filter(Boolean));
const seenFile = new Set(manifest.memos.map((m) => m.file));
console.log(`manifest has ${manifest.memos.length} memos.`);

if (!fs.existsSync(folder)) { console.error(`Folder not found: ${folder}`); process.exit(1); }
const files = (await fsp.readdir(folder))
  .filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
  .map((f) => path.join(folder, f));
console.log(`Scanning ${files.length} audio files in ${folder}`);

// figure out which are new (by content hash)
const candidates = [];
for (const file of files) {
  const bytes = await fsp.readFile(file);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (seenHash.has(hash)) continue;
  const stat = await fsp.stat(file);
  candidates.push({ file, bytes, hash, mtime: stat.mtimeMs, size: bytes.length });
}
candidates.sort((a, b) => a.mtime - b.mtime);
const todo = candidates.slice(0, limit);
console.log(`${candidates.length} new (not already uploaded); processing ${todo.length}.`);

if (dryRun) {
  for (const c of todo) console.log(`  would add: ${path.basename(c.file)}  (${new Date(c.mtime).toISOString().slice(0, 10)}, ${(c.size / 1e6).toFixed(1)}MB)`);
  console.log(`\nDry run — nothing uploaded. Est. cost if run: ~$${(todo.length * 0.015).toFixed(2)}.`);
  process.exit(0);
}

const added = [];
for (const c of todo) {
  const d = new Date(c.mtime);
  const iso = d.toISOString();
  const date = iso.slice(0, 10);
  const hhmm = iso.slice(11, 16).replace(':', '');
  const ext = path.extname(c.file).toLowerCase();
  const id = `${date}_${hhmm}_${c.hash.slice(0, 12)}`;
  const fileName = `${id}${ext}`;
  if (seenFile.has(fileName)) { console.log(`  skip (exists): ${fileName}`); continue; }

  process.stdout.write(`  ${path.basename(c.file)} → transcribing… `);
  const dur = await durationSec(c.file);
  if (dur && dur > maxMin * 60) { console.log(`skip (>${maxMin} min)`); continue; }
  const transcript = await transcribe(c.file);
  if (!transcript) { console.log('no speech, skipped'); continue; }
  const s = await classify(transcript);
  const type = ext.replace('.', '') === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
  await putBytes(stTok, `memo-audio/${fileName}`, c.bytes, type);

  const memo = { id, file: fileName, date, cat: s.category, title: s.title, desc: s.summary,
    keywords: s.keywords || [], dur, transcript, hash: c.hash, source: 'mac-import' };
  added.push(memo);
  manifest.memos.push(memo);
  console.log(`✓ ${s.category} — "${s.title}"`);
}

if (added.length === 0) { console.log('\nNothing new to add.'); process.exit(0); }

// update manifest
manifest.count = manifest.memos.length;
await putJSON(stTok, 'memo-audio/manifest.json', manifest);
console.log(`\nmanifest updated → ${manifest.memos.length} memos.`);

// incrementally embed into the search index
const archive = (await getJSON(stTok, 'search-index/archive.json')) || [];
for (const m of added) {
  const text = [m.title, m.desc, m.transcript].filter(Boolean).join('. ').trim();
  const vector = await embed(text);
  archive.push({ source: 'memo', id: m.id, file: m.file, dur: m.dur, date: m.date, title: m.title,
    cat: m.cat, snippet: (m.desc || m.transcript || '').slice(0, 200), text: text.slice(0, 8000), vector });
}
await putJSON(stTok, 'search-index/archive.json', archive);
console.log(`search index updated → +${added.length} memos.`);
console.log(`\n✅ Added ${added.length} memo(s). They'll show in the app + search right away.`);
