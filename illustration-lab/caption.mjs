// Vision-caption the training candidates. For each doodle: a short content
// phrase, or 'UNCLEAR' if it's unrecognizable scribble / mostly text. Writes
// captions.json. Style-LoRA best practice: caption CONTENT only; the trigger
// word carries the style.
import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const inDir = process.argv[2];
const outJson = process.argv[3];
const KEY = process.env.OPENAI_API_KEY;
const files = (await readdir(inDir)).filter(f => /\.(png|webp|jpe?g)$/i.test(f)).sort();

const SYS = 'You label hand-drawn doodles for an image dataset. Reply with ONLY a short '
  + 'noun phrase (3 to 8 words) naming what the drawing depicts, lowercase, no period. '
  + 'If the image is an unrecognizable scribble, blank, or almost entirely handwritten '
  + 'words, reply with exactly: UNCLEAR';

async function cap(file) {
  const buf = await sharp(join(inDir, file)).flatten({ background: '#fff' })
    .resize(512, 512, { fit: 'inside' }).png().toBuffer();
  const b64 = buf.toString('base64');
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: [
        { type: 'text', text: 'What does this doodle depict?' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ] },
    ],
    max_tokens: 30, temperature: 0,
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
}

// simple concurrency pool
const out = {}; let done = 0, unclear = 0, failed = 0;
const CONC = 8;
let idx = 0;
async function worker() {
  while (idx < files.length) {
    const f = files[idx++];
    try {
      const c = await cap(f);
      out[f] = c;
      if (/^unclear$/i.test(c)) unclear++;
    } catch (e) { out[f] = null; failed++; }
    if (++done % 25 === 0) console.log(`  ${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
await writeFile(outJson, JSON.stringify(out, null, 2));
const good = Object.values(out).filter(v => v && !/^unclear$/i.test(v)).length;
console.log(`captioned ${files.length} | usable ${good} | unclear ${unclear} | failed ${failed}`);
console.log('json ->', outJson);
