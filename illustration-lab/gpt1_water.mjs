import { createRequire } from 'module';
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const REFS = '/home/user/memory-library-react/functions/miracle-refs';
const KEY = process.env.OPENAI_API_KEY;
const CONCEPT = 'a glass of water with a small halo floating above it';
const PROMPT = 'A single small object drawn as a simple doodle / icon, centered with lots of empty space — like a quick diagram, NOT a scene, on a plain uncluttered background like the reference paper. Loose, imperfect, hand-drawn with a thin black ballpoint pen, wobbly uneven lines, childlike and minimal, like the reference images. No shading, no solid black fills, no color, NO people, NO hands. Draw: ' + CONCEPT + ". Do NOT write the object's name or any caption/title anywhere. Only include words if they are literally part of the idea; otherwise no text at all.";
const files = (await readdir(REFS)).filter(f => /\.(webp|png)$/i.test(f)).sort();
const form = new FormData();
form.append('model', 'gpt-image-1'); form.append('prompt', PROMPT);
form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('input_fidelity', 'high'); form.append('n', '1');
for (const f of files) form.append('image[]', new Blob([await readFile(join(REFS, f))], { type: 'image/webp' }), f);
const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
if (!r.ok) { console.log('FAIL', r.status); process.exit(1); }
const buf = Buffer.from((await r.json()).data[0].b64_json, 'base64');
await sharp(buf).png().toFile('/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/modelab/gpt1-water.png');
console.log('gpt1 water OK');
