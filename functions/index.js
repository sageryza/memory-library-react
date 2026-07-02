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

const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileP = promisify(execFile);
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

// Dream — illustrate a dream in a fixed moody diary-comic style (mirrors the
// "Talking to Myself" zine look). The dream text becomes the scene; the image
// itself carries NO text (the app shows the words as a caption).
async function renderDream(rawPrompt, qualityIn) {
  const raw = String(rawPrompt || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Write down your dream first.');
  let quality = String(qualityIn || 'medium');
  if (!STICKER_QUALITIES.has(quality)) quality = 'medium';
  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }
  const body = raw.slice(0, 1200);
  const prompt =
    'Detailed pen-and-ink illustration with dense cross-hatching and fine line '
    + 'work, softened by muted watercolor washes in a limited, dusty palette '
    + '(sepia, faded indigo, ochre, sage, dusty rose). Aged cream paper texture. '
    + 'A single framed panel with a hand-drawn border. Melancholic, surreal, '
    + 'intimate diary mood, like an outsider-art comic. Simple composition, one '
    + 'or two subjects. Absolutely no text, no words, no letters, no captions '
    + 'anywhere in the image. The dream: ' + body;
  const buffer = await generateOpenAIImage(key, prompt, quality, '1024x1024');
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const url = await persistBuffer(buffer, `forge-dreams/${stamp}.webp`);
  return { url, quality, prompt: body };
}

// Storybook page — one picture-book page: an illustrated scene with the page's
// caption set cleanly along the bottom (like a real children's book). The model
// draws NO text; we composite the caption ourselves (sharp) so it's always
// legible and correctly spelled. Pages flip in the app to build a whole book.
async function captionStorybookPage(imgBuffer, text) {
  const W = 1024, H = 1536;
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 30) { if (cur) lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  const fontSize = 46, lineH = Math.round(fontSize * 1.32), padY = 50;
  const bandH = Math.max(160, lines.length * lineH + padY * 2);
  const top = H - bandH;
  const tspans = lines.map((l, i) =>
    `<tspan x="${W / 2}" y="${top + padY + fontSize + i * lineH}">${escapeXml(l)}</tspan>`).join('');
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="0" y="${top}" width="${W}" height="${bandH}" fill="#fffdf6"/>`
    + `<rect x="0" y="${top}" width="${W}" height="3" fill="#e7e0cf"/>`
    + `<text font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" fill="#2c2622" `
    + `text-anchor="middle" font-style="italic">${tspans}</text></svg>`;
  return sharp(imgBuffer).resize(W, H, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp().toBuffer();
}

async function renderStorybookPage(rawPrompt, captionText, qualityIn) {
  const raw = String(rawPrompt || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Describe the picture for this page.');
  let quality = String(qualityIn || 'medium');
  if (!STICKER_QUALITIES.has(quality)) quality = 'medium';
  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }
  const body = raw.slice(0, 1000);
  const prompt =
    'A warm, whimsical children\'s picture-book illustration. Soft hand-painted '
    + 'storybook style, cozy inviting palette, expressive friendly characters, a '
    + 'full-bleed scene that fills the frame. Keep the lower portion of the image '
    + 'calmer and less busy (room for a caption). Absolutely no text, words, '
    + 'letters, captions or watermarks anywhere in the image. The scene: ' + body;
  const buffer = await generateOpenAIImage(key, prompt, quality, '1024x1536');
  const caption = String(captionText || '').trim();
  const finalBuffer = caption ? await captionStorybookPage(buffer, caption) : buffer;
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const url = await persistBuffer(finalBuffer, `forge-storybook/${stamp}.webp`);
  return { url, quality, prompt: body, caption };
}

// Greeting Card — a card-front illustration with the greeting set as a clean
// display headline along the bottom (composited by us so it's always legible
// and correctly spelled). Portrait, like a folded card front.
async function headlineGreetingCard(imgBuffer, text) {
  const W = 1024, H = 1536;
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 18) { if (cur) lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  const fontSize = 70, lineH = Math.round(fontSize * 1.22), padY = 56;
  const bandH = Math.max(190, lines.length * lineH + padY * 2);
  const top = H - bandH;
  const tspans = lines.map((l, i) =>
    `<tspan x="${W / 2}" y="${top + padY + fontSize + i * lineH}">${escapeXml(l)}</tspan>`).join('');
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="0" y="${top}" width="${W}" height="${bandH}" fill="#fffaf0" fill-opacity="0.94"/>`
    + `<rect x="0" y="${top}" width="${W}" height="3" fill="#e3d9c2"/>`
    + `<text font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" fill="#3a2f2a" `
    + `text-anchor="middle" font-weight="600">${tspans}</text></svg>`;
  return sharp(imgBuffer).resize(W, H, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp().toBuffer();
}

async function renderGreetingCard(rawPrompt, messageText, qualityIn) {
  const raw = String(rawPrompt || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Describe the card you want.');
  let quality = String(qualityIn || 'medium');
  if (!STICKER_QUALITIES.has(quality)) quality = 'medium';
  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }
  const body = raw.slice(0, 1000);
  const prompt =
    'A beautiful greeting-card front illustration. Charming, celebratory and '
    + 'tasteful, with a cohesive palette and clear focal subject. Leave calmer '
    + 'negative space along the bottom of the image for a short greeting. '
    + 'Absolutely no text, words, letters or watermarks anywhere in the image. '
    + 'The card: ' + body;
  const buffer = await generateOpenAIImage(key, prompt, quality, '1024x1536');
  const message = String(messageText || '').trim();
  const finalBuffer = message ? await headlineGreetingCard(buffer, message) : buffer;
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const url = await persistBuffer(finalBuffer, `forge-cards/${stamp}.webp`);
  return { url, quality, prompt: body, message };
}

// ===========================================================================
// Instagram post — a polished square (1:1) image from a prompt, optionally with
// product reference images and optional caption text rendered cleanly ONTO the
// image (for meme-style posts). The text is composited by us (sharp) rather than
// drawn by the model, so it's always legible and correctly spelled.
// ===========================================================================
function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

async function overlayCaption(imgBuffer, text) {
  const W = 1080, H = 1350;
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 24) { if (cur) lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  const fontSize = 56, lineH = Math.round(fontSize * 1.25), pad = 50;
  const blockH = lines.length * lineH + pad * 2;
  const top = H - blockH;
  const tspans = lines.map((l, i) =>
    `<tspan x="${W / 2}" y="${top + pad + fontSize + i * lineH}">${escapeXml(l)}</tspan>`).join('');
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="0" y="${top}" width="${W}" height="${blockH}" fill="#000" fill-opacity="0.42"/>`
    + `<text font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" fill="#ffffff" `
    + `text-anchor="middle" font-weight="600">${tspans}</text></svg>`;
  return sharp(imgBuffer).resize(W, H, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp().toBuffer();
}

// Instagram feed posts upload at 4:5 (1080x1350) and the profile grid crops to
// ~3:4, so we generate tall then center-crop to 4:5 — keeping the subject centered
// (center-safe) so nothing important is lost in the grid thumbnail.
async function cropTo45(buffer) {
  const meta = await sharp(buffer).metadata();
  const w = meta.width || 1024, h = meta.height || 1536;
  let cw = w, ch = Math.round(w * 1.25); // 4:5 -> height = width * 5/4
  if (ch > h) { ch = h; cw = Math.round(h * 0.8); }
  const left = Math.round((w - cw) / 2), top = Math.round((h - ch) / 2);
  return sharp(buffer).extract({ left, top, width: cw, height: ch })
    .resize(1080, 1350, { fit: 'fill' }).webp().toBuffer();
}

// Aesthetic presets — a brand picks its lane once; each is a baked prompt wrapper.
const IG_AESTHETICS = {
  dark: 'An atmospheric, witchy Instagram photo with a moody, mystical feel. '
    + 'Soft dramatic lighting — candlelight or moonlight — with a rich dark-romantic '
    + 'palette of deep indigo, amethyst, dusty rose and antique gold, elegant '
    + 'film-like texture and a subtle grain. Mysterious and tactile rather than '
    + 'bright or generic, while keeping the subject clearly visible. ',
  celestial: 'A dreamy, celestial Instagram photo with a soft cosmic mood — moons, '
    + 'stars and night-sky tones. Gentle gradients of midnight blue, lavender and '
    + 'silver with a faint ethereal glow and fine grain. Serene and otherworldly, '
    + 'while keeping the subject clearly visible. ',
  earthy: 'An earthy, herbal-witch Instagram photo with a natural-daylight, '
    + 'cottagecore-apothecary mood. Warm woods, dried botanicals, linen and stone in '
    + 'a muted palette of sage, ochre, terracotta and cream. Tactile and grounded, '
    + 'while keeping the subject clearly visible. ',
};

async function renderIgPost(rawPrompt, refsData, captionText, qualityIn, aestheticIn) {
  const raw = String(rawPrompt || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Describe the post first.');
  let quality = String(qualityIn || 'medium');
  if (!STICKER_QUALITIES.has(quality)) quality = 'medium';
  const aesthetic = IG_AESTHETICS[String(aestheticIn)] ? String(aestheticIn) : 'dark';
  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }
  const body = raw.slice(0, 1000);
  const refs = (Array.isArray(refsData) ? refsData : []).slice(0, 4).map((s) => {
    const str = String(s || '');
    const m = /^data:([^;]+);base64,(.*)$/.exec(str);
    const b64 = m ? m[2] : str;
    const mime = m ? m[1] : 'image/png';
    try { return { buffer: Buffer.from(b64, 'base64'), mime }; } catch { return null; }
  }).filter(Boolean);

  const prompt = IG_AESTHETICS[aesthetic] + body
    + (refs.length ? ' Use the attached image(s) as the product/subject reference — keep the product faithful.' : '')
    + ' No text or watermarks in the image.';

  let buffer;
  if (refs.length) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', quality);
    form.append('output_format', 'webp');
    refs.forEach((r, i) => form.append('image[]', new Blob([r.buffer], { type: r.mime }), `ref${i + 1}.png`));
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) throw new HttpsError('resource-exhausted', 'OpenAI rate limit. Wait ~30–60s and try again.');
      throw new HttpsError('internal', `OpenAI ${res.status}: ${text.slice(0, 400)}`);
    }
    const b64 = (await res.json())?.data?.[0]?.b64_json;
    if (!b64) throw new HttpsError('internal', 'No image returned from gpt-image-2.');
    buffer = Buffer.from(b64, 'base64');
  } else {
    buffer = await generateOpenAIImage(key, prompt, quality, '1024x1536');
  }

  buffer = await cropTo45(buffer); // 4:5, center-safe for the grid crop
  const caption = String(captionText || '').trim();
  if (caption) buffer = await overlayCaption(buffer, caption);

  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const url = await persistBuffer(buffer, `forge-instagram/${stamp}.webp`);
  return { url, quality, prompt: body, aesthetic };
}

