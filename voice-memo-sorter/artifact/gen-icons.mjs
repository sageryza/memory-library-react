import fs from 'node:fs';

const KEY = process.env.OPENAI_API_KEY;
const UP = '/root/.claude/uploads/0ce3c286-e0d7-560a-a987-94d9c461a814/';
const refs = [
  '3e8dd801-1BF6866A88EC4880BBEFD8DE88557885.png',
  '6bf450b1-9B1ADCB0CD9C453D8E9923E25D7E812B.png',
  '0f84492e-8D36DFCCDB94463B88CB01B2E355EFF7.png',
  '1dac51fc-CD5B995598614FE7B8361615832E0F28.png',
  '1c69d6f9-067AFEBBE27D4F509AFAF5C99B15DE47.png',
];

const prompt = `A neat grid of 10 cozy, hand-drawn illustrated category icons in the exact soft pastel cottagecore style of the reference images: gentle watercolor coloring, clean dark outlines, whimsical storybook feel. Each icon is a single cozy object or little vignette, centered on its own white rounded-square card, with a simple hand-lettered ALL-CAPS spaced label beneath it. Soft pastel palette (lavender, mint, periwinkle, blush pink, buttery yellow). Arrange 3 icons per row on a plain white background, lots of white space.

The 10 cards, in order:
1. A little pastel ukulele leaning on a cushion with tiny music notes floating up — label "ORIGINAL SONGS".
2. A cute retro record player with a vinyl record spinning and a small flower — label "COVERS".
3. A sleeping kitten curled under a star-patterned blanket beside a crescent moon — label "DREAMS".
4. A striped mug full of pencils, a paintbrush and scissors — label "IDEAS".
5. Two facing pastel teacups on saucers, one with a tiny grey storm-cloud puff above it — label "CONVERSATIONS & FIGHTS".
6. An open journal with a pen resting on it and a lit candle beside it — label "JOURNAL".
7. A little notepad showing a checklist of ticked boxes, with a pencil — label "TO-DOS".
8. A small framed handwritten note card with a pressed flower — label "QUOTES".
9. A tidy stack of folded letters and note cards tied with a ribbon — label "NOTES".
10. A wrapped parcel with a gift tag showing a question mark — label "OTHER".`;

const fd = new FormData();
fd.append('model', 'gpt-image-2');
for (const r of refs) fd.append('image[]', new Blob([fs.readFileSync(UP + r)], { type: 'image/png' }), r);
fd.append('prompt', prompt);
fd.append('size', '1024x1536');
fd.append('quality', 'medium');
fd.append('n', '1');

console.log('generating…');
const res = await fetch('https://api.openai.com/v1/images/edits', {
  method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd,
});
if (!res.ok) { console.error('ERROR', res.status, (await res.text()).slice(0, 600)); process.exit(1); }
const j = await res.json();
const b64 = j.data[0].b64_json;
fs.writeFileSync(process.argv[2], Buffer.from(b64, 'base64'));
console.log('wrote', process.argv[2]);
