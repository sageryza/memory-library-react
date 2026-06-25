# Image generation — how it's wired (handoff / recipe)

A self-contained guide to the image-generation setup so it can be rebuilt or
split into separate prototypes (even in a new repo / new session). Two engines
are wired up, both callable from a React client through Firebase Cloud Functions:

1. **Replicate trained styles** — text → image in one of your trained LoRA styles.
2. **OpenAI `gpt-image-1` reference** — upload an image + prompt → transformed image
   (also does multi-panel comics with legible text).

---

## Mental model

```
React client ──(httpsCallable)──► Firebase Cloud Function ──(REST)──► Replicate / OpenAI
                                          │
                                   reads API key from
                                   Firestore `config/*`
```

- The client **never** sees the API keys. It calls a Cloud Function; the function
  reads the secret from Firestore and calls the image provider.
- Secrets live in a Firestore collection named **`config`**, set by hand in the
  Firebase console. Security rules don't match `config/**`, so it's admin-only —
  only Cloud Functions (admin SDK) can read it.

---

## 1. Secrets (Firestore `config`)

Set once in the Firebase console (Firestore → `config` collection). The functions
**find keys by prefix**, so the exact document/field name doesn't matter:

| Provider  | Key looks like      | How the function finds it                 |
|-----------|---------------------|-------------------------------------------|
| Replicate | `r8_…`              | scans `config/*` for a value starting `r8_` |
| OpenAI    | `sk-…` / `sk-proj-…`| scans `config/*` for `sk-` (NOT `sk-ant-`) |
| Anthropic | `sk-ant-…`          | (used by other features)                  |

```js
// functions/index.js — admin SDK already initialized: const db = getFirestore();
async function loadReplicateToken() {
  const snap = await db.collection('config').get();
  for (const doc of snap.docs)
    for (const v of Object.values(doc.data() || {}))
      if (typeof v === 'string' && v.trim().startsWith('r8_')) return v.trim();
  return null;
}

async function loadOpenAIKey() {
  const snap = await db.collection('config').get();
  for (const doc of snap.docs)
    for (const v of Object.values(doc.data() || {})) {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s.startsWith('sk-') && !s.startsWith('sk-ant')) return s;
    }
  return null;
}
```

Why prefix-scan instead of a fixed path? Because keys get hand-entered in the
console and end up under odd field names ("api token", "openAi", etc.). Prefix
matching is robust and the `r8_` / `sk-` prefixes are unambiguous.

---

## 2. Replicate trained styles (text → image)

Each style is a LoRA published as its own Replicate model under owner `sageryza`,
each with a **trigger word** that must appear in the prompt:

| Style key | Model slug                     | Trigger |
|-----------|--------------------------------|---------|
| `vict`    | `sageryza/victorianstyle`      | `vict`  | (Book Illustrations)
| `wtr`     | `sageryza/watercolordrawings`  | `wtr`   | (Watercolor)
| `tok`     | `sageryza/pwcscans`            | `tok`   | (PWC Scans)
| `pnt`     | `sageryza/paint`               | `pnt`   | (Painterly)

The call: resolve the model's latest version, create a prediction, poll until done.

```js
async function replicateFetch(path, token, init = {}) {
  const res = await fetch(`https://api.replicate.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Replicate ${path} ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

async function generateReplicateImage(token, prompt, modelSlug) {
  const model = await replicateFetch(`/v1/models/${modelSlug}`, token);
  const version = model.latest_version?.id;

  let pred = await replicateFetch('/v1/predictions', token, {
    method: 'POST',
    body: JSON.stringify({
      version,
      input: {
        prompt,                    // MUST include the trigger word, e.g. "vict, a fox..."
        model: 'dev',
        aspect_ratio: '1:1',
        num_outputs: 1,
        num_inference_steps: 28,
        guidance_scale: 3,
        lora_scale: 1,
        output_format: 'webp',
        output_quality: 80,
      },
    }),
  });

  const deadline = Date.now() + 110000;
  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 1500));
    pred = await replicateFetch(`/v1/predictions/${pred.id}`, token);
  }
  if (pred.status !== 'succeeded') throw new Error(`${pred.status}: ${pred.error || ''}`);

  const out = pred.output;
  return Array.isArray(out) ? out[0] : out; // a TEMPORARY url (~1 hour)
}
```

⚠️ The output URL **expires in ~1 hour**. For anything persistent, download it and
re-upload to storage (see §5).

---

## 3. OpenAI `gpt-image-1` reference (image + prompt → image)

Uses the **images/edits** endpoint (the one that accepts an input image).
Requires an **org-verified** OpenAI account. Returns base64 (no URL).

```js
exports.generateReferenceImage = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in.');
    const prompt = String(request.data?.prompt || '').trim();
    const imageBase64 = String(request.data?.imageBase64 || '');
    const mimeType = String(request.data?.mimeType || 'image/png');
    const key = await loadOpenAIKey();
    if (!key) throw new HttpsError('failed-precondition', 'No OpenAI key.');

    const buffer = Buffer.from(imageBase64, 'base64');
    const form = new FormData();                 // Node 20 globals
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);               // can be a multi-panel comic script
    form.append('size', '1024x1024');            // or 1024x1536 / 1536x1024 / auto
    form.append('n', '1');
    form.append('image', new Blob([buffer], { type: mimeType }), 'reference.png');

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!res.ok) {
      if (res.status === 429) throw new HttpsError('resource-exhausted', 'Rate limit (~5/min). Wait 30-60s.');
      throw new HttpsError('internal', `OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const b64 = (await res.json())?.data?.[0]?.b64_json;
    return { url: `data:image/png;base64,${b64}` };
  }
);
```

Gotchas:
- **Rate limit ~5 images/minute** → 429. Space requests out.
- **Org verification** is required to use `gpt-image-1` at all.
- Returns base64; we hand it back as a `data:` URL the `<img>` can render directly.

---

## 4. Calling from the React client

```js
// firebase.js
import { getFunctions } from 'firebase/functions';
export const functions = getFunctions(app);   // defaults to us-central1
```

```jsx
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const callStyle = httpsCallable(functions, 'generateTestImage');
const callRef   = httpsCallable(functions, 'generateReferenceImage');

// Replicate style:
const { data } = await callStyle({ prompt: 'a fox', style: 'vict' });
setUrl(data.url);

// gpt-image-1 reference — downscale the upload first to keep payload small:
function resizeToDataUrl(file, maxPx = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const s = Math.min(1, maxPx / Math.max(width, height));
        width = Math.round(width * s); height = Math.round(height * s);
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// ...then split "data:image/png;base64,XXXX" into mimeType + base64 and send:
const [meta, b64] = dataUrl.split(',');
const mimeType = (meta.match(/data:(.*?);/) || [])[1] || 'image/png';
const { data } = await callRef({ prompt, imageBase64: b64, mimeType });
```

Callable errors expose `e.code` (e.g. `functions/resource-exhausted`) and
`e.message` — show both so failures aren't opaque.

---

## 5. Persisting images (optional but important)

Replicate URLs expire (~1h) and gpt-image-1 returns base64. To keep an image
permanently, store it in Firebase Storage and use a **download-token URL** (works
without making the bucket public or signing):

```js
const { getStorage } = require('firebase-admin/storage');
const crypto = require('node:crypto');

async function persistImage(imageUrl, path) {              // path e.g. `dreams/abc.webp`
  const buf = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  const bucket = getStorage().bucket('<project>.firebasestorage.app');
  const file = bucket.file(path);
  const token = crypto.randomUUID();
  await file.save(buf, {
    resumable: false, contentType: 'image/webp',
    metadata: { cacheControl: 'public, max-age=31536000',
                metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/`
       + `${encodeURIComponent(file.name)}?alt=media&token=${token}`;
}
```

---

## 6. Deploy & gotchas

- **Cloud Functions**: v2, Node 20, `firebase-functions` + `firebase-admin`. No extra
  deps needed for the image calls — `fetch`, `FormData`, `Blob`, `crypto` are Node 20
  globals. Deploy with `firebase deploy --only functions`.
- **Secrets** are NOT in code — they're hand-entered into Firestore `config`.
- **PWA caching**: if the app is a PWA, a new client build won't show until the
  service worker updates — fully close & reopen the tab (sometimes twice), or use a
  private tab to bypass the cache.
- **Costs**: Replicate per-prediction (cheap); gpt-image-1 noticeably pricier per image.
- **Region**: client `getFunctions()` and the functions both default to `us-central1` —
  keep them matched.

---

## 7. The two pieces, as separable prototypes

- **"Style stamp"** — text box + style dropdown → Replicate image. Self-contained;
  only needs the `r8_` token. Good for sticker/single-image apps.
- **"Reference / comic"** — upload + prompt → `gpt-image-1`. Needs the `sk-` key + a
  verified org. The prompt can be a panel script for comic strips.

Both share the same skeleton: a callable Cloud Function that reads a key from
Firestore `config` and POSTs to the provider. To spin up a new prototype, copy the
relevant function from §2 or §3, the client call from §4, and set the key in §1.
