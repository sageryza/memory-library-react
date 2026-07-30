// Incremental voice-memo updater — pure Node, NO installs needed.
//
// Brings the live Firebase archive up to date with whatever is new in the Mac's
// Voice Memos app. It reads the LIVE manifest first, so it only ever transcribes
// and uploads recordings that aren't already in the archive — safe to re-run.
//
//   1. reads memo-audio/manifest.json from Firebase Storage  (what's already in)
//   2. reads the Mac Voice Memos database, read-only          (what exists)
//   3. transcribes + categorises ONLY the new ones            (OpenAI)
//   4. uploads the new .m4a files + the merged manifest       (Firebase Storage)
//
// RUN (from this folder):
//     export OPENAI_API_KEY=sk-...
//     node update-memos.mjs
//
// Useful flags:
//     --dry-run          show what's new and what it would cost, change nothing
//     --limit 5          only process the first 5 new recordings (test run)
//     --max-minutes 45   longer than this is filed "toolong", not transcribed
//     --yes              skip the cost confirmation
//     --key  /path/to/serviceAccount.json
//     --db   /path/to/CloudRecordings.db
//
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const BUCKET = process.env.BUCKET || 'membry-df528.firebasestorage.app';
const OPENAI_BASE = 'https://api.openai.com/v1';
const TRANSCRIBE_MODEL = 'gpt-4o-transcribe';
const SORT_MODEL = 'gpt-4o-mini';
const COST_PER_MIN = 0.006;       // transcription, for the estimate only
const CONFIRM_OVER = 3;           // ask before spending more than this

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] || true); };
const has = (n) => argv.includes('--' + n);
const DRY = has('dry-run');
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const MAX_MIN = Number(flag('max-minutes', 45));
// Rehearsal escape hatch: point at a throwaway folder to test without touching
// the real archive, e.g. --folder memo-audio-test
const FOLDER = String(flag('folder', 'memo-audio')).replace(/\/+$/, '');

// Same categories the original sorter uses, so new memos file consistently.
const CATEGORIES = [
  ['idea', 'A thought, plan, insight, brainstorm, or thing to make/try.'],
  ['dream', 'A recollection of a dream from sleep — surreal, narrated as something that happened while asleep.'],
  ['original', 'Singing, humming, a melody, lyrics, or an original musical sketch.'],
  ['cover', 'Singing someone else\'s existing song.'],
  ['todo', 'A task, reminder, errand, or something to do.'],
  ['journal', 'A personal reflection, feeling, or account of the day / what is going on.'],
  ['conversation', 'A recorded conversation between two or more people.'],
  ['quote', 'A quote, line, or fragment worth remembering — overheard or recited.'],
  ['note', 'A factual note, piece of info, name, number, or reference.'],
  ['transcription', 'Reading an older written journal entry aloud, rather than speaking in the moment.'],
  ['other', 'Does not clearly fit any category above.'],
];

