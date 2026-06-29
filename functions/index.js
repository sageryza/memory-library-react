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
const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
async function persistImage(imageUrl, path, transform = null, requireStorage = false) {
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
    // For keepsake images (requireStorage) never hand back a temporary URL —
    // those expire in ~an hour and leave the saved drawing permanently broken.
    // Fail loudly so the client shows an error and the user can retry.
    if (requireStorage) {
      console.error('persistImage failed (requireStorage)', e);
      throw new HttpsError('unavailable', 'Could not save the drawing. Please try again.');
    }
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
async function generateOpenAIImage(key, prompt, quality = 'low', size = '1024x1024') {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, n: 1, size, quality, output_format: 'webp' }),
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

// Coloring Page — a printable black-and-white line-art page from a prompt.
// Clean bold outlines, no shading or fill, large simple shapes, portrait page.
// quality defaults to "medium".
async function renderColoringPage(rawPrompt, qualityIn) {
  const raw = String(rawPrompt || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Describe the coloring page you want.');
  let quality = String(qualityIn || 'medium');
  if (!STICKER_QUALITIES.has(quality)) quality = 'medium';
  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }
  const body = raw.slice(0, 1000);
  const prompt =
    'A black-and-white coloring book page. Clean bold black outlines on a pure '
    + 'white background, even line weight, NO shading, NO grey, NO color, NO solid '
    + 'fills — just crisp outlines to color in. Large, simple, friendly shapes with '
    + 'clear separated regions, suitable for a child to color. Fill the page as a '
    + 'single charming scene. No text, words, letters or watermarks. The scene: '
    + body;
  const buffer = await generateOpenAIImage(key, prompt, quality, '1024x1536');
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const url = await persistBuffer(buffer, `forge-coloring/${stamp}.webp`);
  return { url, quality, prompt: body };
}

exports.forgeTestImage = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const styleKey = String(request.data?.style || 'gosh');
    // Sticker Page rides on this (publicly-invokable) function. "redo-sticker"
    // takes an image (no text prompt), so it's handled before the prompt check.
    if (styleKey === 'redo-sticker') {
      return redoSticker(String(request.data?.image || ''), String(request.data?.mimeType || 'image/png'), request.data?.prompt);
    }
    const raw = String(request.data?.prompt || '').trim();
    if (!raw) throw new HttpsError('invalid-argument', 'Enter a prompt.');

    // "sticker-sheet" renders a full sheet (+ segmented boxes) via the helper.
    if (styleKey === 'sticker-sheet') {
      return renderStickerSheet(raw, request.data?.quality);
    }
    // "coloring-page" renders a printable black-and-white line-art page.
    if (styleKey === 'coloring-page') {
      return renderColoringPage(raw, request.data?.quality);
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
// muted palette. We steer toward FREE-FORM individually die-cut shapes (not
// round badges) and a calmer count — a few big stickers plus a handful of small
// ones. quality defaults to "medium". Reached via forgeTestImage (style
// "sticker-sheet") so it rides on a function that already has the public
// invoker binding the client SDK needs.
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
  const prompt =
    'A sheet of individual illustrations on a plain white background. Use the '
    + 'attached images ONLY as the art-style and palette reference — delicate '
    + 'hand-drawn fine black line art with soft flat muted color fills (dusty '
    + 'rose, sage, ochre, terracotta, lavender, pale blue). Do NOT copy their '
    + 'content. Each illustration is free-form, following its own outline (not '
    + 'inside a circle or badge). The illustrations sit directly on the white '
    + 'page — NO white border, no outline, no halo and no drop shadow around '
    + 'them, like art printed straight onto paper. Compose 6 to 8 normal-size '
    + 'illustrations plus 6 to 8 smaller accent illustrations. The small accents '
    + "must match the sheet's theme — little objects or details drawn from the "
    + 'same subject — NOT generic sparkles or gems unless they fit the theme. '
    + 'Spread everything out with breathing room, not crowded. Absolutely no '
    + 'text, words, letters or watermarks anywhere. The illustrations depict: ' + body;

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
  const outBuf = Buffer.from(b64, 'base64');
  // Cut the sheet into individual sticker boxes so the app can offer tap-to-redo
  // and (later) drag-to-rearrange. Boxes are fractions of the sheet, so the app
  // lays them out at any display size. Best-effort: never fail the generation.
  const stickers = await segmentStickerSheet(outBuf).catch((e) => {
    console.warn('segmentStickerSheet failed', e.message); return [];
  });
  const url = await persistBuffer(outBuf, `forge-stickers/${stamp}.webp`);
  return { url, quality, prompt: body, stickers };
}

