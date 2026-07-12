// Few-shot ("calibrated") handwriting transcription with GPT-4o vision.
//
// Show the model a few of Sophie's OWN pages with their correct transcriptions
// (from the aligned Notion blocks), so it learns her letterforms + shorthand,
// then transcribe an unseen page. No training/fine-tune cost — pure in-context.
//
// Usage: OPENAI_API_KEY=... node transcribe.mjs page.png ex1.png ex1.txt ex2.png ex2.txt ...
//   first arg = page to transcribe; remaining args = (examplePng, exampleTruthTxt) pairs.
import { readFileSync } from 'node:fs';

const [, , target, ...rest] = process.argv;
const KEY = process.env.OPENAI_API_KEY;
const b64 = p => readFileSync(p).toString('base64');
const imgPart = p => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64(p), detail: 'high' } });

const content = [{
  type: 'text',
  text: 'You transcribe this journal-keeper\'s handwriting. She owns the journal and '
      + 'authorized transcription. Her hand uses heavy personal shorthand. Study the '
      + 'example pages and their correct verbatim transcriptions to learn her letterforms, '
      + 'then transcribe ONLY the final page as accurately as possible.'
}];
for (let i = 0; i < rest.length; i += 2) {
  content.push({ type: 'text', text: `EXAMPLE ${i / 2 + 1} image:` }, imgPart(rest[i]));
  content.push({ type: 'text', text: `EXAMPLE ${i / 2 + 1} correct transcription:\n` + readFileSync(rest[i + 1], 'utf8') });
}
content.push({ type: 'text', text: 'NOW TRANSCRIBE THIS FINAL PAGE:' }, imgPart(target));

const res = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
  body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content }], max_tokens: 1500 }),
});
const j = await res.json();
if (!j.choices) { console.error('ERR', JSON.stringify(j).slice(0, 400)); process.exit(1); }
console.log(j.choices[0].message.content);
