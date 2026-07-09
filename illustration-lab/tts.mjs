// Usage: node tts.mjs <textfile> <outfile> [voice=fable] [speed=1.2]
// Defaults: British male voice ("fable") at 1.2x. A non-1.0 speed routes to
// tts-1-hd (which supports the `speed` param); speed==1 uses gpt-4o-mini-tts.
import { readFile, writeFile } from 'node:fs/promises';
const [,, textFile, outFile, voice = 'fable', speedArg] = process.argv;
const speed = speedArg ? parseFloat(speedArg) : 1.2;
const KEY = process.env.OPENAI_API_KEY;
const input = await readFile(textFile, 'utf8');
const useSpeed = Math.abs(speed - 1) > 0.01;
const body = useSpeed
  ? { model: 'tts-1-hd', voice, input, response_format: 'mp3', speed }
  : { model: 'gpt-4o-mini-tts', voice, input, response_format: 'mp3' };
const res = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) { console.error('FAIL', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
console.log('wrote', outFile, ((await readFile(outFile)).length / 1024 | 0) + 'KB', `(${body.model}, ${voice}, ${useSpeed ? speed + 'x' : '1x'})`);
