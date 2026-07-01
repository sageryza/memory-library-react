// Cloud Functions — XI Versus turn notifications.
//
// When a game updates such that a player can now move (and hasn't been pinged
// yet this round), notify them: a web-push via FCM to their registered devices,
// and an email via the "Trigger Email" extension (we just write to /mail).
//
// Spam control: we track a `notified` array on the game doc — players already
// pinged for the current round. It resets when the round advances. Our own write
// of `notified` re-triggers this function, but then everyone able to move is
// already in `notified`, so no further sends and no write — no loop.

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');

initializeApp();
const db = getFirestore();

// Turn-alert links (SMS/email/push) point at the public custom domain so they
// match what players actually use — and the Twilio toll-free sample message.
const APP_URL = 'https://incaseofamnesia.com';

// Twilio credentials live in a locked-down Firestore doc (config/twilio:
// { accountSid, authToken, from }) so they can be set from the Firebase console
// — no CLI/Secret Manager needed. Client rules don't match config/**, so it's
// admin-only by default. Returns false if SMS isn't configured.
async function loadTwilio() {
  try {
    const snap = await db.doc('config/twilio').get();
    const d = snap.exists ? snap.data() : null;
    return (d && d.accountSid && d.authToken && d.from) ? d : false;
  } catch { return false; }
}

