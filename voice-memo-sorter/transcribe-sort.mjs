#!/usr/bin/env node
// voice-memo-sorter — transcribe a folder of voice memos with OpenAI and
// auto-sort each one into a category (ideas / dreams / songs / ...).
//
// This is a STANDALONE tool. It does not touch the memory library or Firebase.
// It reads audio files and writes plain output files (JSON + Markdown) you keep
// wherever you like.
//
// Usage:
//   OPENAI_API_KEY=sk-... node transcribe-sort.mjs --in ~/VoiceMemos --out ./output
//
// Recommended first pass — FREE local scan (needs ffmpeg, calls no API):
//   node transcribe-sort.mjs --in ~/VoiceMemos --out ./output --scan
//   Reports each file's length and how many seconds of actual SOUND it has, so
//   you can see the "left on while sleeping" empties before paying to transcribe.
//
// Common flags:
//   --in <dir>          Folder of audio files (searched recursively). Required.
//   --out <dir>         Where to write results. Default: ./output
//   --scan              FREE: analyze silence only, write a report, call no API.
//   --limit <n>         Only process the first N new files (great for a test run).
//   --concurrency <n>   How many files to process at once. Default: 4.
//   --min-speech <sec>  Skip files with less than this many seconds of sound
//                       (the empty/sleep recordings). Default: 2.
//   --max-minutes <n>   Skip files longer than n minutes — set them aside under
//                       "Too long — review manually" (kept in order, not
//                       transcribed). Default: no cap. Try 30 or 60.
//   --no-trim           Don't strip silence before transcribing. By default, when
//                       ffmpeg is present, silence is trimmed so a 6-hour mostly-
//                       empty file only costs the few seconds of real speech.
//   --hear-songs        For song-like memos, also run an audio-understanding pass
//                       (gpt-4o-audio) to capture melody / humming / mood. Default ON.
//   --no-hear-songs     Disable the song audio pass (transcripts only).
//   --transcribe-model  Default: gpt-4o-transcribe  (alt: whisper-1)
//   --sort-model        Default: gpt-4o-mini
//   --audio-model       Default: gpt-4o-audio-preview
//   --noise-db <dB>     Silence threshold. Default: -30 (lower = stricter).
//   --dry-run           List what would be processed; call no APIs.
//
// Resumable: results are cached per file in <out>/.cache.json keyed by path+size+mtime,
// so re-running skips work already done. Safe to Ctrl-C and resume.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Categories. Edit this list to taste — descriptions are sent to the sorter so
// it knows what each bucket means. "other" is the catch-all. "empty" is assigned
// locally (never by the AI) to silent recordings.
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { key: 'idea',    label: 'Ideas',    desc: 'A thought, plan, insight, brainstorm, or thing to make/try.' },
  { key: 'dream',   label: 'Dreams',   desc: 'A recollection of a dream from sleep — surreal, narrated as something that happened while asleep.' },
  { key: 'song',    label: 'Songs',    desc: 'Singing, humming, a melody, lyrics, or a musical sketch — anything where the audio is musical.' },
  { key: 'todo',    label: 'To-dos',   desc: 'A task, reminder, errand, or something to do.' },
  { key: 'journal', label: 'Journal',  desc: 'A personal reflection, feeling, or account of the day / what is going on.' },
  { key: 'quote',   label: 'Quotes',   desc: 'A quote, line, or fragment worth remembering — overheard or recited.' },
  { key: 'note',    label: 'Notes',    desc: 'A factual note, piece of info, name, number, or reference.' },
  { key: 'other',   label: 'Other',    desc: 'Does not clearly fit any category above.' },
  { key: 'empty',   label: 'Empty / silent', desc: 'No real speech — silent or near-silent recording (e.g. left running by accident).' },
  { key: 'toolong', label: 'Too long — review manually', desc: 'Longer than the --max-minutes cutoff; set aside (not transcribed) for you to review by hand.' },
];
// The AI only ever picks from these ("empty"/"toolong" are decided locally).
const LOCAL_ONLY = new Set(['empty', 'toolong']);
const SORT_CATEGORIES = CATEGORIES.filter((c) => !LOCAL_ONLY.has(c.key));
const SORT_KEYS = SORT_CATEGORIES.map((c) => c.key);

