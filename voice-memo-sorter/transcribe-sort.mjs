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
// Common flags:
//   --in <dir>          Folder of audio files (searched recursively). Required.
//   --out <dir>         Where to write results. Default: ./output
//   --limit <n>         Only process the first N new files (great for a test run).
//   --concurrency <n>   How many files to process at once. Default: 4.
//   --hear-songs        For song-like memos, also run an audio-understanding pass
//                       (gpt-4o-audio) to capture melody / humming / mood. Default ON.
//   --no-hear-songs     Disable the song audio pass (transcripts only).
//   --transcribe-model  Default: gpt-4o-transcribe  (alt: whisper-1)
//   --sort-model        Default: gpt-4o-mini
//   --audio-model       Default: gpt-4o-audio-preview
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
// it knows what each bucket means. "other" is the catch-all; keep it last.
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
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.wav', '.aac', '.mp4', '.aiff', '.aif', '.caf', '.flac', '.ogg', '.opus', '.webm']);
const MAX_API_BYTES = 24 * 1024 * 1024; // OpenAI audio endpoints cap at 25MB; stay under.

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = {
    in: null,
    out: './output',
    limit: Infinity,
    concurrency: 4,
    hearSongs: true,
    transcribeModel: 'gpt-4o-transcribe',
    sortModel: 'gpt-4o-mini',
    audioModel: 'gpt-4o-audio-preview',
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case '--in': a.in = next(); break;
      case '--out': a.out = next(); break;
      case '--limit': a.limit = parseInt(next(), 10); break;
      case '--concurrency': a.concurrency = Math.max(1, parseInt(next(), 10)); break;
      case '--hear-songs': a.hearSongs = true; break;
      case '--no-hear-songs': a.hearSongs = false; break;
      case '--transcribe-model': a.transcribeModel = next(); break;
      case '--sort-model': a.sortModel = next(); break;
      case '--audio-model': a.audioModel = next(); break;
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

function hasFfmpeg() {
  try { return spawnSync('ffmpeg', ['-version']).status === 0; }
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
// OpenAI steps
// ---------------------------------------------------------------------------

// Compress oversized audio to a small mono mp3 so it fits the API limit.
// Returns a path to use for upload (temp file) or the original path.
function ensureUnderLimit(file, sizeBytes, ffmpegAvailable) {
  if (sizeBytes <= MAX_API_BYTES) return { path: file, temp: null };
  if (!ffmpegAvailable) {
    throw new Error(`File is ${(sizeBytes / 1e6).toFixed(1)}MB (over 25MB) and ffmpeg is not installed to compress it. Install ffmpeg (brew install ffmpeg) and re-run.`);
  }
  const tmp = path.join(os.tmpdir(), `vms-${path.basename(file)}.mp3`);
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
          category: { type: 'string', enum: CATEGORY_KEYS },
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
  const catList = CATEGORIES.map((c) => `- ${c.key}: ${c.desc}`).join('\n');
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

// Audio-understanding pass for musical memos: capture melody / mood / humming.
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

  // Full machine-readable dump.
  await fsp.writeFile(path.join(outDir, 'transcripts.json'), JSON.stringify(results, null, 2));

  // Per-category Markdown.
  for (const cat of CATEGORIES) {
    const items = results.filter((r) => r.sort.category === cat.key);
    if (!items.length) continue;
    let md = `# ${cat.label} (${items.length})\n\n${cat.desc}\n\n`;
    for (const r of items) {
      md += `## ${r.sort.title}\n\n`;
      md += `*${path.basename(r.file)} · ${r.recordedAt || 'date unknown'}`;
      if (r.sort.confidence < 0.6) md += ` · ⚠ low confidence (${r.sort.confidence.toFixed(2)})`;
      md += `*\n\n`;
      if (r.sort.tags?.length) md += r.sort.tags.map((t) => `#${t}`).join(' ') + '\n\n';
      if (r.melodyNote) md += `> 🎵 ${r.melodyNote}\n\n`;
      md += `${r.transcript || '_(no speech detected)_'}\n\n---\n\n`;
    }
    await fsp.writeFile(path.join(byCatDir, `${slug(cat.label)}.md`), md);
  }

  // Review file: low-confidence or flagged.
  const review = results.filter((r) => r.sort.needs_review || r.sort.confidence < 0.6);
  let rmd = `# Needs review (${review.length})\n\nThese were ambiguous, empty, garbled, or low-confidence. Check the category by hand.\n\n`;
  for (const r of review) {
    rmd += `- **${r.sort.title}** → _${r.sort.category}_ (conf ${r.sort.confidence.toFixed(2)})  \n`;
    rmd += `  ${path.basename(r.file)}: ${r.sort.summary}\n`;
  }
  await fsp.writeFile(path.join(outDir, 'review.md'), rmd);

  // Index / summary.
  let idx = `# Voice memo sort — summary\n\n`;
  idx += `Total: **${results.length}** recordings\n\n`;
  for (const cat of CATEGORIES) {
    const n = results.filter((r) => r.sort.category === cat.key).length;
    if (n) idx += `- ${cat.label}: ${n}\n`;
  }
  idx += `\n⚠ Needs review: ${review.length} (see review.md)\n`;
  await fsp.writeFile(path.join(outDir, 'index.md'), idx);
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

  const cacheFile = path.join(outDir, '.cache.json');
  const cache = await loadCache(cacheFile);

  // Determine which files still need processing.
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
  const ffmpegAvailable = hasFfmpeg();
  if (!ffmpegAvailable) console.log('Note: ffmpeg not found — files over 25MB will be skipped with an error. Install with `brew install ffmpeg` to auto-compress them.');

  let done = 0;
  const failures = [];
  await pool(todo, args.concurrency, async (w) => {
    const name = path.basename(w.file);
    try {
      const { path: upPath, temp } = ensureUnderLimit(w.file, w.stat.size, ffmpegAvailable);
      let transcript;
      try { transcript = await transcribe(openai, args.transcribeModel, upPath); }
      finally { if (temp) { try { await fsp.unlink(temp); } catch { /* ignore */ } } }

      const sort = await sortTranscript(openai, args.sortModel, transcript);

      let melodyNote = null;
      if (args.hearSongs && (sort.is_musical || sort.category === 'song')) {
        try { melodyNote = await hearMusic(openai, args.audioModel, w.file, w.stat.size, ffmpegAvailable); }
        catch (e) { console.warn(`  ⚠ music pass failed for ${name}: ${e.message}`); }
      }

      const result = { file: w.file, recordedAt: w.recordedAt, transcript, sort, melodyNote };
      cache[w.key] = result;
      await fsp.writeFile(cacheFile, JSON.stringify(cache, null, 2)); // persist incrementally
      done++;
      console.log(`  ✓ [${done}/${todo.length}] ${name} → ${sort.category}${melodyNote ? ' 🎵' : ''}`);
    } catch (e) {
      failures.push({ file: w.file, error: e.message });
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  });

  // Build outputs from the full cache (everything ever processed).
  const allResults = Object.values(cache).sort((a, b) => (a.recordedAt || '').localeCompare(b.recordedAt || ''));
  await writeOutputs(outDir, allResults);

  console.log(`\nDone. ${done} processed this run, ${failures.length} failed.`);
  if (failures.length) console.log('Failed files are not cached — re-run to retry them.');
  console.log(`Output written to: ${outDir}`);
  console.log(`  • index.md         — summary + counts`);
  console.log(`  • by-category/*.md — readable, grouped by category`);
  console.log(`  • review.md        — low-confidence ones to eyeball`);
  console.log(`  • transcripts.json — full data`);
}

main().catch((e) => { console.error(e); process.exit(1); });