async function sendSms(cfg, to, body) {
  if (!cfg) return;
  let num = String(to).trim();
  if (!num.startsWith('+')) {
    const digits = num.replace(/\D/g, '');
    num = '+' + (digits.length === 10 ? '1' + digits : digits); // assume US if 10 digits
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const form = new URLSearchParams({ To: num, From: cfg.from, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) console.error('Twilio SMS failed', res.status, await res.text().catch(() => ''));
}

exports.notifyVersusTurn = onDocumentUpdated('versusGames/{gameId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data();
  if (!after) return;

  const players = after.players || [];
  if (players.length < 2) return; // solo game: no one is waiting on a turn

  const acted = after.acted || [];
  const roundChanged = (before.round || 0) !== (after.round || 0);
  const notified = roundChanged ? [] : (after.notified || []).slice();

  // Players who can move now and haven't been pinged yet this round. (The player
  // who just moved is in `acted`, so they're naturally excluded.)
  const toNotify = players.filter((p) => !acted.includes(p.uid) && !notified.includes(p.uid));

  if (toNotify.length === 0) {
    // Nothing to send; only persist a round-reset of `notified` if needed.
    if (roundChanged && (after.notified || []).length) {
      await event.data.after.ref.update({ notified: [] });
    }
    return;
  }

  const gameId = event.params.gameId;
  const link = `${APP_URL}/xi/versus/${gameId}`;
  const twilio = await loadTwilio();

  for (const p of toNotify) {
    try {
      const uSnap = await db.doc(`users/${p.uid}`).get();
      const u = uSnap.exists ? uSnap.data() : {};
      if (u.notifOptIn !== true) { notified.push(p.uid); continue; } // not opted in

      // Web push to all their devices.
      const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens : [];
      if (tokens.length) {
        const res = await getMessaging().sendEachForMulticast({
          tokens,
          notification: { title: 'XI · Versus', body: 'It’s your move on the board.' },
          webpush: {
            fcmOptions: { link },
            notification: { icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' },
          },
        });
        const dead = [];
        res.responses.forEach((r, i) => { if (!r.success) dead.push(tokens[i]); });
        if (dead.length) {
          await db.doc(`users/${p.uid}`).update({ fcmTokens: FieldValue.arrayRemove(...dead) });
        }
      }

      // Email via the Trigger Email extension (reads the /mail collection).
      if (u.notifEmailOn === true && u.notifEmail) {
        await db.collection('mail').add({
          to: u.notifEmail,
          message: {
            subject: 'Your move in XI · Versus',
            text: `It’s your turn to play in XI · Versus.\nOpen the board: ${link}`,
            html: `<p>It’s your turn to play in <b>XI · Versus</b>.</p>`
                + `<p><a href="${link}">Open the board →</a></p>`,
          },
        });
      }

      // Text via Twilio (if both the player and the project are configured).
      if (u.notifSmsOn === true && u.notifPhone) {
        await sendSms(twilio, u.notifPhone, `XI · Versus — it’s your move: ${link}`);
      }

      notified.push(p.uid);
    } catch (e) {
      console.error('notify failed for', p.uid, e);
    }
  }

  await event.data.after.ref.update({ notified });
});

// ===========================================================================
// Dream illustration — draw a picture for a dream entry via Replicate.
//
// Reuses the same trained-LoRA styles as the ImageForge app. v1 ships ONE
// style, "Book Illustrations" (Replicate model sageryza/victorianstyle,
// trigger word "vict"), and is words-only: the dream's text becomes the prompt.
//
// The Replicate API token lives in a locked-down Firestore doc
// (config/replicate: { apiToken }) so it can be set from the Firebase console
// — same pattern as config/twilio. Client rules don't match config/**, so it's
// admin-only by default. Set it once and image generation goes live.
// ===========================================================================

const REPLICATE_MODEL = 'sageryza/victorianstyle'; // "Book Illustrations"
const REPLICATE_TRIGGER = 'vict';
const STORAGE_BUCKET = 'membry-df528.firebasestorage.app';

// Find the Replicate API token in the config collection. It's added by hand
// from the Firebase console, so it may live in any config/* doc under any field
// name (e.g. config/replicate.apiToken, or config/anthropic with a field named
// "api token"). Replicate tokens always start with "r8_", which lets us locate
// it unambiguously without depending on an exact path/field name.
async function loadReplicateToken() {
  try {
    const snap = await db.collection('config').get();
    for (const doc of snap.docs) {
      for (const v of Object.values(doc.data() || {})) {
        if (typeof v === 'string' && v.trim().startsWith('r8_')) return v.trim();
      }
    }
  } catch { /* ignore */ }
  return null;
}

// Find the OpenAI API key in the config collection (same hand-entry tolerance
// as the Replicate token). OpenAI keys start with "sk-" / "sk-proj-"; we
// explicitly skip "sk-ant-" so we never grab the Anthropic key by mistake.
async function loadOpenAIKey() {
  try {
    const snap = await db.collection('config').get();
    for (const doc of snap.docs) {
      for (const v of Object.values(doc.data() || {})) {
        if (typeof v === 'string') {
          const s = v.trim();
          if (s.startsWith('sk-') && !s.startsWith('sk-ant')) return s;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

// Turn a dream entry into a Replicate prompt. The LoRA trigger word must be
// present in the prompt for the trained style to apply.
function buildDreamPrompt(entry) {
  const parts = [];
  if (entry.title) parts.push(String(entry.title).trim());
  if (entry.content) parts.push(String(entry.content).trim());
  const body = parts.join('. ').replace(/\s+/g, ' ').trim().slice(0, 1500);
  return `${REPLICATE_TRIGGER}, ${body}`;
}

async function replicateFetch(path, token, init = {}) {
  const res = await fetch(`https://api.replicate.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Replicate ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

// Download the finished image and store it permanently in Firebase Storage,
// returning a stable Firebase download URL (works regardless of bucket access
// settings, no makePublic/signing needed). Falls back to the temporary
// Replicate URL if the upload fails for any reason.
async function persistImage(imageUrl, path, transform = null) {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`download ${resp.status}`);
    let buffer = Buffer.from(await resp.arrayBuffer());
    if (transform) buffer = await transform(buffer);
    const bucket = getStorage().bucket(STORAGE_BUCKET);
    const file = bucket.file(path);
    const downloadToken = crypto.randomUUID();
    await file.save(buffer, {
      resumable: false,
      contentType: 'image/webp',
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/`
      + `${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
  } catch (e) {
    console.error('persistImage failed, falling back to temporary URL', e);
    return imageUrl;
  }
}

// Save a raw image buffer (e.g. gpt-image-2 base64 output) to Storage and
// return a stable Firebase download URL. Throws on failure (no temp URL to
// fall back to, unlike persistImage).
async function persistBuffer(buffer, path, contentType = 'image/webp') {
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  const file = bucket.file(path);
  const downloadToken = crypto.randomUUID();
  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/`
    + `${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
}

// Generate one image with the Book Illustrations LoRA: resolve the model's
// current version, create the flux-dev prediction (same settings ImageForge
// uses), and poll to completion. Returns the raw (temporary) Replicate URL.
async function generateReplicateImage(token, prompt, modelSlug = REPLICATE_MODEL, loraScale = 1, opts = {}) {
  const model = await replicateFetch(`/v1/models/${modelSlug}`, token);
  const version = model.latest_version?.id;
  if (!version) throw new HttpsError('internal', 'Could not resolve the image model version.');

  let prediction = await replicateFetch('/v1/predictions', token, {
    method: 'POST',
    body: JSON.stringify({
      version,
      input: {
        prompt,
        model: 'dev',
        aspect_ratio: '1:1',
        num_outputs: 1,
        num_inference_steps: opts.numInferenceSteps ?? 28,
        guidance_scale: 3,
        lora_scale: loraScale,
        output_format: 'webp',
        output_quality: 80,
      },
    }),
  });

  // Poll until finished (~every 1.5s), with a hard deadline under the timeout.
  const deadline = Date.now() + 110000;
  while (prediction.status === 'starting' || prediction.status === 'processing') {
    if (Date.now() > deadline) {
      throw new HttpsError('deadline-exceeded', 'The image took too long.');
    }
    await new Promise((r) => setTimeout(r, 1500));
    prediction = await replicateFetch(`/v1/predictions/${prediction.id}`, token);
  }

  if (prediction.status !== 'succeeded') {
    throw new HttpsError('internal',
      `Image generation ${prediction.status}: ${prediction.error || 'unknown error'}`);
  }

  const out = prediction.output;
  const rawUrl = Array.isArray(out) ? out[0] : out;
  if (!rawUrl) throw new HttpsError('internal', 'No image was returned.');
  return { rawUrl, modelSlug, version, predictionId: prediction.id };
}

exports.illustrateDream = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to illustrate a dream.');

    const groupId = String(request.data?.groupId || '');
    const entryId = String(request.data?.entryId || '');
    if (!groupId || !entryId) {
      throw new HttpsError('invalid-argument', 'groupId and entryId are required.');
    }

    // Membership check — only members of the group may illustrate its dreams,
    // so a stranger can't burn Replicate credits on someone else's journal.
    const groupSnap = await db.doc(`groups/${groupId}`).get();
    const memberIds = groupSnap.exists ? (groupSnap.data().memberIds || []) : [];
    if (!memberIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'You are not a member of this group.');
    }

    const entryRef = db.doc(`groups/${groupId}/entries/${entryId}`);
    const entrySnap = await entryRef.get();
    if (!entrySnap.exists) throw new HttpsError('not-found', 'Dream not found.');
    const entry = entrySnap.data();

    const token = await loadReplicateToken();
    if (!token) {
      throw new HttpsError('failed-precondition',
        'Image generation is not configured yet (missing config/replicate).');
    }

    const prompt = buildDreamPrompt(entry);

    const { rawUrl } = await generateReplicateImage(token, prompt);
    const url = await persistImage(rawUrl, `dreams/${groupId}/${entryId}.webp`);

    const illustration = {
      url,
      prompt,
      style: 'Book Illustrations',
      model: REPLICATE_MODEL,
      source: 'replicate',
      createdAt: new Date().toISOString(),
    };
    await entryRef.update({ illustration, updatedAt: FieldValue.serverTimestamp() });

    return { url };
  }
);

// The trained ImageForge styles, by key. Each is a Replicate LoRA owned by
// sageryza with its own trigger word. Used by the test page so we can compare
// styles and find the one that matches the dream-drawing look.
const TEST_STYLES = {
  vict: { model: 'sageryza/victorianstyle', trigger: 'vict' }, // Book Illustrations
  wtr: { model: 'sageryza/watercolordrawings', trigger: 'wtr' }, // Watercolor
  tok: { model: 'sageryza/pwcscans', trigger: 'tok' }, // PWC Scans
  pnt: { model: 'sageryza/paint', trigger: 'pnt' }, // Painterly
  special: { model: 'sageryza/special', trigger: 'special' }, // Sketchy
  gosh: { model: 'sageryza/gosh', trigger: 'gosh' }, // Gouache
};

// Standalone image-generation test. Takes a prompt + style key, runs it through
// the chosen LoRA, and returns the image URL — no dream entry, group, or storage
// involved. Lets us verify the Replicate setup and compare styles independent of
// the dream-journal UI.
exports.generateTestImage = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const raw = String(request.data?.prompt || '').trim();
    if (!raw) throw new HttpsError('invalid-argument', 'Enter a prompt.');

    const token = await loadReplicateToken();
    if (!token) {
      throw new HttpsError('failed-precondition',
        'No Replicate token found in config/* (looking for an r8_… value).');
    }

    const style = TEST_STYLES[String(request.data?.style || 'vict')] || TEST_STYLES.vict;
    const body = raw.slice(0, 1500);
    const prompt = style.trigger ? `${style.trigger}, ${body}` : body;
    const { rawUrl, modelSlug, version, predictionId } =
      await generateReplicateImage(token, prompt, style.model);
    return {
      url: rawUrl,
      prompt,
      model: modelSlug,
      version,
      predictionUrl: `https://replicate.com/p/${predictionId}`,
    };
  }
);

// ===========================================================================
// ImageForge — Test Station backend (shared with the SwiftUI iOS app).
// One prompt, run through any house style. Replicate LoRAs (incl. HOONIE's
// linocut, with its suffix + 40 steps) and OpenAI gpt-image-2 (quality low).
// Mirrors imageforge/server.js so the app and the web app behave identically.
// Result is persisted to Storage so the URL is permanent (and cacheable).
// ===========================================================================
const FORGE_STYLES = {
  gosh:    { provider: 'replicate', model: 'sageryza/gosh',              trigger: 'gosh',    name: 'Gouache' },
  pnt:     { provider: 'replicate', model: 'sageryza/paint',             trigger: 'pnt',     name: 'Painterly' },
  special: { provider: 'replicate', model: 'sageryza/special',           trigger: 'special', name: 'Sketchy' },
  vict:    { provider: 'replicate', model: 'sageryza/victorianstyle',    trigger: 'vict',    name: 'Book Illustrations',
             promptSuffix: 'black and white pen and ink line illustration, fine linework, whimsical mid-century childrens book style, white background' },
  wtr:     { provider: 'replicate', model: 'sageryza/watercolordrawings', trigger: 'wtr',    name: 'Watercolor Drawings' },
  tok:     { provider: 'replicate', model: 'sageryza/pwcscans',          trigger: 'tok',     name: 'PWC Scans' },
  hoonie:  { provider: 'replicate', model: 'sageryza/hoonie',            trigger: 'HOONIE',  name: 'Hoonie Linocut',
             promptSuffix: 'linocut relief print, white background', steps: 40 },
  'gpt-image-2': { provider: 'openai', name: 'ChatGPT (gpt-image-2)', quality: 'low' },
};

// Render one gpt-image-2 image at the given quality; returns a temporary data
// URL source buffer is persisted by the caller. Returns { rawBuffer }.
async function generateOpenAIImage(key, prompt, quality = 'low') {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, n: 1, size: '1024x1024', quality, output_format: 'webp' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new HttpsError('resource-exhausted', 'OpenAI rate limit. Wait ~30–60s and try again.');
    }
    throw new HttpsError('internal', `OpenAI ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new HttpsError('internal', 'No image returned from gpt-image-2.');
  return Buffer.from(b64, 'base64');
}

exports.forgeTestImage = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const raw = String(request.data?.prompt || '').trim();
    if (!raw) throw new HttpsError('invalid-argument', 'Enter a prompt.');

    const styleKey = String(request.data?.style || 'gosh');
    // Sticker Page rides on this (publicly-invokable) function: style
    // "sticker-sheet" renders a full sheet via the shared helper.
    if (styleKey === 'sticker-sheet') {
      return renderStickerSheet(raw, request.data?.quality);
    }
    const style = FORGE_STYLES[styleKey];
    if (!style) throw new HttpsError('invalid-argument', `Unknown style "${styleKey}".`);

    const body = raw.slice(0, 1500);
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    if (style.provider === 'openai') {
      const key = await loadOpenAIKey();
      if (!key) {
        throw new HttpsError('failed-precondition',
          'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
      }
      const buffer = await generateOpenAIImage(key, body, style.quality || 'low');
      const url = await persistBuffer(buffer, `forge-test/${stamp}.webp`);
      return { url, style: styleKey, model: 'gpt-image-2', prompt: body };
    }

    const token = await loadReplicateToken();
    if (!token) {
      throw new HttpsError('failed-precondition',
        'No Replicate token found in config/* (looking for an r8_… value).');
    }
    let prompt = style.trigger ? `${style.trigger}, ${body}` : body;
    if (style.promptSuffix) prompt = `${prompt}, ${style.promptSuffix}`;
    const { rawUrl, modelSlug } = await generateReplicateImage(
      token, prompt, style.model, 1, { numInferenceSteps: style.steps });
    const url = await persistImage(rawUrl, `forge-test/${stamp}.webp`);
    return { url, style: styleKey, model: modelSlug, prompt };
  }
);

// ===========================================================================
// Sticker Page — full-page sticker sheet via gpt-image-2 (shared with the iOS
// app). The house sticker look is baked in from two committed reference images
// (functions/assets/sticker-ref*.jpg): delicate hand-drawn line art, dusty
// muted palette, botanical/celestial motifs. We steer toward FREE-FORM
// individually die-cut shapes (not round badges) and a calmer count — a few big
// stickers plus a handful of small ones. quality defaults to "medium".
// ===========================================================================
const STICKER_REF_FILES = ['sticker-ref1.jpg', 'sticker-ref2.jpg'];
let stickerRefBuffers = null;
function loadStickerRefs() {
  if (stickerRefBuffers) return stickerRefBuffers;
  stickerRefBuffers = STICKER_REF_FILES
    .map((f) => {
      try { return fs.readFileSync(path.join(__dirname, 'assets', f)); }
      catch { return null; }
    })
    .filter(Boolean);
  return stickerRefBuffers;
}

const STICKER_QUALITIES = new Set(['low', 'medium', 'high']);

// Core sticker-sheet render. Shared by the dedicated `forgeStickerSheet`
// callable AND the `forgeTestImage` callable (style "sticker-sheet"), so the
// app can reach it through whichever function is publicly invokable.
async function renderStickerSheet(rawPrompt, qualityIn) {
  const raw = String(rawPrompt || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Describe the stickers you want.');
  let quality = String(qualityIn || 'medium');
  if (!STICKER_QUALITIES.has(quality)) quality = 'medium';

  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }

  const refs = loadStickerRefs();
  if (!refs.length) {
    throw new HttpsError('internal', 'Sticker reference images are missing from the deploy.');
  }

  const body = raw.slice(0, 1000);
  // Compose the sheet instruction. Match the references' art style/palette but
  // not their content; free-form die-cut shapes, calmer count, no text.
  const prompt =
    'A full-page sticker sheet on a plain white background. Use the attached '
    + 'images ONLY as the art-style and palette reference — delicate hand-drawn '
    + 'fine black line art with soft flat muted color fills (dusty rose, sage, '
    + 'ochre, terracotta, lavender, pale blue). Do NOT copy their content. '
    + 'Make the stickers FREE-FORM, individually die-cut shapes that follow each '
    + "illustration's outline — NOT circular badges or round coins. Each sticker "
    + 'has a clean thick white kiss-cut border and a subtle drop shadow. '
    + 'Compose about 6 large stickers plus a handful of small accent stickers '
    + '(sparkles, small flowers, little gems) — not crowded, with breathing room. '
    + 'Absolutely no text, words, letters or watermarks anywhere. '
    + 'The stickers depict: ' + body;

  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', '1024x1536');
  form.append('quality', quality);
  form.append('output_format', 'webp');
  refs.forEach((buf, i) => {
    form.append('image[]', new Blob([buf], { type: 'image/jpeg' }), `ref${i + 1}.jpg`);
  });

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new HttpsError('resource-exhausted', 'OpenAI rate limit. Wait ~30–60s and try again.');
    }
    throw new HttpsError('internal', `OpenAI ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new HttpsError('internal', 'No image returned from gpt-image-2.');

  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const url = await persistBuffer(Buffer.from(b64, 'base64'), `forge-stickers/${stamp}.webp`);
  return { url, quality, prompt: body };
}

// Dedicated callable (needs its own public-invoker IAM binding to be reachable
// from the client SDK). The app currently reaches sticker rendering through
// forgeTestImage instead, which already has that binding.
exports.forgeStickerSheet = onCall(
  { region: 'us-central1', timeoutSeconds: 180, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    return renderStickerSheet(request.data?.prompt, request.data?.quality);
  }
);

// Image-reference test via OpenAI gpt-image-1. Takes an uploaded image + prompt
// and returns a transformed image (data URL). Uses the images/edits endpoint —
// the one that accepts an input image — so we can compare reference output
// against the Replicate trained styles.
exports.generateReferenceImage = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const prompt = String(request.data?.prompt || '').trim();
    const imageBase64 = String(request.data?.imageBase64 || '');
    const mimeType = String(request.data?.mimeType || 'image/png');
    if (!prompt) throw new HttpsError('invalid-argument', 'Enter a prompt.');
    if (!imageBase64) throw new HttpsError('invalid-argument', 'Upload a reference image.');

    const key = await loadOpenAIKey();
    if (!key) {
      throw new HttpsError('failed-precondition',
        'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const ext = /jpe?g/.test(mimeType) ? 'jpg' : (/webp/.test(mimeType) ? 'webp' : 'png');

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('n', '1');
    form.append('image', new Blob([buffer], { type: mimeType }), `reference.${ext}`);

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) {
        throw new HttpsError('resource-exhausted',
          'OpenAI rate limit (~5 images/minute). Wait ~30–60s and try again.');
      }
      throw new HttpsError('internal', `OpenAI ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new HttpsError('internal', 'No image returned from OpenAI.');
    return { url: `data:image/png;base64,${b64}`, model: 'gpt-image-1', prompt };
  }
);

/* ===== AI assist (Anthropic) ============================================== */
// The Anthropic API key lives in a locked-down Firestore doc (config/anthropic:
// { key }), set from the Firebase console — same pattern as Twilio above, so no
// CLI / Secret Manager is needed. Client rules don't match config/**, so only
// this (admin) function can read it.
async function loadAnthropicKey() {
  try {
    const snap = await db.doc('config/anthropic').get();
    const d = snap.exists ? snap.data() : null;
    return (d && d.key) ? d.key : null;
  } catch { return null; }
}

// Frequent + cheap for titles; stronger for the occasional card-generation pass.
const TITLE_MODEL = 'claude-haiku-4-5';
const CARDS_MODEL = 'claude-sonnet-4-6';

const TITLE_SYSTEM = 'You write short, evocative titles for a person\'s own memories. '
  + '2–6 words. No quotes, no trailing punctuation. Capture what the memory is ABOUT '
  + 'so the writer recognizes it at a glance — plain, human, specific. Never generic, '
  + 'never a summary sentence. Output only the title.';

// The creative crux of the card generator: teach the target "altitude" with the
// dream-deck phrases as exemplars, and forbid retelling the person's specifics.
const CARDS_SYSTEM = [
  'You generate cards for "XI", a memory game. A card is a SHORT phrase (2–6 words)',
  'that works as a provocative prompt — it should make someone think "oh, when did',
  'THAT happen to me?" and surface a specific memory of their own.',
  '',
  'The sweet spot:',
  '- Broad enough to match MANY different life situations, but',
  '- evocative enough to NOT be generic filler.',
  '- Mostly first-person past-tense action fragments, or universal states/twists.',
  '- Plain language. No proper nouns, no names, no details unique to one story.',
  '',
  'Model cards that nail the altitude:',
  'did my best · used my time wisely · falsely accused · told them how I felt ·',
  'had no idea what to do · saw them for what they were · interrupted · fell asleep',
  'at the wheel · was unable to help · finally confessed · the tip of the iceberg ·',
  'it took longer than expected · took me by surprise',
  '',
  'You will be given memories from one person\'s life. Read them for recurring shapes,',
  'feelings, and turning points, then ABSTRACT up to card altitude. Do NOT retell their',
  'specific memories — generalize the underlying move so each card works for them AND',
  'others. Avoid duplicating the model cards above.',
  '',
  'Output ONLY the cards, one per line, lowercase, no numbering, no commentary.',
].join('\n');

const textOf = (msg) => ((msg && msg.content && msg.content[0] && msg.content[0].text) || '');

// Callable AI assist:
//   { mode: 'title', text }                    -> { title }
//   { mode: 'cards', memories: [str,...], n }  -> { cards: [phrase,...] }
exports.aiAssist = onCall({ cors: true, timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const key = await loadAnthropicKey();
  const data = req.data || {};
  const mode = data.mode || '';

  // Health check — reports whether the key is configured. No model call, no
  // cost, and doesn't require the key to exist (returns false if missing).
  if (mode === 'status') return { configured: !!key };

  if (!key) throw new HttpsError('failed-precondition', 'AI is not configured yet.');
  const client = new Anthropic({ apiKey: key });

  if (mode === 'title') {
    const text = String(data.text || '').trim().slice(0, 4000);
    if (!text) throw new HttpsError('invalid-argument', 'No text to title.');
    const msg = await client.messages.create({
      model: TITLE_MODEL,
      max_tokens: 40,
      system: TITLE_SYSTEM,
      messages: [{ role: 'user', content: `Memory:\n\n${text}\n\nTitle:` }],
    });
    const title = textOf(msg).trim().replace(/^["']|["']$/g, '').replace(/[.\s]+$/, '');
    return { title };
  }

  if (mode === 'cards') {
    const mems = Array.isArray(data.memories)
      ? data.memories.map((m) => String(m || '').trim()).filter(Boolean).slice(0, 200) : [];
    if (!mems.length) throw new HttpsError('invalid-argument', 'No memories provided.');
    const n = Math.max(1, Math.min(60, Number(data.n) || 24));
    const corpus = mems.map((m, i) => `${i + 1}. ${m.slice(0, 400)}`).join('\n');
    const msg = await client.messages.create({
      model: CARDS_MODEL,
      max_tokens: 1500,
      system: CARDS_SYSTEM,
      messages: [{ role: 'user', content: `Here are memories from one person's life:\n\n${corpus}\n\nWrite ${n} cards.` }],
    });
    const cards = textOf(msg).split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean).slice(0, n);
    return { cards };
  }

  throw new HttpsError('invalid-argument', 'Unknown mode.');
});

/* ===== The Little Book of Miracles ======================================= */
// One style (Sketchy / sageryza/special) + baked-in style guidelines. A moment
// is distilled by Claude into a short caption + a single simple thing to doodle,
// then drawn as a black-ink line doodle and saved permanently.

const MIRACLE_MODEL = 'sageryza/special';
const MIRACLE_TRIGGER = 'special';
// Bump on any change to the miracle pipeline so the client can confirm what's live.
const MIRACLE_FN_VERSION = 'v5-fill';

// The "special" LoRA tends to draw a small doodle floating in a big white
// square, so the result reads as tiny in the app's frame. Trim the white
// margins down to the ink, then recenter the drawing on a square white canvas
// with a small even margin so it fills the frame. Best-effort: any failure
// (e.g. a near-blank image) falls back to the original bytes.
async function trimToSubject(buffer) {
  try {
    const trimmed = await sharp(buffer)
      .flatten({ background: '#ffffff' })
      .trim({ background: '#ffffff', threshold: 12 })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = trimmed.info;
    if (!width || !height) return buffer;
    const side = Math.max(width, height);
    const margin = Math.round(side * 0.08); // ~86% of the frame is the drawing
    const canvas = side + margin * 2;
    // Center the trimmed drawing on a square white canvas. (Done as its own
    // pipeline: sharp applies composite last, after any resize, so the resize
    // to a fixed size has to happen in a separate step below.)
    const centered = await sharp({
      create: { width: canvas, height: canvas, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: trimmed.data, gravity: 'centre' }])
      .png()
      .toBuffer();
    // Normalize to a fixed size so a small trimmed doodle still reads crisp.
    return await sharp(centered)
      .resize(1024, 1024, { kernel: 'lanczos3' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error('trimToSubject failed; using original image', e);
    return buffer;
  }
}
const MIRACLE_STYLE_GUIDE =
  'simple black ink line drawing, bold confident strokes, the single subject drawn '
  + 'large and filling most of the frame, minimal background, no color, charming and '
  + 'childlike, plain white background. Absolutely no words, letters, captions, numbers, '
  + 'signs, or writing anywhere in the image.';

const MIRACLE_SYSTEM = [
  'You turn a small real-life moment into ONE clever little doodle for a keepsake book',
  'of tiny daily miracles. This is a creative task: think about what single image would',
  'make someone instantly recall — and smile at — this exact moment. The best choice is',
  'recognizable at a glance AND captures what made the moment special, funny, or sweet.',
  'It is usually a specific object or a tiny two-element scene, NOT a literal retelling of',
  'the whole story. Consider a few options and pick the most evocative one.',
  '',
  'Respond with ONLY a JSON object: {"caption": "...", "drawing": "..."}.',
  '- drawing: name the literal subject to draw, plainly and concretely (e.g. "a slice of',
  '  birthday cake", "a hand holding a glass of water", "a sleeping fox"). Keep it simple',
  '  enough to draw in a few lines. Never include any words, letters, signs, or text.',
  '- caption: a short, warm, lowercase note, max ~8 words.',
].join('\n');

exports.illustrateMiracle = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const text = String(request.data?.text || '').trim();
    if (!text) throw new HttpsError('invalid-argument', 'Write a miracle first.');
    const id = String(request.data?.id || crypto.randomUUID());

    const repToken = await loadReplicateToken();
    if (!repToken) {
      throw new HttpsError('failed-precondition', 'No Replicate token found in config/*.');
    }

    // Distill the moment into a simple drawing prompt (best-effort). When
    // distill is false, draw the user's text verbatim instead.
    const distill = request.data?.distill !== false;
    let caption = text.slice(0, 80);
    let drawing = text;
    if (distill) {
      const anthropicKey = await loadAnthropicKey();
      if (anthropicKey) {
        try {
          const client = new Anthropic({ apiKey: anthropicKey });
          const msg = await client.messages.create({
            model: 'claude-opus-4-8',
            max_tokens: 2000,
            thinking: { type: 'adaptive' }, // let it actually reason about the best image
            output_config: { effort: 'medium' },
            system: MIRACLE_SYSTEM,
            messages: [{ role: 'user', content: text.slice(0, 2000) }],
          });
          // With thinking on, the answer is the text block (not content[0]).
          const block = (msg.content || []).find((b) => b.type === 'text');
          const raw = (block?.text || '').trim().replace(/^```json\s*|\s*```$/g, '');
          const parsed = JSON.parse(raw);
          if (parsed.caption) caption = String(parsed.caption).trim();
          if (parsed.drawing) drawing = String(parsed.drawing).trim();
        } catch (e) {
          console.error('miracle distill failed; using raw text', e);
        }
      }
    }

    const prompt = `${MIRACLE_TRIGGER}, ${drawing}, ${MIRACLE_STYLE_GUIDE}`;
    // Ease the LoRA strength a touch — at full scale it tends to scrawl its
    // trigger word ("special") into the picture.
    const { rawUrl } = await generateReplicateImage(repToken, prompt, MIRACLE_MODEL, 0.9);
    // Unique path per draw so redraws don't overwrite earlier ones (enables undo).
    // Trim the LoRA's white margins so the doodle fills the frame.
    const url = await persistImage(
      rawUrl, `miracles/${uid}/${id}/${crypto.randomUUID()}.webp`, trimToSubject,
    );
    return { url, caption, drawing, id, version: MIRACLE_FN_VERSION };
  }
);

// ============================================================================
// Ads — Meta Marketing API, wrapped so the app never touches Ads Manager.
//
// Setup (one-time, admin): a locked-down Firestore doc `config/metaAds` holds
//   { appId: "<Meta app id>", appSecret: "<Meta app secret>" }
// (the app secret is NOT in git — same pattern as config/instagram).
// After a user taps Connect and authorizes, we store their long-lived token +
// discovered ad account/pixel at `adsConnections/{uid}`.
// ============================================================================

const META_GRAPH = 'https://graph.facebook.com/v21.0';
const ADS_SCOPES = 'ads_management,ads_read,business_management,pages_show_list,pages_read_engagement';
const ADS_REDIRECT = 'https://us-central1-membry-df528.cloudfunctions.net/adsAuthCallback';
const APP_RETURN = 'imageforge://ads-connected';

async function loadMetaApp() {
  const snap = await db.doc('config/metaAds').get();
  const cfg = snap.exists ? snap.data() : null;
  if (!cfg?.appId || !cfg?.appSecret) {
    throw new HttpsError('failed-precondition',
      'Ads aren’t set up yet. Add config/metaAds with { appId, appSecret }.');
  }
  return cfg;
}

async function loadAdsConnection(uid) {
  const snap = await db.doc(`adsConnections/${uid}`).get();
  return snap.exists ? snap.data() : null;
}

// Kick off Facebook Login: bounce the user to Meta's OAuth dialog. `state` is
// the caller's uid so the callback can store the token against them.
exports.adsAuthStart = onRequest({ region: 'us-central1' }, async (req, res) => {
  try {
    const { appId } = await loadMetaApp();
    const state = String(req.query.state || '');
    const url = `${META_GRAPH}/dialog/oauth?` + new URLSearchParams({
      client_id: appId,
      redirect_uri: ADS_REDIRECT,
      state,
      scope: ADS_SCOPES,
      response_type: 'code',
    }).toString();
    res.redirect(302, url.replace('graph.facebook.com', 'www.facebook.com'));
  } catch (e) {
    res.status(500).send(String(e.message || e));
  }
});

// Meta redirects here with ?code&state. Exchange for a long-lived token, find
// the ad account + pixel, store it, then hand control back to the app.
exports.adsAuthCallback = onRequest({ region: 'us-central1' }, async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const uid = String(req.query.state || '');
    if (!code || !uid) throw new Error('Missing code/state.');
    const { appId, appSecret } = await loadMetaApp();

    // 1) code -> short-lived token
    const tokRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: appId, client_secret: appSecret, redirect_uri: ADS_REDIRECT, code,
    }));
    const tok = await tokRes.json();
    if (!tok.access_token) throw new Error(tok.error?.message || 'Token exchange failed.');

    // 2) short-lived -> long-lived token
    const llRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret,
      fb_exchange_token: tok.access_token,
    }));
    const ll = await llRes.json();
    const token = ll.access_token || tok.access_token;

    // 3) discover ad account + pixel
    const discovered = await discoverAdAccount(token);
    await db.doc(`adsConnections/${uid}`).set({
      accessToken: token,
      ...discovered,
      connectedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.redirect(302, APP_RETURN);
  } catch (e) {
    // Still return to the app; the summary call will report "not connected".
    res.redirect(302, `${APP_RETURN}?error=${encodeURIComponent(String(e.message || e))}`);
  }
});