// Caption + hashtag helper — an on-brand caption and hashtag set for a post
// subject, in the witchy-but-authoritative voice. Text only (no image).
async function generateIgCaption(subject) {
  const subj = String(subject || '').trim();
  if (!subj) throw new HttpsError('invalid-argument', 'Describe the post to caption.');
  const key = await loadOpenAIKey();
  if (!key) throw new HttpsError('failed-precondition', 'No OpenAI key found in config/*.');
  const sys = 'You write Instagram captions for a witchy, metaphysical apothecary '
    + 'brand (crystals, herbs, ritual goods, candles). Voice: whimsical yet '
    + 'authoritative, a little mystical and lyrical, warm, never cheesy or salesy. '
    + 'Return strict JSON: {"caption": string (1-3 short sentences, optionally one '
    + 'tasteful emoji), "hashtags": string[] (10-14 lowercase tags WITHOUT the # sign, '
    + 'mixing broad tags like witchesofinstagram with niche ones relevant to the subject)}.';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: `Post subject: ${subj}` }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (res.status === 429) throw new HttpsError('resource-exhausted', 'OpenAI rate limit. Wait and retry.');
    throw new HttpsError('internal', `OpenAI ${res.status}: ${t.slice(0, 300)}`);
  }
  let parsed = {};
  try { parsed = JSON.parse((await res.json())?.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  const caption = String(parsed.caption || '').trim();
  const hashtags = (Array.isArray(parsed.hashtags) ? parsed.hashtags : [])
    .map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 14);
  return { caption, hashtags };
}

// ===========================================================================
// Carousel — a short educational multi-slide post (the highest-engagement IG
// format). An LLM plans a cover title + 4 content slides; each slide is an
// aesthetic 4:5 image with its text composited on a legibility scrim.
// ===========================================================================
function wrapLines(text, maxChars) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

