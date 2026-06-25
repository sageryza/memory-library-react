// One-time build tool: pull base64 image data URIs out of the XI deck JSON files
// and write them as real .webp files under public/xi-cards/, rewriting each card's
// `img` to its URL. Dedupes identical images by content hash. Idempotent: running
// again on already-externalized JSON is a no-op.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(root, 'public/xi-cards');
const FILES = ['deckTrial.json', 'deckDaily.json', 'deckBoard.json', 'deckDreams.json']
  .map((f) => resolve(root, 'src/data/xi', f));

const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
mkdirSync(OUT_DIR, { recursive: true });

let written = 0, rewritten = 0, skipped = 0;
const seen = new Set();

function externalize(card) {
  const img = card && card.img;
  if (typeof img !== 'string') return;
  const m = img.match(/^data:(image\/[a-z]+);base64,(.+)$/s);
  if (!m) { skipped++; return; } // already a URL or empty
  const ext = EXT[m[1]] || 'bin';
  const bytes = Buffer.from(m[2], 'base64');
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16);
  const name = `${hash}.${ext}`;
  const path = resolve(OUT_DIR, name);
  if (!existsSync(path)) { writeFileSync(path, bytes); written++; }
  if (!seen.has(name)) seen.add(name);
  card.img = `/xi-cards/${name}`;
  rewritten++;
}

function walk(data) {
  if (Array.isArray(data.cards)) data.cards.forEach(externalize);
  if (Array.isArray(data.ev)) data.ev.forEach(externalize);
  if (Array.isArray(data.tw)) data.tw.forEach(externalize);
}

for (const file of FILES) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  walk(data);
  writeFileSync(file, JSON.stringify(data));
}

console.log(`images written: ${written} (unique: ${seen.size}), card refs rewritten: ${rewritten}, non-data skipped: ${skipped}`);