// ---- firebase auth + storage (same approach as upload-memos.mjs) ---------
function findKey() {
  if (flag('key')) return flag('key');
  for (const d of ['.', path.join(HOME, 'Downloads'), HOME, path.join(HOME, 'Desktop')]) {
    let files = [];
    try { files = fs.readdirSync(d); } catch { continue; }
    const hit = files.find(f => f.endsWith('.json') && /firebase.*adminsdk|membry.*firebase|serviceaccount/i.test(f));
    if (hit) return path.join(d, hit);
  }
  return null;
}
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let sa = null;
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: sa.token_uri, iat: now, exp: now + 3600,
  }));
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), sa.private_key));
  const res = await fetch(sa.token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }),
  });
  if (!res.ok) throw new Error('firebase auth failed: ' + res.status + ' ' + (await res.text()));
  return (await res.json()).access_token;
}
async function get(tok, name) {
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(name)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('download ' + name + ' failed: ' + res.status);
  return Buffer.from(await res.arrayBuffer());
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

// ---- the Mac's Voice Memos database -------------------------------------
function readVoiceMemos() {
  const db = flag('db') || path.join(HOME, 'Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/CloudRecordings.db');
  if (!fs.existsSync(db)) {
    console.error('❌ No Voice Memos database at:\n   ' + db + '\n   Open the Voice Memos app once, then re-run.');
    process.exit(1);
  }
  // Work on a snapshot so the live database is never locked.
  const snap = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-'));
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.copyFileSync(db + ext, path.join(snap, 'db' + ext)); } catch {}
  }
  const sql = "SELECT COALESCE(ZDATE,''),COALESCE(ZPATH,''),COALESCE(ZCUSTOMLABEL,''),COALESCE(ZDURATION,0) FROM ZCLOUDRECORDING ORDER BY ZDATE;";
  let rows;
  try {
    rows = execFileSync('sqlite3', ['-separator', '\x1f', path.join(snap, 'db'), sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } finally { fs.rmSync(snap, { recursive: true, force: true }); }
  const recDir = path.dirname(db);
  return rows.split('\n').filter(Boolean).map(line => {
    const [zdate, zpath, label, dur] = line.split('\x1f');
    // Core Data epoch starts 2001-01-01.
    const when = zdate ? new Date((Number(zdate) + 978307200) * 1000) : null;
    const src = zpath ? path.join(recDir, zpath) : null;
    return {
      when, title: label || 'Recording', dur: Math.round(Number(dur) || 0),
      src, downloaded: !!(src && fs.existsSync(src)),
    };
  }).filter(r => r.when);
}
// Local wall-clock stamp — this prefix is the join key against the archive,
// because it is stable across every naming scheme the exporter has used.
function localKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
const idFor = (d) => `${localKey(d)}_${d.toISOString().replace(/[:.]/g, '_').replace(/_\d+Z$/, 'Z')}`;

// ---- openai -------------------------------------------------------------
const oaHeaders = (extra = {}) => {
  const k = process.env.OPENAI_API_KEY;
  if (!k) { console.error('❌ Set your key first:  export OPENAI_API_KEY=sk-...'); process.exit(1); }
  return { Authorization: 'Bearer ' + k, ...extra };
};
async function transcribe(file) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mp4' }), path.basename(file));
  fd.append('model', TRANSCRIBE_MODEL);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${OPENAI_BASE}/audio/transcriptions`, { method: 'POST', headers: oaHeaders(), body: fd });
    if (r.ok) return ((await r.json()).text || '').trim();
    if (r.status < 500 && r.status !== 429) throw new Error('transcribe failed: ' + r.status + ' ' + (await r.text()));
    await new Promise(res => setTimeout(res, attempt * 2000));
  }
  throw new Error('transcribe failed after retries');
}
async function classify(transcript, spokenTitle) {
  const list = CATEGORIES.map(([k, d]) => `- ${k}: ${d}`).join('\n');
  const body = {
    model: SORT_MODEL, temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `You sort a personal voice memo into exactly one category and describe it.\n\nCategories:\n${list}\n\nReturn JSON only: {"category":"<key>","title":"<4-6 word title>","description":"<1-2 sentence summary in the third person>","keywords":["3-6 short keywords"]}` },
      { role: 'user', content: `Recording title as saved on the phone: ${spokenTitle || '(none)'}\n\nTranscript:\n"""${transcript.slice(0, 12000)}"""` },
    ],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, { method: 'POST', headers: oaHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (r.ok) {
      const j = await r.json();
      try { return JSON.parse(j.choices[0].message.content); } catch { return null; }
    }
    if (r.status < 500 && r.status !== 429) throw new Error('sort failed: ' + r.status + ' ' + (await r.text()));
    await new Promise(res => setTimeout(res, attempt * 2000));
  }
  return null;
}

// ---- main ---------------------------------------------------------------
const keyPath = findKey();
if (!keyPath) {
  console.error('❌ Could not find your Firebase service-account .json.\n   Pass it:  node update-memos.mjs --key /path/to/key.json');
  process.exit(1);
}
sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
console.log('Key:    ' + keyPath);
console.log('Bucket: gs://' + BUCKET + '/' + FOLDER + '/\n');

let tok = await getToken();
const manifestBuf = await get(tok, FOLDER + '/manifest.json');
if (!manifestBuf) { console.error('❌ No manifest.json in the archive — stopping rather than starting a new one.'); process.exit(1); }
const manifest = JSON.parse(manifestBuf.toString());
// Every naming scheme the exporter has used starts with the local wall-clock
// stamp, so that prefix is the join key — ids also carry a UTC stamp after it.
const stampOf = (s) => { const m = /^\d{4}-\d{2}-\d{2}_\d{4}/.exec(String(s || '')); return m ? m[0] : null; };
const known = new Set(manifest.memos.map(m => stampOf(m.id) || stampOf(m.file)).filter(Boolean));
if (known.size < manifest.memos.length * 0.9) {
  console.error(`❌ Only recognised ${known.size} of ${manifest.memos.length} archived ids — refusing to run rather than re-upload the archive.`);
  process.exit(1);
}
const lastDate = manifest.memos.map(m => m.date).filter(Boolean).sort().pop();
console.log(`Archive has ${manifest.memos.length} recordings, newest dated ${lastDate}.`);

const all = readVoiceMemos();
const missing = all.filter(r => !r.downloaded);
const fresh = all.filter(r => r.downloaded && !known.has(localKey(r.when)));
console.log(`Voice Memos app has ${all.length} recordings.`);
console.log(`New since the archive: ${fresh.length}${missing.length ? `   (${missing.length} still in iCloud — see below)` : ''}\n`);

if (missing.length) {
  console.log(`⚠️  ${missing.length} recording(s) are not downloaded to this Mac, so they can't be read:`);
  missing.slice(0, 12).forEach(r => console.log(`     ${localKey(r.when)}  ${r.title}`));
  if (missing.length > 12) console.log(`     …and ${missing.length - 12} more`);
  console.log('   Open Voice Memos, scroll through / play them so they download, then re-run.\n');
}
if (!fresh.length) { console.log('✅ Nothing new — the archive is already up to date.'); process.exit(0); }