const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.wav', '.aac', '.mp4', '.aiff', '.aif', '.caf', '.flac', '.ogg', '.opus', '.webm']);
const MAX_API_BYTES = 24 * 1024 * 1024; // OpenAI audio endpoints cap at 25MB; stay under.

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = {
    in: null,
    out: './output',
    scan: false,
    limit: Infinity,
    concurrency: 4,
    minSpeech: 2,
    maxMinutes: Infinity,
    trim: true,
    hearSongs: true,
    transcribeModel: 'gpt-4o-transcribe',
    sortModel: 'gpt-4o-mini',
    audioModel: 'gpt-4o-audio-preview',
    noiseDb: -30,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case '--in': a.in = next(); break;
      case '--out': a.out = next(); break;
      case '--scan': a.scan = true; break;
      case '--limit': a.limit = parseInt(next(), 10); break;
      case '--concurrency': a.concurrency = Math.max(1, parseInt(next(), 10)); break;
      case '--min-speech': a.minSpeech = parseFloat(next()); break;
      case '--max-minutes': a.maxMinutes = parseFloat(next()); break;
      case '--no-trim': a.trim = false; break;
      case '--hear-songs': a.hearSongs = true; break;
      case '--no-hear-songs': a.hearSongs = false; break;
      case '--transcribe-model': a.transcribeModel = next(); break;
      case '--sort-model': a.sortModel = next(); break;
      case '--audio-model': a.audioModel = next(); break;
      case '--noise-db': a.noiseDb = parseFloat(next()); break;
      case '--dry-run': a.dryRun = true; break;
      case '--help': case '-h': printHelp(); process.exit(0); break;
      default: console.error(`Unknown flag: ${t}`); printHelp(); process.exit(1);
    }
  }
  return a;
}

function printHelp() {
  const lines = fs.readFileSync(new URL(import.meta.url)).toString().split('\n');
  // Print the leading comment block as help (skipping the shebang line).
  let started = false;
  for (const l of lines) {
    if (l.startsWith('#!')) continue;
    if (l.startsWith('//')) { started = true; console.log(l.replace(/^\/\/ ?/, '')); }
    else if (started) break;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

async function withRetry(fn, { tries = 4, base = 2000, label = 'op' } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const status = e?.status || e?.response?.status;
      const code = e?.code || e?.error?.code || e?.response?.data?.error?.code;
      // Out of credits/quota is a 429 that retrying will never fix — fail fast.
      if (code === 'insufficient_quota') {
        throw new Error('OpenAI returned insufficient_quota — the account is out of credits or over its quota. Add credits / check billing at https://platform.openai.com/account/billing, then re-run.');
      }
      // Don't retry obvious client errors except rate limits.
      if (status && status !== 429 && status >= 400 && status < 500) throw e;
      const wait = base * 2 ** i;
      console.warn(`  ⚠ ${label} failed (attempt ${i + 1}/${tries}): ${e.message}. Retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function hasBin(bin) {
  try { return spawnSync(bin, ['-version']).status === 0; }
  catch { return false; }
}

// Walk a directory recursively for audio files.
async function findAudio(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      if (AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  await walk(dir);
  out.sort();
  return out;
}

function cacheKey(file, stat) {
  return `${file}|${stat.size}|${Math.round(stat.mtimeMs)}`;
}

async function loadCache(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch { return {}; }
}

// ---------------------------------------------------------------------------
// ffmpeg: silence analysis + trimming (all local, free)
// ---------------------------------------------------------------------------
function ffprobeDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat((r.stdout || '').trim()) || 0;
}

// Returns { duration, silenceSec, speechSec } for a file. speechSec is how many
// seconds of actual sound there is (above the noise threshold).
function analyzeAudio(file, noiseDb, minSilence = 2) {
  const duration = ffprobeDuration(file);
  const r = spawnSync('ffmpeg', ['-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${minSilence}`, '-f', 'null', '-'], { encoding: 'utf8' });
  const log = (r.stderr || '') + (r.stdout || '');
  let silence = 0;
  for (const m of log.matchAll(/silence_duration:\s*([0-9.]+)/g)) silence += parseFloat(m[1]);
  const speechSec = Math.max(0, duration - silence);
  return { duration, silenceSec: silence, speechSec };
}

// Strip leading/internal/trailing silence into a small temp file. Returns its
// path, or null on failure.
let tmpCounter = 0;
function trimSilence(file, noiseDb) {
  const tmp = path.join(os.tmpdir(), `vms-trim-${process.pid}-${tmpCounter++}-${path.basename(file)}.m4a`);
  const filt = `silenceremove=start_periods=1:start_duration=0:start_threshold=${noiseDb}dB:stop_periods=-1:stop_duration=0.5:stop_threshold=${noiseDb}dB:detection=peak`;
  const r = spawnSync('ffmpeg', ['-y', '-i', file, '-af', filt, '-ac', '1', '-ar', '16000', tmp], { stdio: 'ignore' });
  if (r.status !== 0 || !fs.existsSync(tmp)) return null;
  return tmp;
}

// ---------------------------------------------------------------------------
// OpenAI steps
// ---------------------------------------------------------------------------
function ensureUnderLimit(file, sizeBytes, ffmpegAvailable) {
  if (sizeBytes <= MAX_API_BYTES) return { path: file, temp: null };
  if (!ffmpegAvailable) {
    throw new Error(`File is ${(sizeBytes / 1e6).toFixed(1)}MB (over 25MB) and ffmpeg is not installed to compress it. Install ffmpeg (brew install ffmpeg) and re-run.`);
  }
  const tmp = path.join(os.tmpdir(), `vms-${process.pid}-${tmpCounter++}-${path.basename(file)}.mp3`);
  const r = spawnSync('ffmpeg', ['-y', '-i', file, '-ac', '1', '-ar', '16000', '-b:a', '32k', tmp], { stdio: 'ignore' });
  if (r.status !== 0) throw new Error(`ffmpeg failed to compress ${file}`);
  return { path: tmp, temp: tmp };
}

async function transcribe(openai, model, filePath) {
  const res = await withRetry(
    () => openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model,
    }),
    { label: 'transcribe' },
  );
  return (res.text || '').trim();
}

function buildSortSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'sorted_memo',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: SORT_KEYS },
          title: { type: 'string', description: 'A short 3-8 word title.' },
          summary: { type: 'string', description: 'One sentence summary.' },
          tags: { type: 'array', items: { type: 'string' }, description: '2-5 lowercase keyword tags, no # symbol.' },
          confidence: { type: 'number', description: '0 to 1 — how sure you are about the category.' },
          is_musical: { type: 'boolean', description: 'True if the recording is or contains singing/humming/melody.' },
          needs_review: { type: 'boolean', description: 'True if ambiguous, empty, garbled, or you are unsure.' },
        },
        required: ['category', 'title', 'summary', 'tags', 'confidence', 'is_musical', 'needs_review'],
      },
    },
  };
}

async function sortTranscript(openai, model, transcript) {
  if (!transcript) {
    return { category: 'other', title: 'Empty / inaudible', summary: 'No speech detected.', tags: [], confidence: 0, is_musical: false, needs_review: true };
  }
  const catList = SORT_CATEGORIES.map((c) => `- ${c.key}: ${c.desc}`).join('\n');
  const res = await withRetry(
    () => openai.chat.completions.create({
      model,
      response_format: buildSortSchema(),
      messages: [
        { role: 'system', content: `You sort a person's voice-memo transcripts into one category. Categories:\n${catList}\n\nPick the single best category. Be honest with confidence — set needs_review=true when ambiguous, empty, or garbled.` },
        { role: 'user', content: `Transcript:\n"""\n${transcript.slice(0, 6000)}\n"""` },
      ],
    }),
    { label: 'sort' },
  );
  return JSON.parse(res.choices[0].message.content);
}