// Find each sticker's bounding box on the plain white background: connected
// components over a dilated "not near-white" mask, at a downscaled analysis
// resolution. Returns boxes as fractions {xPct,yPct,wPct,hPct} of the full
// sheet (largest first). Pure pixel analysis — no uploads, no network.
async function segmentStickerSheet(buffer) {
  const meta = await sharp(buffer).metadata();
  const W0 = meta.width, H0 = meta.height;
  const AW = 384, AH = Math.round((H0 / W0) * AW);
  const { data, info } = await sharp(buffer).resize(AW, AH).greyscale()
    .raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, n = w * h;
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = data[i] < 238 ? 1 : 0;
  // Dilate (separable max filter, radius r) to close line-art gaps + merge parts.
  const r = 4, tmp = new Uint8Array(n), dil = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; if (fg[y*w+xx]) { m = 1; break; } } tmp[y*w+x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; if (tmp[yy*w+x]) { m = 1; break; } } dil[y*w+x] = m;
  }
  // Connected components (BFS, 8-connected).
  const lab = new Int32Array(n), qx = new Int32Array(n), qy = new Int32Array(n);
  let cur = 0; const comps = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const idx = y*w+x; if (!dil[idx] || lab[idx]) continue;
    cur++; let head = 0, tail = 0; qx[tail] = x; qy[tail] = y; tail++; lab[idx] = cur;
    let minx = x, maxx = x, miny = y, maxy = y, area = 0;
    while (head < tail) {
      const cx = qx[head], cy = qy[head]; head++; area++;
      if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx+dx, ny = cy+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny*w+nx; if (dil[ni] && !lab[ni]) { lab[ni] = cur; qx[tail] = nx; qy[tail] = ny; tail++; }
      }
    }
    comps.push({ minx, miny, maxx, maxy, area });
  }
  const padA = 6;
  return comps
    .filter((c) => c.area > n * 0.0008)            // drop speckle noise
    .map((c) => {
      const x0 = Math.max(0, c.minx - padA), y0 = Math.max(0, c.miny - padA);
      const x1 = Math.min(w, c.maxx + padA), y1 = Math.min(h, c.maxy + padA);
      return { xPct: x0 / w, yPct: y0 / h, wPct: (x1 - x0) / w, hPct: (y1 - y0) / h, area: c.area };
    })
    .sort((a, b) => b.area - a.area)
    .map(({ area, ...box }) => box);
}

