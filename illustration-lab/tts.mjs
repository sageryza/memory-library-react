// Usage: node tts.mjs <textfile> <outfile> [voice]
import { readFile, writeFile } from 'node:fs/promises';
const [,, textFile, outFile, voice='nova'] = process.argv;
const KEY = process.env.OPENAI_API_KEY;
const input = await readFile(textFile, 'utf8');
const res = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input, response_format: 'mp3' }),
});
if (!res.ok) { console.error('FAIL', res.status, (await res.text()).slice(0,200)); process.exit(1); }
await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
console.log('wrote', outFile, ((await readFile(outFile)).length/1024|0)+'KB');