const batch = fresh.slice(0, LIMIT);
const willTranscribe = batch.filter(r => r.dur / 60 <= MAX_MIN);
const tooLong = batch.filter(r => r.dur / 60 > MAX_MIN);
const mins = willTranscribe.reduce((a, r) => a + r.dur / 60, 0);
const cost = mins * COST_PER_MIN;
console.log(`To process: ${batch.length} recording(s)`);
console.log(`  transcribing: ${willTranscribe.length}  (${mins.toFixed(0)} minutes,  ≈ $${cost.toFixed(2)})`);
if (tooLong.length) console.log(`  filed "toolong" without transcribing (over ${MAX_MIN} min): ${tooLong.length}`);
batch.slice(0, 20).forEach(r => console.log(`     ${localKey(r.when)}  ${String(Math.round(r.dur / 60)).padStart(3)}min  ${r.title}`));
if (batch.length > 20) console.log(`     …and ${batch.length - 20} more`);

if (DRY) { console.log('\n(dry run — nothing changed)'); process.exit(0); }
if (cost > CONFIRM_OVER && !has('yes')) {
  console.log(`\n⚠️  That's over $${CONFIRM_OVER}. Re-run with --yes to go ahead, or use --limit / --max-minutes to trim it.`);
  process.exit(0);
}

console.log('\nWorking…');
const added = [];
const started = Date.now();
for (const [i, r] of batch.entries()) {
  const id = idFor(r.when);
  const date = localKey(r.when).slice(0, 10);
  try {
    let cat = 'toolong', transcript = null, sort = null;
    if (r.dur / 60 <= MAX_MIN) {
      transcript = await transcribe(r.src);
      if (!transcript || transcript.length < 8) { cat = 'empty'; transcript = null; }
      else { sort = await classify(transcript, r.title); cat = (sort && sort.category) || 'other'; }
    }
    if (Date.now() - started > 45 * 60 * 1000) tok = await getToken();
    await put(tok, FOLDER + '/' + id + '.m4a', fs.readFileSync(r.src), 'audio/mp4');
    added.push({
      id, file: id + '.m4a', date, cat,
      title: (sort && sort.title) || r.title || null,
      desc: (sort && sort.description) || null,
      keywords: (sort && sort.keywords) || [],
      dur: r.dur, transcript: transcript || null,
    });
    console.log(`  ${i + 1}/${batch.length}  ${date}  [${cat}]  ${(sort && sort.title) || r.title}`);
  } catch (e) {
    console.log(`  ${i + 1}/${batch.length}  ${date}  ✕ skipped — ${e.message}`);
  }
}

if (!added.length) { console.log('\nNothing was added.'); process.exit(1); }
manifest.memos.push(...added);
manifest.memos.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
manifest.count = manifest.memos.length;
await put(tok, FOLDER + '/manifest.json', Buffer.from(JSON.stringify(manifest)), 'application/json');

const dreams = added.filter(m => m.cat === 'dream');
console.log(`\n✅ Added ${added.length} recording(s). Archive is now ${manifest.count}.`);
console.log(`   New dreams in this batch: ${dreams.length}`);
dreams.forEach(d => console.log(`     ${d.date}  ${d.title}`));
console.log('\nTell Claude it finished and the dream archive will pick these up.');