const AESTHETIC_BG = { dark: '#2a2230', celestial: '#1c1b3a', earthy: '#3a3326' };

async function solidBg(aesthetic) {
  const c = AESTHETIC_BG[aesthetic] || '#2a2230';
  return sharp({ create: { width: 1080, height: 1350, channels: 3, background: c } }).webp().toBuffer();
}

async function composeSlide(buffer, heading, body, isTitle) {
  const W = 1080, H = 1350;
  const scrim = '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#000" stop-opacity="0.18"/>'
    + '<stop offset="0.55" stop-color="#000" stop-opacity="0.38"/>'
    + '<stop offset="1" stop-color="#000" stop-opacity="0.80"/></linearGradient>';
  let textSvg = '';
  if (isTitle) {
    const hLines = wrapLines(heading, 16);
    const hSize = 92, hLineH = Math.round(hSize * 1.12);
    const startY = H / 2 - (hLines.length * hLineH) / 2 + hSize;
    const t = hLines.map((l, i) => `<tspan x="${W / 2}" y="${startY + i * hLineH}">${escapeXml(l)}</tspan>`).join('');
    textSvg = `<text font-family="Georgia, 'Times New Roman', serif" font-size="${hSize}" fill="#ffffff" text-anchor="middle" font-weight="700">${t}</text>`;
  } else {
    const hLines = wrapLines(heading, 18);
    const bLines = wrapLines(body, 34);
    const hSize = 64, hLineH = Math.round(hSize * 1.12);
    const bSize = 38, bLineH = Math.round(bSize * 1.32);
    const bottomPad = 130;
    const bStartY = H - bottomPad - (bLines.length * bLineH) + bSize;
    const hStartY = H - bottomPad - (bLines.length * bLineH) - 30 - (hLines.length * hLineH) + hSize;
    const hT = hLines.map((l, i) => `<tspan x="80" y="${hStartY + i * hLineH}">${escapeXml(l)}</tspan>`).join('');
    const bT = bLines.map((l, i) => `<tspan x="80" y="${bStartY + i * bLineH}">${escapeXml(l)}</tspan>`).join('');
    textSvg = `<text font-family="Georgia, serif" font-size="${hSize}" fill="#ffffff" text-anchor="start" font-weight="700">${hT}</text>`
      + `<text font-family="Georgia, serif" font-size="${bSize}" fill="#f1ede7" text-anchor="start">${bT}</text>`;
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${scrim}</defs>`
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>${textSvg}</svg>`;
  return sharp(buffer).resize(W, H, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp().toBuffer();
}

async function renderCarousel(topic, aestheticIn, qualityIn) {
  const t = String(topic || '').trim();
  if (!t) throw new HttpsError('invalid-argument', 'Give the carousel a topic.');
  const aesthetic = IG_AESTHETICS[String(aestheticIn)] ? String(aestheticIn) : 'dark';
  let quality = String(qualityIn || 'low');
  if (!STICKER_QUALITIES.has(quality)) quality = 'low';
  const key = await loadOpenAIKey();
  if (!key) throw new HttpsError('failed-precondition', 'No OpenAI key found in config/*.');

  // 1) Plan the carousel content.
  const sys = 'You design short educational Instagram carousels for a witchy, '
    + 'metaphysical apothecary brand (crystals, herbs, ritual goods). Return strict '
    + 'JSON: {"title": string (punchy cover title, <=6 words), "slides": '
    + '[{"heading": string (<=5 words), "body": string (one short sentence), '
    + '"imagePrompt": string (a vivid visual scene illustrating this slide, no text)}] '
    + '(exactly 4 slides), "caption": string (1-2 sentences), "hashtags": string[] '
    + '(10-12 lowercase tags, no # sign)}.';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: `Carousel topic: ${t}` }],
      response_format: { type: 'json_object' }, temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const x = await res.text().catch(() => '');
    throw new HttpsError('internal', `OpenAI ${res.status}: ${x.slice(0, 200)}`);
  }
  let plan = {};
  try { plan = JSON.parse((await res.json())?.choices?.[0]?.message?.content || '{}'); } catch { plan = {}; }
  const title = String(plan.title || t).slice(0, 80);
  const slides = (Array.isArray(plan.slides) ? plan.slides : []).slice(0, 4);
  if (!slides.length) throw new HttpsError('internal', 'Could not plan the carousel.');

  // 2) Generate all slides in parallel (cover + content); fall back to a solid
  // aesthetic background if any single image generation fails.
  const genSlide = async (imgPrompt, heading, body, isTitle) => {
    let bg;
    try {
      const raw = await generateOpenAIImage(key, IG_AESTHETICS[aesthetic] + imgPrompt + ' No text or watermarks in the image.', quality, '1024x1536');
      bg = await cropTo45(raw);
    } catch (e) {
      bg = await solidBg(aesthetic);
    }
    return composeSlide(bg, heading, body, isTitle);
  };
  const jobs = [genSlide(t, title, '', true)];
  for (const s of slides) {
    jobs.push(genSlide(String(s.imagePrompt || s.heading || t), String(s.heading || ''), String(s.body || ''), false));
  }
  const buffers = await Promise.all(jobs);

  // 3) Persist each slide.
  const urls = [];
  for (const buf of buffers) {
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    urls.push(await persistBuffer(buf, `forge-instagram/carousel-${stamp}.webp`));
  }
  const hashtags = (Array.isArray(plan.hashtags) ? plan.hashtags : [])
    .map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 12);
  return { slides: urls, url: urls[0], title, caption: String(plan.caption || ''), hashtags };
}

