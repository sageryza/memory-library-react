// Strict recognizability scoring over the final training pool: label + 1-5
// score per drawing. 5 = instantly recognizable, 4 = clearly recognizable,
// 3 = guessable/ambiguous, 2 = mostly marks, 1 = unrecognizable.
import { createRequire } from 'module';
const req = createRequire('/home/user/memory-library-react/functions/');
const sharp = req('sharp');
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const W = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/batch1';
const IN = `${W}/erased_curated/train`;
const EXCLUDE = new Set(JSON.parse(await readFile(`${W}/dedup_exclude.json`, 'utf8')));
const KEY = process.env.OPENAI_API_KEY;

const SYS = 'You judge hand-drawn doodles for a training set. Reply with ONLY compact JSON '
  + '{"label":"<2-6 word noun phrase>","score":N}. score: 5 = anyone would instantly '
  + 'recognize the subject; 4 = clearly recognizable; 3 = guessable but ambiguous; '
  + '2 = mostly abstract marks; 1 = unrecognizable. Be strict: if you are not sure what '
  + 'it depicts, score 2 or lower. Judge subject clarity only, not drawing quality.';

const files = (await readdir(IN)).filter(f => /\.png$/i.test(f) && !EXCLUDE.has(f)).sort();
console.log('scoring', files.length);

async function score(f) {
  const b = await sharp(join(IN, f)).flatten({ background: '#fff' }).resize(512, 512, { fit: 'inside' }).png().toBuffer();
  const body = { model: 'gpt-4o-mini', temperature: 0, max_tokens: 60, messages: [
    { role: 'system', content: SYS },
    { role: 'user', content: [
      { type: 'text', text: 'Label and score this doodle.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b.toString('base64')}` } },
    ] },
  ] };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('' + r.status);
  const txt = (await r.json()).choices?.[0]?.message?.content || '';
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

const out = {}; let done = 0, fail = 0; let idx = 0; const CONC = 8;
async function worker() {
  while (idx < files.length) {
    const f = files[idx++];
    try { out[f] = await score(f); } catch { fail++; out[f] = null; }
    if (++done % 50 === 0) console.log(`  ${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
await writeFile(`${W}/recognize.json`, JSON.stringify(out, null, 2));
const scores = Object.values(out).filter(Boolean).map(v => v.score);
const dist = {}; for (const s of scores) dist[s] = (dist[s] || 0) + 1;
console.log('DONE. distribution:', JSON.stringify(dist), '| failed:', fail);
console.log('picks (>=4):', scores.filter(s => s >= 4).length);
