// Upload this chat's renders into the ImageForge / "Deck Factory" gallery,
// oldest set first so the newest work lands on top (the gallery sorts by
// Firebase timeCreated, descending). Reads gallery_upload_manifest.json.
//
// Two ways to run:
//   A) Direct (no deploy) — needs a Firebase service-account JSON on disk:
//        GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node upload_to_gallery.mjs
//   B) Via the deployed server's token-gated endpoint:
//        GALLERY_URL=https://imageforge-q125.onrender.com/api/gallery/upload \
//        GALLERY_TOKEN=<token> node upload_to_gallery.mjs
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = new URL('.', import.meta.url).pathname;
const manifest = JSON.parse(await readFile(HERE + 'gallery_upload_manifest.json', 'utf8'));
const ctOf = (f) => f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
const FOLDER = 'journal-illustrations';

async function viaEndpoint(url, token) {
  for (const [i, it] of manifest.entries()) {
    const buf = await readFile(HERE + it.file);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ image: buf.toString('base64'), contentType: ctOf(it.file), folder: FOLDER, name: it.file.replace('/', '_') }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${it.file}: ${res.status} ${j.error || ''}`);
    console.log(`${String(i + 1).padStart(2)}/${manifest.length}  ${it.file}  -> ${j.url}`);
    await sleep(400); // keep timeCreated strictly increasing so order holds
  }
}

async function viaAdmin() {
  const admin = (await import('firebase-admin')).default;
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const sa = JSON.parse(await readFile(saPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: `${sa.project_id}.firebasestorage.app` });
  const bucket = admin.storage().bucket();
  for (const [i, it] of manifest.entries()) {
    const buf = await readFile(HERE + it.file);
    const ext = it.file.split('.').pop();
    const filename = `${FOLDER}/${Date.now()}-${i}-${it.file.replace('/', '_')}`;
    const file = bucket.file(filename);
    await file.save(buf, { metadata: { contentType: ctOf(it.file) } });
    await file.makePublic();
    console.log(`${String(i + 1).padStart(2)}/${manifest.length}  ${it.file}  -> https://storage.googleapis.com/${bucket.name}/${filename}`);
    await sleep(400);
  }
}

if (process.env.GALLERY_URL && process.env.GALLERY_TOKEN) {
  await viaEndpoint(process.env.GALLERY_URL, process.env.GALLERY_TOKEN);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  await viaAdmin();
} else {
  console.error('Set GALLERY_URL+GALLERY_TOKEN (endpoint) or GOOGLE_APPLICATION_CREDENTIALS (direct).');
  process.exit(1);
}
console.log('done — check https://imageforge-q125.onrender.com/gallery');
