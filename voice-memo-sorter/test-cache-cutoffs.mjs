// Offline test: a cached "empty" / "too long" skip must not outlive the cutoff
// that caused it. Makes no API calls and needs no key — it drives the real
// script in --dry-run and reads the line it prints about what it would process.
//
//   node test-cache-cutoffs.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'transcribe-sort.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vms-cache-'));
const inDir = path.join(root, 'in');
const outDir = path.join(root, 'out');
fs.mkdirSync(inDir); fs.mkdirSync(outDir);

// Two files the last run skipped locally: a 40-minute one and a silent one.
const long = path.join(inDir, 'long.m4a');
const quiet = path.join(inDir, 'quiet.m4a');
fs.writeFileSync(long, 'x'); fs.writeFileSync(quiet, 'x');

const key = (f) => {
  const s = fs.statSync(f);
  return `${f}|${s.size}|${Math.round(s.mtimeMs)}`;
};
fs.writeFileSync(path.join(outDir, '.cache.json'), JSON.stringify({
  [key(long)]: { file: long, skipped: 'toolong', analysis: { duration: 2400, speechSec: 1800 } },
  [key(quiet)]: { file: quiet, skipped: 'empty', analysis: { duration: 60, speechSec: 0.5 } },
}, null, 2));

const wouldProcess = (flags) => {
  const r = spawnSync('node', [script, '--in', inDir, '--out', outDir, '--dry-run', ...flags], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`exit ${r.status}\n${r.stderr}`);
  return (r.stdout.match(/would process: (.+)/g) || []).map((l) => path.basename(l.split(': ')[1]));
};

let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got.sort()) === JSON.stringify(want.sort());
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${JSON.stringify(got)} · want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

check('cutoffs unchanged — both stay skipped',
  wouldProcess(['--max-minutes', '30']), []);
check('cutoff still below the file — stays skipped',
  wouldProcess(['--max-minutes', '35']), []);
check('cutoff raised past it — the long one comes back',
  wouldProcess(['--max-minutes', '60']), ['long.m4a']);
check('cutoff dropped entirely — the long one comes back',
  wouldProcess([]), ['long.m4a']);
check('--min-speech lowered — the silent one comes back too',
  wouldProcess(['--min-speech', '0.1']), ['long.m4a', 'quiet.m4a']);

fs.rmSync(root, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