async function hearMusic(openai, model, filePath, sizeBytes, ffmpegAvailable) {
  let useFile = filePath, temp = null;
  try {
    ({ path: useFile, temp } = ensureUnderLimit(filePath, sizeBytes, ffmpegAvailable));
    const b64 = (await fsp.readFile(useFile)).toString('base64');
    const fmt = path.extname(useFile).toLowerCase() === '.wav' ? 'wav' : 'mp3';
    const res = await withRetry(
      () => openai.chat.completions.create({
        model,
        modalities: ['text'],
        messages: [
          { role: 'system', content: 'You listen to a short musical voice memo and describe the MUSIC in 1-2 sentences: melody/mood/tempo, whether hummed or sung, and any catchable hook. Do not transcribe lyrics verbatim — describe the sound.' },
          { role: 'user', content: [
            { type: 'text', text: 'Describe the music in this memo.' },
            { type: 'input_audio', input_audio: { data: b64, format: fmt } },
          ] },
        ],
      }),
      { label: 'hear-music', tries: 3 },
    );
    return (res.choices[0].message.content || '').trim();
  } finally {
    if (temp) { try { await fsp.unlink(temp); } catch { /* ignore */ } }
  }
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

async function writeOutputs(outDir, results) {
  const byCatDir = path.join(outDir, 'by-category');
  await fsp.mkdir(byCatDir, { recursive: true });

  await fsp.writeFile(path.join(outDir, 'transcripts.json'), JSON.stringify(results, null, 2));

  for (const cat of CATEGORIES) {
    const items = results.filter((r) => r.sort.category === cat.key);
    if (!items.length) continue;
    let md = `# ${cat.label} (${items.length})\n\n${cat.desc}\n\n`;
    for (const r of items) {
      md += `## ${r.sort.title}\n\n`;
      md += `*${path.basename(r.file)} · ${r.recordedAt || 'date unknown'}`;
      if (r.analysis) md += ` · ${fmtDur(r.analysis.duration)} long`;
      if (r.sort.confidence < 0.6 && cat.key !== 'empty') md += ` · ⚠ low confidence (${r.sort.confidence.toFixed(2)})`;
      md += `*\n\n`;
      if (r.sort.tags?.length) md += r.sort.tags.map((t) => `#${t}`).join(' ') + '\n\n';
      if (r.melodyNote) md += `> 🎵 ${r.melodyNote}\n\n`;
      md += `${r.transcript || '_(no speech detected)_'}\n\n---\n\n`;
    }
    await fsp.writeFile(path.join(byCatDir, `${slug(cat.label)}.md`), md);
  }

  const review = results.filter((r) => (r.sort.needs_review || r.sort.confidence < 0.6) && r.sort.category !== 'empty');
  let rmd = `# Needs review (${review.length})\n\nThese were ambiguous, garbled, or low-confidence. Check the category by hand.\n\n`;
  for (const r of review) {
    rmd += `- **${r.sort.title}** → _${r.sort.category}_ (conf ${r.sort.confidence.toFixed(2)})  \n`;
    rmd += `  ${path.basename(r.file)}: ${r.sort.summary}\n`;
  }
  await fsp.writeFile(path.join(outDir, 'review.md'), rmd);

  let idx = `# Voice memo sort — summary\n\n`;
  idx += `Total: **${results.length}** recordings\n\n`;
  for (const cat of CATEGORIES) {
    const n = results.filter((r) => r.sort.category === cat.key).length;
    if (n) idx += `- ${cat.label}: ${n}\n`;
  }
  idx += `\n⚠ Needs review: ${review.length} (see review.md)\n`;
  await fsp.writeFile(path.join(outDir, 'index.md'), idx);
}

// Scan-only report — no API, just ffmpeg silence analysis.
async function writeScanReport(outDir, rows, costPerMin) {
  await fsp.mkdir(outDir, { recursive: true });
  await fsp.writeFile(path.join(outDir, 'scan.json'), JSON.stringify(rows, null, 2));

  const empties = rows.filter((r) => r.speechSec < 2);
  const totalAudioMin = rows.reduce((s, r) => s + r.duration, 0) / 60;
  const speechMin = rows.reduce((s, r) => s + r.speechSec, 0) / 60;

  let md = `# Scan report (FREE — no transcription yet)\n\n`;
  md += `Scanned **${rows.length}** files.\n\n`;
  md += `- Total audio length: **${fmtDur(totalAudioMin * 60)}**\n`;
  md += `- Actual speech/sound: **${fmtDur(speechMin * 60)}**\n`;
  md += `- Likely empty/silent (under 2s of sound): **${empties.length}**\n\n`;
  md += `### Cost estimate\n`;
  md += `- Transcribing everything as-is: ~$${(totalAudioMin * costPerMin).toFixed(2)}\n`;
  md += `- Transcribing only the real sound (skip empties + trim silence): ~$${(speechMin * costPerMin).toFixed(2)}\n\n`;
  md += `### Likely-empty recordings (would be skipped)\n\n`;
  for (const r of empties.sort((a, b) => b.duration - a.duration)) {
    md += `- ${path.basename(r.file)} — ${fmtDur(r.duration)} long, only ${r.speechSec.toFixed(1)}s of sound\n`;
  }
  md += `\n### Longest recordings\n\n`;
  for (const r of [...rows].sort((a, b) => b.duration - a.duration).slice(0, 25)) {
    md += `- ${path.basename(r.file)} — ${fmtDur(r.duration)} long, ${fmtDur(r.speechSec)} sound (${((r.speechSec / (r.duration || 1)) * 100).toFixed(0)}%)\n`;
  }
  await fsp.writeFile(path.join(outDir, 'scan.md'), md);
  return { empties: empties.length, totalAudioMin, speechMin };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  if (!args.in) { console.error('Error: --in <folder> is required.\n'); printHelp(); process.exit(1); }

  const inDir = path.resolve(args.in.replace(/^~/, os.homedir()));
  const outDir = path.resolve(args.out.replace(/^~/, os.homedir()));
  await fsp.mkdir(outDir, { recursive: true });

  const files = await findAudio(inDir);
  console.log(`Found ${files.length} audio file(s) in ${inDir}`);
  if (!files.length) process.exit(0);

  const ffmpegAvailable = hasBin('ffmpeg') && hasBin('ffprobe');
  const COST_PER_MIN = 0.006; // gpt-4o-transcribe ballpark, for estimates only.

  // -------- SCAN MODE: free, no API --------
  if (args.scan) {
    if (!ffmpegAvailable) { console.error('Scan needs ffmpeg + ffprobe. Install with: brew install ffmpeg'); process.exit(1); }
    console.log('Scanning for silence (free, no API calls)…');
    let done = 0;
    const rows = await pool(files, Math.max(args.concurrency, 6), async (file) => {
      const a = analyzeAudio(file, args.noiseDb);
      done++;
      if (done % 25 === 0) console.log(`  scanned ${done}/${files.length}…`);
      return { file, ...a };
    });
    const sum = await writeScanReport(outDir, rows, COST_PER_MIN);
    console.log(`\nScan done. ${sum.empties} likely-empty of ${rows.length}.`);
    console.log(`Total audio ${fmtDur(sum.totalAudioMin * 60)} · real sound ${fmtDur(sum.speechMin * 60)}.`);
    console.log(`Est. cost: ~$${(sum.totalAudioMin * COST_PER_MIN).toFixed(2)} as-is vs ~$${(sum.speechMin * COST_PER_MIN).toFixed(2)} skipping/trimming silence.`);
    console.log(`See ${path.join(outDir, 'scan.md')}`);
    return;
  }

  const cacheFile = path.join(outDir, '.cache.json');
  const cache = await loadCache(cacheFile);

  const work = [];
  for (const file of files) {
    const stat = await fsp.stat(file);
    const key = cacheKey(file, stat);
    if (cache[key]) continue;
    work.push({ file, stat, key, recordedAt: stat.mtime.toISOString().slice(0, 10) });
  }
  const todo = work.slice(0, args.limit);
  console.log(`${Object.keys(cache).length} already cached · ${work.length} new · processing ${todo.length} this run.`);

  if (args.dryRun) {
    for (const w of todo) console.log(`  would process: ${w.file}`);
    console.log('\nDry run — no API calls made.');
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set in the environment.');
    process.exit(1);
  }
  const openai = new OpenAI();
  if (!ffmpegAvailable) console.log('Note: ffmpeg not found — empty-skip, silence-trim, and >25MB compression are disabled. Install with `brew install ffmpeg`.');
  const doTrim = args.trim && ffmpegAvailable;

  let done = 0, skipped = 0, skippedLong = 0;
  const failures = [];
  await pool(todo, args.concurrency, async (w) => {
    const name = path.basename(w.file);
    try {
      // 1. Local silence analysis (free) — skip the empties before paying.
      let analysis = null;
      if (ffmpegAvailable) {
        analysis = analyzeAudio(w.file, args.noiseDb);
        if (analysis.speechSec < args.minSpeech) {
          const result = {
            file: w.file, recordedAt: w.recordedAt, transcript: '', analysis, skipped: 'empty',
            sort: { category: 'empty', title: '(no speech — silent recording)', summary: `Mostly silent: only ${analysis.speechSec.toFixed(1)}s of sound in ${fmtDur(analysis.duration)}.`, tags: [], confidence: 1, is_musical: false, needs_review: false },
          };
          cache[w.key] = result;
          await fsp.writeFile(cacheFile, JSON.stringify(cache, null, 2));
          skipped++;
          console.log(`  ○ skipped (empty): ${name} — ${fmtDur(analysis.duration)}, ${analysis.speechSec.toFixed(1)}s sound`);
          return;
        }
        if (analysis.duration / 60 > args.maxMinutes) {
          const result = {
            file: w.file, recordedAt: w.recordedAt, transcript: '', analysis, skipped: 'toolong',
            sort: { category: 'toolong', title: `(too long — ${fmtDur(analysis.duration)}, review by hand)`, summary: `Over the ${args.maxMinutes}-min cutoff (${fmtDur(analysis.duration)}); set aside for manual review.`, tags: [], confidence: 1, is_musical: false, needs_review: false },
          };
          cache[w.key] = result;
          await fsp.writeFile(cacheFile, JSON.stringify(cache, null, 2));
          skippedLong++;
          console.log(`  ○ skipped (too long): ${name} — ${fmtDur(analysis.duration)}`);
          return;
        }
      }

      // 2. Optionally trim silence so long sparse files only cost their speech.
      let srcPath = w.file, trimTemp = null;
      if (doTrim && analysis && analysis.silenceSec > 5) {
        const t = trimSilence(w.file, args.noiseDb);
        if (t) { srcPath = t; trimTemp = t; }
      }

      // 3. Handle the 25MB cap (compress if needed), then transcribe.
      let transcript;
      const { path: upPath, temp: sizeTemp } = ensureUnderLimit(srcPath, fs.statSync(srcPath).size, ffmpegAvailable);
      try { transcript = await transcribe(openai, args.transcribeModel, upPath); }
      finally {
        if (sizeTemp) { try { await fsp.unlink(sizeTemp); } catch { /* ignore */ } }
        if (trimTemp) { try { await fsp.unlink(trimTemp); } catch { /* ignore */ } }
      }

      // 4. Sort.
      const sort = await sortTranscript(openai, args.sortModel, transcript);

      // 5. Song "listen" pass (uses the original untrimmed file).
      let melodyNote = null;
      if (args.hearSongs && (sort.is_musical || sort.category === 'song')) {
        try { melodyNote = await hearMusic(openai, args.audioModel, w.file, w.stat.size, ffmpegAvailable); }
        catch (e) { console.warn(`  ⚠ music pass failed for ${name}: ${e.message}`); }
      }

      const result = { file: w.file, recordedAt: w.recordedAt, transcript, sort, melodyNote, analysis };
      cache[w.key] = result;
      await fsp.writeFile(cacheFile, JSON.stringify(cache, null, 2));
      done++;
      console.log(`  ✓ [${done}/${todo.length}] ${name} → ${sort.category}${melodyNote ? ' 🎵' : ''}`);
    } catch (e) {
      failures.push({ file: w.file, error: e.message });
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  });

  const allResults = Object.values(cache).sort((a, b) => (a.recordedAt || '').localeCompare(b.recordedAt || ''));
  await writeOutputs(outDir, allResults);

  console.log(`\nDone. ${done} transcribed, ${skipped} skipped as empty, ${skippedLong} skipped as too-long, ${failures.length} failed.`);
  if (failures.length) console.log('Failed files are not cached — re-run to retry them.');
  console.log(`Output written to: ${outDir}`);
  console.log(`  • index.md         — summary + counts`);
  console.log(`  • by-category/*.md — readable, grouped by category`);
  console.log(`  • review.md        — low-confidence ones to eyeball`);
  console.log(`  • transcripts.json — full data`);
}

main().catch((e) => { console.error(e); process.exit(1); });
