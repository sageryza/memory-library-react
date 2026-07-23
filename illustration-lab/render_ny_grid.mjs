import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad';
const OUT = `${SP}/ny_grid`;
await mkdir(OUT, { recursive: true });
const KEY = process.env.OPENAI_API_KEY;

const jokes = JSON.parse(await readFile('/home/user/memory-library-react/illustration-lab/jokes_candidates.json', 'utf8'));
// 9 funniest/most-visual, by index into jokes_candidates
const pick = [0, 1, 2, 11, 10, 9, 12, 13, 6];
const nine = pick.map((i) => jokes[i].visual || jokes[i].gist);

const cells = nine.map((s, i) => `${i + 1}) ${s}`).join('\n');
const PROMPT =
  'Create ONE sheet: a 3x3 grid of nine separate New Yorker single-panel cartoons, each in its own hand-drawn panel frame. '
  + 'Classic New Yorker style: black-ink line drawing with light grey wash on white. '
  + 'Under each panel, print a witty New Yorker-style caption in small serif italics — YOU write the funniest short caption for each scene (keep captions short so the text stays fully inside the sheet). '
  + 'The nine panels:\n' + cells;

await writeFile(`${OUT}/prompt.txt`, PROMPT);

async function render(id, model, size) {
  for (let a = 1; a <= 4; a++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: PROMPT, size, quality: 'high', n: 1 }),
    });
    if (res.ok) {
      const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
      await sharp(buf).webp({ quality: 94 }).toFile(`${OUT}/${id}.webp`);
      console.log(id, model, 'ok'); return true;
    }
    const t = await res.text(); console.log(id, model, res.status, t.slice(0, 140));
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 10000 * a)); continue; }
    return false;
  }
  return false;
}

// gpt-image-2 preferred; fall back to gpt-image-1.5 then gpt-image-1
const ok = await render('ny_grid_img2', 'gpt-image-2', '1024x1536');
if (!ok) { const ok15 = await render('ny_grid_img15', 'gpt-image-1.5', '1024x1536'); if (!ok15) await render('ny_grid_img1', 'gpt-image-1', '1024x1536'); }
console.log('DONE');