// Publish a set of images as a single Instagram carousel: create a carousel-item
// child container per image, then a CAROUSEL parent, wait, and publish.
async function publishCarouselToInstagram(imageUrls, caption) {
  const urls = (Array.isArray(imageUrls) ? imageUrls : []).filter(Boolean).slice(0, 10);
  if (urls.length < 2) throw new HttpsError('invalid-argument', 'A carousel needs at least 2 images.');
  const snap = await db.doc('config/instagram').get();
  const cfg = snap.exists ? snap.data() : null;
  const token = cfg?.accessToken, igUser = cfg?.igUserId;
  if (!token || !igUser) {
    throw new HttpsError('failed-precondition', 'Instagram posting isn’t set up yet.');
  }
  const base = 'https://graph.facebook.com/v21.0';
  const childIds = [];
  for (const u of urls) {
    const p = new URLSearchParams({ image_url: u, is_carousel_item: 'true', access_token: token });
    const r = await fetch(`${base}/${igUser}/media`, { method: 'POST', body: p });
    const j = await r.json();
    if (!r.ok || !j.id) throw new HttpsError('internal', `Carousel item failed: ${JSON.stringify(j.error || j).slice(0, 200)}`);
    childIds.push(j.id);
  }
  const cp = new URLSearchParams({ media_type: 'CAROUSEL', children: childIds.join(','), access_token: token });
  if (caption) cp.set('caption', caption);
  let r = await fetch(`${base}/${igUser}/media`, { method: 'POST', body: cp });
  let j = await r.json();
  if (!r.ok || !j.id) throw new HttpsError('internal', `Carousel create failed: ${JSON.stringify(j.error || j).slice(0, 200)}`);
  const creationId = j.id;
  for (let i = 0; i < 15; i++) {
    const s = await fetch(`${base}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const sj = await s.json();
    if (sj.status_code === 'FINISHED') break;
    if (sj.status_code === 'ERROR') throw new HttpsError('internal', 'Instagram could not process the carousel.');
    await new Promise((x) => setTimeout(x, 2000));
  }
  r = await fetch(`${base}/${igUser}/media_publish`, {
    method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  j = await r.json();
  if (!r.ok || !j.id) throw new HttpsError('internal', `Carousel publish failed: ${JSON.stringify(j.error || j).slice(0, 200)}`);
  return { id: j.id, posted: true, carousel: true };
}

// ===========================================================================
// Reel — turn an aesthetic still into a short cinematic vertical (9:16) clip
// with a slow Ken-Burns zoom (ffmpeg), then publish as an Instagram Reel. The
// ffmpeg-static binary is copied to /tmp once per instance (node_modules is
// read-only at runtime) and reused.
// ===========================================================================
let FFMPEG_BIN = null;
async function ensureFfmpeg() {
  if (FFMPEG_BIN) return FFMPEG_BIN;
  const src = require('ffmpeg-static');
  const dst = path.join('/tmp', 'ffmpeg-bin');
  try {
    await fs.promises.access(dst, fs.constants.X_OK);
    FFMPEG_BIN = dst;
    return dst;
  } catch { /* not copied yet */ }
  await fs.promises.copyFile(src, dst);
  await fs.promises.chmod(dst, 0o755);
  FFMPEG_BIN = dst;
  return dst;
}

async function kenBurnsMp4(stillBuffer) {
  const ff = await ensureFfmpeg();
  const id = crypto.randomUUID().slice(0, 8);
  const inP = path.join('/tmp', `reel-in-${id}.png`);
  const outP = path.join('/tmp', `reel-out-${id}.mp4`);
  await fs.promises.writeFile(inP, stillBuffer);
  // Pre-upscale then zoompan for a smooth slow zoom; silent stereo AAC track so
  // the Reel always has an audio stream (some IG validation expects one).
  const vf = "scale=2160:3840,zoompan=z='min(zoom+0.0009,1.18)':d=180:"
    + "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,format=yuv420p";
  try {
    await execFileP(ff, [
      '-y', '-loop', '1', '-i', inP,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf', vf, '-t', '6', '-r', '30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high',
      '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', outP,
    ], { maxBuffer: 1024 * 1024 * 64, timeout: 100000 });
    const mp4 = await fs.promises.readFile(outP);
    return mp4;
  } finally {
    fs.promises.unlink(inP).catch(() => {});
    fs.promises.unlink(outP).catch(() => {});
  }
}

async function renderReel(rawPrompt, aestheticIn, qualityIn) {
  const raw = String(rawPrompt || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Describe the reel first.');
  const aesthetic = IG_AESTHETICS[String(aestheticIn)] ? String(aestheticIn) : 'dark';
  let quality = String(qualityIn || 'medium');
  if (!STICKER_QUALITIES.has(quality)) quality = 'medium';
  const key = await loadOpenAIKey();
  if (!key) throw new HttpsError('failed-precondition', 'No OpenAI key found in config/*.');
  const prompt = IG_AESTHETICS[aesthetic] + raw.slice(0, 1000)
    + ' Vertical composition. No text or watermarks in the image.';
  const imgBuf = await generateOpenAIImage(key, prompt, quality, '1024x1536');
  const still = await sharp(imgBuf).resize(1080, 1920, { fit: 'cover' }).png().toBuffer();
  const mp4 = await kenBurnsMp4(still);
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const videoUrl = await persistBuffer(mp4, `forge-instagram/reel-${stamp}.mp4`, 'video/mp4');
  const posterUrl = await persistBuffer(await sharp(still).webp().toBuffer(), `forge-instagram/reel-${stamp}.webp`);
  return { videoUrl, url: posterUrl, prompt: raw.slice(0, 1000), aesthetic };
}

// Publish a video URL as an Instagram Reel (videos take longer to process, so
// poll a bit more patiently than the photo path).
async function publishReelToInstagram(videoUrl, caption) {
  if (!videoUrl) throw new HttpsError('invalid-argument', 'No video to post.');
  const snap = await db.doc('config/instagram').get();
  const cfg = snap.exists ? snap.data() : null;
  const token = cfg?.accessToken, igUser = cfg?.igUserId;
  if (!token || !igUser) {
    throw new HttpsError('failed-precondition', 'Instagram posting isn’t set up yet.');
  }
  const base = 'https://graph.facebook.com/v21.0';
  const p = new URLSearchParams({ media_type: 'REELS', video_url: videoUrl, access_token: token });
  if (caption) p.set('caption', caption);
  let r = await fetch(`${base}/${igUser}/media`, { method: 'POST', body: p });
  let j = await r.json();
  if (!r.ok || !j.id) throw new HttpsError('internal', `Reel create failed: ${JSON.stringify(j.error || j).slice(0, 200)}`);
  const creationId = j.id;
  let finished = false;
  for (let i = 0; i < 40; i++) {
    const s = await fetch(`${base}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const sj = await s.json();
    if (sj.status_code === 'FINISHED') { finished = true; break; }
    if (sj.status_code === 'ERROR') throw new HttpsError('internal', 'Instagram could not process the reel.');
    await new Promise((x) => setTimeout(x, 2500));
  }
  if (!finished) throw new HttpsError('deadline-exceeded', 'Reel is still processing — try posting again in a minute.');
  r = await fetch(`${base}/${igUser}/media_publish`, {
    method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  j = await r.json();
  if (!r.ok || !j.id) throw new HttpsError('internal', `Reel publish failed: ${JSON.stringify(j.error || j).slice(0, 200)}`);
  return { id: j.id, posted: true, reel: true };
}

// ===========================================================================
// Scheduling — save a finished post + a time to `scheduledPosts`; a cron
// (publishDuePosts) publishes it when due. Works for feed, story, carousel,
// and reel. The doc is deleted once processed so the collection stays small and
// the cron query needs only a single-field (postAt) index.
// ===========================================================================
async function scheduleInstagramPost(uid, data) {
  const type = String(data?.type || 'feed');
  const postAt = Number(data?.postAt || 0);
  if (!postAt || postAt < Date.now()) {
    throw new HttpsError('invalid-argument', 'Pick a time in the future.');
  }
  const doc = {
    uid: uid || null,
    type,                                   // feed | story | carousel | reel
    status: 'pending',
    postAt,                                 // ms since epoch
    caption: String(data?.caption || ''),
    imageUrl: data?.imageUrl ? String(data.imageUrl) : null,
    imageUrls: Array.isArray(data?.imageUrls) ? data.imageUrls.map(String) : null,
    videoUrl: data?.videoUrl ? String(data.videoUrl) : null,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('scheduledPosts').add(doc);
  return { id: ref.id, scheduled: true, postAt };
}

exports.publishDuePosts = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const now = Date.now();
    const snap = await db.collection('scheduledPosts')
      .where('postAt', '<=', now).orderBy('postAt').limit(20).get();
    for (const d of snap.docs) {
      const p = d.data();
      try {
        if (p.type === 'carousel') await publishCarouselToInstagram(p.imageUrls, p.caption);
        else if (p.type === 'reel') await publishReelToInstagram(p.videoUrl, p.caption);
        else await publishToInstagram(p.imageUrl, p.caption, p.type === 'story');
        console.log('scheduled post published', d.id, p.type);
      } catch (e) {
        console.warn('scheduled post failed', d.id, p.type, e.message);
      }
      // Fire once — remove the doc whether it posted or failed (no retry storms).
      await d.ref.delete().catch(() => {});
    }
  });

// Publish an already-generated image straight to Instagram via the Graph API.
// Credentials live in a locked-down Firestore doc config/instagram:
//   { igUserId: "<IG business account id>", accessToken: "<long-lived token>" }
// (admin-only, same pattern as the other secrets). Two-step flow: create a media
// container from the public image URL, wait for it to finish, then publish.
async function publishToInstagram(imageUrl, caption, asStory) {
  if (!imageUrl) throw new HttpsError('invalid-argument', 'No image to post.');
  const snap = await db.doc('config/instagram').get();
  const cfg = snap.exists ? snap.data() : null;
  const token = cfg?.accessToken;
  const igUser = cfg?.igUserId;
  if (!token || !igUser) {
    throw new HttpsError('failed-precondition',
      'Instagram posting isn’t set up yet. Add config/instagram with igUserId + accessToken.');
  }
  const base = 'https://graph.facebook.com/v21.0';

  // 1) Create the media container. Stories use media_type=STORIES and ignore
  // captions; feed posts carry the optional caption.
  const createParams = new URLSearchParams({ image_url: imageUrl, access_token: token });
  if (asStory) createParams.set('media_type', 'STORIES');
  else if (caption) createParams.set('caption', caption);
  let res = await fetch(`${base}/${igUser}/media`, { method: 'POST', body: createParams });
  let json = await res.json();
  if (!res.ok || !json.id) {
    throw new HttpsError('internal', `Instagram create failed: ${JSON.stringify(json.error || json).slice(0, 300)}`);
  }
  const creationId = json.id;

  // 2) Wait for the container to be ready (images are usually quick).
  for (let i = 0; i < 12; i++) {
    const s = await fetch(`${base}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const sj = await s.json();
    if (sj.status_code === 'FINISHED') break;
    if (sj.status_code === 'ERROR') throw new HttpsError('internal', 'Instagram could not process the image.');
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 3) Publish it.
  res = await fetch(`${base}/${igUser}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  json = await res.json();
  if (!res.ok || !json.id) {
    throw new HttpsError('internal', `Instagram publish failed: ${JSON.stringify(json.error || json).slice(0, 300)}`);
  }
  return { id: json.id, posted: true, story: !!asStory };
}

// Save a finished creation to the owner's list so it survives a dropped
// connection / backgrounded app and shows up in the in-app grid. Best-effort.
async function saveCreation(uid, type, data) {
  if (!uid || !data?.url) return;
  try {
    await db.collection('users').doc(uid).collection('creations').add({
      type,
      url: data.url,
      prompt: data.prompt || null,
      stickers: data.stickers || null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('saveCreation failed', e.message);
  }
}

exports.forgeTestImage = onCall(
  // 1GiB + 180s headroom for the Reel path (ffmpeg encode in /tmp + IG video processing).
  { region: 'us-central1', timeoutSeconds: 180, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const uid = request.auth.uid;
    const styleKey = String(request.data?.style || 'gosh');
    // Sticker Page rides on this (publicly-invokable) function. "redo-sticker"
    // takes an image (no text prompt), so it's handled before the prompt check.
    if (styleKey === 'redo-sticker') {
      return redoSticker(String(request.data?.image || ''), String(request.data?.mimeType || 'image/png'), request.data?.prompt);
    }
    // "closet-draw" (Choose What I Wear) redraws a photo of a clothing item as
    // a hand-drawn illustration on a transparent background. Image in, image
    // out — no text prompt.
    if (styleKey === 'closet-draw') {
      return drawClosetItem(
        String(request.data?.image || ''),
        String(request.data?.mimeType || 'image/jpeg'),
        String(request.data?.category || ''));
    }
    // "save-sheet" persists an edited sticker sheet (flattened in the app) to
    // the user's creations, so edits aren't lost. Takes an image, no prompt.
    if (styleKey === 'save-sheet') {
      const img = String(request.data?.image || '');
      if (!img) throw new HttpsError('invalid-argument', 'No image to save.');
      const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const url = await persistBuffer(Buffer.from(img, 'base64'), `forge-stickers/edited-${stamp}.jpg`, 'image/jpeg');
      await saveCreation(uid, 'sticker', { url, prompt: String(request.data?.prompt || 'edited sheet') });
      return { url };
    }
    // "ig-publish" posts an existing image straight to Instagram via the Graph
    // API (needs config/instagram set up). Takes imageUrl + caption + asStory.
    if (styleKey === 'ig-publish') {
      return publishToInstagram(
        String(request.data?.imageUrl || ''),
        String(request.data?.caption || ''),
        request.data?.asStory === true);
    }
    // "ig-carousel-publish" posts a set of image URLs as one IG carousel.
    if (styleKey === 'ig-carousel-publish') {
      return publishCarouselToInstagram(request.data?.imageUrls, String(request.data?.caption || ''));
    }
    // "ig-reel-publish" posts a video URL as an Instagram Reel.
    if (styleKey === 'ig-reel-publish') {
      return publishReelToInstagram(String(request.data?.videoUrl || ''), String(request.data?.caption || ''));
    }
    // "ig-schedule" saves a finished post + a time; publishDuePosts posts it later.
    if (styleKey === 'ig-schedule') {
      return scheduleInstagramPost(uid, request.data);
    }
    const raw = String(request.data?.prompt || '').trim();
    if (!raw) throw new HttpsError('invalid-argument', 'Enter a prompt.');

    // "sticker-sheet" renders a full sheet (+ segmented boxes) via the helper.
    if (styleKey === 'sticker-sheet') {
      const out = await renderStickerSheet(raw, request.data?.quality);
      await saveCreation(uid, 'sticker', out);
      return out;
    }
    // "coloring-page" renders a printable black-and-white line-art page.
    if (styleKey === 'coloring-page') {
      const out = await renderColoringPage(raw, request.data?.quality);
      await saveCreation(uid, 'coloring', out);
      return out;
    }
    // "dream" illustrates a dream in the moody diary-comic style.
    if (styleKey === 'dream') {
      const out = await renderDream(raw, request.data?.quality);
      await saveCreation(uid, 'dream', out);
      return out;
    }
    // "storybook-page" makes one picture-book page: illustrated scene + caption.
    if (styleKey === 'storybook-page') {
      const out = await renderStorybookPage(raw, request.data?.caption, request.data?.quality);
      await saveCreation(uid, 'storybook', { url: out.url, prompt: out.caption || out.prompt });
      return out;
    }
    // "greeting-card" makes a card-front illustration with a greeting headline.
    if (styleKey === 'greeting-card') {
      const out = await renderGreetingCard(raw, request.data?.message, request.data?.quality);
      await saveCreation(uid, 'card', { url: out.url, prompt: out.message || out.prompt });
      return out;
    }
    // "ig-post" makes a square Instagram post (optional product refs + caption).
    if (styleKey === 'ig-post') {
      const out = await renderIgPost(raw, request.data?.refs, request.data?.caption, request.data?.quality, request.data?.aesthetic);
      await saveCreation(uid, 'instagram', out);
      return out;
    }
    // "ig-caption" returns an on-brand caption + hashtags for a post subject (text only).
    if (styleKey === 'ig-caption') {
      return generateIgCaption(raw);
    }
    // "ig-carousel" plans + renders a 5-slide educational carousel (cover + 4).
    if (styleKey === 'ig-carousel') {
      const out = await renderCarousel(raw, request.data?.aesthetic, request.data?.quality);
      await saveCreation(uid, 'carousel', { url: out.url, prompt: out.title });
      return out;
    }
    // "ig-reel" renders a short cinematic vertical clip (still + Ken-Burns zoom).
    if (styleKey === 'ig-reel') {
      const out = await renderReel(raw, request.data?.aesthetic, request.data?.quality);
      await saveCreation(uid, 'reel', { url: out.url, prompt: out.prompt });
      return out;
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

// ===========================================================================
// Choose What I Wear — closet item redraw. Takes a photo of a garment and
// returns the SAME item as a hand-drawn illustration on a TRANSPARENT
// background, so the closet reads as a consistent drawn wardrobe instead of
// raw photo rectangles. The b64 PNG goes straight back to the app (the closet
// lives on-device; nothing is persisted here). Rides on forgeTestImage (style
// "closet-draw") for the public invoker binding, like redo-sticker above.
// ===========================================================================
async function drawClosetItem(imageBase64, mimeType, category) {
  if (!imageBase64) throw new HttpsError('invalid-argument', 'No photo to draw.');
  const key = await loadOpenAIKey();
  if (!key) {
    throw new HttpsError('failed-precondition',
      'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
  }
  const labels = {
    top: 'top', bottom: 'bottom (pants or a skirt)', dress: 'dress',
    jumpsuit: 'jumpsuit', jacket: 'jacket', accessory: 'accessory',
  };
  const label = labels[category] || 'clothing item';
  const prompt =
    `Redraw the ${label} in this photo as ONE cute hand-drawn illustration: `
    + 'soft gouache texture with clean, even outlines and gentle colors. Show ONLY '
    + 'the item itself, drawn flat and front-facing in the proportions of clothing '
    + 'for a paper doll, filling most of the frame, '
    + 'on a fully TRANSPARENT background. Keep its real colors, pattern and details '
    + 'recognizable. No person, no mannequin, no hanger, no shadow, no text, no border.';
  const form = new FormData();
  // gpt-image-1, not -2: the edits endpoint rejects background:transparent on
  // gpt-image-2 ("Transparent background is not supported for this model").
  form.append('model', 'gpt-image-1');
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', 'low');            // a closet fills up fast — favor speed + cost
  form.append('background', 'transparent');
  form.append('output_format', 'png');      // PNG keeps alpha; the app downscales locally
  form.append('image[]',
    new Blob([Buffer.from(imageBase64, 'base64')], { type: mimeType || 'image/jpeg' }), 'item.jpg');

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
  if (!b64) throw new HttpsError('internal', 'No image returned from gpt-image-1.');
  return { b64, model: 'gpt-image-1' };
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
  'A single small object drawn as a simple doodle / icon, centered with lots of empty '
  + 'space — like a quick diagram, NOT a scene, on a plain uncluttered background like the '
  + 'reference paper. Loose, imperfect, hand-drawn with a thin black ballpoint pen, wobbly '
  + 'uneven lines, childlike and minimal, like the reference images. No shading, no solid '
  + `black fills, no color, NO people, NO hands. Draw: ${concept}. Do NOT write the object's `
  + 'name or any caption/title anywhere. Only include words if they are literally part of '
  + "the idea (e.g. a 'CLOSED' sign, a small 'x3'); otherwise no text at all.";

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
  // Preserve the reference doodles' hand-drawn line/look much more faithfully.
  form.append('input_fidelity', 'high');
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

// ── SAGEDIAGRAM: shared drawing/caption pool ────────────────────────────────
// One online set that the web captioner (public/sagediagram.html), this
// pipeline, and JournalReader's Set Builder / Stickers tabs can all read and
// write. All writes go through this callable (Admin SDK), so no open Storage or
// Firestore client rules are required. Anonymous auth is required.
const SAGEDIAGRAM_COLLECTION = 'sagediagram';
function sagediagramId(name) {
  const slug = String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 120);
  return slug || crypto.randomUUID();
}
exports.sagediagram = onCall(
  { region: 'us-central1', cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const uid = req.auth.uid;
    const data = req.data || {};
    const mode = data.mode || 'list';

    if (mode === 'list') {
      const snap = await db.collection(SAGEDIAGRAM_COLLECTION).get();
      const items = snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id, name: v.name, month: v.month || 'Unsorted',
          caption: v.caption || '', url: v.url, addedBy: v.addedBy,
          createdAt: v.createdAt?.toMillis?.() || null,
        };
      });
      return { items };
    }

    if (mode === 'add') {
      const name = String(data.name || '').trim();
      if (!name) throw new HttpsError('invalid-argument', 'name required');
      if (!data.imageBase64) throw new HttpsError('invalid-argument', 'imageBase64 required');
      const id = sagediagramId(name);
      const buffer = Buffer.from(String(data.imageBase64), 'base64');
      const url = await persistBuffer(buffer, `${SAGEDIAGRAM_COLLECTION}/${id}.webp`, data.contentType || 'image/webp');
      const doc = {
        name, month: String(data.month || 'Unsorted'), caption: String(data.caption || ''),
        url, storagePath: `${SAGEDIAGRAM_COLLECTION}/${id}.webp`,
        addedBy: uid, createdAt: FieldValue.serverTimestamp(),
      };
      await db.collection(SAGEDIAGRAM_COLLECTION).doc(id).set(doc, { merge: true });
      return { id, name: doc.name, month: doc.month, caption: doc.caption, url };
    }

    if (mode === 'caption') {
      const id = String(data.id || '').trim();
      if (!id) throw new HttpsError('invalid-argument', 'id required');
      await db.collection(SAGEDIAGRAM_COLLECTION).doc(id).set(
        { caption: String(data.caption || ''), captionedBy: uid, captionAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return { ok: true };
    }

    if (mode === 'delete') {
      const id = String(data.id || '').trim();
      if (!id) throw new HttpsError('invalid-argument', 'id required');
      await db.collection(SAGEDIAGRAM_COLLECTION).doc(id).delete();
      try { await getStorage().bucket(STORAGE_BUCKET).file(`${SAGEDIAGRAM_COLLECTION}/${id}.webp`).delete(); } catch { /* already gone */ }
      return { ok: true };
    }

    throw new HttpsError('invalid-argument', `unknown mode: ${mode}`);
  },
);

exports.illustrateMiracle = onCall(
  { region: 'us-central1', timeoutSeconds: 300, memory: '2GiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const text = String(request.data?.text || '').trim();
    if (!text) throw new HttpsError('invalid-argument', 'Write a miracle first.');
    const id = String(request.data?.id || crypto.randomUUID());
    // Which illustrator: 'openai' (gpt-image-1 + reference doodles, now the
    // default look) or 'replicate' (the old Sketchy LoRA). Still switchable.
    const engine = String(request.data?.engine || 'openai').toLowerCase();

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
        // The OpenAI image already fills its square (paper background + doodle),
        // so persist it as-is. trimToSubject is for the LoRA's small-doodle-on-
        // white output; on a paper background it can't find white to trim and
        // instead recenters onto a white canvas, adding margins.
        return persistBuffer(buffer, `miracles/${uid}/${id}/${crypto.randomUUID()}.webp`);
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
  // Prefer a shared System User token stored in config/metaAds (no per-user
  // OAuth needed — single-owner setup). Fall back to a per-user OAuth
  // connection at adsConnections/{uid} if that's ever used.
  const cfgSnap = await db.doc('config/metaAds').get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  if (cfg.systemToken) {
    return {
      accessToken: cfg.systemToken,
      adAccountId: cfg.adAccountId || null,
      accountName: cfg.accountName || null,
      currency: cfg.currency || null,
      pixelId: cfg.pixelId || null,
    };
  }
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

    const tokRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: appId, client_secret: appSecret, redirect_uri: ADS_REDIRECT, code,
    }));
    const tok = await tokRes.json();
    if (!tok.access_token) throw new Error(tok.error?.message || 'Token exchange failed.');

    const llRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret,
      fb_exchange_token: tok.access_token,
    }));
    const ll = await llRes.json();
    const token = ll.access_token || tok.access_token;

    const discovered = await discoverAdAccount(token);
    await db.doc(`adsConnections/${uid}`).set({
      accessToken: token,
      ...discovered,
      connectedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.redirect(302, APP_RETURN);
  } catch (e) {
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

// Build a COMPLETE, launchable ad — campaign + ad set (pixel-optimized, Advantage+
// audience) + creative (page image ad) + ad — all PAUSED. Nothing spends until
// adsSetStatus flips it ACTIVE. Takes the creative image (base64), primary text,
// budget, and where it links.
exports.adsCreateCampaign = onCall({ region: 'us-central1', memory: '512MiB', timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const cfg = (await db.doc('config/metaAds').get()).data() || {};
  const token = cfg.systemToken;
  const act = cfg.adAccountId;
  const pixel = cfg.pixelId;
  const page = cfg.pageId;
  if (!token || !act) throw new HttpsError('failed-precondition', 'Connect your Meta account first.');
  if (!page) throw new HttpsError('failed-precondition', 'No Facebook Page configured for ads.');

  const d = request.data || {};
  const promoting = String(d.promoting || '').trim().slice(0, 200);
  const linkUrl = /^https?:\/\//i.test(promoting) ? promoting : (cfg.shopUrl || 'https://secretlyawitch.com');
  const budgetCents = Math.max(500, Math.round(Number(d.dailyBudgetCents) || 1500)); // >= $5/day
  const primaryText = String(d.primaryText || 'A little magic for your everyday. ✨').slice(0, 500);
  const headline = String(d.headline || cfg.pageName || 'Shop the collection').slice(0, 60);
  const event = ['PURCHASE', 'ADD_TO_CART', 'INITIATE_CHECKOUT', 'VIEW_CONTENT'].includes(d.optimizationEvent)
    ? d.optimizationEvent : 'ADD_TO_CART';
  const imageB64 = String(d.image || '');
  if (!imageB64) throw new HttpsError('invalid-argument', 'Add an image for the ad.');

  const post = async (path, body) => {
    const r = await fetch(`${META_GRAPH}/${path}`, { method: 'POST', body: new URLSearchParams({ ...body, access_token: token }) });
    return r.json();
  };
  const del = (id) => fetch(`${META_GRAPH}/${id}?access_token=${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => {});
  const fail = async (msg, cleanup) => { for (const id of cleanup) if (id) await del(id); throw new HttpsError('internal', msg); };

  // 1) Campaign — Sales objective, PAUSED, ad-set-level budget.
  const camp = await post(`${act}/campaigns`, {
    name: `Ads — ${promoting || 'shop'}`.slice(0, 100),
    objective: 'OUTCOME_SALES', status: 'PAUSED',
    is_adset_budget_sharing_enabled: 'false',
    special_ad_categories: JSON.stringify([]),
  });
  if (!camp.id) throw new HttpsError('internal', camp.error?.message || 'Campaign failed.');

  // 2) Ad set — daily budget, optimize toward the pixel event, Advantage+ audience.
  const promoted = pixel ? { pixel_id: pixel, custom_event_type: event } : undefined;
  const adset = await post(`${act}/adsets`, {
    name: `${headline}`.slice(0, 100), campaign_id: camp.id, status: 'PAUSED',
    daily_budget: String(budgetCents), billing_event: 'IMPRESSIONS',
    optimization_goal: pixel ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    ...(promoted ? { promoted_object: JSON.stringify(promoted) } : {}),
    targeting: JSON.stringify({ geo_locations: { countries: ['US'] }, targeting_automation: { advantage_audience: 1 } }),
  });
  if (!adset.id) await fail(adset.error?.message || 'Ad set failed.', [camp.id]);

  // 3) Upload the creative image → image_hash.
  const buf = Buffer.from(imageB64, 'base64');
  const fd = new FormData();
  fd.append('access_token', token);
  fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'creative.jpg');
  const imgRes = await (await fetch(`${META_GRAPH}/${act}/adimages`, { method: 'POST', body: fd })).json();
  const hash = imgRes.images && Object.values(imgRes.images)[0]?.hash;
  if (!hash) await fail(imgRes.error?.message || 'Image upload failed.', [adset.id, camp.id]);

  // 4) Ad creative — single-image link ad off the Page.
  const creative = await post(`${act}/adcreatives`, {
    name: `${headline}`.slice(0, 100),
    object_story_spec: JSON.stringify({
      page_id: page,
      link_data: {
        message: primaryText, link: linkUrl, name: headline, image_hash: hash,
        call_to_action: { type: 'SHOP_NOW', value: { link: linkUrl } },
      },
    }),
  });
  if (!creative.id) await fail(creative.error?.message || 'Creative failed.', [adset.id, camp.id]);

  // 5) Ad — ties ad set + creative, PAUSED.
  const ad = await post(`${act}/ads`, {
    name: `${headline}`.slice(0, 100), adset_id: adset.id, status: 'PAUSED',
    creative: JSON.stringify({ creative_id: creative.id }),
  });
  if (!ad.id) await fail(ad.error?.message || 'Ad failed.', [creative.id, adset.id, camp.id]);

  return { id: camp.id, adId: ad.id, name: `Ads — ${promoting || 'shop'}`, status: 'PAUSED' };
});

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

// ───────────────── Side Quest — party matchmaking + chat pushes ─────────────────
//
// Match: when a party doc is created, ping every member except the creator (who
// is in-app at that moment — they just matched). Chat: ping the other members on
// each message. Tokens live in sidequestUsers/{uid}.fcmTokens, written by the
// iOS app after the notification permission is granted; dead tokens are pruned
// after each send. Delivery to iPhones needs the APNs auth key uploaded once in
// Firebase console → Project settings → Cloud Messaging.

async function sidequestPush(uids, payload) {
  for (const uid of uids) {
    try {
      const snap = await db.doc(`sidequestUsers/${uid}`).get();
      const tokens = (snap.exists && Array.isArray(snap.data().fcmTokens)) ? snap.data().fcmTokens : [];
      if (!tokens.length) continue;
      const res = await getMessaging().sendEachForMulticast({
        tokens,
        notification: payload,
        apns: { payload: { aps: { sound: 'default' } } },
      });
      const dead = [];
      res.responses.forEach((r, i) => { if (!r.success) dead.push(tokens[i]); });
      if (dead.length) {
        await db.doc(`sidequestUsers/${uid}`).update({ fcmTokens: FieldValue.arrayRemove(...dead) });
      }
    } catch (e) {
      console.error('sidequest push failed for', uid, e);
    }
  }
}

exports.sidequestPartyMatched = onDocumentCreated('sidequestParties/{partyId}', async (event) => {
  const d = event.data ? event.data.data() : null;
  if (!d) return;
  const others = (d.memberIds || []).filter((u) => u !== d.createdBy);
  await sidequestPush(others, {
    title: '⚔ A party has formed!',
    body: `Your questing partner awaits in ${d.cityName || 'your city'}. Open Side Quest to meet them.`,
  });
});

exports.sidequestChatMessage = onDocumentCreated('sidequestParties/{partyId}/messages/{msgId}', async (event) => {
  const m = event.data ? event.data.data() : null;
  if (!m) return;
  const party = await db.doc(`sidequestParties/${event.params.partyId}`).get();
  if (!party.exists) return;
  const others = (party.data().memberIds || []).filter((u) => u !== m.byUid);
  await sidequestPush(others, {
    title: `${m.username || 'Your partner'} · Side Quest`,
    body: String(m.text || '').slice(0, 120),
  });
});