// Redo one sticker: take the cropped tile the user tapped and draw a fresh
// variation of the same subject in the same house style, on a plain white
// background. Returns a new image URL the app swaps into that slot.
async function redoSticker(imageBase64, mimeType, userPrompt) {
  if (!imageBase64) throw new HttpsError('invalid-argument', 'No sticker image to redo.');
  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }
  const buf = Buffer.from(imageBase64, 'base64');
  const want = String(userPrompt || '').trim().slice(0, 300);
  // With a user prompt: draw that NEW subject in the same style. Without one:
  // a fresh variation of whatever the tile already shows.
  const prompt = want
    ? ('Use the attached image ONLY as the art-STYLE reference — match its '
      + 'delicate hand-drawn fine black line art and soft muted palette. Draw ONE '
      + 'new sticker of: ' + want + '. Center it on a plain white background. No '
      + 'white border, no outline, no drop shadow, no text. Just the single '
      + 'illustration on white.')
    : ('Redraw the single subject in the attached image as ONE fresh sticker '
      + 'illustration — a new variation of the SAME thing (same kind of object), '
      + 'keeping the delicate hand-drawn fine black line art and soft muted palette. '
      + 'Center it on a plain white background. No white border, no outline, no '
      + 'drop shadow, no text. Just the single illustration on white.');
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', 'low');   // one small sticker — favor speed
  form.append('output_format', 'webp');
  form.append('image[]', new Blob([buf], { type: mimeType || 'image/png' }), 'tile.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) throw new HttpsError('resource-exhausted', 'OpenAI rate limit. Wait ~30–60s and try again.');
    throw new HttpsError('internal', `OpenAI ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new HttpsError('internal', 'No image returned from gpt-image-2.');
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const url = await persistBuffer(Buffer.from(b64, 'base64'), `forge-stickers/redo-${stamp}.webp`);
  return { url };
}

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
  'You distill a small real-life moment into ONE clever little doodle for a keepsake book',
  'of tiny daily miracles. Think hard: the doodle is a single SYMBOL — one object (or a',
  'tight, witty combination of objects) that captures the WHOLE story and its twist at a',
  'glance, like a clever icon, pictogram, or little diagram. The intelligence is in',
  'choosing/combining the RIGHT thing so it reads instantly and makes someone smile.',
  '',
  'HARD RULES:',
  '- It is a THING, not a scene. NO people, NO human figures, NO faces, NO hands, NO speech',
  '  bubbles, NO background or setting. Just the object(s), centered on a blank page like a',
  '  diagram.',
  '- Combine ideas when that is the clever move. Examples:',
  '  · "the bakery was closed but they unlocked it for my birthday" →',
  '    a birthday cake with a little "CLOSED" sign hanging on it.',
  '  · "a Mini Brands surprise ball opened to tiny strawberry pancakes" →',
  '    a cracked-open capsule with a tiny stack of pancakes inside.',
  '  · "a girl named Hope brought me water when I nearly fainted" →',
  '    a glass of water with a small halo floating over it.',
  '- A few small hand-lettered words or a tiny sign ARE allowed when they make it click.',
  '  Keep them minimal.',
  '- Keep it drawable in a few simple pen lines.',
  '',
  'If one symbol nails it, return ONE. If a couple of different objects could each work,',
  'return up to THREE distinct concepts so the person can choose.',
  '',
  'Respond with ONLY JSON: {"concepts": [{"caption": "...", "drawing": "..."}, ...]}',
  '(1 to 3 items).',
  '- drawing: name the single object / diagram concretely, including any clever combination',
  '  or tiny label — but NO people and NO scenery.',
  '- caption: a short, warm, lowercase note for the moment, max ~8 words.',
].join('\n');

// ---- OpenAI engine (experimental) -----------------------------------------
// Instead of the trained "Sketchy" LoRA, draw with gpt-image-1's image *edits*
// endpoint, passing a handful of the author's own doodles as style references.
// Toggle per-call with { engine: 'openai' }; default stays Replicate/Sketchy.
const MIRACLE_OPENAI_PROMPT = (concept) =>
  'A single small object drawn as a simple doodle / icon on a plain white background, '
  + 'centered with lots of empty white space — like a quick diagram, NOT a scene. Loose, '
  + 'imperfect, hand-drawn with a thin black ballpoint pen, wobbly uneven lines, childlike '
  + 'and minimal, like the reference images. No shading, no solid black fills, no color, '
  + `NO people, NO hands, NO background. Draw: ${concept}. A tiny hand-lettered label is `
  + 'okay only if it helps.';

// The author's reference doodles, committed under functions/miracle-refs/.
// Read once and cached for the life of the instance.
let _miracleRefs = null;
function loadMiracleRefs() {
  if (_miracleRefs) return _miracleRefs;
  const dir = path.join(__dirname, 'miracle-refs');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(webp|png|jpe?g)$/i.test(f)).sort(); } catch { /* none */ }
  _miracleRefs = files.map((f) => ({
    name: f,
    buffer: fs.readFileSync(path.join(dir, f)),
    type: f.endsWith('.webp') ? 'image/webp' : (/jpe?g$/i.test(f) ? 'image/jpeg' : 'image/png'),
  }));
  return _miracleRefs;
}

// Draw the subject with gpt-image-1 edits + the reference doodles. Returns a
// PNG/webp buffer (caller trims + persists).
async function generateMiracleOpenAIImage(key, subject) {
  const refs = loadMiracleRefs();
  if (!refs.length) throw new HttpsError('failed-precondition', 'No reference doodles bundled.');
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', MIRACLE_OPENAI_PROMPT(subject));
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  form.append('n', '1');
  for (const r of refs) form.append('image[]', new Blob([r.buffer], { type: r.type }), r.name);

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (res.status === 429) throw new HttpsError('resource-exhausted', 'OpenAI rate limit. Wait ~30–60s and retry.');
    throw new HttpsError('internal', `OpenAI ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new HttpsError('internal', 'No image returned from OpenAI edits.');
  return Buffer.from(b64, 'base64');
}

exports.illustrateMiracle = onCall(
  { region: 'us-central1', timeoutSeconds: 300, memory: '2GiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const text = String(request.data?.text || '').trim();
    if (!text) throw new HttpsError('invalid-argument', 'Write a miracle first.');
    const id = String(request.data?.id || crypto.randomUUID());
    // Which illustrator: 'openai' (gpt-image-1 + reference doodles) or the
    // default 'replicate' (the Sketchy LoRA). Lets us compare them live.
    const engine = String(request.data?.engine || 'replicate').toLowerCase();

    // Distill the moment into 1–3 whole-story doodle concepts (best-effort).
    // When distill is false, draw the user's text verbatim as a single concept.
    const distill = request.data?.distill !== false;
    // How many concept variants to actually render (the distiller may offer up
    // to 3; render up to `variants` of them so the person can pick).
    const variants = Math.max(1, Math.min(3, Number(request.data?.variants) || 1));

    let concepts = [{ caption: text.slice(0, 80), drawing: text }];
    if (distill) {
      const anthropicKey = await loadAnthropicKey();
      if (anthropicKey) {
        try {
          const client = new Anthropic({ apiKey: anthropicKey });
          const msg = await client.messages.create({
            model: 'claude-opus-4-8',
            max_tokens: 3000,
            thinking: { type: 'adaptive' }, // let it really reason about the best idea
            output_config: { effort: 'high' },
            system: MIRACLE_SYSTEM,
            messages: [{ role: 'user', content: text.slice(0, 2000) }],
          });
          // With thinking on, the answer is the text block (not content[0]).
          const block = (msg.content || []).find((b) => b.type === 'text');
          const raw = (block?.text || '').trim().replace(/^```json\s*|\s*```$/g, '');
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed.concepts)
            ? parsed.concepts
            : (parsed.drawing ? [parsed] : []);
          const clean = arr
            .filter((c) => c && c.drawing)
            .map((c) => ({ caption: String(c.caption || '').trim(), drawing: String(c.drawing).trim() }));
          if (clean.length) concepts = clean;
        } catch (e) {
          console.error('miracle distill failed; using raw text', e);
        }
      }
    }
    const chosen = concepts.slice(0, variants);

    // Load the engine's key/token once, then render each chosen concept.
    let renderOne;
    let version;
    if (engine === 'openai') {
      const openaiKey = await loadOpenAIKey();
      if (!openaiKey) {
        throw new HttpsError('failed-precondition',
          'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
      }
      version = 'v7-concepts';
      renderOne = async (concept) => {
        const buffer = await generateMiracleOpenAIImage(openaiKey, concept.drawing);
        const filled = await trimToSubject(buffer); // fill the frame, same as Sketchy
        return persistBuffer(filled, `miracles/${uid}/${id}/${crypto.randomUUID()}.webp`);
      };
    } else {
      const repToken = await loadReplicateToken();
      if (!repToken) {
        throw new HttpsError('failed-precondition', 'No Replicate token found in config/*.');
      }
      version = MIRACLE_FN_VERSION;
      renderOne = async (concept) => {
        // Ease the LoRA strength a touch — at full scale it scrawls its trigger word.
        const prompt = `${MIRACLE_TRIGGER}, ${concept.drawing}, ${MIRACLE_STYLE_GUIDE}`;
        const { rawUrl } = await generateReplicateImage(repToken, prompt, MIRACLE_MODEL, 0.9);
        return persistImage(rawUrl, `miracles/${uid}/${id}/${crypto.randomUUID()}.webp`, trimToSubject, true);
      };
    }

    const urls = await Promise.all(chosen.map((c) => renderOne(c)));
    const out = chosen.map((c, i) => ({ caption: c.caption, drawing: c.drawing, url: urls[i] }));

    // First concept is the primary (back-compat with the current single-image
    // clients); `concepts` carries all rendered options to pick from.
    return {
      url: out[0].url,
      caption: out[0].caption,
      drawing: out[0].drawing,
      concepts: out,
      id,
      version,
      engine,
    };
  }
);
