import fs from 'node:fs';
const KEY = process.env.OPENAI_API_KEY;
const fd = new FormData();
fd.append('model', 'gpt-image-2');
fd.append('image[]', new Blob([fs.readFileSync('/tmp/claude-0/-home-user/0ce3c286-e0d7-560a-a987-94d9c461a814/scratchpad/category-icons-medium.png')], { type: 'image/png' }), 'style.png');
fd.append('prompt', `One single card in exactly the same hand-drawn pastel cottagecore style as the reference grid: a white rounded-square card with a thin dark rounded-rectangle border, containing a cozy illustration and a hand-lettered ALL-CAPS spaced label beneath it, inside the border. The illustration: the little pastel purple ukulele from the reference leaning against the mint-green retro record player with a spinning vinyl, a few floating music notes. The label reads exactly "SONGS". Same soft palette (lavender, mint, blush, buttery yellow), same line weight, plain white background around the card, the card centered with generous white margin.`);
fd.append('size', '1024x1024');
fd.append('quality', 'medium');
fd.append('n', '1');
const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd });
if (!res.ok) { console.error('ERROR', res.status, (await res.text()).slice(0, 400)); process.exit(1); }
fs.writeFileSync(process.argv[2], Buffer.from((await res.json()).data[0].b64_json, 'base64'));
console.log('wrote songs tile');