async function discoverAdAccount(token) {
  const acctRes = await fetch(`${META_GRAPH}/me/adaccounts?` + new URLSearchParams({
    fields: 'account_id,name,currency', access_token: token,
  }));
  const acct = await acctRes.json();
  const first = acct.data?.[0];
  if (!first) return {};
  const adAccountId = `act_${first.account_id}`;
  let pixelId = null;
  try {
    const pxRes = await fetch(`${META_GRAPH}/${adAccountId}/adspixels?` + new URLSearchParams({
      fields: 'id,name', access_token: token,
    }));
    const px = await pxRes.json();
    pixelId = px.data?.[0]?.id || null;
  } catch { /* pixel optional */ }
  return { adAccountId, accountName: first.name, currency: first.currency, pixelId };
}

// What the app shows after Connect.
exports.adsSummary = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const conn = await loadAdsConnection(uid);
  if (!conn?.accessToken) return { connected: false };
  return {
    connected: true,
    accountName: conn.accountName || null,
    currency: conn.currency || null,
    pixelId: conn.pixelId || null,
  };
});

// Create an Advantage+ Shopping campaign — PAUSED. Nothing spends until the app
// flips it ACTIVE via adsSetStatus. (Ad set + creative are a later slice; a
// campaign with no ads can't spend, so this is safe to build up front.)
exports.adsCreateCampaign = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const conn = await loadAdsConnection(uid);
  if (!conn?.accessToken || !conn?.adAccountId) {
    throw new HttpsError('failed-precondition', 'Connect your Meta account first.');
  }
  const promoting = String(request.data?.promoting || '').trim().slice(0, 120) || 'My shop';
  const token = conn.accessToken;

  const params = new URLSearchParams({
    name: `Ads — ${promoting}`,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',                       // <- never live on create
    smart_promotion_type: 'AUTOMATED_SHOPPING_ADS',
    special_ad_categories: JSON.stringify([]),
    access_token: token,
  });
  const res = await fetch(`${META_GRAPH}/${conn.adAccountId}/campaigns`, {
    method: 'POST', body: params,
  });
  const json = await res.json();
  if (!json.id) {
    throw new HttpsError('internal', json.error?.message || 'Meta rejected the campaign.');
  }
  return { id: json.id, name: `Ads — ${promoting}`, status: 'PAUSED' };
});

// The ONLY call that can start spending: flip a campaign ACTIVE (or PAUSED).
exports.adsSetStatus = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const conn = await loadAdsConnection(uid);
  if (!conn?.accessToken) throw new HttpsError('failed-precondition', 'Connect your Meta account first.');
  const id = String(request.data?.id || '');
  const status = request.data?.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
  if (!id) throw new HttpsError('invalid-argument', 'Missing campaign id.');
  const res = await fetch(`${META_GRAPH}/${id}`, {
    method: 'POST',
    body: new URLSearchParams({ status, access_token: conn.accessToken }),
  });
  const json = await res.json();
  if (json.error) throw new HttpsError('internal', json.error.message || 'Couldn’t update the campaign.');
  return { id, status };
});
